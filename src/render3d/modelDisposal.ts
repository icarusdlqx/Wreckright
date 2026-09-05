import { InstancedMesh, Material, Mesh, Object3D, type BufferGeometry } from 'three';

/** Frees the geometry and materials a model owns. */
export function disposeModel(root: Object3D): void {
  if (root.userData.modelDisposed === true) return;
  root.userData.modelDisposed = true;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const instances = new Set<InstancedMesh>();
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    if (child instanceof InstancedMesh) instances.add(child);
    geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((entry) => materials.add(entry));
    else materials.add(child.material);
  });
  const owned = root.userData.ownedMaterials;
  if (Array.isArray(owned)) {
    for (const entry of owned) if (entry instanceof Material) materials.add(entry);
  }
  instances.forEach((instance) => instance.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
