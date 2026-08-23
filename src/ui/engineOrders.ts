import type { MechLocation } from '../schema/common';
import { useAbility } from '../sim/abilities';
import { restoreIntent } from '../sim/governor';
import {
  isHoldingFire,
  issueAlphaStrike,
  issueAttack,
  issueJump,
  issueMove,
  issueStop,
  setGroupEnabled,
  setHoldFire,
  setPosture,
} from '../sim/orders';
import {
  findEntity,
  isOperational,
  type EntityId,
  type MechEntity,
  type Posture,
  type Vec2,
  type World,
} from '../sim/types';
import type { AudioDirector } from './audio';
import { formationDestinations } from './formation';
import { prepareInvestigation } from './investigationOrder';
import { useGame } from './store';

export interface EngineOrderContext {
  readonly world: World;
  readonly audio: AudioDirector;
  selectedEntities(): EntityId[];
}

export interface MoveOrderOptions {
  engage?: boolean;
  queued?: boolean;
}

export function moveSelection(
  context: EngineOrderContext,
  to: Vec2,
  run: boolean,
  options: MoveOrderOptions = {},
): void {
  let moved = 0;
  const entities = context
    .selectedEntities()
    .map((id) => findEntity(context.world, id))
    .filter((entity): entity is MechEntity => entity !== null && !entity.autopilot);
  const destinations = formationDestinations(context.world, entities, to);
  for (const entity of entities) {
    // A queued leg keeps the pace of the order it extends.
    const pace = options.queued === true ? (entity.orders.move?.run ?? run) : run;
    if (
      issueMove(context.world, entity, destinations.get(entity.id) ?? to, pace, options)
    ) moved += 1;
  }
  if (moved > 0) context.audio.order();
  // An order that silently does nothing reads as a broken control — and an
  // order given with nothing selected was the commonest way to see one.
  else if (entities.length > 0) useGame.getState().pushLog('No route to that point.');
  else useGame.getState().pushLog('No mech selected to give that order to.');
}

export function investigateSelection(
  context: EngineOrderContext,
  to: Vec2,
  move: (to: Vec2) => void,
): void {
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    prepareInvestigation(entity);
  }
  move(to);
}

export function jumpSelection(context: EngineOrderContext, to: Vec2): void {
  let fired = 0;
  let asked = 0;
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    asked += 1;
    if (issueJump(context.world, entity, to)) fired += 1;
  }
  if (asked > 0 && fired === 0) useGame.getState().pushLog('No selected mech can jump there.');
}

export function attackSelection(
  context: EngineOrderContext,
  targetId: EntityId,
  calledShot: MechLocation | null,
): void {
  let ordered = 0;
  let eligible = 0;
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot || entity.id === targetId) continue;
    eligible += 1;
    if (issueAttack(context.world, entity, targetId, calledShot)) ordered += 1;
  }

  // Say so out loud. A target order that silently does nothing — because
  // nothing was selected, or the click missed — is the single hardest thing
  // to tell apart from a control that is simply broken.
  const target = findEntity(context.world, targetId);
  const push = useGame.getState().pushLog;
  if (eligible === 0) push('No mech selected to give that order to.');
  else if (ordered === 0) push('Optical contact is required before that target can be engaged.');
  else if (target !== null) {
    context.audio.order();
    push(`${ordered} mech${ordered === 1 ? '' : 's'} targeting ${target.name}.`);
  }
}

export function targetNearestSelection(
  context: EngineOrderContext,
  attack: (targetId: EntityId) => void,
): void {
  const ids = context.selectedEntities();
  const anchor = findEntity(context.world, ids[0] ?? null);
  if (anchor === null) {
    useGame.getState().pushLog('No mech selected to give that order to.');
    return;
  }

  let best: MechEntity | null = null;
  let bestRange = Infinity;
  for (const entity of context.world.entities) {
    if (entity.team === anchor.team || !isOperational(entity)) continue;
    if (context.world.vision !== null && !context.world.vision.visible.has(entity.id)) continue;
    const range = Math.hypot(entity.pos.x - anchor.pos.x, entity.pos.y - anchor.pos.y);
    if (range >= bestRange) continue;
    best = entity;
    bestRange = range;
  }

  if (best === null) {
    useGame.getState().pushLog('Nothing hostile in optical sight.');
    return;
  }
  attack(best.id);
}

export function setSelectionPosture(context: EngineOrderContext, posture: Posture): void {
  const mechs = context
    .selectedEntities()
    .map((id) => findEntity(context.world, id))
    .filter((entity): entity is MechEntity => entity !== null && !entity.autopilot);
  if (mechs.length === 0) return;

  const already = mechs.every((entity) => entity.posture === posture);
  for (const entity of mechs) setPosture(entity, already ? 'free' : posture);
}

export function stopSelection(context: EngineOrderContext): void {
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    issueStop(entity);
    entity.orders.attack = null;
  }
}

export function toggleSelectionHoldFire(context: EngineOrderContext): void {
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    setHoldFire(entity, !isHoldingFire(entity));
  }
}

export function toggleSelectionHeatSafety(context: EngineOrderContext): void {
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    entity.heatSafety = !entity.heatSafety;
    // Switching the governor off stops it restoring anything, so hand the guns
    // back to whatever the pilot last asked for — not to everything.
    if (!entity.heatSafety) restoreIntent(entity);
  }
}

export function useSelectionAbilities(context: EngineOrderContext): void {
  let used = 0;
  let asked = 0;
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    asked += 1;
    if (!useAbility(context.world, entity)) continue;
    used += 1;
    const ability = context.world.rules.abilities.entries[entity.ability.id];
    useGame.getState().pushLog(`${entity.pilot.name}: ${ability?.label ?? entity.ability.id}.`);
  }
  if (used > 0) context.audio.order();
  else if (asked > 0) useGame.getState().pushLog('Nothing ready to call on yet.');
  else useGame.getState().pushLog('No mech selected to give that order to.');
}

export function alphaStrikeSelection(context: EngineOrderContext): void {
  let fired = 0;
  let asked = 0;
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    asked += 1;
    if (issueAlphaStrike(context.world, entity)) fired += 1;
  }
  if (fired > 0) {
    context.audio.order();
    useGame.getState().pushLog(`Alpha strike — ${fired} mech${fired === 1 ? '' : 's'}.`);
  } else if (asked > 0) useGame.getState().pushLog('Guns are not ready for an alpha yet.');
  else useGame.getState().pushLog('No mech selected to give that order to.');
}

export function toggleSelectionGroup(context: EngineOrderContext, group: number): void {
  for (const id of context.selectedEntities()) {
    const entity = findEntity(context.world, id);
    if (entity === null || entity.autopilot) continue;
    setGroupEnabled(entity, group, entity.groupIntent[group - 1] !== true);
  }
}
