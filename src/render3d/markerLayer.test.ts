import { BufferAttribute, Line, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { updateSupport } from '../sim/support';
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
  routes: [],
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

  it('gives a live sensor sweep a legible ring without disclosing enemy coverage', () => {
    const world = playerWorld('sensor-sweep-marker');
    const player = world.playerTeam ?? 0;
    world.zones.length = 0;
    world.support.pending.length = 0;
    world.reveals = [
      { team: player, kind: 'sensor', x: 300, y: 420, radius: 260, expiresTick: 100 },
      { team: player + 1, kind: 'sensor', x: 500, y: 420, radius: 260, expiresTick: 100 },
    ];
    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw(world, baseView);

    const rings = layer.group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.visible,
    );
    expect(rings).toHaveLength(1);
    expect(rings[0]?.position.x).toBe(300);
    const material = rings[0]?.material as MeshBasicMaterial | undefined;
    expect(material?.opacity).toBe(0.68);
    expect(material?.depthTest).toBe(false);
    expect(rings[0]?.renderOrder).toBe(10);
    const geometry = rings[0]?.geometry as RingGeometry | undefined;
    expect(geometry?.parameters.outerRadius).toBe(260);
    expect(geometry?.parameters.innerRadius).toBeCloseTo(255.2);

    const identities = {
      child: rings[0],
      geometry: rings[0]?.geometry,
      material: rings[0]?.material,
      children: layer.group.children.length,
    };
    world.tick = 100;
    updateSupport(world);
    layer.draw(world, baseView);
    expect(layer.group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.visible,
    )).toHaveLength(0);
    expect(layer.group.children).toHaveLength(identities.children);

    world.reveals = [
      { team: player, kind: 'sensor', x: 300, y: 420, radius: 260, expiresTick: 1_000 },
    ];
    layer.draw(world, baseView);
    const restored = layer.group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.visible,
    );
    expect(restored[0]).toBe(identities.child);
    expect(restored[0]?.geometry).toBe(identities.geometry);
    expect(restored[0]?.material).toBe(identities.material);

    world.reveals.push(
      { team: player, kind: 'sensor', x: 700, y: 420, radius: 260, expiresTick: 1_000 },
    );
    layer.draw(world, baseView);
    const atHighWater = layer.group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.visible,
    );
    expect(atHighWater).toHaveLength(2);
    expect(layer.group.children).toHaveLength(identities.children + 1);
    const secondRing = atHighWater[1];

    world.reveals.length = 0;
    layer.draw(world, baseView);
    world.reveals = [
      { team: player, kind: 'sensor', x: 700, y: 420, radius: 260, expiresTick: 1_000 },
      { team: player, kind: 'sensor', x: 300, y: 420, radius: 260, expiresTick: 1_000 },
    ];
    for (let frame = 0; frame < 1_000; frame += 1) layer.draw(world, baseView);
    const afterReuse = layer.group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.visible,
    );
    expect(afterReuse[0]).toBe(identities.child);
    expect(afterReuse[1]).toBe(secondRing);
    expect(afterReuse.every((ring) => ring.geometry === identities.geometry)).toBe(true);
    expect(afterReuse.every((ring) => ring.material === identities.material)).toBe(true);
    expect(layer.group.children).toHaveLength(identities.children + 1);
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
    const selectedEnemy = {
      ...baseView,
      selection: new Set([enemy.id]),
      orderMode: 'attack' as const,
      routes: [{
        entityId: enemy.id,
        team: enemy.team,
        legs: [{
          points: [enemy.pos, enemy.path[0] ?? enemy.pos],
          kind: 'active' as const,
          run: false,
          arrivalFacing: 0,
          arrivalFacingEstimated: true as const,
          cumulativeEtaSeconds: 5,
        }],
      }],
    };

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
      routes: [{
        entityId: friendly.id,
        team: friendly.team,
        legs: [{
          points: [friendly.pos, friendly.path[0] ?? friendly.pos],
          kind: 'active',
          run: false,
          arrivalFacing: 0,
          arrivalFacingEstimated: true,
          cumulativeEtaSeconds: 5,
        }],
      }],
    });
    expect(layer.group.children.some((child) => child instanceof Mesh && child.visible)).toBe(true);
    expect(layer.routeMarkerStats.routes).toBe(1);
    expect(layer.routeMarkerStats.activeLegs).toBe(1);
    layer.dispose();
  });

  it('draws the selected sensor instrument at its current-weather reach', () => {
    const world = playerWorld('weather-sensor-marker');
    const friendly = world.entities.find((entity) => entity.team === world.playerTeam);
    const moonlit = world.catalog.atmospheres.get('moonlit_night');
    if (friendly === undefined || moonlit === undefined) throw new Error('missing marker fixture');
    world.atmosphere = moonlit;
    world.zones.length = 0;
    world.reveals.length = 0;
    world.support.pending.length = 0;
    friendly.path.length = 0;

    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw(world, { ...baseView, selection: new Set([friendly.id]) });

    const rings = layer.group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.visible,
    );
    expect(rings).toHaveLength(1);
    const radius = (rings[0]?.geometry as RingGeometry | undefined)?.parameters.outerRadius;
    expect(radius).toBeCloseTo(friendly.sensorRange * 0.95);
    expect(radius).not.toBeCloseTo(friendly.sensorRange);
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

  it('telegraphs visible hostile artillery without disclosing hidden or private calls', () => {
    const world = playerWorld('hostile-support-marker');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const player = world.entities.find((entity) => entity.team === vision.team);
    if (player === undefined) throw new Error('mission has no player unit');
    world.zones.length = 0;
    world.reveals.length = 0;
    const target = { ...player.pos };
    const tile = world.terrain.toTile(target);
    const cell = tile.row * world.terrain.width + tile.column;
    vision.tiles.fill(0);
    vision.tiles[cell] = 1;
    world.support.pending = [{
      call: 'artillery_strike', team: 1, target, heading: 0, resolveTick: 80,
    }];
    const layer = new MarkerLayer(() => 0, () => null);
    layer.draw(world, baseView);
    const warning = layer.group.children.find(
      (child) => child instanceof Mesh && child.visible,
    ) as Mesh | undefined;
    expect((warning?.geometry as RingGeometry | undefined)?.parameters.outerRadius).toBe(
      world.rules.support.artillery_strike.radius + world.rules.support.artillery_strike.scatter,
    );

    vision.tiles[cell] = 0;
    world.support.pending[0] = {
      call: 'artillery_strike',
      team: 1,
      target: { x: world.terrain.width * world.terrain.tileSize - 10, y: 10 },
      heading: 0,
      resolveTick: 80,
    };
    layer.draw(world, baseView);
    expect(layer.group.children.some((child) => child instanceof Mesh && child.visible)).toBe(false);

    vision.tiles[cell] = 1;
    world.support.pending[0] = {
      call: 'repair_truck', team: 1, target, heading: 0, resolveTick: 80,
    };
    layer.draw(world, baseView);
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
