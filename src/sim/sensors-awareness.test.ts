import { beforeEach, describe, expect, it } from 'vitest';
import { catalog, makeGrid, OPEN_LEGEND, playerWorld, spawnDesign, unitOf } from '../../tests/support';
import type { Catalog } from '../schema/load';
import { createMech } from './entity';
import { lineOfSight } from './los';
import {
  createVision,
  isDetectedBy,
  isSightedBy,
  quantizeTrackPosition,
  rememberObservedStops,
  sensorRangeFor,
  sightRangeFor,
  signatureFor,
  trackFor,
  updateVision,
} from './sensors';
import type { MechEntity, World } from './types';

let world: World;
let observer: MechEntity;
let target: MechEntity;

function useGrid(tiles: string[], elevation?: string[]): void {
  world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles, elevation });
  world.vision = createVision(world, observer.team);
  world.visions.set(observer.team, world.vision);
}

function isolate(): void {
  for (const entity of world.entities) {
    if (entity !== observer && entity !== target) entity.destroyed = true;
  }
  observer.sensorRange = 1_000;
  observer.sightRange = 1_000;
  target.signature = 1;
}

beforeEach(() => {
  world = playerWorld('awareness-core');
  observer = unitOf(world, 'hornet_spotter');
  target = unitOf(world, 'halberd_prime');
  isolate();
});

describe('electronic contacts', () => {
  it('detects through blocking terrain without granting optical sight', () => {
    useGrid(['.bb....']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 55, y: 5 };

    expect(lineOfSight(world.terrain, observer.pos, target.pos).clear).toBe(false);
    updateVision(world, world.vision!);

    expect(isDetectedBy(world.vision, target)).toBe(true);
    expect(isSightedBy(world.vision, target)).toBe(false);
    expect(world.vision!.identified.has(target.id)).toBe(false);
  });

  it('stores only classified, quantized contact facts', () => {
    useGrid(['.bb....']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 55, y: 5 };
    updateVision(world, world.vision!);

    const track = trackFor(world.vision, target);
    expect(Object.keys(track ?? {}).sort()).toEqual([
      'chassisClass',
      'frame',
      'id',
      'pos',
      'source',
      'team',
      'tick',
    ]);
    expect(track).toMatchObject({
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: quantizeTrackPosition(target.pos, catalog.rules.sensors.trackGridMetres),
      source: 'sensor',
    });
    expect(world.vision!.ghosts.get(target.id)?.pos).toEqual(track?.pos);
  });

  it.each([
    ['courser_patrol', 'vehicle', 'light'],
    ['redoubt_emplacement', 'turret', 'medium'],
  ] as const)('classifies %s as a %s %s contact', (designId, frame, chassisClass) => {
    useGrid(['.......']);
    target.destroyed = true;
    observer.pos = { x: 5, y: 5 };
    observer.sightRange = 0;
    const contact = spawnDesign(world, designId, 1, { x: 55, y: 5 });
    contact.signature = 1;

    updateVision(world, world.vision!);
    expect(trackFor(world.vision, contact)).toMatchObject({ frame, chassisClass });
  });

  it('keeps a lost track frozen, then expires it with its ghost', () => {
    useGrid(['.......']);
    observer.pos = { x: 5, y: 5 };
    observer.sightRange = 1;
    target.pos = { x: 55, y: 5 };
    updateVision(world, world.vision!);
    const held = trackFor(world.vision, target);

    target.pos = { x: 5_000, y: 5_000 };
    updateVision(world, world.vision!);
    expect(trackFor(world.vision, target)).toEqual(held);

    world.tick += catalog.rules.sensors.ghostMemorySeconds / world.dt + 1;
    updateVision(world, world.vision!);
    expect(trackFor(world.vision, target)).toBeNull();
    expect(world.vision!.ghosts.has(target.id)).toBe(false);
  });

  it('keeps a sensor probe out of fog and upgrades scripted optical intel', () => {
    useGrid(['..........']);
    observer.pos = { x: 5, y: 5 };
    observer.sensorRange = 0;
    observer.sightRange = 0;
    target.pos = { x: 85, y: 5 };
    const tile = world.terrain.toTile(target.pos);
    const cell = tile.row * world.terrain.width + tile.column;
    world.reveals = [{
      kind: 'sensor',
      team: observer.team,
      x: target.pos.x,
      y: target.pos.y,
      radius: 20,
      expiresTick: 100,
    }];

    updateVision(world, world.vision!);
    expect(world.vision!.detected.has(target.id)).toBe(true);
    expect(world.vision!.visible.has(target.id)).toBe(false);
    expect(world.vision!.tiles[cell]).toBe(0);
    expect(world.vision!.explored[cell]).toBe(0);

    world.reveals[0]!.kind = 'optical';
    updateVision(world, world.vision!);
    expect(world.vision!.visible.has(target.id)).toBe(true);
    expect(world.vision!.tiles[cell]).toBe(1);
    expect(world.vision!.explored[cell]).toBe(1);
  });
});

describe('optical sight', () => {
  it('requires both range and a clear line', () => {
    useGrid(['.......']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 55, y: 5 };
    observer.sightRange = 49;
    updateVision(world, world.vision!);
    expect(isSightedBy(world.vision, target)).toBe(false);

    observer.sightRange = 50;
    updateVision(world, world.vision!);
    expect(isSightedBy(world.vision, target)).toBe(true);
    expect(world.vision!.identified.has(target.id)).toBe(true);
    expect(world.vision!.ghosts.get(target.id)?.pos).toEqual(target.pos);
  });

  it('reduces sight into forest even when the line itself is clear', () => {
    useGrid(['.......f..']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 75, y: 5 };
    observer.sightRange = 100;

    updateVision(world, world.vision!);
    expect(lineOfSight(world.terrain, observer.pos, target.pos).clear).toBe(true);
    expect(isSightedBy(world.vision, target)).toBe(false);

    useGrid(['..........']);
    updateVision(world, world.vision!);
    expect(isSightedBy(world.vision, target)).toBe(true);
  });

  it('extends from high ground using the authored elevation factor', () => {
    useGrid(['.........'], ['200000000']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 75, y: 5 };
    observer.sightRange = 60;
    updateVision(world, world.vision!);
    expect(isSightedBy(world.vision, target)).toBe(true);

    useGrid(['.........'], ['000000000']);
    updateVision(world, world.vision!);
    expect(isSightedBy(world.vision, target)).toBe(false);
  });

  it('reuses a footprint inside a tile and invalidates it across a boundary', () => {
    useGrid(['..........']);
    observer.pos = { x: 5, y: 5 };
    target.destroyed = true;
    updateVision(world, world.vision!);
    const first = world.vision!.opticalFootprints.get(observer.id)?.cells;

    observer.pos = { x: 8, y: 5 };
    updateVision(world, world.vision!);
    expect(world.vision!.opticalFootprints.get(observer.id)?.cells).toBe(first);

    observer.pos = { x: 15, y: 5 };
    updateVision(world, world.vision!);
    expect(world.vision!.opticalFootprints.get(observer.id)?.cells).not.toBe(first);
  });
});

describe('observed hulks', () => {
  it('does not reveal a hidden death merely because its ground was explored', () => {
    useGrid(['..........']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 85, y: 5 };
    observer.sightRange = 100;
    updateVision(world, world.vision!);
    const tile = world.terrain.toTile(target.pos);
    const cell = tile.row * world.terrain.width + tile.column;
    expect(world.vision!.explored[cell]).toBe(1);

    observer.sightRange = 0;
    updateVision(world, world.vision!);
    expect(world.vision!.visible.has(target.id)).toBe(false);
    target.destroyed = true;
    rememberObservedStops(world);
    updateVision(world, world.vision!);
    expect(world.vision!.tiles[cell]).toBe(0);
    expect(world.vision!.observedHulks.has(target.id)).toBe(false);
  });

  it('remembers a hulk after an optical sweep legitimately finds it', () => {
    useGrid(['..........']);
    observer.pos = { x: 5, y: 5 };
    observer.sightRange = 0;
    target.pos = { x: 85, y: 5 };
    target.destroyed = true;
    world.reveals = [{
      kind: 'optical',
      team: observer.team,
      x: target.pos.x,
      y: target.pos.y,
      radius: 20,
      expiresTick: 100,
    }];

    updateVision(world, world.vision!);
    expect(world.vision!.observedHulks.has(target.id)).toBe(true);

    world.reveals = [];
    updateVision(world, world.vision!);
    expect(world.vision!.observedHulks.has(target.id)).toBe(true);
  });

  it('retains a visibly destroyed target when the final observer disappears', () => {
    useGrid(['..........']);
    observer.pos = { x: 5, y: 5 };
    target.pos = { x: 55, y: 5 };
    updateVision(world, world.vision!);
    expect(world.vision!.visible.has(target.id)).toBe(true);
    expect(world.vision!.tracks.has(target.id)).toBe(true);

    target.destroyed = true;
    observer.destroyed = true;
    rememberObservedStops(world);
    updateVision(world, world.vision!);

    expect(world.vision!.observedHulks.has(target.id)).toBe(true);
    expect(world.vision!.tracks.has(target.id)).toBe(false);
    expect(world.vision!.ghosts.has(target.id)).toBe(false);
    expect(world.vision!.tiles.some((cell) => cell === 1)).toBe(false);
  });
});

describe('derived awareness ratings', () => {
  it('derives electronic and optical range from pilot skill', () => {
    const rules = catalog.rules.sensors;
    expect(sensorRangeFor(rules, 5)).toBeGreaterThan(sensorRangeFor(rules, 1));
    expect(sightRangeFor(rules, 5)).toBeGreaterThan(sightRangeFor(rules, 1));
  });

  it.each(['hornet_spotter', 'courser_patrol'])('%s carries recon optics', (designId) => {
    const scout = designId === observer.designId ? observer : spawnDesign(world, designId, 0);
    expect(scout.sightRange).toBeGreaterThan(
      sightRangeFor(catalog.rules.sensors, scout.pilot.sensors),
    );
  });

  it('applies frame and hull factors to sensor signature', () => {
    const courser = spawnDesign(world, 'courser_patrol');
    const chassis = catalog.chassis.get(courser.chassisId)!;
    const frame = catalog.rules.frames.entries[courser.frame];
    const hullFactor = chassis.traits.reduce(
      (factor, id) => factor * (catalog.rules.traits.entries[id]?.signatureFactor ?? 1),
      1,
    );
    expect(courser.signature).toBeCloseTo(
      signatureFor(catalog.rules.sensors, courser.tonnage) *
        frame.sensorSignatureFactor *
        hullFactor,
    );
  });

  it('applies equipment factors to sight and signature', () => {
    const equipment = catalog.equipment.get('ecm_suite')!;
    const design = catalog.designs.get('halberd_prime')!;
    const fittedDesign = {
      ...design,
      id: 'awareness_test_fit',
      equipment: [...design.equipment, { equipmentId: equipment.id, location: 'head' as const }],
    };
    const fittedCatalog: Catalog = {
      ...catalog,
      equipment: new Map(catalog.equipment).set(equipment.id, {
        ...equipment,
        stats: { ...equipment.stats, signature_factor: 0.5, sight_range_factor: 1.1 },
      }),
    };
    const params = {
      id: 100,
      team: 0,
      designId: fittedDesign.id,
      pilotId: 'nadia_ostrow',
      spawn: { x: 5, y: 5 },
      facingDegrees: 0,
    };
    const fitted = createMech(fittedCatalog, catalog.rules, { ...params, design: fittedDesign });
    const plain = createMech(catalog, catalog.rules, { ...params, design });

    expect(fitted.signature).toBeCloseTo(plain.signature * 0.5);
    expect(fitted.sightRange).toBeCloseTo(plain.sightRange * 1.1);
  });
});
