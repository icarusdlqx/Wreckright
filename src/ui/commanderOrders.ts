import type { MechLocation } from '../schema/common';
import type { SupportCallId } from '../sim/support';
import type { EntityId, Vec2 } from '../sim/types';
import type { GameActions, GameState, OrderMode } from './store';

/** Contacts cross this seam only as quantized presentation markers, never entities. */
export type CommanderOrderTarget =
  | { kind: 'ground'; position: Vec2 }
  | { kind: 'friendly'; id: EntityId; position: Vec2 }
  | { kind: 'optical'; id: EntityId; position: Vec2 }
  | { kind: 'contact'; id: EntityId; position: Vec2 };

export interface CommanderOrderEngine {
  selectedEntities(): EntityId[];
  orderMove(
    to: Vec2,
    run: boolean,
    options?: { engage?: boolean; queued?: boolean },
  ): void;
  engageContact(targetId: EntityId, to: Vec2): void;
  orderJump(to: Vec2): void;
  orderAttack(targetId: EntityId, calledShot: MechLocation | null): void;
  supportNeedsHeading(call: SupportCallId): boolean;
  callSupport(
    call: SupportCallId,
    target: Vec2,
    runTo?: Vec2,
  ): { ok: boolean; reason: string | null };
}

export type CommanderOrderState = Pick<
  GameState,
  | 'selection'
  | 'orderMode'
  | 'queueOrders'
  | 'calledShotLocation'
  | 'supportMode'
>;

export type CommanderOrderActions = Pick<
  GameActions,
  'setSelection' | 'setOrderMode' | 'setSupportMode' | 'patch'
>;

export interface CommanderPointerIntent {
  /** DOM button numbering: primary 0, middle 1, secondary 2. */
  button: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  mobile?: boolean;
  /** The release point of a directional support drag. */
  headingTo?: Vec2;
}

export interface CommanderOrderRequest {
  engine: CommanderOrderEngine;
  state: CommanderOrderState;
  actions: CommanderOrderActions;
  target: CommanderOrderTarget;
  pointer: CommanderPointerIntent;
}

export type CommanderOrderResult =
  | { kind: 'ignored' }
  | { kind: 'selection'; ids: EntityId[] }
  | { kind: 'move'; run: boolean; engage: boolean; queued: boolean }
  | { kind: 'jump' }
  | { kind: 'attack'; calledShot: MechLocation | null }
  | { kind: 'contact' }
  | { kind: 'support'; ok: boolean; reason: string | null };

function copyPoint(point: Vec2): Vec2 {
  return { x: point.x, y: point.y };
}

function isSecondary(pointer: CommanderPointerIntent): boolean {
  return pointer.button === 2 || (pointer.button === 0 && pointer.ctrlKey === true);
}

function isRouteMode(mode: OrderMode): mode is 'move' | 'run' | 'attack_move' {
  return mode === 'move' || mode === 'run' || mode === 'attack_move';
}

function queueRequested(state: CommanderOrderState, pointer: CommanderPointerIntent): boolean {
  return pointer.mobile === true ? state.queueOrders : pointer.shiftKey === true;
}

function finishExplicitMode(
  state: CommanderOrderState,
  actions: CommanderOrderActions,
  pointer: CommanderPointerIntent,
  issued: boolean,
): void {
  if (!issued && pointer.mobile === true) return;
  if (
    pointer.mobile === true &&
    state.queueOrders &&
    isRouteMode(state.orderMode)
  ) return;
  actions.setOrderMode(null);
}

function issueMove(
  engine: CommanderOrderEngine,
  target: CommanderOrderTarget,
  run: boolean,
  engage: boolean,
  queued: boolean,
): CommanderOrderResult {
  engine.orderMove(copyPoint(target.position), run, { engage, queued });
  return { kind: 'move', run, engage, queued };
}

function issueTarget(
  engine: CommanderOrderEngine,
  target: CommanderOrderTarget,
  calledShot: MechLocation | null,
): CommanderOrderResult {
  if (target.kind === 'optical') {
    engine.orderAttack(target.id, calledShot);
    return { kind: 'attack', calledShot };
  }
  if (target.kind === 'contact') {
    engine.engageContact(target.id, copyPoint(target.position));
    return { kind: 'contact' };
  }
  return { kind: 'ignored' };
}

function issueSupport(request: CommanderOrderRequest): CommanderOrderResult {
  const { engine, state, actions, target, pointer } = request;
  const call = state.supportMode;
  if (call === null) return { kind: 'ignored' };

  const at = copyPoint(target.position);
  const runTo = engine.supportNeedsHeading(call)
    ? copyPoint(pointer.headingTo ?? target.position)
    : at;
  const result = engine.callSupport(call, at, runTo);
  if (result.ok) actions.setSupportMode(null);
  else actions.patch({ supportNotice: result.reason });
  return { kind: 'support', ...result };
}

function issueExplicit(request: CommanderOrderRequest): CommanderOrderResult {
  const { engine, state, actions, target, pointer } = request;
  const mode = state.orderMode;
  if (mode === null) return { kind: 'ignored' };

  let result: CommanderOrderResult;
  switch (mode) {
    case 'move':
      result = issueMove(engine, target, false, false, queueRequested(state, pointer));
      break;
    case 'run':
      result = issueMove(engine, target, true, false, queueRequested(state, pointer));
      break;
    case 'attack_move':
      result = issueMove(engine, target, false, true, queueRequested(state, pointer));
      break;
    case 'jump':
      engine.orderJump(copyPoint(target.position));
      result = { kind: 'jump' };
      break;
    case 'attack':
      result = issueTarget(engine, target, null);
      break;
    case 'called_shot':
      result = issueTarget(engine, target, state.calledShotLocation);
      break;
  }

  finishExplicitMode(state, actions, pointer, result.kind !== 'ignored');
  return result;
}

function selectFriendly(request: CommanderOrderRequest): CommanderOrderResult {
  const { state, actions, target, pointer } = request;
  if (target.kind !== 'friendly') return { kind: 'ignored' };

  const ids =
    pointer.mobile !== true && pointer.shiftKey === true
      ? state.selection.includes(target.id)
        ? state.selection.filter((id) => id !== target.id)
        : [...state.selection, target.id]
      : [target.id];
  actions.setSelection(ids);
  return { kind: 'selection', ids };
}

function issuePrimary(request: CommanderOrderRequest): CommanderOrderResult {
  const { engine, state, actions, target, pointer } = request;
  const friendlySelected = engine.selectedEntities().length > 0;

  if (target.kind === 'friendly') return selectFriendly(request);
  if (target.kind === 'optical') {
    if (friendlySelected) return issueTarget(engine, target, null);
    const ids = [target.id];
    actions.setSelection(ids);
    return { kind: 'selection', ids };
  }
  if (target.kind === 'contact') {
    return friendlySelected ? issueTarget(engine, target, null) : { kind: 'ignored' };
  }
  if (pointer.mobile === true) {
    return friendlySelected
      ? issueMove(engine, target, false, false, state.queueOrders)
      : { kind: 'ignored' };
  }
  if (pointer.shiftKey === true) return { kind: 'ignored' };

  actions.setSelection([]);
  return { kind: 'selection', ids: [] };
}

/** Routes one Commander-overlay activation through the field's existing order grammar. */
export function routeCommanderOrder(request: CommanderOrderRequest): CommanderOrderResult {
  const { engine, state, actions, target, pointer } = request;
  const secondary = isSecondary(pointer);
  if (state.supportMode !== null && pointer.button === 0 && !secondary) {
    return issueSupport(request);
  }
  if (secondary) {
    const result = issueTarget(engine, target, null);
    actions.setOrderMode(null);
    return result.kind === 'ignored'
      ? issueMove(engine, target, false, false, pointer.shiftKey === true)
      : result;
  }
  if (pointer.button !== 0) return { kind: 'ignored' };
  if (state.orderMode !== null) return issueExplicit(request);
  return issuePrimary(request);
}
