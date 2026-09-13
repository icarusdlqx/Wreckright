/** Locally synthesized instruments; no samples, soundfonts, or external recordings. */
export const RATE = 32_000;
const TAU = Math.PI * 2;

function saturate(value, drive = 1) {
  return Math.tanh(value * drive) / Math.tanh(drive);
}

export function voice(note, seconds) {
  const releases = { pad: .8, lead: .34, guitar: .22, pulse: .18, bass: .2 };
  const release = releases[note.voice] ?? .14;
  const output = new Float32Array(Math.ceil((seconds + release) * RATE));
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  let seed = note.seed * 2654435761;
  let lowNoise = 0;
  let phase = 0;
  let guitarState = 0;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  };
  for (let i = 0; i < output.length; i++) {
    const t = i / RATE;
    const tail = t <= seconds ? 1 : Math.exp(-(t - seconds) / Math.max(.01, release / 4.5));
    let sound = 0;
    if (note.voice === 'pad') {
      const attack = 1 - Math.exp(-t / .22);
      const close = Math.min(1, Math.max(0, (seconds + release - t) / release));
      for (const detune of [.996, 1, 1.004]) {
        const saw = 2 * ((t * hz * detune) % 1) - 1;
        const octave = 2 * ((t * hz * detune * 2) % 1) - 1;
        sound += (saw * .58 + octave * .12) / 3;
      }
      sound = saturate(sound, 1.2) * attack * close * tail * .72;
    } else if (note.voice === 'lead') {
      const vibrato = 1 + .0024 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / .18);
      phase += TAU * hz * vibrato / RATE;
      const square = Math.sin(phase) >= 0 ? 1 : -1;
      sound = saturate(.66 * Math.sin(phase) + .2 * Math.sin(phase * 2) + .11 * square, 1.5)
        * (1 - Math.exp(-t / .018)) * Math.exp(-Math.max(0, t - .08) / 1.8) * tail;
    } else if (note.voice === 'guitar') {
      const noise = rand();
      const excite = t < .014 ? noise * (1 - t / .014) : 0;
      const body = Math.sin(TAU * hz * t) + .72 * Math.sin(TAU * hz * 2 * t + .18)
        + .38 * Math.sin(TAU * hz * 3 * t + .42) + .2 * Math.sin(TAU * hz * 4 * t + .11);
      guitarState += ((body * .22 + excite * 1.6) - guitarState) * .24;
      const pick = (noise - lowNoise) * Math.exp(-t / .018) * .32;
      sound = saturate(guitarState + pick, 3.2) * Math.exp(-t / .34) * Math.min(1, t / .0025) * tail;
    } else if (note.voice === 'pulse') {
      phase += TAU * hz / RATE;
      const saw = 2 * ((phase / TAU) % 1) - 1;
      const sub = Math.sin(phase * .5);
      sound = saturate(saw * .62 + sub * .24, 1.7) * Math.min(1, t / .005) * Math.exp(-t / .18) * tail;
    } else if (note.voice === 'bass') {
      phase += TAU * hz / RATE * (1 + .02 * Math.exp(-t / .035));
      sound = saturate(Math.sin(phase) + .32 * Math.sin(phase * 2) + .1 * Math.sin(phase * 3), 1.8)
        * Math.min(1, t / .006) * Math.exp(-t / .55) * tail;
    } else {
      const noise = rand();
      lowNoise += (noise - lowNoise) * .045;
      if (note.voice === 'kick') {
        phase += TAU / RATE * (hz * .52 + hz * 2.9 * Math.exp(-t / .026));
        sound = (Math.sin(phase) * 1.08 + .12 * noise * Math.exp(-t / .012)) * Math.exp(-t / .13);
      } else if (note.voice === 'snare') {
        const wire = noise - lowNoise;
        sound = (wire * .82 + Math.sin(TAU * hz * .72 * t) * .36) * Math.exp(-t / .105);
      } else if (note.voice === 'tom') {
        phase += TAU / RATE * (hz * .72 + hz * .6 * Math.exp(-t / .04));
        sound = (Math.sin(phase) + .18 * lowNoise) * Math.exp(-t / .17);
      } else if (note.voice === 'snap') {
        sound = ((noise - lowNoise) * .76 + .2 * Math.sin(TAU * hz * t)) * Math.exp(-t / .027);
      } else {
        sound = ((noise - lowNoise) * .62 + Math.sin(TAU * hz * 4.7 * t) * .09) * Math.exp(-t / .018);
      }
      sound *= Math.min(1, t / .0015) * tail;
    }
    lowNoise += (rand() - lowNoise) * .018;
    output[i] = sound * note.gain;
  }
  return output;
}

export function stereoRoom(channels) {
  const original = channels.map(channel => new Float32Array(channel));
  const taps = [[.031, .1], [.067, .085], [.109, .07], [.173, .06], [.257, .043], [.401, .027]];
  for (let channel = 0; channel < channels.length; channel++) {
    const target = channels[channel];
    const source = original[(channel + 1) % original.length];
    for (const [seconds, gain] of taps) {
      const offset = Math.round((seconds + channel * .011) * RATE);
      let smooth = 0;
      for (let i = 0; i < source.length; i++) {
        smooth += (source[i] - smooth) * .19;
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
