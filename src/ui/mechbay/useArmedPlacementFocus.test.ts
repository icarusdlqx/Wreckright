import { describe, expect, it } from 'vitest';
import type { MechLocation } from '../../schema/common';
import { armedPlacementTarget } from './useArmedPlacementFocus';

describe('armed placement focus', () => {
  it('returns the selected filtered location before other compatible targets', () => {
    const compatible = new Set<MechLocation>(['left_arm', 'right_torso']);
    expect(armedPlacementTarget('right_torso', compatible)).toBe('right_torso');
  });

  it('falls back to the first compatible location and reports no target truthfully', () => {
    expect(armedPlacementTarget(null, new Set<MechLocation>(['left_arm']))).toBe('left_arm');
    expect(armedPlacementTarget(null, new Set<MechLocation>())).toBeNull();
  });
});
