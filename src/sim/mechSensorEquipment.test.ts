import { describe, expect, it } from 'vitest';
import { catalog, makeGrid, OPEN_LEGEND, playerWorld } from '../../tests/support';
import { createMech } from './entity';
import { createVision, effectiveSensorRange, updateVision } from './sensors';

describe('fitted mech scanners', () => {
  it('automatically detects a classified contact beyond the same unfitted machine without creating optical sight', () => {
    const world = playerWorld('passive-deep-scanner');
    const design = catalog.designs.get('votive_picket')!;
    const parameters = { id: 100, team: 0, designId: design.id, pilotId: 'petra_lindqvist',
      spawn: { x: 12, y: 12 }, facingDegrees: 0 };
    const fitted = createMech(catalog, catalog.rules, { ...parameters, design });
    const unfitted = createMech(catalog, catalog.rules, { ...parameters,
      design: { ...design, equipment: design.equipment.filter(fit => fit.equipmentId !== 'active_probe') } });
    const target = world.entities.find(entity => entity.team !== fitted.team)!;
    target.signature = 1;
    fitted.sightRange = 0;
    unfitted.sightRange = 0;
    world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles: ['.'.repeat(200)], tileSize: 24 });
    const plainRange = effectiveSensorRange(world, unfitted);
    const scannerRange = effectiveSensorRange(world, fitted);
    target.pos = { x: 12 + (plainRange + scannerRange) / 2, y: 12 };
    world.entities = [unfitted, target];
    world.vision = createVision(world, fitted.team);
    updateVision(world, world.vision);
    expect(world.vision.detected.has(target.id)).toBe(false);
    world.entities = [fitted, target];
    updateVision(world, world.vision);
    expect(world.vision.detected.has(target.id)).toBe(true);
    expect(world.vision.visible.has(target.id)).toBe(false);
    expect(world.vision.identified.has(target.id)).toBe(false);
    expect(world.vision.tracks.get(target.id)?.source).toBe('sensor');
    expect(fitted.ability.activeUntilTick).toBeLessThan(world.tick);
    expect(scannerRange / plainRange).toBeCloseTo(catalog.equipment.get('active_probe')!.stats.sensor_range_factor!);
  });
});
