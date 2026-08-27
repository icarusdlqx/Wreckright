import { BufferAttribute, Line, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/types';
import { SupportEffects } from './supportEffects';

function presentation(world: World, reducedMotion = false): SupportEffects {
  return new SupportEffects(
    () => 0,
    (id) => world.entities.find((entity) => entity.id === id)?.pos ?? null,
    reducedMotion,
    world.rules.support.air_strike.shots,
  );
}

function airEvents(world: World, x: number, y: number): [SimEvent, SimEvent] {
  const team = world.playerTeam ?? 0;
  return [
    { type: 'support_called', tick: world.tick, team, call: 'air_strike', x, y, cost: 700 },
    { type: 'support_resolved', tick: world.tick + 80, team, call: 'air_strike', x, y },
  ];
}

describe('support-call presentation', () => {
  it('plots a pending air lane and sweeps its ETA toward the target end', () => {
    const world = playerWorld('support-pending-lane');
    world.tick = 20;
    world.support.pending.push({
      call: 'air_strike', team: 0, target: { x: 500, y: 400 }, heading: 0, resolveTick: 80,
    });
    const effects = presentation(world);
    effects.draw(world, 0.1);

    const outline = effects.group.getObjectByName('support-air-pending-0') as Line;
    const eta = effects.group.getObjectByName('support-air-eta-0') as Line;
    expect(outline.visible).toBe(true);
    expect(eta.visible).toBe(true);
    const outlinePoints = outline.geometry.getAttribute('position') as BufferAttribute;
    const etaPoints = eta.geometry.getAttribute('position') as BufferAttribute;
    expect(outlinePoints.getX(0)).toBe(357);
    expect(outlinePoints.getX(2)).toBe(643);
    expect(etaPoints.getX(0)).toBe(428.5);
    expect(etaPoints.getZ(0)).toBe(377);
    expect(etaPoints.getZ(1)).toBe(423);
    effects.dispose();
  });

  it('shows seven deterministic strike points, an aircraft, and persistent scars', () => {
    const world = playerWorld('support-air-run');
    const at = { x: 500, y: 400 };
    const pending = {
      call: 'air_strike' as const,
      team: 0,
      target: at,
      heading: Math.PI / 2,
      resolveTick: world.tick + 80,
    };
    world.support.pending.push(pending);
    const [called, resolved] = airEvents(world, at.x, at.y);
    const effects = presentation(world);
    const children = effects.group.children.length;
    effects.consume(world, [called]);
    world.support.pending.length = 0;
    effects.consume(world, [resolved]);
    effects.draw(world, 0.25);

    expect(effects.group.getObjectByName('support-aircraft-0')?.visible).toBe(true);
    const scars = Array.from({ length: world.rules.support.air_strike.shots }, (_, index) =>
      effects.group.getObjectByName(`support-air-scar-0-${index}`) as Mesh);
    expect(scars.every((scar) => scar.visible)).toBe(true);
    expect(scars.map((scar) => Math.round(scar.parent?.position.z ?? 0))).toEqual([
      280, 320, 360, 400, 440, 480, 520,
    ]);

    for (let index = 0; index < 100; index += 1) effects.consume(world, [resolved]);
    expect(effects.group.children).toHaveLength(children);
    effects.dispose();
  });

  it('keeps the strike readable without sweeping motion in reduced-motion mode', () => {
    const world = playerWorld('support-air-reduced');
    const at = { x: 500, y: 400 };
    world.support.pending.push({
      call: 'air_strike', team: 0, target: at, heading: 0, resolveTick: world.tick + 80,
    });
    const [called, resolved] = airEvents(world, at.x, at.y);
    const effects = presentation(world, true);
    effects.consume(world, [called]);
    world.support.pending.length = 0;
    effects.consume(world, [resolved]);
    effects.draw(world, 0.1);

    expect(effects.group.getObjectByName('support-aircraft-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('support-air-trail-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('support-air-scar-0-0')?.visible).toBe(true);
    effects.dispose();
  });

  it('keeps all strike points but drops the aircraft streak in low-FX mode', () => {
    const world = playerWorld('support-air-low-fx');
    const at = { x: 500, y: 400 };
    world.support.pending.push({
      call: 'air_strike', team: 0, target: at, heading: 0, resolveTick: world.tick + 80,
    });
    const [called, resolved] = airEvents(world, at.x, at.y);
    const effects = presentation(world);
    effects.setPresentationMode(true);
    effects.consume(world, [called]);
    world.support.pending.length = 0;
    effects.consume(world, [resolved]);
    effects.draw(world, 0.25);

    expect(effects.group.getObjectByName('support-aircraft-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('support-air-trail-0')?.visible).toBe(false);
    expect(Array.from({ length: world.rules.support.air_strike.shots }, (_, index) =>
      effects.group.getObjectByName(`support-air-scar-0-${index}`)?.visible)).toEqual(
      Array.from({ length: world.rules.support.air_strike.shots }, () => true),
    );
    effects.dispose();
  });

  it('places the repair truck, its authored radius, and bounded links to damaged allies', () => {
    const world = playerWorld('support-repair-truck');
    const ally = world.entities.find((entity) => entity.team === 0);
    expect(ally).toBeDefined();
    if (ally === undefined) return;
    ally.locations.centre_torso.rearArmour -= 1;
    world.support.trucks.push({
      team: 0,
      pos: { ...ally.pos },
      radius: 45,
      armourPerSecond: 7,
      expiresTick: world.tick + 600,
    });
    const effects = presentation(world);
    effects.draw(world, 0.1);

    expect(effects.group.getObjectByName('support-repair-truck-0')?.visible).toBe(true);
    const radius = effects.group.getObjectByName('support-repair-radius-0') as Mesh;
    expect(radius.scale.x).toBe(45);
    const visibleLinks = Array.from({ length: 6 }, (_, index) =>
      effects.group.getObjectByName(`support-repair-link-0-${index}`))
      .filter((link) => link?.visible === true);
    expect(visibleLinks.length).toBeGreaterThan(0);
    expect(visibleLinks.length).toBeLessThanOrEqual(6);
    effects.dispose();
  });

  it('telegraphs a visible enemy air strike and remembers its heading through resolution', () => {
    const world = playerWorld('support-visible-hostile-air');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const player = world.entities.find((entity) => entity.team === vision.team);
    if (player === undefined) throw new Error('mission has no player unit');
    const at = { ...player.pos };
    const enemyTeam = vision.team + 1;
    const tile = world.terrain.toTile(at);
    vision.tiles.fill(0);
    vision.tiles[tile.row * world.terrain.width + tile.column] = 1;
    world.support.pending.push({
      call: 'air_strike', team: enemyTeam, target: at, heading: Math.PI / 2, resolveTick: 80,
    });
    const effects = presentation(world);
    effects.draw(world, 0.1);
    expect(effects.group.getObjectByName('support-air-pending-0')?.visible).toBe(true);

    effects.consume(world, [{
      type: 'support_called', tick: world.tick, team: enemyTeam,
      call: 'air_strike', x: at.x, y: at.y, cost: 700,
    }]);
    world.support.pending.length = 0;
    effects.consume(world, [{
      type: 'support_resolved', tick: world.tick + 80, team: enemyTeam,
      call: 'air_strike', x: at.x, y: at.y,
    }]);
    effects.draw(world, 0.1);
    const craft = effects.group.getObjectByName('support-aircraft-0');
    expect(craft?.visible).toBe(true);
    expect(craft?.rotation.y).toBeCloseTo(-Math.PI / 2);
    effects.dispose();
  });

  it('does not reveal hidden enemy support calls and tears down idempotently', () => {
    const world = playerWorld('support-fog-privacy');
    world.vision?.tiles.fill(0);
    world.support.pending.push({
      call: 'air_strike', team: 1, target: { x: 500, y: 400 }, heading: 0, resolveTick: 80,
    });
    world.support.trucks.push({
      team: 1, pos: { x: 500, y: 400 }, radius: 45, armourPerSecond: 7, expiresTick: 600,
    });
    const effects = presentation(world);
    effects.draw(world, 0.1);

    expect(effects.group.getObjectByName('support-air-pending-0')?.visible).toBe(false);
    expect(effects.group.getObjectByName('support-repair-truck-0')?.visible).toBe(false);
    effects.consume(world, [{
      type: 'support_called', tick: world.tick, team: 1,
      call: 'air_strike', x: 500, y: 400, cost: 700,
    }]);
    world.support.pending.length = 0;
    effects.consume(world, [{
      type: 'support_resolved', tick: world.tick + 80, team: 1,
      call: 'air_strike', x: 500, y: 400,
    }]);
    effects.draw(world, 0.1);
    expect(effects.group.getObjectByName('support-aircraft-0')?.visible).toBe(false);
    effects.dispose();
    effects.dispose();
    expect(effects.group.children).toHaveLength(0);
    expect(() => effects.draw(world, 1)).not.toThrow();
  });
});
