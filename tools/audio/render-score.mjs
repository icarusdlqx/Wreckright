import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { BEAT, SECONDS, compose } from './score-composition.mjs';
import { RATE, encodeWav, stereoRoom, voice } from './score-instruments.mjs';

// Rebuild with Node and ffmpeg. The game itself uses only the bundled recordings.
const root = resolve(import.meta.dirname, '../..');
const assets = resolve(root, 'src/assets/audio');
const review = resolve(root, 'reports/audio-upgrade');
await mkdir(assets, { recursive: true });
await mkdir(review, { recursive: true });
const frames = Math.round(SECONDS * RATE);
const stems = { core: [new Float32Array(frames), new Float32Array(frames)],
  ironwork: [new Float32Array(frames)], monolith: [new Float32Array(frames)] };
for (const note of compose()) {
  const sound = voice(note, note.duration * BEAT);
  const start = Math.round(note.beat * BEAT * RATE);
  const channels = stems[note.stem];
  for (let c = 0; c < channels.length; c++) {
    const level = channels.length === 1 ? 1 : Math.sqrt((1 + note.pan * (c === 0 ? -1 : 1)) / 2);
    for (let i = 0; i < sound.length; i++) channels[c][(start + i) % frames] += sound[i] * level;
  }
}
for (const channels of Object.values(stems)) stereoRoom(channels);

const master = [new Float32Array(frames), new Float32Array(frames)];
const report = {};
for (const [name, channels] of Object.entries(stems)) {
  let peak = 0;
  let energy = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const trim = Math.min(1, .64 / peak);
  for (let c = 0; c < channels.length; c++) {
    for (let i = 0; i < frames; i++) { channels[c][i] *= trim; energy += channels[c][i] ** 2; }
  }
  // A conservative shared output trim leaves headroom for simultaneous field sounds.
  for (let c = 0; c < 2; c++) for (let i = 0; i < frames; i++) {
    master[c][i] += channels[c % channels.length][i] * (name === 'core' ? .92 : .6);
  }
  const wav = resolve(review, `carry-the-dawn-${name}.wav`);
  await writeFile(wav, encodeWav(channels));
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav,
    '-c:a', 'libopus', '-b:a', channels.length === 2 ? '112k' : '64k', '-metadata', `title=Carry the Dawn - ${name}`,
    '-metadata', 'artist=Wreckright', resolve(assets, `carry-the-dawn-${name}.ogg`)]);
  report[name] = { seconds: frames / RATE, channels: channels.length, peak: peak * trim,
    rms: Math.sqrt(energy / (frames * channels.length)) };
}
let masterPeak = 0;
for (const channel of master) for (const sample of channel) masterPeak = Math.max(masterPeak, Math.abs(sample));
const masterTrim = .84 / masterPeak;
for (const channel of master) for (let i = 0; i < frames; i++) {
  const fadeIn = Math.min(1, i / (RATE * .65));
  const fadeOut = Math.min(1, (frames - 1 - i) / (RATE * 2.5));
  channel[i] *= masterTrim * fadeIn * fadeOut;
}
const fullWav = resolve(review, 'Wreckright-Carry-the-Dawn.wav');
await writeFile(fullWav, encodeWav(master));
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', fullWav,
  '-c:a', 'libmp3lame', '-q:a', '2', '-metadata', 'title=Carry the Dawn',
  '-metadata', 'artist=Wreckright', resolve(review, 'Wreckright-Carry-the-Dawn.mp3')]);
await writeFile(resolve(review, 'score-render.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
