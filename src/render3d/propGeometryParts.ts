import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface PropPart {
  geometry: BufferGeometry;
  colour: number;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

function prepare(part: PropPart): BufferGeometry {
  const geometry = part.geometry;
  const [sx, sy, sz] = part.scale ?? [1, 1, 1];
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  const [x, y, z] = part.position ?? [0, 0, 0];
  geometry.scale(sx, sy, sz);
  geometry.rotateX(rx);
  geometry.rotateY(ry);
  geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  geometry.deleteAttribute('uv');

  const colour = new Color(part.colour);
  const count = geometry.getAttribute('position').count;
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    values[index * 3] = colour.r;
    values[index * 3 + 1] = colour.g;
    values[index * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));

  if (geometry.index === null) return geometry;
  const unindexed = geometry.toNonIndexed();
  geometry.dispose();
  return unindexed;
}

export function mergePropParts(parts: readonly PropPart[]): BufferGeometry {
  const prepared = parts.map(prepare);
  const geometry = mergeGeometries(prepared, false);
  for (const part of prepared) part.dispose();
  if (geometry === null) throw new Error('prop geometry parts did not share attributes');
  geometry.computeBoundingSphere();
  return geometry;
}
