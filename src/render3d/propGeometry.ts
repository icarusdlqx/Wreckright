import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PropTheme } from '../schema/map';
import { mix, shade } from '../render/palette';

export type PropKind =
  | 'tree'
  | 'snag'
  | 'boulder'
  | 'shale'
  | 'crag'
  | 'block'
  | 'causeway'
  | 'wreckage';

interface Part {
  geometry: BufferGeometry;
  colour: number;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

function prepare(part: Part): BufferGeometry {
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

function merge(parts: readonly Part[]): BufferGeometry {
  const prepared = parts.map(prepare);
  const geometry = mergeGeometries(prepared, false);
  for (const part of prepared) part.dispose();
  if (geometry === null) throw new Error('prop geometry parts did not share attributes');
  geometry.computeBoundingSphere();
  return geometry;
}

function tree(theme: PropTheme): BufferGeometry {
  const foliage =
    theme === 'causeway' ? 0x468f7e : theme === 'shale' ? 0x6f8960 : 0x568c68;
  const bark = theme === 'shale' ? 0x8b694a : 0x755840;
  return merge([
    {
      geometry: new CylinderGeometry(0.18, 0.25, 1, 5),
      colour: bark,
      position: [0, 0.33, 0],
      scale: [1, 0.66, 1],
    },
    {
      geometry: new ConeGeometry(1, 1, 6),
      colour: shade(foliage, 0.78),
      position: [0, 0.47, 0],
      scale: [1.12, 0.5, 1.12],
    },
    {
      geometry: new ConeGeometry(0.82, 1, 6),
      colour: foliage,
      position: [0, 0.68, 0],
      scale: [1, 0.46, 1],
    },
    {
      geometry: new ConeGeometry(0.6, 1, 6),
      colour: mix(foliage, 0xbad393, 0.32),
      position: [0, 0.84, 0],
      scale: [1, 0.32, 1],
    },
  ]);
}

function snag(theme: PropTheme): BufferGeometry {
  const bark = theme === 'shale' ? 0x8d7457 : 0x80644d;
  return merge([
    {
      geometry: new CylinderGeometry(0.14, 0.24, 1, 5),
      colour: bark,
      position: [0, 0.5, 0],
    },
    {
      geometry: new CylinderGeometry(0.055, 0.08, 0.45, 5),
      colour: bark,
      position: [0.15, 0.65, 0],
      rotation: [0, 0, -0.82],
    },
    {
      geometry: new CylinderGeometry(0.045, 0.07, 0.36, 5),
      colour: bark,
      position: [-0.13, 0.79, 0.04],
      rotation: [0.18, 0, 0.92],
    },
  ]);
}

function boulder(): BufferGeometry {
  return merge([
    {
      geometry: new IcosahedronGeometry(1, 0),
      colour: 0xc39a73,
      position: [-0.18, 0.42, 0],
      rotation: [0.1, 0.35, 0],
      scale: [0.72, 0.48, 0.62],
    },
    {
      geometry: new IcosahedronGeometry(1, 0),
      colour: 0x9e7c64,
      position: [0.42, 0.25, 0.18],
      rotation: [0, 0.72, 0.16],
      scale: [0.38, 0.28, 0.42],
    },
    {
      geometry: new IcosahedronGeometry(1, 0),
      colour: 0xe0b686,
      position: [0.15, 0.18, -0.42],
      rotation: [0.2, 0.1, -0.08],
      scale: [0.3, 0.2, 0.34],
    },
  ]);
}

function shale(): BufferGeometry {
  return merge([
    {
      geometry: new ConeGeometry(0.48, 1, 4),
      colour: 0xaa826b,
      position: [-0.22, 0.48, 0.02],
      rotation: [0.08, 0.28, -0.22],
      scale: [0.72, 0.96, 0.34],
    },
    {
      geometry: new ConeGeometry(0.42, 1, 4),
      colour: 0x736e6a,
      position: [0.2, 0.37, 0.12],
      rotation: [-0.1, -0.38, 0.3],
      scale: [0.6, 0.74, 0.3],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0xc39a76,
      position: [0.12, 0.12, -0.25],
      rotation: [0.14, 0.32, 0.08],
      scale: [0.55, 0.18, 0.3],
    },
  ]);
}

function block(theme: PropTheme): BufferGeometry {
  const industrial = theme === 'industrial';
  const wall = industrial ? 0xd2bc95 : theme === 'shale' ? 0xc9a780 : 0xead6ab;
  const roof = theme === 'shale' ? 0x65716e : 0x45646b;
  const parts: Part[] = [
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: wall,
      position: [0, 0.38, 0],
      scale: [1, 0.76, 1],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: roof,
      position: [0, 0.76, 0],
      scale: [1.02, 0.075, 1.02],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0x31464b,
      position: [0.08, 0.27, -0.502],
      scale: [0.34, 0.54, 0.025],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0xebaa51,
      position: [0.08, 0.58, -0.514],
      scale: [0.52, 0.07, 0.045],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: roof,
      position: [-0.504, 0.44, 0.04],
      scale: [0.025, 0.16, 0.52],
    },
  ];
  if (industrial) {
    parts.push(
      { geometry: new BoxGeometry(1, 1, 1), colour: 0x70988d,
        position: [-0.18, 0.84, 0.08], scale: [0.55, 0.18, 0.62] },
      { geometry: new CylinderGeometry(0.07, 0.09, 0.5, 6), colour: 0x8b6954,
        position: [0.27, 0.95, -0.22] },
    );
  } else {
    // A low hipped roof keeps the original unit footprint and overall height.
    parts.push({ geometry: new ConeGeometry(1, 1, 4), colour: roof,
      position: [0, 0.875, 0], rotation: [0, Math.PI / 4, 0],
      scale: [Math.SQRT1_2, 0.25, Math.SQRT1_2] });
  }
  return merge(parts);
}

function causeway(): BufferGeometry {
  return merge([
    {
      geometry: new CylinderGeometry(0.035, 0.05, 1, 5),
      colour: 0x476267,
      position: [0, 0.5, 0],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0xd1b98c,
      position: [0, 0.52, 0],
      scale: [1, 0.045, 0.035],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0xd1b98c,
      position: [0, 0.3, 0],
      scale: [1, 0.04, 0.035],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0xeab35e,
      position: [0, 0.92, 0],
      scale: [0.34, 0.055, 0.055],
    },
  ]);
}

function wreckage(): BufferGeometry {
  return merge([
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0x92715a,
      position: [0, 0.3, 0],
      rotation: [0.05, 0.08, -0.07],
      scale: [0.8, 0.34, 0.54],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0x292d2d,
      position: [-0.52, 0.2, 0],
      rotation: [0, 0.06, 0.08],
      scale: [0.22, 0.24, 0.76],
    },
    {
      geometry: new BoxGeometry(1, 1, 1),
      colour: 0x292d2d,
      position: [0.52, 0.18, 0.02],
      rotation: [0, -0.08, -0.05],
      scale: [0.22, 0.22, 0.76],
    },
    {
      geometry: new IcosahedronGeometry(1, 0),
      colour: 0xb28b67,
      position: [0.55, 0.13, -0.5],
      scale: [0.22, 0.14, 0.24],
    },
    {
      geometry: new IcosahedronGeometry(1, 0),
      colour: 0x896c58,
      position: [-0.42, 0.11, 0.52],
      scale: [0.25, 0.12, 0.18],
    },
  ]);
}

export function createPropGeometry(kind: PropKind, theme: PropTheme): BufferGeometry {
  switch (kind) {
    case 'tree': return tree(theme);
    case 'snag': return snag(theme);
    case 'boulder': return boulder();
    case 'shale': return shale();
    case 'crag':
      return merge([
        {
          geometry: new IcosahedronGeometry(1, 0),
          colour: 0xa1806b,
          position: [-0.08, 0.46, 0],
          rotation: [0.08, 0.25, 0.12],
          scale: [0.7, 0.6, 0.62],
        },
        {
          geometry: new IcosahedronGeometry(1, 0),
          colour: 0xc49b74,
          position: [0.24, 0.28, 0.12],
          rotation: [0.1, 0.45, -0.14],
          scale: [0.53, 0.33, 0.53],
        },
      ]);
    case 'block': return block(theme);
    case 'causeway': return causeway();
    case 'wreckage': return wreckage();
  }
}
