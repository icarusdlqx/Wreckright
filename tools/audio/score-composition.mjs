/** Original Wreckright score: Roads We Keep. E minor, 116 bpm, thirty-two bars. */
export const BPM = 116;
export const BARS = 32;
export const BEAT = 60 / BPM;
export const SECONDS = BARS * 4 * BEAT;

// A clipped ascent and broad descending answer give every arrangement one
// recognisable company signal without borrowing a melody from the reference mood.
const COMPANY_CALL = [
  [0, 64, .36, .82], [.5, 67, .36, .9], [1, 71, .72, 1],
  [2, 69, .36, .78], [2.5, 67, .36, .72], [3, 64, .82, .92],
];
const ROAD_ANSWER = [
  [0, 71, .36, .92], [.5, 74, .36, 1], [1, 76, .72, .94],
  [2, 74, .36, .82], [2.5, 71, .36, .76], [3, 69, .82, .88],
];

const HARMONY = [
  { root: 40, chord: [52, 55, 59, 64] },
  { root: 36, chord: [48, 52, 55, 59] },
  { root: 43, chord: [55, 59, 62, 67] },
  { root: 38, chord: [50, 54, 57, 62] },
];

export function compose() {
  const notes = [];
  const add = (stem, voice, beat, pitch, duration, gain, pan = 0) =>
    notes.push({ stem, voice, beat, pitch, duration, gain, pan, seed: notes.length + 197 });

  for (let bar = 0; bar < BARS; bar++) {
    const start = bar * 4;
    const section = Math.floor(bar / 8);
    const harmony = HARMONY[Math.floor(bar / 2) % HARMONY.length];
    const lift = section === 0 ? .74 : section === 1 ? .9 : section === 2 ? .8 : 1;

    if (bar % 2 === 0) {
      for (const [index, pitch] of harmony.chord.entries()) {
        add('core', 'pad', start, pitch, 8.05, .048 * lift, [-.68, -.2, .25, .66][index]);
      }
    }
    const bassPattern = [
      [0, 0, .44], [.75, 0, .28], [1.5, 12, .34], [2, 0, .4],
      [2.75, 7, .28], [3.5, 12, .32],
    ];
    for (const [offset, semitone, duration] of bassPattern) {
      add('core', 'bass', start + offset, harmony.root + semitone, duration, .18 * lift, -.08);
    }

    const guitarPattern = section === 2
      ? [[0, 0], [1.5, 0], [2.5, 7], [3.25, 0]]
      : [[0, 0], [.75, 0], [2, 0], [2.75, 7], [3.5, 0]];
    for (const [offset, semitone] of guitarPattern) {
      add('ironwork', 'guitar', start + offset, harmony.root + 12 + semitone, .42, .12 * lift, -.36);
      add('ironwork', 'guitar', start + offset + .012, harmony.root + 19 + semitone, .38, .08 * lift, .18);
    }
    for (const beat of [0, 2]) add('ironwork', 'kick', start + beat, 36, .35, .34 * lift);
    if (section >= 1) add('ironwork', 'kick', start + 2.75, 36, .28, .2 * lift);
    for (const beat of [1, 3]) add('ironwork', 'snare', start + beat, 50, .3, .24 * lift, .08);
    for (let step = 0; step < 8; step++) {
      add('ironwork', 'hat', start + step / 2 + (step % 2 ? .018 : 0), 84, .09, (step % 2 ? .07 : .1) * lift, .3);
    }

    const pulse = [0, 2, 1, 2, 3, 2, 1, 2];
    for (let step = 0; step < 8; step++) {
      add('monolith', 'pulse', start + step / 2, harmony.chord[pulse[step]] + 12,
        .24, .058 * lift, step % 2 ? .42 : -.42);
      add('monolith', 'tick', start + step / 2, 94, .06, .035 * lift, step % 2 ? .6 : -.6);
    }
    for (const beat of [0, 2]) add('monolith', 'kick', start + beat, 40, .28, .2 * lift);
    for (const beat of [1, 3]) add('monolith', 'snap', start + beat, 70, .15, .13 * lift, -.08);

    if (bar % 8 === 7) {
      for (let hit = 0; hit < 4; hit++) {
        add('ironwork', 'tom', start + 3 + hit * .25, 48 - hit * 2, .24, .16 + hit * .025, hit % 2 ? .28 : -.28);
        add('monolith', 'pulse', start + 3 + hit * .25, 76 - hit * 2, .18, .055 + hit * .008, hit % 2 ? -.38 : .38);
      }
    }
  }

  const phrases = [
    [8, COMPANY_CALL, .5], [24, ROAD_ANSWER, .62],
    [40, COMPANY_CALL, .68], [56, ROAD_ANSWER, .72],
    [72, COMPANY_CALL, .54], [88, ROAD_ANSWER, .72],
    [104, COMPANY_CALL, .86], [120, ROAD_ANSWER, .92],
  ];
  for (const [start, phrase, strength] of phrases) {
    for (const [beat, pitch, duration, velocity] of phrase) {
      add('core', 'lead', start + beat, pitch, duration, .14 * strength * velocity, -.12);
      if (start >= 104) add('core', 'lead', start + beat + .018, pitch - 12, duration, .045 * velocity, .24);
    }
  }
  return notes;
}
