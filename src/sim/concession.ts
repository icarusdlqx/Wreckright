import { emit } from './events';
import { distance } from './math';
import { replacePath } from './pathProgress';
import { isLegged, isOperational, type MechEntity, type World } from './types';

/**
 * Whether anyone upright on this mech's side is close enough to be covering
 * it. Another legged machine does not count: two hulks propping each other up
 * is exactly the stalemate this rule exists to end.
 */
function covered(world: World, entity: MechEntity, radius: number): boolean {
  return world.entities.some(
    (other) =>
      other !== entity &&
      other.team === entity.team &&
      isOperational(other) &&
      !isLegged(other) &&
      distance(other.pos, entity.pos) <= radius,
  );
}

function concede(world: World, entity: MechEntity): void {
  entity.disabled = true;
  entity.killMethod = 'legged';
  entity.targetId = null;
  entity.calledShot = null;
  entity.motion = 'stationary';
  entity.intendedMotion = entity.motion;
  replacePath(entity, []);
  emit(world.events, { type: 'unit_disabled', tick: world.tick, entityId: entity.id, team: entity.team });
}

/**
 * A mech with both legs gone is still a gun emplacement, and a fight against
 * one only ends when somebody walks over and cores it — every legged machine
 * became a wreck, and the salvage table's best outcome never happened. So a
 * legged mech that has sat uncovered for long enough powers down and concedes:
 * it stops shooting, stops being shot, stops counting as a side still in the
 * field, and keeps its structure for whoever tows it home.
 */
export function updateConcessions(world: World): void {
  const rules = world.rules.combat.leggedConcession;
  const limit = Math.ceil(rules.seconds / world.dt);

  for (const entity of world.entities) {
    if (!isOperational(entity) || !isLegged(entity)) continue;
    if (covered(world, entity, rules.allyRadius)) {
      entity.concessionTicks = 0;
      continue;
    }
    entity.concessionTicks += 1;
    if (entity.concessionTicks >= limit) concede(world, entity);
  }
}
