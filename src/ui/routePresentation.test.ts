import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { MechEntity, World } from '../sim/types';
import { buildFriendlyRouteMarkers } from './enginePresentation';

function combatants(world: World): { friendly: MechEntity; hostile: MechEntity } {
  const playerTeam = world.playerTeam;
  if (playerTeam === null) throw new Error('player world has no player team');
  const friendly = world.entities.find((entity) => entity.team === playerTeam);
  const hostile = world.entities.find((entity) => entity.team !== playerTeam);
  if (friendly === undefined || hostile === undefined) throw new Error('mission too small');
  return { friendly, hostile };
}

describe('friendly route presentation', () => {
  it('copies the active remainder and at most eight queued legs with bearings and ETAs', () => {
    const world = playerWorld('route-presentation');
    const { friendly } = combatants(world);
    friendly.pos = { x: 100, y: 100 };
    friendly.facing = -0.5;
    friendly.walkSpeed = 10;
    friendly.runSpeed = 20;
    friendly.orders.move = { to: { x: 130, y: 140 }, run: false };
    friendly.path = [
      { x: 100, y: 100 },
      { x: 130, y: 100 },
      { x: 130, y: 140 },
    ];
    friendly.pathIndex = 1;
    friendly.orders.queue = [
      { to: { x: 170, y: 140 }, run: true },
      { to: { x: 170, y: 180 }, run: false },
      ...Array.from({ length: 8 }, (_, index) => ({
        to: { x: 180 + index * 10, y: 180 },
        run: false,
      })),
    ];

    const routes = buildFriendlyRouteMarkers(world, new Set([friendly.id]));
    const route = routes[0];
    if (route === undefined) throw new Error('selected route missing');

    expect(route.entityId).toBe(friendly.id);
    expect(route.team).toBe(friendly.team);
    expect(route.legs).toHaveLength(9);
    expect(route.legs[0]).toMatchObject({
      kind: 'active',
      run: false,
      points: [
        { x: 100, y: 100 },
        { x: 130, y: 100 },
        { x: 130, y: 140 },
      ],
      arrivalFacingEstimated: true,
    });
    expect(route.legs[0]?.arrivalFacing).toBeCloseTo(Math.PI / 2);
    expect(route.legs[0]?.cumulativeEtaSeconds).toBeCloseTo(7);
    expect(route.legs[1]).toMatchObject({
      kind: 'queued',
      run: true,
      points: [
        { x: 130, y: 140 },
        { x: 170, y: 140 },
      ],
      arrivalFacingEstimated: true,
    });
    expect(route.legs[1]?.arrivalFacing).toBeCloseTo(0);
    expect(route.legs[1]?.cumulativeEtaSeconds).toBeCloseTo(9);
    expect(route.legs[2]?.arrivalFacing).toBeCloseTo(Math.PI / 2);
    expect(route.legs[2]?.cumulativeEtaSeconds).toBeCloseTo(13);
    expect(route.legs[8]?.points[1]).toEqual(friendly.orders.queue[7]?.to);

    expect(route.legs[0]?.points[1]).not.toBe(friendly.path[1]);
    expect(route.legs[1]?.points[1]).not.toBe(friendly.orders.queue[0]?.to);
    const pathPoint = friendly.path[1];
    const queuedPoint = friendly.orders.queue[0]?.to;
    if (pathPoint === undefined || queuedPoint === undefined) throw new Error('test route missing');
    pathPoint.x = 999;
    queuedPoint.x = 999;
    expect(route.legs[0]?.points[1]).toEqual({ x: 130, y: 100 });
    expect(route.legs[1]?.points[1]).toEqual({ x: 170, y: 140 });
  });

  it('makes an invalid leg speed and every later cumulative ETA unavailable', () => {
    const world = playerWorld('route-invalid-speed');
    const { friendly } = combatants(world);
    friendly.pos = { x: 0, y: 0 };
    friendly.walkSpeed = 5;
    friendly.runSpeed = 0;
    friendly.orders.move = { to: { x: 30, y: 0 }, run: false };
    friendly.path = [];
    friendly.pathIndex = 0;
    friendly.orders.queue = [
      { to: { x: 50, y: 0 }, run: true },
      { to: { x: 60, y: 0 }, run: false },
    ];

    const route = buildFriendlyRouteMarkers(world, new Set([friendly.id]))[0];
    expect(route?.legs.map((leg) => leg.cumulativeEtaSeconds)).toEqual([6, null, null]);
  });

  it('fails closed without a player team and never reads selected hostile orders', () => {
    const world = playerWorld('route-privacy');
    const { friendly, hostile } = combatants(world);
    if (world.vision === null) throw new Error('player world has no vision state');
    world.vision.visible.add(hostile.id);
    Object.defineProperty(hostile, 'orders', {
      configurable: true,
      get(): never {
        throw new Error('hostile route state crossed the presentation boundary');
      },
    });

    expect(buildFriendlyRouteMarkers(world, new Set([hostile.id]))).toEqual([]);

    world.playerTeam = null;
    Object.defineProperty(friendly, 'orders', {
      configurable: true,
      get(): never {
        throw new Error('route state read without a player team');
      },
    });
    expect(buildFriendlyRouteMarkers(world, new Set([friendly.id]))).toEqual([]);
  });
});
