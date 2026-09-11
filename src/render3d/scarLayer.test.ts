import { Matrix4, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { SCAR_SECONDS, ScarLayer } from './scarLayer';

describe('soft battlefield scars', () => {
  it('coalesces a volley and fades ordinary damage without removing the heavy crater', () => {
    const layer = new ScarLayer(4, 2);
    layer.mark({ x: 10, y: 10 }, 0, 4, 0.2);
    layer.mark({ x: 11, y: 11 }, 0, 4, 0.2);
    layer.crater({ x: 40, y: 50 }, 0, 18);
    expect(layer.scarCount).toBe(1);
    const alpha = layer.mesh.geometry.getAttribute('scarOpacity');
    expect(alpha.getX(0)).toBeCloseTo(0.55);
    layer.update(SCAR_SECONDS / 2);
    expect(alpha.getX(0)).toBeCloseTo(0.275);
    layer.update(0);
    expect(alpha.getX(0)).toBeCloseTo(0.275);
    layer.update(SCAR_SECONDS / 2);
    expect(layer.scarCount).toBe(0);
    expect(layer.craterCount).toBe(1);
    expect(alpha.getX(4)).toBe(1);
    const matrix = new Matrix4();
    layer.mesh.getMatrixAt(0, matrix);
    expect(matrix.getMaxScaleOnAxis()).toBe(0);
    layer.mesh.getMatrixAt(4, matrix);
    expect(matrix.getMaxScaleOnAxis()).toBe(18);
    layer.dispose();
  });

  it('uses transparent edges and applies each instance fade in the actual shader', () => {
    const layer = new ScarLayer(1, 1);
    const colours = layer.mesh.geometry.getAttribute('color');
    expect(colours.itemSize).toBe(4);
    expect(colours.getW(0)).toBe(1);
    for (let i = 1; i < colours.count; i += 1) expect(colours.getW(i)).toBe(0);
    const material = Array.isArray(layer.mesh.material) ? layer.mesh.material[0]! : layer.mesh.material;
    const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as Parameters<typeof material.onBeforeCompile>[1]);
    expect(shader.vertexShader).toContain('vScarOpacity = scarOpacity');
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vScarOpacity');
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
    layer.dispose();
  });
});
