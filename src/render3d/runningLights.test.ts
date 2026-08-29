import { MeshStandardMaterial, PointLight, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog, testWorld, unitOf } from '../../tests/support';
import type { MechLocation } from '../schema/common';
import { createWorld } from '../sim/world';
import { buildMechModel, disposeModel } from './mechModel';
import { TACTICAL_MECH_RENDER } from './renderQuality';
import { advanceStartupSequence } from './startupLights';
import { UnitViews } from './unitViews';

function modelFor(
  chassisId: string,
  destroyed = false,
  lost: ReadonlySet<MechLocation> = new Set(),
  nightRunningLights = false,
) {
  const chassis = catalog.chassis.get(chassisId);
  if (chassis === undefined) throw new Error(`missing chassis ${chassisId}`);
  return buildMechModel(
    chassis.silhouette,
    chassis.traits,
    chassis.tonnage,
    0x78c9ff,
    destroyed,
    [],
    lost,
    chassis.hardpoints,
    chassis.id,
    {},
    chassis.faction,
    TACTICAL_MECH_RENDER,
    nightRunningLights,
  );
}

describe('machine running lights', () => {
  it('preserves the sealed Aurelian sequence when night running lights are requested', () => {
    const model = modelFor('sentinel_snl2', false, new Set(), true);
    expect(model.startup?.lights).toHaveLength(5);
    expect(model.startup?.lights.filter((light) => light.name.startsWith('startup-light:')))
      .toHaveLength(3);
    expect(model.startup?.lights.filter((light) => light.name.startsWith('power-seam:')))
      .toHaveLength(2);

    advanceStartupSequence(model, 0, false);
    expect(model.startup?.lights.filter((light) => light.visible)).toHaveLength(1);
    advanceStartupSequence(model, 0.17, false);
    expect(model.startup?.lights.filter((light) => light.visible)).toHaveLength(2);
    disposeModel(model.root);
  });

  it('adds three bounded warm emissive channels only to live Linewrought night mechs', () => {
    const daylight = modelFor('hornet_hnt2');
    const night = modelFor('hornet_hnt2', false, new Set(), true);
    const failed = modelFor('hornet_hnt2', false, new Set(['head']), true);
    const wreck = modelFor('hornet_hnt2', true, new Set(), true);

    expect(daylight.startup).toBeNull();
    expect(night.startup?.lights).toHaveLength(3);
    expect(night.startup?.enabled).toEqual([true, true, true]);
    expect(failed.startup?.enabled).toEqual([false, true, true]);
    expect(wreck.startup).toBeNull();
    expect(night.startup?.lights.every((light) => (
      light.name.startsWith('running-light:')
      && light.material instanceof MeshStandardMaterial
      && light.material.emissive.getHex() === 0xff8a3d
    ))).toBe(true);
    let pointLights = 0;
    night.root.traverse((child) => {
      if (child instanceof PointLight) pointLights += 1;
    });
    expect(pointLights).toBe(0);

    const geometry = night.startup?.lights[0]?.geometry;
    const material = night.startup?.lights[0]?.material;
    if (geometry === undefined || !(material instanceof MeshStandardMaterial)) {
      throw new Error('missing running-light resources');
    }
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    disposeModel(night.root);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    disposeModel(daylight.root);
    disposeModel(failed.root);
    disposeModel(wreck.root);
  });

  it('uses the existing power lifecycle without losing the welded shutdown shudder', () => {
    const world = createWorld(catalog, { seed: 'night-running-power', missionId: 'causeway_night' });
    const entity = unitOf(world, 'hornet_spotter');
    const units = new UnitViews(new Scene(), () => 0);
    const view = units.viewFor(world, entity);
    const lights = view.model.startup?.lights ?? [];

    expect(lights).toHaveLength(3);
    expect(lights.some((light) => light.visible)).toBe(false);
    units.beginFrame(0);
    units.markPlaced(entity.id);
    expect(lights.every((light) => light.visible)).toBe(true);

    entity.shutdownRemaining = 2;
    units.consumeEvents(world, [
      { type: 'shutdown', tick: 4, entityId: entity.id, forced: false },
    ]);
    expect(lights.some((light) => light.visible)).toBe(false);
    expect(view.model.hullRecoil.kick).toBeGreaterThan(view.model.hullRecoil.travel * 2);

    view.model.hullRecoil.kick = 0;
    units.beginFrame(0);
    units.markPlaced(entity.id);
    entity.shutdownRemaining = 0;
    units.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    units.beginFrame(0);
    expect(lights.every((light) => light.visible)).toBe(true);
    expect(view.model.hullRecoil.kick).toBeGreaterThan(0);

    entity.destroyed = true;
    expect(units.viewFor(world, entity).model.startup).toBeNull();
    units.dispose();
  });

  it('synchronizes hidden running lights without replaying a power event on reveal', () => {
    const world = createWorld(catalog, {
      seed: 'night-running-hidden',
      missionId: 'causeway_night',
      playerTeam: 0,
    });
    const entity = world.entities.find(
      (candidate) => candidate.team === 1 && candidate.designId === 'hornet_spotter',
    );
    if (entity === undefined) throw new Error('missing hostile night Hornet');
    world.vision?.visible.add(entity.id);
    const units = new UnitViews(new Scene(), () => 0);
    const view = units.present(world, entity);
    if (view === null) throw new Error('night Hornet was not presented');
    units.beginFrame(0);
    units.markPlaced(entity.id);

    world.vision?.visible.delete(entity.id);
    units.snapshot(world);
    expect(view.model.root.visible).toBe(false);
    entity.shutdownRemaining = 2;
    units.consumeEvents(world, [
      { type: 'shutdown', tick: 4, entityId: entity.id, forced: false },
    ]);
    expect(view.model.startup?.lights.some((light) => light.visible)).toBe(false);

    entity.shutdownRemaining = 0;
    units.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    world.vision?.visible.add(entity.id);
    expect(units.present(world, entity)).toBe(view);
    expect(view.model.startup?.running).toBe(false);
    expect(view.model.startup?.lights.map((light) => light.visible))
      .toEqual(view.model.startup?.enabled);
    units.dispose();
  });

  it('does not add night running lights to a Linewrought vehicle', () => {
    const world = createWorld(catalog, { seed: 'night-running-frame', missionId: 'causeway_night' });
    const vehicle = unitOf(world, 'courser_patrol');
    expect(vehicle.frame).toBe('vehicle');
    const units = new UnitViews(new Scene(), () => 0);
    expect(units.viewFor(world, vehicle).model.startup).toBeNull();
    units.dispose();

    const daylight = testWorld('daylight-running-control');
    const hornet = unitOf(daylight, 'hornet_spotter');
    const daylightUnits = new UnitViews(new Scene(), () => 0);
    expect(daylightUnits.viewFor(daylight, hornet).model.startup).toBeNull();
    daylightUnits.dispose();
  });
});
