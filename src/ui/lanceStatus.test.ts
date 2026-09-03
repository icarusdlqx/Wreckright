import { describe, expect, it } from 'vitest';
import { MOTION_SETTLE_TICKS, settleMotionLabel, type MotionLabelMemory } from './lanceStatus';

describe('lance strip gait label', () => {
  it('shows the first reading at once', () => {
    const memory = new Map<number, MotionLabelMemory>();
    expect(settleMotionLabel(memory, 1, 'walk', 0)).toBe('walk');
  });

  it('ignores a pivot that flickers between stationary and walking', () => {
    const memory = new Map<number, MotionLabelMemory>();
    settleMotionLabel(memory, 1, 'walk', 0);
    for (let tick = 1; tick < 40; tick += 1) {
      const motion = tick % 2 === 0 ? 'walk' : 'stationary';
      expect(settleMotionLabel(memory, 1, motion, tick)).toBe('walk');
    }
  });

  it('adopts a gait once it has held for the settle time', () => {
    const memory = new Map<number, MotionLabelMemory>();
    settleMotionLabel(memory, 1, 'walk', 0);
    for (let tick = 1; tick < MOTION_SETTLE_TICKS; tick += 1) {
      expect(settleMotionLabel(memory, 1, 'stationary', tick)).toBe('walk');
    }
    expect(settleMotionLabel(memory, 1, 'stationary', MOTION_SETTLE_TICKS + 1)).toBe('stationary');
  });

  it('shows a jump immediately and unfiltered readings without a tick', () => {
    const memory = new Map<number, MotionLabelMemory>();
    settleMotionLabel(memory, 1, 'walk', 0);
    expect(settleMotionLabel(memory, 1, 'jump', 1)).toBe('walk');
    expect(settleMotionLabel(memory, 1, 'jump', 2)).toBe('jump');
    expect(settleMotionLabel(memory, 2, 'run', null)).toBe('run');
  });

  it('forgets the old reading when the clock rewinds', () => {
    const memory = new Map<number, MotionLabelMemory>();
    settleMotionLabel(memory, 1, 'run', 500);
    expect(settleMotionLabel(memory, 1, 'stationary', 0)).toBe('stationary');
  });
});
