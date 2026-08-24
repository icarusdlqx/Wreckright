import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld, testWorld, unitOf } from '../../tests/support';
import { UnitViews } from './unitViews';

describe('unit damage presentation', () => {
  it('turns a welded location-loss event into persistent bounded wreckage', () => {
    const world = testWorld('detached-location-event');
    const entity = unitOf(world, 'hornet_spotter');
    const scene = new Scene();
    const units = new UnitViews(scene, () => 0);
    const intact = units.viewFor(world, entity);
    units.beginFrame();
    units.markPlaced(entity.id);
    units.consumeEvents(world, [
      { type: 'location_destroyed', tick: 4, entityId: entity.id, location: 'left_arm' },
    ]);
    const debris = scene.children.find(
      (child) => child.name === 'detached-part-slot' && child.visible,
    );
    expect(debris?.children.length).toBeGreaterThan(0);

    entity.locations.left_arm.destroyed = true;
    const damaged = units.viewFor(world, entity);
    expect(damaged.model.root).not.toBe(intact.model.root);
    expect(debris?.visible).toBe(true);
    units.dispose();
  });

  it('does not shed debris for a contact hidden in the current sensor picture', () => {
    const world = playerWorld('hidden-detached-location', 1);
    const entity = unitOf(world, 'hornet_spotter');
    const scene = new Scene();
    const units = new UnitViews(scene, () => 0);
    const view = units.viewFor(world, entity);
    view.model.root.visible = true;
    units.beginFrame();
    units.markPlaced(entity.id);
    world.vision?.visible.delete(entity.id);
    expect(units.canAnimateVisibleEvent(world, entity.id)).toBe(false);

    units.consumeEvents(world, [
      { type: 'location_destroyed', tick: 4, entityId: entity.id, location: 'left_arm' },
    ]);

    expect(scene.children.some(
      (child) => child.name === 'detached-part-slot' && child.visible,
    )).toBe(false);
    world.vision?.visible.add(entity.id);
    expect(units.canAnimateVisibleEvent(world, entity.id)).toBe(true);
    units.dispose();
  });

  it('uses an attacker fall axis only when both combatants are visibly placed', () => {
    const world = testWorld('impact-directed-wreck');
    const target = unitOf(world, 'sentinel_brawler');
    const attacker = unitOf(world, 'halberd_prime');
    target.pos = { x: 100, y: 100 };
    target.facing = 0;
    attacker.pos = { x: 0, y: 100 };
    const units = new UnitViews(new Scene(), () => 0);
    units.snapshot(world);
    const live = units.viewFor(world, target);
    units.viewFor(world, attacker);
    const fallback = { ...live.model.terminalFallAxis };
    const hit = {
      type: 'projectile_hit' as const,
      tick: 5,
      shooterId: attacker.id,
      targetId: target.id,
      weaponId: 'medium_laser',
      location: 'centre_torso' as const,
      damage: 6,
      arc: 'front' as const,
    };

    units.beginFrame();
    units.markPlaced(target.id);
    units.consumeEvents(world, [hit]);
    expect(live.model.terminalFallAxis).toEqual(fallback);

    units.markPlaced(attacker.id);
    live.model.root.visible = false;
    units.consumeEvents(world, [hit]);
    expect(live.model.terminalFallAxis).toEqual(fallback);

    live.model.root.visible = true;
    units.consumeEvents(world, [hit]);
    expect(live.model.terminalFallAxis?.roll).toBeCloseTo(-1);
    target.destroyed = true;
    expect(units.viewFor(world, target).model.terminalFallAxis?.roll).toBeCloseTo(-1);
    units.dispose();
  });

  it('does not derive a fall direction from an attacker hidden by current vision', () => {
    const world = playerWorld('hidden-impact-direction');
    const target = unitOf(world, 'sentinel_brawler');
    const attacker = unitOf(world, 'halberd_prime');
    target.pos = { x: 100, y: 100 };
    target.facing = 0;
    attacker.pos = { x: 0, y: 100 };
    const units = new UnitViews(new Scene(), () => 0);
    units.snapshot(world);
    const live = units.viewFor(world, target);
    const attackerView = units.viewFor(world, attacker);
    units.beginFrame();
    units.markPlaced(target.id);
    units.markPlaced(attacker.id);
    attackerView.model.root.visible = true;
    world.vision?.visible.delete(attacker.id);
    const fallback = { ...live.model.terminalFallAxis };
    const hit = {
      type: 'projectile_hit' as const,
      tick: 5,
      shooterId: attacker.id,
      targetId: target.id,
      weaponId: 'medium_laser',
      location: 'centre_torso' as const,
      damage: 6,
      arc: 'front' as const,
    };

    units.consumeEvents(world, [hit]);
    expect(live.model.terminalFallAxis).toEqual(fallback);
    world.vision?.visible.add(target.id);
    world.vision?.visible.add(attacker.id);
    units.snapshot(world);
    units.consumeEvents(world, [hit]);
    expect(live.model.terminalFallAxis?.roll).toBeCloseTo(-1);
    units.dispose();
  });

  it('keeps a failed sealed shell intact while blacking out its damaged systems', () => {
    const world = testWorld('sealed-damage-signature');
    const entity = unitOf(world, 'sentinel_brawler');
    const units = new UnitViews(new Scene(), () => 0);
    const clean = units.viewFor(world, entity);
    entity.locations.left_arm.armour = 0;
    entity.locations.left_arm.internal = 0;
    entity.locations.left_arm.destroyed = true;
    const mount = entity.weapons.find((candidate) => candidate.location === 'left_arm');
    if (mount !== undefined) mount.destroyed = true;

    const failed = units.viewFor(world, entity);
    let failedArmMeshes = 0;
    let disabledWeapons = 0;
    failed.model.root.traverse((node) => {
      if (node.userData.damageLocation === 'left_arm') failedArmMeshes += 1;
      if (node.userData.disabledWeapon === true) disabledWeapons += 1;
    });
    expect(failed.model.root).not.toBe(clean.model.root);
    expect(failedArmMeshes).toBeGreaterThan(0);
    expect(disabledWeapons).toBeGreaterThan(0);
    expect(failed.model.startup?.enabled.filter(Boolean).length)
      .toBeLessThan(failed.model.startup?.lights.length ?? 0);
    entity.destroyed = true;
    expect(units.viewFor(world, entity).model.root).not.toBe(failed.model.root);
    units.dispose();
  });

  it.each(['sentinel_brawler', 'hornet_spotter'])(
    'rebuilds %s with readable arm and leg wear before either limb is lost',
    (designId) => {
      const world = testWorld(`limb-wear-${designId}`);
      const entity = unitOf(world, designId);
      const units = new UnitViews(new Scene(), () => 0);
      const clean = units.viewFor(world, entity);
      const cleanLegY = clean.model.legs.find(
        (candidate) => candidate.location === 'left_leg',
      )?.hipRestY;
      for (const location of ['left_arm', 'left_leg'] as const) {
        entity.locations[location].armour = 0;
        entity.locations[location].rearArmour = 0;
        entity.locations[location].internal *= 0.2;
      }

      const damaged = units.viewFor(world, entity);
      let markedArmMeshes = 0;
      let armDroop = 0;
      damaged.model.root.traverse((node) => {
        if (
          node.userData.damageLocation === 'left_arm' &&
          (node.userData.limbDamageTier as number | undefined) !== undefined
        ) {
          markedArmMeshes += 1;
          armDroop = Math.max(armDroop, Math.abs(node.rotation.x));
        }
      });
      const leg = damaged.model.legs.find((candidate) => candidate.location === 'left_leg');
      expect(damaged.model.root).not.toBe(clean.model.root);
      expect(markedArmMeshes).toBeGreaterThan(0);
      expect(armDroop).toBeGreaterThan(0.05);
      expect(leg?.damageTier).toBe(2);
      expect(leg?.hipRestY).toBeLessThan(cleanLegY ?? 0);
      units.dispose();
    },
  );

  it('keeps duplicate destroyed emitters dark and cycles only live copies', () => {
    const world = testWorld('sealed-disabled-duplicate');
    const entity = unitOf(world, 'sentinel_brawler');
    const destroyed = entity.weapons.find((mount) => mount.weaponId === 'medium_laser');
    expect(destroyed).toBeDefined();
    if (destroyed === undefined) return;
    destroyed.destroyed = true;
    const units = new UnitViews(new Scene(), () => 0);
    const rigs = units.viewFor(world, entity).model.weapons.filter(
      (rig) => rig.weaponId === 'medium_laser',
    );
    const disabled = rigs.find((rig) => rig.slide.userData.disabledWeapon === true);
    const live = rigs.filter((rig) => rig.slide.userData.disabledWeapon !== true);
    expect(rigs).toHaveLength(3);
    expect(disabled).toBeDefined();
    expect(live).toHaveLength(2);

    units.beginFrame();
    units.markPlaced(entity.id);
    const origins: Vector3[] = [];
    for (let shot = 0; shot < 3; shot += 1) {
      const muzzle = new Vector3();
      expect(units.fireMount(entity.id, 'medium_laser', muzzle)).toBe(true);
      origins.push(muzzle);
    }
    expect(origins[0]?.equals(origins[1] ?? new Vector3())).toBe(false);
    expect(origins[2]?.equals(origins[0] ?? new Vector3())).toBe(true);
    expect(disabled?.cycle).toBe(0);
    disabled?.slide.position.set(7, 0, 0);
    units.beginFrame(1);
    expect(disabled?.slide.position.x).toBe(7);
    units.dispose();
  });
});

describe('unit power presentation', () => {
  it('starts sealed lights on reveal and sequences them again after a restart', () => {
    const world = testWorld('sealed-startup-events');
    const entity = unitOf(world, 'sentinel_brawler');
    const units = new UnitViews(new Scene(), () => 0);
    const view = units.viewFor(world, entity);
    expect(view.model.startup?.lights).toHaveLength(5);
    view.model.root.visible = false;
    units.beginFrame(2);
    expect(view.model.startup?.lights.some((light) => light.visible)).toBe(false);

    view.model.root.visible = true;
    units.beginFrame(0.17);
    units.markPlaced(entity.id);
    expect(view.model.startup?.lights.filter((light) => light.visible)).toHaveLength(2);
    units.consumeEvents(world, [
      { type: 'shutdown', tick: 4, entityId: entity.id, forced: false },
    ]);
    units.beginFrame(2);
    expect(view.model.startup?.lights.some((light) => light.visible)).toBe(false);
    units.markPlaced(entity.id);
    units.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    units.beginFrame(0);
    expect(view.model.startup?.lights.filter((light) => light.visible)).toHaveLength(1);
    units.dispose();
  });

  it('keeps a late-created shutdown sealed view dark until its restart event', () => {
    const world = testWorld('sealed-late-shutdown');
    const entity = unitOf(world, 'sentinel_brawler');
    entity.shutdownRemaining = 2;
    const units = new UnitViews(new Scene(), () => 0);
    const view = units.viewFor(world, entity);
    units.beginFrame(2);
    expect(view.model.startup?.lights.some((light) => light.visible)).toBe(false);
    units.markPlaced(entity.id);
    units.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    units.beginFrame(0);
    expect(view.model.startup?.lights.filter((light) => light.visible)).toHaveLength(1);
    units.dispose();
  });

  it('makes a hidden power cycle equal steady control when reacquired in the event tick', () => {
    const world = playerWorld('hidden-sealed-power');
    const entity = unitOf(world, 'wisp_scout');
    const units = new UnitViews(new Scene(), () => 0);
    world.vision?.visible.add(entity.id);
    const view = units.present(world, entity);
    expect(view).not.toBeNull();
    if (view === null) return;
    units.beginFrame(0.17);
    units.markPlaced(entity.id);
    world.vision?.visible.delete(entity.id);
    units.snapshot(world);
    expect(view.model.root.visible).toBe(false);
    const steady = view.model.startup?.enabled ?? [];
    expect(view.model.startup?.lights.map((light) => light.visible)).toEqual(steady);

    entity.shutdownRemaining = 2;
    units.consumeEvents(world, [
      { type: 'shutdown', tick: 4, entityId: entity.id, forced: false },
    ]);
    expect(view.model.startup?.lights.some((light) => light.visible)).toBe(false);

    entity.shutdownRemaining = 0;
    world.vision?.visible.add(entity.id);
    units.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    const revealed = units.present(world, entity);

    expect(revealed).toBe(view);
    expect(view.model.startup?.running).toBe(false);
    expect(view.model.startup?.lights.map((light) => light.visible)).toEqual(steady);
    units.dispose();
  });

  it('does not kick a hidden welded hull when power cycles', () => {
    const world = playerWorld('hidden-welded-power', 1);
    const entity = unitOf(world, 'hornet_spotter');
    const units = new UnitViews(new Scene(), () => 0);
    world.vision?.visible.add(entity.id);
    const view = units.present(world, entity);
    expect(view).not.toBeNull();
    if (view === null) return;
    units.markPlaced(entity.id);
    world.vision?.visible.delete(entity.id);
    units.snapshot(world);
    expect(view.model.root.visible).toBe(false);

    entity.shutdownRemaining = 2;
    units.consumeEvents(world, [
      { type: 'shutdown', tick: 4, entityId: entity.id, forced: false },
    ]);
    entity.shutdownRemaining = 0;
    world.vision?.visible.add(entity.id);
    units.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    units.present(world, entity);

    expect(view.model.hullRecoil.kick).toBe(0);
    units.dispose();
  });

  it('coughs on welded power-down and restart without moving under reduced motion', () => {
    const world = testWorld('welded-restart-shudder');
    const entity = unitOf(world, 'bulwark_assault');
    const active = new UnitViews(new Scene(), () => 0);
    const activeView = active.viewFor(world, entity);
    active.markPlaced(entity.id);
    active.consumeEvents(world, [
      { type: 'shutdown', tick: 4, entityId: entity.id, forced: false },
    ]);
    expect(activeView.model.hullRecoil.kick)
      .toBeGreaterThan(activeView.model.hullRecoil.travel * 2);
    activeView.model.hullRecoil.kick = 0;
    active.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    expect(activeView.model.hullRecoil.kick).toBeGreaterThan(0);

    const reduced = new UnitViews(new Scene(), () => 0, true);
    const reducedView = reduced.viewFor(world, entity);
    const rig = reducedView.model.weapons.find((candidate) => candidate.weaponId === 'ac5');
    expect(rig).toBeDefined();
    if (rig === undefined) return;
    reduced.beginFrame();
    reduced.markPlaced(entity.id);
    expect(reduced.fireMount(entity.id, 'ac5', new Vector3())).toBe(true);
    expect(rig.kick).toBe(rig.travel);
    expect(reducedView.model.hullRecoil.kick).toBe(0);
    reduced.consumeEvents(world, [{ type: 'restart', tick: 8, entityId: entity.id }]);
    expect(reducedView.model.hullRecoil.kick).toBe(0);
    active.dispose();
    reduced.dispose();
  });
});
