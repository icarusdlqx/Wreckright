import type { DifficultyTier } from '../../schema/rules';
import { isVisibleTo, visionFor } from '../sensors';
import { isOperational, type EntityId, type World } from '../types';
import { healthFraction, scoreTargets } from './utility';

/** The lance agrees on one target instead of fighting four private duels. */
export function lanceFocus(world: World, team: number, tier: DifficultyTier): EntityId | null {
  if (!tier.focusFire) return null;

  const members = world.entities.filter(
    (entity) => entity.team === team && isOperational(entity),
  );
  if (members.length === 0) return null;

  const prior = new Map<EntityId, number>();
  for (const member of members) {
    const id = member.ai.focusTargetId;
    if (id !== null) prior.set(id, (prior.get(id) ?? 0) + 1);
  }
  const previousFocus = [...prior.entries()].sort((a, b) =>
    b[1] === a[1] ? a[0] - b[0] : b[1] - a[1],
  )[0]?.[0] ?? null;
  const vision = visionFor(world, team);

  let best: { id: EntityId; score: number } | null = null;
  for (const candidate of world.entities) {
    if (candidate.team === team || !isOperational(candidate)) continue;
    if (!isVisibleTo(vision, candidate)) continue;

    const reachable = members.filter((member) =>
      scoreTargets(world, member, { focusTargetId: null, currentTargetId: null })
        .some((entry) => entry.target.id === candidate.id),
    ).length;
    if (reachable === 0) continue;

    let score = reachable * (1.6 - healthFraction(candidate));
    if (candidate.id === previousFocus) score *= world.rules.ai.target.switchHysteresis;
    if (best === null || score > best.score || (score === best.score && candidate.id < best.id)) {
      best = { id: candidate.id, score };
    }
  }

  return best?.id ?? null;
}
