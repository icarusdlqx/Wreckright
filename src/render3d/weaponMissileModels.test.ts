import { Box3, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../schema/load';
import { buildWeaponModel } from './weaponModels';
import { weaponArtFor } from './weaponArt';
import { disposeObjectResources } from './sceneResources';

const missiles = [...loadCatalog().weapons.values()].filter(weapon => weapon.type === 'missile');

describe('missile launch faces', () => {
  it.each(['tactical', 'hero'] as const)('exposes every tube mouth beyond the actual bevelled housing at %s quality', quality => {
    for (const weapon of missiles) {
      const model = buildWeaponModel({ weaponId: weapon.id, location: 'left_torso', type: weapon.type,
        tonnage: weapon.tonnage, projectiles: weapon.projectiles, recoil: weapon.recoil, visual: weapon.visual },
      0.5 + Math.min(1, weapon.tonnage / 14), 1, new MeshStandardMaterial(), new MeshStandardMaterial(), quality);
      try {
        const housing = model.root.children.find(child => child.name.endsWith('-rack'));
        const tubes = model.root.getObjectByName('missile-tubes');
        expect(housing).toBeInstanceOf(Mesh);
        expect(tubes).toBeInstanceOf(InstancedMesh);
        if (!(housing instanceof Mesh) || !(tubes instanceof InstancedMesh)) throw new Error('missing launcher geometry');
        const front = new Box3().setFromObject(housing).max.x;
        tubes.geometry.computeBoundingBox();
        for (let index = 0; index < tubes.count; index += 1) {
          const matrix = new Matrix4();
          tubes.getMatrixAt(index, matrix);
          const vertices = tubes.geometry.getAttribute('position');
          const mouthPlane = tubes.geometry.boundingBox!.max.y;
          const rim: number[] = [];
          for (let vertex = 0; vertex < vertices.count; vertex += 1) {
            if (vertices.getY(vertex) < mouthPlane - 0.00001) continue;
            rim.push(new Vector3().fromBufferAttribute(vertices, vertex).applyMatrix4(matrix).x);
          }
          expect(rim.length).toBeGreaterThan(0);
          expect(Math.min(...rim), `${weapon.id} tube ${index + 1} complete mouth`).toBeGreaterThan(front);
        }
        expect(model.rig.muzzle.position.x, weapon.id).toBeGreaterThan(front);
        if (weapon.id !== 'lrm20') {
          const art = weaponArtFor({ weaponId: weapon.id, type: weapon.type, projectiles: weapon.projectiles, visual: weapon.visual });
          const depthFactor = art.family === 'missile-loft' ? 0.5 : art.family === 'missile-heavy' ? 0.58 : 0.36;
          const originalCentre = depthFactor * (0.5 + Math.min(1, weapon.tonnage / 14)) * art.bulk * 0.54;
          const firstTube = new Matrix4();
          tubes.getMatrixAt(0, firstTube);
          expect(firstTube.elements[12], `${weapon.id} unchanged centre`).toBeCloseTo(originalCentre);
        }
      } finally { disposeObjectResources(model.root); }
    }
  });
});
