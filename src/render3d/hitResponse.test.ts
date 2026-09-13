import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld, testWorld, unitOf } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { createEntityView, disposeEntityView } from './unitViewFactory';
import { advanceHitResponse, applyHitResponse, presentHitResponse } from './hitResponse';
import { UnitViews } from './unitViews';

function fixture() {
  const world = testWorld('body-hit-response');
  const target = unitOf(world, 'sentinel_brawler');
  const attacker = unitOf(world, 'halberd_prime');
  const view = createEntityView(world, target, 'hero', false, undefined);
  const event: Extract<SimEvent, { type: 'projectile_hit' }> = {
    type: 'projectile_hit', tick: 1, shooterId: attacker.id, targetId: target.id,
    weaponId: 'ac5', location: 'left_arm', damage: 20, arc: 'front',
  };
  return { world, target, view, event };
}

describe('localized hit reactions', () => {
  it('shows a short bounded flinch and leaves simulation position and state unchanged', () => {
    const { world, target, view, event } = fixture();
    const before = JSON.stringify(target);
    const rootPosition = view.model.root.position.clone();
    presentHitResponse(world, event, view.model, true, false);
    expect(view.model.hitResponse.strength).toBeGreaterThan(0);
    applyHitResponse(view.model);
    expect(view.model.torso.rotation.x).toBeGreaterThan(0);
    expect(view.model.torso.rotation.z).toBeGreaterThan(0);
    expect(view.model.root.position.equals(rootPosition)).toBe(true);
    expect(JSON.stringify(target)).toBe(before);
    advanceHitResponse(view.model.hitResponse, 1);
    expect(view.model.hitResponse.strength).toBe(0);
    disposeEntityView(view);
  });

  it('differentiates ballistic and energy impact weight and caps concentrated volleys', () => {
    const { world, view, event } = fixture();
    presentHitResponse(world, { ...event, weaponId: 'medium_laser' }, view.model, true, false);
    const energy = view.model.hitResponse.strength;
    presentHitResponse(world, event, view.model, true, false);
    expect(view.model.hitResponse.strength).toBeGreaterThan(energy);
    for (let index = 0; index < 100; index++) presentHitResponse(world, { ...event, damage: 1000 }, view.model, true, false);
    expect(view.model.hitResponse.strength).toBeLessThanOrEqual(0.12);
    presentHitResponse(world, { ...event, arc: 'rear', location: 'right_arm' }, view.model, true, false);
    expect(view.model.hitResponse.pitch).toBeLessThan(0);
    expect(view.model.hitResponse.roll).toBeLessThan(0);
    disposeEntityView(view);
  });

  it('does not animate hidden, unplaced or reduced-motion contacts', () => {
    const world = playerWorld('unseen-hit-response', 1);
    const target = unitOf(world, 'hornet_spotter');
    const view = createEntityView(world, target, 'hero', false, undefined);
    const source = fixture();
    const event = { ...source.event, targetId: target.id };
    disposeEntityView(source.view);
    world.vision?.visible.delete(target.id);
    presentHitResponse(world, event, view.model, true, false);
    expect(view.model.hitResponse.strength).toBe(0);
    world.vision?.visible.add(target.id);
    presentHitResponse(world, event, view.model, false, false);
    presentHitResponse(world, event, view.model, true, true);
    expect(view.model.hitResponse.strength).toBe(0);
    disposeEntityView(view);
  });

  it('carries a visible hit through the armour damage model rebuild', () => {
    const { world, target, view, event } = fixture();
    disposeEntityView(view);
    const units = new UnitViews(new Scene(), () => 0);
    const before = units.viewFor(world, target);
    units.markPlaced(target.id);
    units.consumeEvents(world, [event]);
    const strength = before.model.hitResponse.strength;
    target.locations.left_arm.armour = 0;
    const after = units.viewFor(world, target);
    expect(after.model.root).not.toBe(before.model.root);
    expect(after.model.hitResponse.strength).toBe(strength);
    expect(strength).toBeGreaterThan(0);
    units.dispose();
  });
});
