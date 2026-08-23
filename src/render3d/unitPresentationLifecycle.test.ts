import { Mesh, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { playerWorld, spawnDesign } from '../../tests/support';
import type { BattleEffects } from './battleEffects';
import { Locomotion } from './locomotion';
import { UnitViews } from './unitViews';
import { PRESENTED_HULK_LIMIT } from './visibilityPresentation';

interface UnitViewInternals {
  views: Map<number, unknown>;
  samples: Map<number, unknown>;
  interpolated: Map<number, unknown>;
  mountCycles: Map<string, number>;
  placed: Set<number>;
  fallAxes: Map<number, unknown>;
  presentedPowerEvents: Map<number, unknown>;
}

describe('unit presentation lifecycle', () => {
  it('does not construct or track a never-seen hidden entity', () => {
    const world = playerWorld('never-seen-unit-view');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const hidden = world.entities.find((entity) => entity.team !== vision.team);
    if (hidden === undefined) throw new Error('mission has no hostile');
    vision.visible.delete(hidden.id);
    vision.observedHulks.delete(hidden.id);
    const scene = new Scene();
    const units = new UnitViews(scene, () => 0);

    units.snapshot(world);
    units.interpolate(world, 1);
    expect(units.present(world, hidden)).toBeNull();

    const state = units as unknown as UnitViewInternals;
    expect(state.views.has(hidden.id)).toBe(false);
    expect(state.samples.has(hidden.id)).toBe(false);
    expect(state.interpolated.has(hidden.id)).toBe(false);
    expect(scene.children.some((child) => child.userData.entityId === hidden.id)).toBe(false);
    units.dispose();
  });

  it('authorizes only a death whose live model was visible in the prior frame', () => {
    const world = playerWorld('terminal-event-authorization');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    vision.visible.clear();
    const visibleDeath = spawnDesign(world, 'hornet_spotter', 1);
    const hiddenDeath = spawnDesign(world, 'hornet_spotter', 1);
    const units = new UnitViews(new Scene(), () => 0);

    vision.visible.add(visibleDeath.id);
    vision.visible.add(hiddenDeath.id);
    units.snapshot(world);
    expect(units.present(world, visibleDeath)).not.toBeNull();
    expect(units.present(world, hiddenDeath)).not.toBeNull();
    units.markPlaced(visibleDeath.id);
    units.markPlaced(hiddenDeath.id);

    vision.visible.delete(hiddenDeath.id);
    units.snapshot(world);
    visibleDeath.destroyed = true;
    hiddenDeath.destroyed = true;
    vision.observedHulks.add(visibleDeath.id);
    vision.observedHulks.add(hiddenDeath.id);

    expect(units.canAnimateTerminalEvent(world, visibleDeath.id)).toBe(true);
    expect(units.canAnimateTerminalEvent(world, hiddenDeath.id)).toBe(false);
    units.dispose();
  });

  it('disposes the oldest hulk and clears every keyed state when the 65th arrives', () => {
    const world = playerWorld('unit-view-hulk-cap');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    vision.visible.clear();
    vision.observedHulks.clear();
    const hulks = [];
    for (let index = 0; index < PRESENTED_HULK_LIMIT; index += 1) {
      const hulk = spawnDesign(world, 'hornet_spotter', 1, { x: 400 + index, y: 400 });
      hulk.destroyed = true;
      vision.observedHulks.add(hulk.id);
      hulks.push(hulk);
    }

    const scene = new Scene();
    const units = new UnitViews(scene, () => 0);
    units.snapshot(world);
    units.interpolate(world, 1);
    const oldestEntity = hulks[0];
    if (oldestEntity === undefined) throw new Error('missing oldest hulk');
    const oldest = units.present(world, oldestEntity);
    if (oldest === null) throw new Error('oldest hulk was not presented');
    for (const hulk of hulks.slice(1)) units.present(world, hulk);
    units.markPlaced(oldestEntity.id);

    const ownedMeshes: Mesh[] = [];
    oldest.model.root.traverse((node) => {
      if (node instanceof Mesh) ownedMeshes.push(node);
    });
    const ownedMesh = ownedMeshes[0];
    if (ownedMesh === undefined) throw new Error('hulk model has no mesh');
    const modelDispose = vi.spyOn(ownedMesh.geometry, 'dispose');
    const ringDispose = vi.spyOn(oldest.ring.geometry, 'dispose');
    const state = units as unknown as UnitViewInternals;
    state.mountCycles.set(`${oldestEntity.id}:test`, 1);
    state.fallAxes.set(oldestEntity.id, { pitch: 1, roll: 0 });
    state.presentedPowerEvents.set(oldestEntity.id, 'restart');

    const newest = spawnDesign(world, 'hornet_spotter', 1, { x: 500, y: 400 });
    newest.destroyed = true;
    vision.observedHulks.add(newest.id);
    expect(units.present(world, oldestEntity)).toBeNull();
    expect(units.present(world, newest)).not.toBeNull();
    units.snapshot(world);
    units.interpolate(world, 1);

    expect(oldest.model.root.parent).toBeNull();
    expect(oldest.ring.parent).toBeNull();
    expect(modelDispose).toHaveBeenCalledTimes(1);
    expect(ringDispose).toHaveBeenCalledTimes(1);
    expect(state.views.has(oldestEntity.id)).toBe(false);
    expect(state.samples.has(oldestEntity.id)).toBe(false);
    expect(state.interpolated.has(oldestEntity.id)).toBe(false);
    expect(state.placed.has(oldestEntity.id)).toBe(false);
    expect(state.fallAxes.has(oldestEntity.id)).toBe(false);
    expect(state.presentedPowerEvents.has(oldestEntity.id)).toBe(false);
    expect([...state.mountCycles.keys()].some((key) => key.startsWith(`${oldestEntity.id}:`)))
      .toBe(false);

    const effects = { land: vi.fn(), plume: vi.fn() } as unknown as BattleEffects;
    const locomotion = new Locomotion(() => 0, () => 'open', effects);
    locomotion.authorizeTerminalFall(oldestEntity.id);
    const motionState = locomotion as unknown as {
      states: Map<number, unknown>;
      terminalFallAuthorizations: Set<number>;
    };
    locomotion.place(
      oldestEntity,
      oldest.model,
      { x: oldestEntity.pos.x, y: oldestEntity.pos.y, facing: 0, torso: 0 },
      0,
      0,
    );
    expect(motionState.states.has(oldestEntity.id)).toBe(true);
    locomotion.retire(oldestEntity.id);
    expect(motionState.states.has(oldestEntity.id)).toBe(false);
    expect(motionState.terminalFallAuthorizations.has(oldestEntity.id)).toBe(false);
    units.dispose();
  });
});
