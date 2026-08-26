import { describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { MechEntity, World } from '../sim/types';
import { IncomingFireDirections } from './incomingFireDirections';

class FakeStyle {
  left = '';
  top = '';
  transform = '';
}

class FakeElement {
  className = '';
  hidden = false;
  readonly style = new FakeStyle();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  setAttribute(): void {}

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

interface Harness {
  host: FakeElement;
  pool: IncomingFireDirections;
  project: ReturnType<typeof vi.fn<(entity: MechEntity) => { x: number; y: number; radius: number }>>;
  setNow(value: number): void;
  createElement: ReturnType<typeof vi.fn<() => FakeElement>>;
}

function harness(
  body: (entity: MechEntity) => { x: number; y: number; radius: number } = () => ({
    x: 1_100,
    y: 300,
    radius: 20,
  }),
  capacity = 6,
  viewport = { width: 1_000, height: 600 },
  direction: (
    entity: MechEntity,
    out: { x: number; y: number },
  ) => void = (entity, out) => {
    const projected = body(entity);
    out.x = projected.x - viewport.width / 2;
    out.y = projected.y - viewport.height / 2;
  },
): Harness {
  const host = new FakeElement();
  let currentNow = 0;
  const project = vi.fn(body);
  const createElement = vi.fn(() => new FakeElement());
  const pool = new IncomingFireDirections(
    host as unknown as HTMLElement,
    project,
    direction,
    () => viewport,
    capacity,
    { createElement: createElement as unknown as Document['createElement'] },
    () => currentNow,
  );
  return {
    host,
    pool,
    project,
    createElement,
    setNow(value: number): void {
      currentNow = value;
    },
  };
}

function combatants(world: World): { ally: MechEntity; enemies: MechEntity[] } {
  const ally = world.entities.find((entity) => entity.team === (world.playerTeam ?? 0));
  const enemies = world.entities.filter((entity) => entity.team !== (world.playerTeam ?? 0));
  if (ally === undefined || enemies.length < 2) throw new Error('missing test combatants');
  return { ally, enemies };
}

function hit(shooterId: number, targetId: number, tick = 1): SimEvent {
  return {
    type: 'projectile_hit',
    tick,
    shooterId,
    targetId,
    weaponId: 'ac5',
    location: 'centre_torso',
    damage: 8,
    arc: 'front',
  };
}

describe('incoming-fire direction pool', () => {
  it('places a player-team hit on the edge toward a fully off-screen shooter', () => {
    const world = playerWorld('incoming-edge');
    const { ally, enemies } = combatants(world);
    const shooter = enemies[0];
    if (world.vision === null || shooter === undefined) throw new Error('missing player vision');
    world.vision.visible.add(shooter.id);
    const { host, pool } = harness();

    pool.consume(world, [hit(shooter.id, ally.id)], []);

    const tick = host.children[0]?.children[0];
    expect(pool.activeCount).toBe(1);
    expect(tick?.hidden).toBe(false);
    expect(tick?.style.left).toBe('968.0px');
    expect(tick?.style.top).toBe('300.0px');
    expect(tick?.style.transform).toContain('rotate(45.0deg)');
  });

  it('ignores an unselected hostile target and any shooter whose hull meets the screen', () => {
    const world = playerWorld('incoming-target-filter');
    const { enemies } = combatants(world);
    const shooter = enemies[0];
    const target = enemies[1];
    if (world.vision === null || shooter === undefined || target === undefined) {
      throw new Error('missing player vision');
    }
    world.vision.visible.add(shooter.id);
    const { pool } = harness(() => ({ x: 1_010, y: 300, radius: 20 }));

    pool.consume(world, [hit(shooter.id, target.id)], []);
    expect(pool.activeCount).toBe(0);
    pool.consume(world, [hit(shooter.id, target.id)], [target.id]);
    expect(pool.activeCount).toBe(0);

    const offScreen = harness(() => ({ x: -30, y: 100, radius: 20 }));
    offScreen.pool.consume(world, [hit(shooter.id, target.id)], [target.id]);
    expect(offScreen.pool.activeCount).toBe(1);
    expect(offScreen.host.children[0]?.children[0]?.style.left).toBe('32.0px');
  });

  it('checks the fog boundary before asking for an exact shooter position', () => {
    const world = playerWorld('incoming-private-bearing');
    const { ally, enemies } = combatants(world);
    const shooter = enemies[0];
    if (world.vision === null || shooter === undefined) throw new Error('missing player vision');
    world.vision.detected.add(shooter.id);
    world.vision.visible.delete(shooter.id);
    const { pool, project } = harness();

    pool.consume(world, [hit(shooter.id, ally.id)], []);
    expect(pool.activeCount).toBe(0);
    expect(project).not.toHaveBeenCalled();

    world.vision.visible.add(shooter.id);
    pool.consume(world, [hit(shooter.id, ally.id, 2)], []);
    expect(pool.activeCount).toBe(1);
    expect(project).toHaveBeenCalledOnce();
  });

  it('uses the camera-aware bearing when perspective puts a behind-camera shooter above', () => {
    const world = playerWorld('incoming-behind-camera');
    const { ally, enemies } = combatants(world);
    const shooter = enemies[0];
    if (world.vision === null || shooter === undefined) throw new Error('missing player vision');
    world.vision.visible.add(shooter.id);
    const { host, pool } = harness(
      () => ({ x: 500, y: -200, radius: 20 }),
      6,
      { width: 1_000, height: 600 },
      (_entity, out) => {
        out.x = 0;
        out.y = 1;
      },
    );

    pool.consume(world, [hit(shooter.id, ally.id)], []);

    expect(host.children[0]?.children[0]?.style.top).toBe('568.0px');
  });

  it('keeps a diagonal cue inside a compact viewport', () => {
    const world = playerWorld('incoming-compact-corner');
    const { ally, enemies } = combatants(world);
    const shooter = enemies[0];
    if (world.vision === null || shooter === undefined) throw new Error('missing player vision');
    world.vision.visible.add(shooter.id);
    const { host, pool } = harness(
      () => ({ x: 400, y: 260, radius: 12 }),
      6,
      { width: 320, height: 180 },
      (_entity, out) => {
        out.x = 1;
        out.y = 1;
      },
    );

    pool.consume(world, [hit(shooter.id, ally.id)], []);

    expect(host.children[0]?.children[0]?.style.left).toBe('218.0px');
    expect(host.children[0]?.children[0]?.style.top).toBe('148.0px');
  });

  it('coalesces volleys inside a fixed pool and recycles every slot after its pulse', () => {
    const world = playerWorld('incoming-pool-budget');
    const { ally, enemies } = combatants(world);
    if (world.vision === null) throw new Error('missing player vision');
    for (const enemy of enemies) world.vision.visible.add(enemy.id);
    const { host, pool, project, createElement, setNow } = harness(
      (entity) => ({ x: 1_100, y: 80 + entity.id * 35, radius: 12 }),
      3,
    );
    const root = host.children[0];
    const identities = root?.children.slice() ?? [];
    const shooter = enemies[0];
    if (shooter === undefined) throw new Error('missing shooter');
    const volley = Array.from({ length: 40 }, () => hit(shooter.id, ally.id, 1));

    pool.consume(world, volley, []);
    expect(project).toHaveBeenCalledOnce();
    project.mockClear();

    for (let index = 0; index < 1_000; index += 1) {
      const shooter = enemies[index % enemies.length];
      if (shooter !== undefined) pool.consume(world, [hit(shooter.id, ally.id, index)], []);
    }

    expect(pool.nodeCount).toBe(4);
    expect(pool.activeCount).toBe(3);
    expect(createElement).toHaveBeenCalledTimes(4);
    expect(root?.children).toEqual(identities);
    setNow(851);
    expect(pool.activeCount).toBe(0);
    expect(root?.children.every((element) => element.hidden)).toBe(true);
    pool.destroy();
    expect(host.children).toHaveLength(0);
  });
});
