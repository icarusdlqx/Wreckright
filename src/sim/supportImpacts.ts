import type { MechLocation } from '../schema/common';
import { applyDamage } from './damage';
import { emit } from './events';
import { queueIgnition } from './fire';
import { distance } from './math';
import { addStabilityImpulse, impulseOf } from './stability';
import { isOperational, type MechEntity, type Vec2, type World } from './types';

interface ImpactCall {
  team: number;
  target: Vec2;
  heading: number;
}

/** Overhead fire keeps its authored weights, but only among locations this frame actually has. */
export function supportHitTable(
  world: World,
  target: MechEntity,
): readonly { value: MechLocation; weight: number }[] {
  const active = new Set(
    Object.values(world.arcHitTables[target.frame].tables).flatMap((table) =>
      table.map((entry) => entry.value),
    ),
  );
  return world.hitLocationTable.filter((entry) => active.has(entry.value));
}

function damageAt(world: World, team: number, point: Vec2, radius: number, damage: number): void {
  for (const entity of world.entities) {
    if (entity.team === team || !isOperational(entity)) continue;
    if (distance(entity.pos, point) > radius) continue;
    const location = world.rng.weighted(supportHitTable(world, entity));
    const absorbed = applyDamage(world, entity, location, damage);
    entity.stats.damageTaken += absorbed;
    // A shell coming down has no recoil to speak of and no arc — it just lands
    // heavily enough to matter, and the impact floor decides whether it does.
    addStabilityImpulse(world, entity, impulseOf(world.rules.stability, absorbed, null));
  }
}

export function resolveArtillery(world: World, pending: ImpactCall): void {
  const config = world.rules.support.artillery_strike;
  for (let shot = 0; shot < config.shots; shot += 1) {
    const angle = world.rng.range(0, Math.PI * 2);
    const spread = world.rng.range(0, config.scatter);
    const point = {
      x: pending.target.x + Math.cos(angle) * spread,
      y: pending.target.y + Math.sin(angle) * spread,
    };
    emit(world.events, {
      type: 'ground_impact',
      tick: world.tick,
      kind: 'artillery',
      team: pending.team,
      x: point.x,
      y: point.y,
    });
    queueIgnition(world, point, 'artillery_impact');
    damageAt(world, pending.team, point, config.radius, config.damage);
  }
}

/** Bursts walk the authored run length, leaving its centre line unbroken. */
export function resolveAirStrike(world: World, pending: ImpactCall): void {
  const config = world.rules.support.air_strike;
  const along = { x: Math.cos(pending.heading), y: Math.sin(pending.heading) };
  const spacing = config.length / config.shots;

  for (let shot = 0; shot < config.shots; shot += 1) {
    const offset = -config.length / 2 + spacing * (shot + 0.5);
    damageAt(
      world,
      pending.team,
      {
        x: pending.target.x + along.x * offset,
        y: pending.target.y + along.y * offset,
      },
      config.width / 2,
      config.damage,
    );
  }
}
