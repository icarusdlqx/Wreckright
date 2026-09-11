import { canPresentEntity } from '../render3d/visibilityPresentation';
import { isOperational, type World } from '../sim/types';

/** Equal-power arrangement blend keeps the shared F-minor theme in tune. */
export function scoreCultureAt(aurelianShare: number): { ironwork: number; monolith: number } {
  const share = Number.isNaN(aurelianShare) ? 0 : Math.max(0, Math.min(1, aurelianShare));
  return {
    ironwork: share === 1 ? 0 : Math.cos(share * Math.PI / 2),
    monolith: share === 0 ? 0 : Math.sin(share * Math.PI / 2),
  };
}

/**
 * Equal-weight culture share for machines whose exact identities the player
 * can currently know. Sensor returns never disclose a hostile chassis.
 */
export function battleCultureShare(world: World): number | null {
  let aurelian = 0;
  let linewrought = 0;

  for (const entity of world.entities) {
    if (!isOperational(entity) || !canPresentEntity(world, entity.id)) continue;
    const faction = world.catalog.chassis.get(entity.chassisId)?.faction;
    if (faction === 'aurelian') aurelian += 1;
    if (faction === 'linewrought') linewrought += 1;
  }

  const eligible = aurelian + linewrought;
  return eligible === 0 ? null : aurelian / eligible;
}
