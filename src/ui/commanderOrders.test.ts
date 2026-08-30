import { describe, expect, it, vi } from 'vitest';
import type { MechLocation } from '../schema/common';
import type { SupportCallId } from '../sim/support';
import type { Vec2 } from '../sim/types';
import {
  routeCommanderOrder,
  type CommanderOrderActions,
  type CommanderOrderEngine,
  type CommanderOrderState,
  type CommanderOrderTarget,
  type CommanderPointerIntent,
} from './commanderOrders';

const GROUND: CommanderOrderTarget = {
  kind: 'ground',
  position: { x: 440, y: 280 },
};

function harness(overrides: Partial<CommanderOrderState> = {}) {
  const state: CommanderOrderState = {
    selection: [1],
    orderMode: null,
    queueOrders: false,
    calledShotLocation: null,
    supportMode: null,
    ...overrides,
  };
  const engine: CommanderOrderEngine = {
    selectedEntities: vi.fn(() => [1]),
    orderMove: vi.fn(),
    engageContact: vi.fn(),
    orderJump: vi.fn(),
    orderAttack: vi.fn(),
    supportNeedsHeading: vi.fn(() => false),
    callSupport: vi.fn(() => ({ ok: true, reason: null })),
  };
  const actions: CommanderOrderActions = {
    setSelection: vi.fn(),
    setOrderMode: vi.fn(),
    setSupportMode: vi.fn(),
    patch: vi.fn(),
  };
  const route = (
    target: CommanderOrderTarget,
    pointer: Partial<CommanderPointerIntent> = {},
  ) => routeCommanderOrder({
    engine,
    state,
    actions,
    target,
    pointer: { button: 0, ...pointer },
  });
  return { actions, engine, route, state };
}

describe('Commander selection and direct orders', () => {
  it('selects friendly chits and uses Shift to toggle a desktop selection', () => {
    const friendly: CommanderOrderTarget = {
      kind: 'friendly',
      id: 2,
      position: { x: 120, y: 90 },
    };
    const single = harness();
    expect(single.route(friendly)).toEqual({ kind: 'selection', ids: [2] });
    expect(single.actions.setSelection).toHaveBeenCalledWith([2]);

    const additive = harness({ selection: [1, 2] });
    expect(additive.route(friendly, { shiftKey: true })).toEqual({
      kind: 'selection',
      ids: [1],
    });
    expect(additive.actions.setSelection).toHaveBeenCalledWith([1]);
  });

  it('turns right-click and macOS Ctrl-click ground activations into walk orders', () => {
    for (const pointer of [
      { button: 2 },
      { button: 0, ctrlKey: true },
    ]) {
      const { actions, engine, route } = harness({ orderMode: 'attack' });
      expect(route(GROUND, pointer)).toEqual({
        kind: 'move',
        run: false,
        engage: false,
        queued: false,
      });
      expect(engine.orderMove).toHaveBeenCalledWith(
        { x: 440, y: 280 },
        false,
        { engage: false, queued: false },
      );
      expect(actions.setOrderMode).toHaveBeenCalledWith(null);
    }
  });

  it('uses Shift to queue a secondary ground order', () => {
    const { engine, route } = harness();
    route(GROUND, { button: 2, shiftKey: true });
    expect(engine.orderMove).toHaveBeenCalledWith(
      { x: 440, y: 280 },
      false,
      { engage: false, queued: true },
    );
  });

  it('attacks an optical chit when a friendly selection can take orders', () => {
    const { engine, route } = harness();
    const target: CommanderOrderTarget = {
      kind: 'optical',
      id: 9,
      position: { x: 610, y: 350 },
    };
    expect(route(target)).toEqual({ kind: 'attack', calledShot: null });
    expect(engine.orderAttack).toHaveBeenCalledWith(9, null);
    expect(engine.engageContact).not.toHaveBeenCalled();
  });

  it.each(['current sensor', 'remembered'])(
    'engages a %s contact only at its coarse marker position',
    () => {
      const { engine, route } = harness();
      const target = {
        kind: 'contact',
        id: 71,
        position: { x: 504, y: 312 },
      } satisfies CommanderOrderTarget;

      expect(route(target)).toEqual({ kind: 'contact' });
      expect(engine.engageContact).toHaveBeenCalledWith(71, { x: 504, y: 312 });
      expect(engine.orderAttack).not.toHaveBeenCalled();
      expect(Object.keys(target).sort()).toEqual(['id', 'kind', 'position']);
    },
  );
});

describe('Commander explicit order modes', () => {
  it.each<{
    mode: Exclude<CommanderOrderState['orderMode'], null>;
    target: CommanderOrderTarget;
    assertion: (
      engine: CommanderOrderEngine,
      calledShot: MechLocation,
      point: Vec2,
    ) => void;
  }>([
    {
      mode: 'move',
      target: GROUND,
      assertion: (engine, _calledShot, point) =>
        expect(engine.orderMove).toHaveBeenCalledWith(point, false, {
          engage: false,
          queued: false,
        }),
    },
    {
      mode: 'run',
      target: GROUND,
      assertion: (engine, _calledShot, point) =>
        expect(engine.orderMove).toHaveBeenCalledWith(point, true, {
          engage: false,
          queued: false,
        }),
    },
    {
      mode: 'attack_move',
      target: GROUND,
      assertion: (engine, _calledShot, point) =>
        expect(engine.orderMove).toHaveBeenCalledWith(point, false, {
          engage: true,
          queued: false,
        }),
    },
    {
      mode: 'jump',
      target: GROUND,
      assertion: (engine, _calledShot, point) =>
        expect(engine.orderJump).toHaveBeenCalledWith(point),
    },
    {
      mode: 'attack',
      target: { kind: 'optical', id: 9, position: GROUND.position },
      assertion: (engine) => expect(engine.orderAttack).toHaveBeenCalledWith(9, null),
    },
    {
      mode: 'called_shot',
      target: { kind: 'optical', id: 9, position: GROUND.position },
      assertion: (engine, calledShot) =>
        expect(engine.orderAttack).toHaveBeenCalledWith(9, calledShot),
    },
  ])('routes $mode through the matching Engine surface', ({ mode, target, assertion }) => {
    const calledShot: MechLocation = 'left_leg';
    const { actions, engine, route } = harness({
      orderMode: mode,
      calledShotLocation: calledShot,
    });
    const point = { x: target.position.x, y: target.position.y };
    expect(route(target).kind).not.toBe('ignored');
    assertion(engine, calledShot, point);
    expect(actions.setOrderMode).toHaveBeenCalledWith(null);
  });

  it.each(['attack', 'called_shot'] as const)(
    'turns %s on a contact into privacy-safe contact engagement',
    (mode) => {
      const { engine, route } = harness({
        orderMode: mode,
        calledShotLocation: 'head',
      });
      route({ kind: 'contact', id: 88, position: { x: 480, y: 320 } });
      expect(engine.engageContact).toHaveBeenCalledWith(88, { x: 480, y: 320 });
      expect(engine.orderAttack).not.toHaveBeenCalled();
    },
  );
});

describe('Commander mobile queue grammar', () => {
  it.each(['move', 'run', 'attack_move'] as const)(
    'keeps queued %s mode armed across successive taps',
    (mode) => {
      const { actions, engine, route } = harness({
        orderMode: mode,
        queueOrders: true,
      });
      route(GROUND, { mobile: true });
      expect(engine.orderMove).toHaveBeenCalledWith(
        { x: 440, y: 280 },
        mode === 'run',
        { engage: mode === 'attack_move', queued: true },
      );
      expect(actions.setOrderMode).not.toHaveBeenCalled();
    },
  );

  it('clears a non-queued route mode and every non-route mode', () => {
    const routeMode = harness({ orderMode: 'move', queueOrders: false });
    routeMode.route(GROUND, { mobile: true });
    expect(routeMode.actions.setOrderMode).toHaveBeenCalledWith(null);

    const jumpMode = harness({ orderMode: 'jump', queueOrders: true });
    jumpMode.route(GROUND, { mobile: true });
    expect(jumpMode.actions.setOrderMode).toHaveBeenCalledWith(null);
  });

  it('queues an unarmed ground tap without turning it into a desktop selection clear', () => {
    const { actions, engine, route } = harness({ queueOrders: true });
    route(GROUND, { mobile: true });
    expect(engine.orderMove).toHaveBeenCalledWith(
      { x: 440, y: 280 },
      false,
      { engage: false, queued: true },
    );
    expect(actions.setSelection).not.toHaveBeenCalled();
  });
});

describe('Commander support routing', () => {
  function supportHarness(
    call: SupportCallId,
    response: { ok: boolean; reason: string | null },
  ) {
    const setup = harness({ supportMode: call });
    vi.mocked(setup.engine.supportNeedsHeading).mockReturnValue(call === 'air_strike');
    vi.mocked(setup.engine.callSupport).mockReturnValue(response);
    return setup;
  }

  it('commits a directional run and clears it only after success', () => {
    const { actions, engine, route } = supportHarness('air_strike', {
      ok: true,
      reason: null,
    });
    expect(route(GROUND, { headingTo: { x: 620, y: 280 } })).toEqual({
      kind: 'support',
      ok: true,
      reason: null,
    });
    expect(engine.callSupport).toHaveBeenCalledWith(
      'air_strike',
      { x: 440, y: 280 },
      { x: 620, y: 280 },
    );
    expect(actions.setSupportMode).toHaveBeenCalledWith(null);
  });

  it('leaves a rejected directional call armed with its reason', () => {
    const { actions, engine, route } = supportHarness('air_strike', {
      ok: false,
      reason: 'that point is off the map',
    });
    expect(route(GROUND, { headingTo: { x: 900, y: 280 } })).toEqual({
      kind: 'support',
      ok: false,
      reason: 'that point is off the map',
    });
    expect(engine.callSupport).toHaveBeenCalledWith(
      'air_strike',
      { x: 440, y: 280 },
      { x: 900, y: 280 },
    );
    expect(actions.setSupportMode).not.toHaveBeenCalled();
    expect(actions.patch).toHaveBeenCalledWith({
      supportNotice: 'that point is off the map',
    });
  });

  it('ignores a heading for a positional support call', () => {
    const { engine, route } = supportHarness('sensor_probe', {
      ok: true,
      reason: null,
    });
    route(GROUND, { headingTo: { x: 900, y: 700 } });
    expect(engine.callSupport).toHaveBeenCalledWith(
      'sensor_probe',
      { x: 440, y: 280 },
      { x: 440, y: 280 },
    );
  });
});
