import { hitPreview } from '../sim/preview';
import { isHoldingFire } from '../sim/orders';
import { findEntity, isOperational, type World } from '../sim/types';
import { selectedAttackIntent } from './attackIntent';
import type { UnitSnapshot } from './store';

export interface CommandIntent { label: string; detail: string; tone: 'normal' | 'warn' }

/** Explain friendly intent without publishing a target outside current optical information. */
export function combatIntent(world: World, unit: UnitSnapshot): CommandIntent | null {
  const entity = findEntity(world, unit.id);
  if (entity === null || entity.team !== world.playerTeam || !isOperational(entity)) return null;
  if (entity.shutdownRemaining > 0 || entity.downRemaining > 0) return null;
  // Orders can change while paused, before the next throttled HUD snapshot is published.
  if (isHoldingFire(entity)) return { label: 'Holding fire', detail: 'Weapons are safed. Useful when preserving a disabled machine.', tone: 'warn' };
  if (entity.orders.move !== null) return { label: entity.orders.move.engage ? 'Advancing through contacts' : 'Following your route', detail: entity.orders.queue.length > 0 ? `${entity.orders.queue.length} further waypoint${entity.orders.queue.length === 1 ? '' : 's'} queued.` : 'Your route takes priority over chasing a target. Guard cancels the route and keeps the priority target.', tone: 'normal' };
  const target = findEntity(world, entity.orders.attack?.targetId ?? entity.targetId);
  const preview = target === null ? null : hitPreview(world, entity, target);
  const plan = selectedAttackIntent(world, entity);
  if (plan?.needsMove) return {
    label: plan.reachable ? `Closing to ${Math.round(plan.range)}m` : 'Approach blocked',
    detail: plan.reachable ? 'The marked stopping point suits the available weapons. Move or Guard overrides the approach.' : 'No firing position on this approach. Choose another route or a different target.',
    tone: plan.reachable ? 'normal' : 'warn',
  };
  if (preview === null) return { label: entity.posture === 'hold_position' ? 'Guarding this ground' : 'Watching for contacts', detail: entity.orders.attack !== null ? 'The target is not in optical sight. Sensor tracks can still guide compatible indirect weapons.' : 'Weapons engage suitable targets automatically. Attack assigns a priority target.', tone: 'normal' };
  const live = unit.weapons.filter((weapon) => !weapon.destroyed);
  if (live.length === 0) return { label: 'Weapons lost', detail: 'Withdraw or use this machine to scout and secure ground.', tone: 'warn' };
  if (live.every((weapon) => weapon.rounds === 0)) return { label: 'Out of ammunition', detail: 'The remaining weapons have no usable ammunition.', tone: 'warn' };
  const enabled = live.filter((weapon) => entity.groupEnabled[weapon.group - 1]);
  if (enabled.length === 0) return { label: unit.reactor.shedGroups.length > 0 ? 'Cooling weapon groups' : 'Weapon groups off', detail: unit.reactor.shedGroups.length > 0 ? 'Heat safety will restore these groups when the reactor cools.' : 'Enable a weapon group to resume fire.', tone: 'warn' };
  const usable = preview.weapons.filter((weapon) => enabled.some((mount) => mount.index === weapon.index));
  if (usable.every((weapon) => weapon.blocked !== null)) {
    const blocked = usable[0]?.blocked;
    return { label: blocked === 'range' ? 'Target out of range' : blocked === 'arc' ? 'Turning onto target' : 'No firing solution', detail: entity.posture === 'hold_position' ? 'Guard keeps your feet planted. Release it or move to a firing position.' : 'Terrain, facing or weapon reach is preventing fire. Check the weapon rows below.', tone: 'warn' };
  }
  return { label: 'Engaging', detail: 'Weapons cycle independently. Range and hit estimates are shown below.', tone: 'normal' };
}
