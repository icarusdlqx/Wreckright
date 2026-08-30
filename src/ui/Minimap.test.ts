import { describe, expect, it } from 'vitest';
import { catalog, playerWorld } from '../../tests/support';
import { createWorld } from '../sim/world';
import {
  createMinimapPulseLedger,
  minimapBlips,
  minimapKeyboardTarget,
  minimapPointFromClient,
  minimapPulseAppearance,
  minimapViewportFootprint,
  minimapZones,
  updateMinimapContactPulses,
  type MinimapBlip,
  type MinimapContactPulse,
} from './Minimap';

describe('minimap contact privacy', () => {
  it('never exposes an exact hostile when no player vision exists', () => {
    const world = playerWorld('no-vision-minimap');
    world.vision = null;

    const blips = minimapBlips(world);
    expect(blips.length).toBeGreaterThan(0);
    expect(blips.every((blip) => blip.team === world.playerTeam)).toBe(true);
  });

  it('draws a sensor return at its coarse track rather than the hidden live position', () => {
    const world = playerWorld('sensor-minimap');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (enemy === undefined) throw new Error('mission has no hostile');
    vision.visible.clear();
    vision.detected.clear();
    vision.tracks.clear();
    enemy.pos = { x: 731, y: 619 };
    const coarse = { x: 504, y: 312 };
    vision.detected.add(enemy.id);
    vision.tracks.set(enemy.id, {
      id: enemy.id,
      team: enemy.team,
      frame: enemy.frame,
      chassisClass: enemy.chassisClass,
      pos: coarse,
      tick: world.tick,
      source: 'sensor',
    });

    const blip = minimapBlips(world).find((entry) => entry.id === enemy.id);
    expect(blip).toEqual({ id: enemy.id, team: enemy.team, position: coarse, kind: 'sensor' });
    expect(blip?.position).not.toEqual(enemy.pos);

    vision.visible.add(enemy.id);
    const optical = minimapBlips(world).find((entry) => entry.id === enemy.id);
    expect(optical?.kind).toBe('optical');
    expect(optical?.position).toEqual(enemy.pos);

    vision.visible.delete(enemy.id);
    vision.detected.delete(enemy.id);
    const memory = minimapBlips(world).find((entry) => entry.id === enemy.id);
    expect(memory).toEqual({ id: enemy.id, team: enemy.team, position: coarse, kind: 'memory' });
  });
});

describe('minimap camera controls', () => {
  const map = { width: 960, height: 960 };

  it('maps CSS-scaled pointer coordinates and clamps captured drags to the field', () => {
    const bounds = { left: 20, top: 40, width: 160, height: 80 };
    expect(minimapPointFromClient({ x: 100, y: 80 }, bounds, map)).toEqual({ x: 480, y: 480 });
    expect(minimapPointFromClient({ x: -50, y: 500 }, bounds, map)).toEqual({ x: 0, y: 960 });
    expect(minimapPointFromClient(
      { x: 100, y: 80 },
      { ...bounds, width: 0 },
      map,
    )).toBeNull();
  });

  it('moves north-up by exactly two tiles and clamps at the map edge', () => {
    const target = { x: 480, y: 480 };
    expect(minimapKeyboardTarget(target, 'ArrowLeft', 24, map)).toEqual({ x: 432, y: 480 });
    expect(minimapKeyboardTarget(target, 'ArrowRight', 24, map)).toEqual({ x: 528, y: 480 });
    expect(minimapKeyboardTarget(target, 'ArrowUp', 24, map)).toEqual({ x: 480, y: 432 });
    expect(minimapKeyboardTarget(target, 'ArrowDown', 24, map)).toEqual({ x: 480, y: 528 });
    expect(minimapKeyboardTarget({ x: 4, y: 956 }, 'ArrowLeft', 24, map)).toEqual({ x: 0, y: 956 });
    expect(minimapKeyboardTarget({ x: 4, y: 956 }, 'ArrowDown', 24, map)).toEqual({ x: 4, y: 960 });
    expect(minimapKeyboardTarget(target, 'Enter', 24, map)).toBeNull();
  });

  it('projects all four camera corners into a clipped minimap footprint', () => {
    const viewport = { width: 100, height: 50 };
    const footprint = minimapViewportFootprint(
      (screen) => ({ x: 100 + screen.x * 2, y: 40 + screen.y * 3 }),
      viewport,
      { width: 400, height: 200 },
      { width: 160, height: 80 },
    );
    expect(footprint).toEqual([
      { x: 40, y: 16 },
      { x: 120, y: 16 },
      { x: 120, y: 76 },
      { x: 40, y: 76 },
    ]);

    const clipped = minimapViewportFootprint(
      (screen) => ({ x: screen.x === 0 ? -100 : 900, y: screen.y === 0 ? -40 : 700 }),
      viewport,
      map,
      { width: 160, height: 160 },
    );
    expect(clipped).toEqual([
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 116.66666666666666 },
      { x: 0, y: 116.66666666666666 },
    ]);
  });
});

describe('minimap contact pulses', () => {
  const optical: MinimapBlip = {
    id: 10,
    team: 1,
    position: { x: 300, y: 240 },
    kind: 'optical',
  };

  it('seeds opening contacts silently and pings each later contact only once', () => {
    const ledger = createMinimapPulseLedger();
    updateMinimapContactPulses(ledger, [optical], 100);
    expect(ledger.pulses).toEqual([]);

    const sensor: MinimapBlip = {
      id: 11,
      team: 1,
      position: { x: 504, y: 312 },
      kind: 'sensor',
    };
    updateMinimapContactPulses(ledger, [optical, sensor], 200);
    expect(ledger.pulses).toEqual([
      { id: 11, position: { x: 504, y: 312 }, startedAt: 200 },
    ]);
    sensor.position.x = 900;
    expect(ledger.pulses[0]?.position).toEqual({ x: 504, y: 312 });

    const memory: MinimapBlip = {
      id: 12,
      team: 1,
      position: { x: 620, y: 410 },
      kind: 'memory',
    };
    updateMinimapContactPulses(ledger, [memory], 300);
    updateMinimapContactPulses(ledger, [{ ...memory, kind: 'sensor' }], 400);
    updateMinimapContactPulses(ledger, [], 500);
    updateMinimapContactPulses(ledger, [sensor], 600);
    expect(ledger.pulses).toHaveLength(1);

    updateMinimapContactPulses(ledger, [], 1_601);
    expect(ledger.pulses).toEqual([]);
  });

  it('animates ordinary pings but leaves reduced-motion geometry static', () => {
    const pulse: MinimapContactPulse = { id: 2, position: { x: 20, y: 30 }, startedAt: 100 };
    const early = minimapPulseAppearance(pulse, 200, false);
    const late = minimapPulseAppearance(pulse, 900, false);
    expect(late?.radius).toBeGreaterThan(early?.radius ?? 0);
    expect(late?.alpha).toBeLessThan(early?.alpha ?? 1);
    expect(minimapPulseAppearance(pulse, 200, true)).toEqual({ radius: 9, alpha: 0.82 });
    expect(minimapPulseAppearance(pulse, 900, true)).toEqual({ radius: 9, alpha: 0.82 });
    expect(minimapPulseAppearance(pulse, 1_500, false)).toBeNull();
  });
});

describe('minimap objective privacy', () => {
  it('projects owner and geometry without capture progress or contender state', () => {
    const world = createWorld(catalog, {
      seed: 'minimap-zones',
      missionId: 'base_capture_ridge',
      playerTeam: 0,
    });
    const zone = world.zones[0];
    if (zone === undefined) throw new Error('mission has no zone');
    const before = minimapZones(world);
    zone.contender = zone.owner === 0 ? 1 : 0;
    zone.progress += 9;
    zone.contested = !zone.contested;
    expect(minimapZones(world)).toEqual(before);
    expect(Object.keys(before[0] ?? {}).sort()).toEqual(['id', 'owner', 'position', 'radius']);
  });
});
