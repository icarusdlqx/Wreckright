import type { DifficultyTier } from '../../schema/rules';
import type { MechEntity, World } from '../types';
import { structureFraction } from './utility';

const LEG_LOCATIONS = ['left_leg', 'right_leg'] as const;

export function chooseCalledShot(world: World, mech: MechEntity, target: MechEntity, tier: DifficultyTier): void {
  if (!tier.calledShots) {
    mech.calledShot = null;
    return;
  }

  const rules = world.rules.ai.calledShot;
  if (structureFraction(target) > rules.targetStructureFraction) {
    mech.calledShot = null;
    return;
  }

  const standing = LEG_LOCATIONS.filter((location) => !target.locations[location].destroyed);
  if (standing.length === 0) {
    mech.calledShot = null;
    return;
  }

  // Taking the legs leaves the chassis on the field to be towed home.
  mech.calledShot = world.rng.chance(rules.chance) ? world.rng.pick(standing) : null;
}
