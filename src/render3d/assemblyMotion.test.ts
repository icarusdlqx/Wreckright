import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { poseTravellingAssemblies } from './assemblyMotion';
import { resetModelArticulation, type ModelArticulation } from './modelArticulation';

function rig(): ModelArticulation {
  return { arms: [{ location: 'left_arm', pivot: new Group() }, { location: 'right_arm', pivot: new Group() }],
    shoulders: [{ location: 'left_torso', pivot: new Group() }] };
}

describe('travelling upper assemblies', () => {
  it('lets industrial arms counter-swing without yawing the weapon off its target', () => {
    const model = rig();
    poseTravellingAssemblies(model, 'linewrought', 0.3, 1, false, false);
    const [left, right] = model.arms;
    expect(left!.pivot.rotation.z).toBeLessThan(0);
    expect(right!.pivot.rotation.z).toBeGreaterThan(0);
    expect(model.arms.every((arm) => arm.pivot.rotation.y === 0)).toBe(true);
    expect(model.arms.every((arm) => arm.pivot.position.length() === 0)).toBe(true);
  });

  it('stabilises firing weapons and gives Aurelian actuators a more restrained gait', () => {
    const full = rig(), firing = rig(), aurelian = rig();
    poseTravellingAssemblies(full, 'linewrought', 0.3, 1, false, false);
    poseTravellingAssemblies(firing, 'linewrought', 0.3, 1, true, false);
    poseTravellingAssemblies(aurelian, 'aurelian', 0.3, 1, false, false);
    expect(Math.abs(firing.arms[0]!.pivot.rotation.z)).toBeCloseTo(Math.abs(full.arms[0]!.pivot.rotation.z) * 0.15);
    expect(Math.abs(aurelian.arms[0]!.pivot.rotation.z)).toBeLessThan(Math.abs(full.arms[0]!.pivot.rotation.z));
  });

  it('returns cleanly to the authored pose and respects reduced motion', () => {
    const model = rig();
    poseTravellingAssemblies(model, 'linewrought', 1, 1, false, false);
    resetModelArticulation(model);
    poseTravellingAssemblies(model, 'linewrought', 1, 1, false, true);
    for (const assembly of [...model.arms, ...model.shoulders]) {
      expect(assembly.pivot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    }
  });
});
