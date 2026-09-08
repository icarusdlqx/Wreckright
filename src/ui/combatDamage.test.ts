import { describe, expect, it } from 'vitest';
import type { LocationSnapshot } from './store';
import { sectionDamage, sectionDescription } from './combatDamage';

const intact: LocationSnapshot = { armour: 30, armourMax: 30, rearArmour: 12, rearArmourMax: 12,
  hasRearArmourFace: true, internal: 20, internalMax: 20, destroyed: false };

describe('combat section condition', () => {
  it('keeps stripped armour red while the intact internal core stays green', () => {
    const state = { ...intact, armour: 0 };
    expect(sectionDamage(state, 'front')).toMatchObject({ armourTone: 'critical', internalTone: 'sound', exposed: true, destroyed: false });
    expect(sectionDescription('left_torso', state, 'front')).toContain('exposed');
  });
  it('makes rear damage visible independently of front armour and shared limb armour', () => {
    const state = { ...intact, rearArmour: 2, internal: 9 };
    expect(sectionDamage(state, 'front')).toMatchObject({ armourTone: 'sound', internalTone: 'damaged' });
    expect(sectionDamage(state, 'rear')).toMatchObject({ armourTone: 'critical', internalTone: 'damaged' });
    expect(sectionDamage({ ...state, hasRearArmourFace: false }, 'rear').armourTone).toBe('sound');
  });
  it('never paints zero-capacity rear armour as healthy or divides by zero', () => {
    expect(sectionDamage({ ...intact, rearArmour: 0, rearArmourMax: 0 }, 'rear')).toMatchObject({ armourTone: 'critical', exposed: true, destroyed: false });
  });
  it('marks loss of structure black even before the destroyed flag and ignores residual armour', () => {
    expect(sectionDamage({ ...intact, internal: 0 }, 'front')).toMatchObject({ armourTone: 'destroyed', internalTone: 'destroyed', armour: 0, internal: 0 });
    expect(sectionDescription('left_arm', { ...intact, destroyed: true }, 'front')).toBe('Left arm — destroyed');
  });
  it('separates worn armour from critical internal damage', () => {
    expect(sectionDamage({ ...intact, armour: 15, internal: 3 }, 'front')).toMatchObject({ armourTone: 'damaged', internalTone: 'critical' });
  });
});
