import { BoxGeometry, MeshStandardMaterial, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { part } from '../render/blueprint/parts';
import { ArmourFinishMaterial, addArmourCoordinates } from './armourFinish';
import { createDamageWearMaterials, createMechMaterials } from './mechMaterials';

function finishShader(material: ArmourFinishMaterial) {
  const shader = { vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as Parameters<ArmourFinishMaterial['onBeforeCompile']>[0]);
  return shader;
}

describe('armour surface finish', () => {
  it('keeps full-size plate coordinates local and bounded without adding triangles', () => {
    const geometry = new BoxGeometry(3, 4, 2);
    const triangles = geometry.index?.count;
    addArmourCoordinates(geometry, part('centre_torso', 'box', [0, 0, 0], [1, 1, 1], 'plate'));
    const attribute = geometry.getAttribute('armourCoordinate');
    expect(attribute.count).toBe(geometry.getAttribute('position').count);
    expect([...attribute.array].every((value) => Number.isFinite(value) && value >= -1 && value <= 1)).toBe(true);
    expect(attribute.getW(0)).toBe(1);
    expect(geometry.index?.count).toBe(triangles);
    geometry.dispose();
  });

  it('omits patterns from tiny plates, joint bearings and glass', () => {
    for (const piece of [
      part('head', 'box', [0, 0, 0], [0.1, 0.1, 0.1], 'plate'),
      part('head', 'box', [0, 0, 0], [1, 1, 1], 'glass'),
      part('left_leg', 'cylinder', [0, 0, 0], [1, 1, 1], 'plate'),
    ]) {
      const geometry = addArmourCoordinates(new BoxGeometry(1, 1, 1), piece);
      expect([...geometry.getAttribute('armourCoordinate').array].every((value) => value === 0)).toBe(true);
      geometry.dispose();
    }
  });

  it('preserves the cultured finish when persistent damage clones an armour material', () => {
    const clean = createMechMaterials('sentinel_snl2', 0x88b7ba, false, 'aurelian');
    const damaged = createDamageWearMaterials(clean, 1);
    expect(damaged.plate).toBeInstanceOf(ArmourFinishMaterial);
    expect(damaged.plate.userData.armourCulture).toBe(1);
    expect(damaged.plate.color.getHex()).not.toBe(clean.plate.color.getHex());
    for (const material of [...Object.values(clean), ...Object.values(damaged)]) material.dispose();
  });

  it('retains normal lighting, shadows and derivatives for stable subpixel seams', () => {
    const material = new ArmourFinishMaterial({}, 'linewrought');
    const shader = finishShader(material);
    expect(shader.vertexShader).toContain('attribute vec4 armourCoordinate');
    expect(shader.fragmentShader).toContain('fwidth(border)');
    expect(shader.fragmentShader).toContain('graphicNormalLight');
    expect(shader.fragmentShader).toContain('#include <shadowmap_pars_fragment>');
    expect(shader.uniforms).toEqual({ armourCulture: { value: 0 } });
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    material.dispose();
  });
});
