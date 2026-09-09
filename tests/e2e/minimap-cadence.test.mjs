import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minimapPaintCadence } from './minimap-cadence.mjs';

function frameTimes(hz) {
  return Array.from({ length: 300 }, (_, index) => 1000 + index * 1000 / hz);
}

function paintedFrames(frames, delayedInterval = -1, extraFrames = 0) {
  const paints = [frames[0]];
  while (paints.length < 12) {
    const first = frames.findIndex(at => at - paints.at(-1) >= 100);
    const extra = paints.length - 1 === delayedInterval ? extraFrames : 0;
    paints.push(frames[first + extra]);
  }
  return paints;
}

for (const hz of [14, 21, 60]) {
  test(`${hz}Hz accepts every first eligible frame despite quantization`, () => {
    const frames = frameTimes(hz);
    const paints = paintedFrames(frames);
    const cadence = minimapPaintCadence(frames, paints);
    assert.deepEqual(cadence.firstEligibleFrames, paints.slice(1));
    assert.equal(cadence.missedEligibleFrames, 0);
    assert.equal(cadence.offSchedulePaints, 0);
  });

  test(`${hz}Hz detects each extra skipped eligible frame in every sampled interval`, () => {
    const frames = frameTimes(hz);
    for (let interval = 0; interval < 11; interval += 1) {
      for (let extra = 1; extra <= 3; extra += 1) {
        const paints = paintedFrames(frames, interval, extra);
        const cadence = minimapPaintCadence(frames, paints);
        assert.equal(cadence.missedEligibleFrames, extra, `interval ${interval}, skipped ${extra}`);
        assert.equal(cadence.offSchedulePaints, 1);
        assert.ok(cadence.firstEligibleFrames[interval] < paints[interval + 1]);
      }
    }
  });
}

test('variable frame intervals accept the first actual opportunity rather than a predicted rate', () => {
  const steps = [16.6, 70, 47.2, 31, 49.4, 100.1, 16.7];
  const frames = [1000];
  for (let index = 0; index < 150; index += 1) frames.push(frames.at(-1) + steps[index % steps.length]);
  const paints = paintedFrames(frames);
  assert.deepEqual(minimapPaintCadence(frames, paints), {
    firstEligibleFrames: paints.slice(1), missedEligibleFrames: 0, offSchedulePaints: 0,
  });
});

test('exact 100ms eligibility is retained without rounding tolerance', () => {
  assert.deepEqual(minimapPaintCadence([0, 99.999, 100, 200], [0, 100, 200]), {
    firstEligibleFrames: [100, 200], missedEligibleFrames: 0, offSchedulePaints: 0,
  });
});

test('an early or unrecorded paint cannot pass the cadence gate', () => {
  assert.equal(minimapPaintCadence([0, 90, 110, 130], [0, 90]).offSchedulePaints, 1);
  assert.equal(minimapPaintCadence([0, 90, 110, 130], [0, 120]).offSchedulePaints, 1);
});
