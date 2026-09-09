/** Original Wreckright score: Carry the Dawn. F minor, 104 bpm, thirty-two bars. */
export const BPM = 104;
export const BARS = 32;
export const BEAT = 60 / BPM;
export const SECONDS = BARS * 4 * BEAT;

// A rising fifth, two close steps, then a held falling answer is the company call.
// Each event is beat offset, MIDI pitch, duration in beats, and played strength.
const CALL = [
  [0, 65, 1.4, .88], [1.5, 72, .42, .72], [2, 75, .9, .9], [3, 77, 1.7, 1],
  [5, 75, .9, .78], [6, 72, 1.25, .87], [7.5, 68, .42, .65],
  [8, 70, 1.4, .84], [9.5, 72, .42, .67], [10, 68, .9, .8], [11, 65, 2.65, .9],
  [14, 63, .85, .62], [15, 65, .7, .8],
];
const ANSWER = [
  [0, 68, 1.4, .82], [1.5, 72, .42, .7], [2, 75, .9, .9], [3, 77, 1.75, .92],
  [5, 79, .85, .86], [6, 80, 1.4, 1], [7.5, 79, .42, .67],
  [8, 77, 1.9, .9], [10, 75, .85, .8], [11, 72, 1.7, .82],
  [13, 68, .85, .67], [14, 67, .8, .62], [15, 65, .75, .84],
];
const BRIDGE = [
  [0, 72, 2.65, .76], [3, 68, 1.4, .7], [4.5, 70, 1.4, .75], [6, 72, 1.7, .81],
  [8, 75, 1.4, .82], [9.5, 74, .4, .6], [10, 72, 1.65, .73],
  [12, 68, 1.4, .68], [13.5, 67, .4, .58], [14, 65, 1.7, .72],
];

const HARMONY = [
  { bass: 29, chord: [53, 60, 65, 68] }, // Open F minor leaves room for the melody.
  { bass: 37, chord: [56, 60, 65, 68] }, // Db major 7, shared tones soften the turn.
  { bass: 32, chord: [55, 60, 63, 68] }, // Ab with a rising inner voice.
  { bass: 39, chord: [55, 58, 63, 67] }, // Eb, an open end before the return.
];

export function compose() {
  const notes = [];
  const add = (stem, voice, beat, pitch, duration, gain, pan = 0) =>
    notes.push({ stem, voice, beat, pitch, duration, gain, pan, seed: notes.length + 19 });

  for (let bar = 0; bar < BARS; bar++) {
    const start = bar * 4;
    const harmony = HARMONY[Math.floor(bar / 2) % 4];
    const first = bar < 4;
    const bridge = bar >= 16 && bar < 24;
    const peak = bar >= 24;
    const energy = first ? .58 : bridge ? .7 : peak ? 1 : .86;
    if (bar % 2 === 0) {
      for (const [i, pitch] of harmony.chord.entries()) {
        add('core', 'strings', start, pitch, 8.1, .064 * energy, [-.7, .3, -.25, .7][i]);
      }
    }
    for (const beat of [0, 2.5]) {
      add('core', 'bass', start + beat, harmony.bass, beat === 0 ? 2.1 : 1.25, .18 * energy);
    }
    // The mallet voice introduces the motif before the horn takes the lead.
    const arpeggio = [0, 2, 1, 3, 2, 1, 3, 2];
    for (let step = 0; step < 8; step++) {
      const pitch = harmony.chord[arpeggio[step]] + (peak && step % 3 === 0 ? 12 : 0);
      if (!bridge || step % 2 === 0) add('core', 'mallet', start + step / 2, pitch, .65, .065 * energy, step % 2 ? .48 : -.48);
      add('monolith', 'glass', start + step / 2, pitch + 12, .85, .044 * energy);
      if (step % 3 !== 1) add('ironwork', 'plucked', start + step / 2 + (step % 2 ? .018 : 0), pitch - 12, .32, .063 * energy);
    }
    // Weight on one and three; the syncopated answer leaves space around the hook.
    for (const beat of [0, 2, ...(peak ? [3.5] : [])]) {
      add('ironwork', 'drum', start + beat, 46, .55, .27 * energy);
      add('monolith', 'drum', start + beat, 53, .3, .13 * energy);
    }
    for (const beat of [1, 3]) {
      add('ironwork', 'clank', start + beat + .012, 53, .32, .15 * energy);
      add('monolith', 'snap', start + beat, 64, .18, .092 * energy);
    }
    for (const beat of [0, .75, 1.5, 2, 2.75, 3.5]) {
      add('ironwork', 'tick', start + beat, 80, .11, .058 * energy);
      add('monolith', 'tick', start + beat, 92, .075, .032 * energy);
    }
    if (bar % 8 === 7) {
      for (const [i, pitch] of [58, 53, 46].entries()) {
        add('ironwork', 'drum', start + 3 + i / 3, pitch, .45, .18 * energy);
      }
    }
  }

  for (const [start, phrase, strength, voice] of [
    [0, CALL, .44, 'mallet'], [16, ANSWER, .52, 'horn'],
    [32, CALL, .86, 'horn'], [48, ANSWER, .9, 'horn'],
    [64, BRIDGE, .72, 'horn'], [80, CALL, .68, 'mallet'],
    [96, CALL, 1, 'horn'], [112, ANSWER, 1, 'horn'],
  ]) {
    for (const [beat, pitch, duration, velocity] of phrase) {
      add('core', voice, start + beat, pitch, duration, .2 * strength * velocity, -.08);
      if (start >= 96) add('core', 'horn', start + beat + .025, pitch - 12, duration, .052 * velocity, .2);
    }
  }
  return notes;
}
