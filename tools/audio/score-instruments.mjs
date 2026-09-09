/** Locally synthesized instruments; no samples, soundfonts, or external recordings. */
export const RATE = 32_000;
const TAU = Math.PI * 2;

export function voice(note, seconds) {
  const release = note.voice === 'strings' ? .65 : note.voice === 'horn' ? .28 : .16;
  const output = new Float32Array(Math.ceil((seconds + release) * RATE));
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  let seed = note.seed * 2654435761;
  let lowNoise = 0;
  let phase = 0;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  };
  for (let i = 0; i < output.length; i++) {
    const t = i / RATE;
    const tail = t > seconds ? Math.exp(-(t - seconds) / (release / 5)) : 1;
    let sound = 0;
    if (note.voice === 'horn') {
      phase += TAU * hz / RATE * (1 + .0018 * Math.sin(TAU * 5.1 * t) * Math.min(1, t / .2));
      const attack = 1 - Math.exp(-t / .036);
      const colour = .15 + .13 * (1 - Math.exp(-t / .24));
      for (let h = 1; h <= 10; h++) sound += Math.sin(phase * h + .07 * h) * Math.exp(-h * colour) / h;
      sound *= attack * tail * (.85 + .15 * Math.exp(-t / .2));
    } else if (note.voice === 'strings') {
      const envelope = Math.min(1, t / .3) * tail * .72;
      for (const detune of [.9981, 1.0008, 1.0022]) {
        for (let h = 1; h <= 5; h++) {
          sound += Math.sin(TAU * hz * detune * h * t + h * .4) * Math.exp(-h * .22) / h / 3;
        }
      }
      sound *= envelope;
    } else if (note.voice === 'bass') {
      sound = (Math.sin(TAU * hz * t) + .24 * Math.sin(TAU * hz * 2 * t) + .08 * Math.sin(TAU * hz * 3 * t))
        * Math.min(1, t / .012) * Math.exp(-t / 1.1) * tail;
    } else if (['mallet', 'glass', 'plucked'].includes(note.voice)) {
      const glass = note.voice === 'glass';
      const pluck = note.voice === 'plucked';
      const decay = glass ? .85 : pluck ? .2 : .46;
      sound = Math.sin(TAU * hz * t + (glass ? .9 : .25) * Math.sin(TAU * hz * 2.002 * t) * Math.exp(-t / .1)) * Math.exp(-t / decay);
      sound += .22 * Math.sin(TAU * hz * 3.997 * t) * Math.exp(-t / .065);
      if (pluck) sound += .18 * Math.sin(TAU * hz * 2 * t) * Math.exp(-t / .13);
      sound *= Math.min(1, t / .003) * tail;
    } else {
      const noise = rand();
      lowNoise += (noise - lowNoise) * .06;
      if (note.voice === 'drum') {
        phase += TAU / RATE * (hz * .65 + hz * 1.8 * Math.exp(-t / .038));
        sound = Math.sin(phase) * Math.exp(-t / .125) + .27 * lowNoise * Math.exp(-t / .2)
          + .06 * noise * Math.exp(-t / .009);
      } else if (note.voice === 'clank') {
        sound = (.5 * noise + .65 * Math.sin(TAU * hz * t) + .27 * Math.sin(TAU * hz * 2.71 * t)) * Math.exp(-t / .055);
      } else if (note.voice === 'snap') {
        sound = (noise - lowNoise + .25 * Math.sin(TAU * hz * t)) * Math.exp(-t / .028);
      } else {
        sound = ((noise - lowNoise) * .55 + Math.sin(TAU * hz * 5.27 * t) * .14) * Math.exp(-t / .016);
      }
      sound *= Math.min(1, t / .0015) * tail;
    }
    output[i] = sound * note.gain;
  }
  return output;
}

export function stereoRoom(channels) {
  const original = channels.map(channel => new Float32Array(channel));
  const taps = [[.043, .14], [.079, .12], [.127, .105], [.181, .095], [.263, .07], [.367, .055], [.521, .037], [.733, .022]];
  for (let channel = 0; channel < channels.length; channel++) {
    const target = channels[channel];
    const source = original[(channel + 1) % original.length];
    for (const [seconds, gain] of taps) {
      const offset = Math.round((seconds + channel * .013) * RATE);
      let smooth = 0;
      for (let i = 0; i < source.length; i++) {
        smooth += (source[i] - smooth) * .16;
        // Circular tails preserve the space through the sample-exact loop join.
        target[(i + offset) % target.length] += smooth * gain;
      }
    }
  }
}

export function encodeWav(channels) {
  const length = channels[0].length;
  const dataBytes = length * channels.length * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels.length, 22);
  bytes.writeUInt32LE(RATE, 24); bytes.writeUInt32LE(RATE * channels.length * 2, 28);
  bytes.writeUInt16LE(channels.length * 2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < length; i++) for (let c = 0; c < channels.length; c++) {
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + (i * channels.length + c) * 2);
  }
  return bytes;
}
