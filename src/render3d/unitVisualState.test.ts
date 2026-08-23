import { describe, expect, it } from 'vitest';
import { playerWorld, testWorld, unitOf } from '../../tests/support';
import {
  fallbackFallAxis,
  impactFallAxis,
  modelDamageSignature,
  sealedTargetOffset,
} from './unitVisualState';

describe('unit visual state', () => {
  it('turns an attacker bearing into a facing-relative fall axis', () => {
    const target = { x: 10, y: 0, facing: 0 };
    expect(impactFallAxis(target, { x: 0, y: 0 })).toEqual({ pitch: 0, roll: -1 });
    expect(impactFallAxis(target, { x: 10, y: -10 })?.pitch).toBeCloseTo(1);
    expect(impactFallAxis(target, { x: 10, y: -10 })?.roll).toBeCloseTo(0);
    expect(impactFallAxis(target, target)).toBeNull();
    expect(fallbackFallAxis(1)).not.toEqual(fallbackFallAxis(2));
  });

  it('keeps sealed wear hidden but rebuilds persistent system failures', () => {
    const world = testWorld('sealed-signature-failures');
    const entity = unitOf(world, 'sentinel_brawler');
    const clean = modelDamageSignature(entity, 'aurelian');
    entity.locations.left_arm.armour *= 0.2;
    expect(modelDamageSignature(entity, 'aurelian')).toBe(clean);
    entity.locations.left_arm.destroyed = true;
    expect(modelDamageSignature(entity, 'aurelian')).not.toBe(clean);
  });

  it('does not articulate a sealed hull toward an optically lost target', () => {
    const world = playerWorld('sealed-hidden-bearing');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const sealed = unitOf(world, 'sentinel_brawler');
    const target = world.entities.find((entity) => entity.team !== sealed.team);
    if (target === undefined) throw new Error('missing hostile target');
    vision.team = sealed.team;
    vision.visible.delete(target.id);
    sealed.pos = { x: 100, y: 100 };
    sealed.facing = 0;
    sealed.torsoOffset = 0.18;
    sealed.targetId = target.id;
    target.pos = { x: 100, y: 300 };
    const displayed = { x: sealed.pos.x, y: sealed.pos.y, facing: 0, torso: 0 };

    expect(sealedTargetOffset(world, sealed, displayed)).toBe(sealed.torsoOffset);
    vision.visible.add(target.id);
    expect(sealedTargetOffset(world, sealed, displayed))
      .toBeCloseTo(Math.min(Math.PI / 2, sealed.twistLimit));
  });
});
