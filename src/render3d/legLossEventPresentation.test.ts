import { Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { playerWorld, testWorld, unitOf } from '../../tests/support';
import { routeVisibleLegLoss } from './legLossEventPresentation';
import { UnitViews } from './unitViews';

function loseLeftLeg(entity: ReturnType<typeof unitOf>): void {
  entity.locations.left_leg.destroyed = true;
  entity.locations.left_leg.armour = 0;
  entity.locations.left_leg.internal = 0;
}

describe('visible leg-loss event routing', () => {
  it('routes a currently visible, previously placed mech into the stumble sink', () => {
    const world = testWorld('visible-leg-loss-route');
    const entity = unitOf(world, 'sentinel_brawler');
    const units = new UnitViews(new Scene(), () => 0);
    units.viewFor(world, entity);
    units.beginFrame();
    units.markPlaced(entity.id);
    loseLeftLeg(entity);
    const triggerLegLoss = vi.fn();

    expect(routeVisibleLegLoss(world, {
      type: 'location_destroyed', tick: 4, entityId: entity.id, location: 'left_leg',
    }, units, { triggerLegLoss })).toBe(true);
    expect(triggerLegLoss).toHaveBeenCalledWith(entity.id, 'left_leg');
    units.dispose();
  });

  it('does not route an unplaced or currently hidden event for later replay', () => {
    const world = playerWorld('hidden-leg-loss-route', 1);
    const entity = unitOf(world, 'hornet_spotter');
    const units = new UnitViews(new Scene(), () => 0);
    units.viewFor(world, entity);
    loseLeftLeg(entity);
    const event = {
      type: 'location_destroyed' as const,
      tick: 4,
      entityId: entity.id,
      location: 'left_leg' as const,
    };
    const triggerLegLoss = vi.fn();

    expect(routeVisibleLegLoss(world, event, units, { triggerLegLoss })).toBe(false);
    units.beginFrame();
    units.markPlaced(entity.id);
    world.vision?.visible.delete(entity.id);
    expect(routeVisibleLegLoss(world, event, units, { triggerLegLoss })).toBe(false);
    expect(triggerLegLoss).not.toHaveBeenCalled();
    units.dispose();
  });
});
