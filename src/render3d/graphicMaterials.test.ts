import { MeshStandardMaterial, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { GraphicStandardMaterial } from './graphicMaterials';
import { createDamageWearMaterials, createMechMaterials } from './mechMaterials';

describe('graphic material lifecycle', () => {
  it('retains the same shader programme when damage clones an armour finish', () => {
    const intact = createMechMaterials('hornet_hnt2', 0x78c9ff, false);
    const scorched = createDamageWearMaterials(intact, 2);
    expect(scorched.plate).toBeInstanceOf(GraphicStandardMaterial);
    expect(scorched.plate.customProgramCacheKey()).toBe(intact.plate.customProgramCacheKey());
    expect(scorched.plate.customProgramCacheKey())
      .not.toBe(new MeshStandardMaterial().customProgramCacheKey());
    expect(scorched.plate.color.equals(intact.plate.color)).toBe(false);
    Object.values(intact).forEach((material) => material.dispose());
    Object.values(scorched).forEach((material) => material.dispose());
  });

  it('patches the installed shader while preserving fog, shadow and emissive stages', () => {
    const shader = {
      fragmentShader: ShaderLib.standard.fragmentShader,
    } as Parameters<GraphicStandardMaterial['onBeforeCompile']>[0];
    const material = new GraphicStandardMaterial();
    material.onBeforeCompile(shader);
    expect(shader.fragmentShader).toContain('float graphicBands');
    expect(shader.fragmentShader).toContain('vec3 irradiance = dotNL * directLight.color');
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance');
    material.dispose();
  });
});
