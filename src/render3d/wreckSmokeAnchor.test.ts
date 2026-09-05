import { Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { testWorld } from '../../tests/support';
import { BattleEffects } from './battleEffects';
import { SmokeLayer } from './battlefieldWear';
import { TacticalCamera } from './camera';

function matrix(mesh: InstancedMesh): Matrix4 { const result = new Matrix4(); mesh.getMatrixAt(0, result); return result; }
function position(mesh: InstancedMesh): Vector3 { return new Vector3().setFromMatrixPosition(matrix(mesh)); }

describe('visible articulated wreck smoke', () => {
  it('moves the existing column with its source while retaining age, scale and fixed storage', () => {
    const smoke = new SmokeLayer(new Color(), { x: 0, y: 0 });
    smoke.start({ x: 10, y: 20 }, 24, 7); smoke.update(.3);
    const initial = position(smoke.mesh), scale = new Vector3().setFromMatrixScale(matrix(smoke.mesh));
    const geometry = smoke.mesh.geometry, instances = smoke.mesh.instanceMatrix;
    const resolve = vi.fn((key: number, out: Vector3) => { expect(key).toBe(7); out.set(12, 8, 23); return true; });
    smoke.followAnchors(resolve);
    const moved = position(smoke.mesh);
    expect(moved.x - initial.x).toBeCloseTo(2); expect(moved.y - initial.y).toBeCloseTo(-22);
    expect(moved.z - initial.z).toBeCloseTo(3);
    expect(new Vector3().setFromMatrixScale(matrix(smoke.mesh)).equals(scale)).toBe(true);
    expect(smoke.mesh.geometry).toBe(geometry); expect(smoke.mesh.instanceMatrix).toBe(instances);
    expect(smoke.activeColumns).toBe(1);
    smoke.followAnchors(() => false); expect(position(smoke.mesh).equals(moved)).toBe(true);
    smoke.update(59.7); expect(smoke.activeColumns).toBe(0);
    smoke.followAnchors(resolve); expect(resolve).toHaveBeenCalledTimes(1);
    smoke.dispose();
  });

  it('refreshes only placed visible wrecks after the model pose, without reading concealed anchors', () => {
    const world = testWorld('wreck-smoke-follow'); const scene = new Scene(); let visible = true;
    const anchor = new Vector3(10, 30, 20);
    const anchorOf = vi.fn((_id: number, _location: string, out: Vector3) => { out.copy(anchor); return true; });
    const effects = new BattleEffects(scene, new Color(), new TacticalCamera(false), () => 0,
      () => ({ x: 10, y: 20 }), () => false, { anchorOf, canLocate: () => visible });
    effects.consume(world, [{ type: 'mech_destroyed', tick: 1, entityId: 2, method: 'centre_torso' }]);
    const smoke = scene.getObjectByName('wreck-smoke') as InstancedMesh;
    effects.advance(.1); anchor.set(12, 8, 23); effects.finishFrame(.1);
    expect(position(smoke).y).toBeLessThan(12);
    const last = position(smoke); anchorOf.mockClear(); visible = false; anchor.set(900, 900, 900);
    effects.finishFrame(0);
    expect(anchorOf).not.toHaveBeenCalled(); expect(position(smoke).equals(last)).toBe(true);
    effects.destroy();
  });
});
