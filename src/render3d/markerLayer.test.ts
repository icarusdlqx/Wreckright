import { BufferAttribute, Line, Mesh, RingGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { World } from '../sim/types';
import { MarkerLayer, type MarkerViewState } from './markerLayer';

const emptyWorld = {
  zones: [],
  reveals: [],
  support: { pending: [] },
  entities: [],
  playerTeam: 0,
} as unknown as World;

const baseView: MarkerViewState = {
  selection: new Set(),
  orderMode: null,
  supportRadius: null,
  supportRun: null,
};

describe('support placement markers', () => {
  it('draws an authored radius without creating a new marker kind', () => {
    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw(emptyWorld, {
      ...baseView,
      supportRadius: { at: { x: 300, y: 420 }, radius: 45 },
    });

    const ring = layer.group.children.find((child) => child instanceof Mesh && child.visible);
    expect(ring).toBeDefined();
    expect(ring?.position.x).toBe(300);
    expect(ring?.position.z).toBe(420);
    layer.dispose();
  });

  it('keeps hostile command overlays private while drawing friendly orders', () => {
    const world = playerWorld('selected-marker-visibility');
    const friendly = world.entities.find((entity) => entity.team === world.playerTeam);
    const enemy = world.entities.find((entity) => entity.team !== world.playerTeam);
    expect(world.vision).not.toBeNull();
    expect(friendly).toBeDefined();
    expect(enemy).toBeDefined();
    if (world.vision === null || friendly === undefined || enemy === undefined) return;
    world.zones.length = 0;
    world.reveals.length = 0;
    world.support.pending.length = 0;
    enemy.path = [{ x: enemy.pos.x + 20, y: enemy.pos.y + 20 }];
    friendly.path = [{ x: friendly.pos.x + 20, y: friendly.pos.y + 20 }];
    const layer = new MarkerLayer(() => 0, () => null);
    const selectedEnemy = { ...baseView, selection: new Set([enemy.id]), orderMode: 'attack' as const };

    world.vision.visible.add(enemy.id);
    layer.draw(world, selectedEnemy);
    expect(layer.group.children.some((child) => child.visible)).toBe(false);

    world.vision.visible.delete(enemy.id);
    layer.draw(world, selectedEnemy);
    expect(layer.group.children.some((child) => child.visible)).toBe(false);

    layer.draw(world, {
      ...baseView,
      selection: new Set([friendly.id]),
      orderMode: 'attack',
    });
    expect(layer.group.children.some((child) => child instanceof Mesh && child.visible)).toBe(true);
    expect(layer.group.children.some((child) => child instanceof Line && child.visible)).toBe(true);
    layer.dispose();
  });

  it('lays the air-strike outline along the supplied heading', () => {
    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw(emptyWorld, {
      ...baseView,
      supportRun: {
        at: { x: 500, y: 400 },
        heading: 0,
        length: 280,
        width: 46,
      },
    });

    const lane = layer.group.children.find(
      (child) => child instanceof Line && child.visible,
    ) as Line | undefined;
    expect(lane).toBeDefined();
    const points = lane?.geometry.getAttribute('position') as BufferAttribute;
    expect(points.getX(0)).toBe(360);
    expect(points.getX(1)).toBe(640);
    expect(points.getZ(0)).toBe(377);
    expect(points.getZ(2)).toBe(423);
    expect(points.getX(4)).toBe(points.getX(0));
    expect(points.getZ(4)).toBe(points.getZ(0));
    layer.dispose();
  });

  it('does not disclose an enemy support call through the marker layer', () => {
    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw({
      ...emptyWorld,
      support: {
        pending: [{
          call: 'air_strike', team: 1, target: { x: 400, y: 400 }, heading: 0, resolveTick: 80,
        }],
        trucks: [],
        minefields: [],
      },
    }, baseView);

    expect(layer.group.children.some((child) => child instanceof Mesh && child.visible)).toBe(false);
    layer.dispose();
  });

  it('uses the authored repair radius and leaves air lanes to support presentation', () => {
    const world = playerWorld('pending-support-markers');
    world.support.pending.push({
      call: 'repair_truck',
      team: world.playerTeam ?? 0,
      target: { x: 300, y: 420 },
      heading: 0,
      resolveTick: 80,
    });
    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw(world, baseView);
    const repair = layer.group.children.find((child) => child instanceof Mesh && child.visible) as Mesh;
    expect((repair.geometry as RingGeometry).parameters.innerRadius)
      .toBeCloseTo(world.rules.support.repair_truck.radius - 1.6);

    world.support.pending[0] = {
      call: 'air_strike',
      team: world.playerTeam ?? 0,
      target: { x: 300, y: 420 },
      heading: 0,
      resolveTick: 80,
    };
    layer.draw(world, baseView);
    expect(layer.group.children.some((child) => child instanceof Mesh && child.visible)).toBe(false);
    layer.dispose();
  });
});
