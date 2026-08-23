import { describe, expect, it } from 'vitest';
import { testWorld, unitOf } from '../../tests/support';
import {
  fallbackFallAxis,
  impactFallAxis,
  modelDamageSignature,
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
});
