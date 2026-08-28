import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { visionFor } from '../sim/sensors';
import type { AudioDirector } from './audio';
import { attackSelection, engageContactSelection, type EngineOrderContext } from './engineOrders';
import { useGame } from './store';

beforeEach(() => useGame.setState({ log: [] }));

describe('sensor contact orders', () => {
  it('assigns a live return to selected indirect mounts without moving the lance', () => {
    const world = playerWorld('indirect-contact-ui');
    const shooter = unitOf(world, 'bulwark_assault');
    const target = world.entities.find((entity) => entity.team !== shooter.team);
    if (target === undefined) throw new Error('need a hostile contact');
    const vision = visionFor(world, shooter.team);
    if (vision === null) throw new Error('need team vision');
    vision.visible.clear();
    vision.detected.add(target.id);
    vision.tracks.set(target.id, {
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { ...target.pos },
      tick: world.tick,
      source: 'sensor',
    });
    const order = vi.fn();
    const context: EngineOrderContext = {
      world,
      audio: { order } as unknown as AudioDirector,
      selectedEntities: () => [shooter.id],
    };
    engageContactSelection(context, target.id, target.pos);

    expect(shooter.orders.attack).toEqual({ targetId: target.id, calledShot: null });
    expect(shooter.orders.move).toBeNull();
    expect(order).toHaveBeenCalledOnce();
    expect(useGame.getState().log[0]).toBe('1 mech firing indirectly on sensor contact.');
  });

  it('falls back to a coarse investigation when no indirect solution exists', () => {
    const world = playerWorld('investigate-contact-ui');
    const shooter = unitOf(world, 'sentinel_brawler');
    const target = world.entities.find((entity) => entity.team !== shooter.team);
    if (target === undefined) throw new Error('need a hostile contact');
    shooter.weapons = shooter.weapons.filter((mount) =>
      world.catalog.weapons.get(mount.weaponId)?.tags.includes('indirect_fire') !== true,
    );
    const context: EngineOrderContext = {
      world,
      audio: { order: vi.fn() } as unknown as AudioDirector,
      selectedEntities: () => [shooter.id],
    };
    engageContactSelection(context, target.id, { x: 504, y: 312 });

    expect(shooter.orders.attack).toBeNull();
    expect(shooter.orders.move?.engage).toBe(true);
    expect(shooter.orders.move?.to).toEqual({ x: 504, y: 312 });
  });

  it('splits a mixed selection between indirect fire and coarse investigation', () => {
    const world = playerWorld('mixed-contact-ui');
    const battery = unitOf(world, 'bulwark_assault');
    const scout = unitOf(world, 'sentinel_brawler');
    const target = world.entities.find((entity) => entity.team !== battery.team);
    if (target === undefined) throw new Error('need hostile contact');
    const vision = visionFor(world, battery.team);
    if (vision === null) throw new Error('need team vision');
    vision.visible.clear();
    vision.detected.add(target.id);
    vision.tracks.set(target.id, {
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { x: 504, y: 312 },
      tick: world.tick,
      source: 'sensor',
    });
    scout.weapons = scout.weapons.filter((mount) =>
      world.catalog.weapons.get(mount.weaponId)?.tags.includes('indirect_fire') !== true,
    );
    const context: EngineOrderContext = {
      world,
      audio: { order: vi.fn() } as unknown as AudioDirector,
      selectedEntities: () => [battery.id, scout.id],
    };

    engageContactSelection(context, target.id, { x: 504, y: 312 });

    expect(battery.orders.attack).toEqual({ targetId: target.id, calledShot: null });
    expect(battery.orders.move).toBeNull();
    expect(scout.orders.attack).toBeNull();
    expect(scout.orders.move?.engage).toBe(true);
    expect(useGame.getState().log[0]).toBe(
      '1 mech firing indirectly on sensor contact; 1 mech investigating sensor contact.',
    );
  });

  it('never puts the hidden chassis name into a generic attack-order log', () => {
    const world = playerWorld('private-indirect-order-log');
    const shooter = unitOf(world, 'bulwark_assault');
    const target = world.entities.find((entity) => entity.team !== shooter.team);
    if (target === undefined) throw new Error('need hostile contact');
    target.name = 'SECRET SENSOR CHASSIS';
    const vision = visionFor(world, shooter.team);
    if (vision === null) throw new Error('need team vision');
    vision.visible.delete(target.id);
    vision.detected.add(target.id);
    vision.tracks.set(target.id, {
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { ...target.pos },
      tick: world.tick,
      source: 'sensor',
    });
    const context: EngineOrderContext = {
      world,
      audio: { order: vi.fn() } as unknown as AudioDirector,
      selectedEntities: () => [shooter.id],
    };

    attackSelection(context, target.id, 'head');

    expect(useGame.getState().log[0]).toBe('1 mech targeting sensor contact.');
    expect(useGame.getState().log.join(' ')).not.toContain('SECRET SENSOR CHASSIS');
    expect(shooter.calledShot).toBeNull();
  });
});
