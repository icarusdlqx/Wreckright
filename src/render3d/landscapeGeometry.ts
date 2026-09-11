import {
  BoxGeometry, BufferGeometry, Color, Float32BufferAttribute,
  type Vector3Tuple,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** All scenery is baked once into a small number of draws, not one draw per rock or girder. */
export class LandscapeGeometry {
  private readonly parts: BufferGeometry[] = [];

  constructor(private readonly tint: { colour: Color; strength: number } | null) {}

  box(at: Vector3Tuple, size: Vector3Tuple, colour: number, turn = 0): void {
    const box = new BoxGeometry(...size);
    box.rotateY(turn);
    box.translate(...at);
    this.add(box, colour);
  }

  quad(a: Vector3Tuple, b: Vector3Tuple, c: Vector3Tuple, d: Vector3Tuple, colour: number): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    geometry.computeVertexNormals();
    this.add(geometry, colour);
  }

  /** A broad, flat summit and an offset foot give strata a deliberate silhouette. */
  mesa(at: Vector3Tuple, size: Vector3Tuple, colour: number, lean = 0): void {
    const [x, y, z] = at;
    const [w, h, d] = size;
    const base: Vector3Tuple[] = [[x-w/2,y,z-d/2], [x+w/2,y,z-d/2], [x+w/2,y,z+d/2], [x-w/2,y,z+d/2]];
    const top: Vector3Tuple[] = [[x-w*.33+lean,y+h,z-d*.28], [x+w*.31+lean,y+h,z-d*.3],
      [x+w*.37+lean,y+h,z+d*.27], [x-w*.28+lean,y+h,z+d*.32]];
    this.quad(top[0]!, top[1]!, top[2]!, top[3]!, colour);
    for (let side = 0; side < 4; side += 1) {
      const next = (side + 1) % 4;
      this.quad(base[side]!, base[next]!, top[next]!, top[side]!, colour);
    }
  }

  finish(): BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (merged === null) throw new Error('Landscape geometry must share position, normal and colour attributes');
    merged.computeBoundingSphere();
    return merged;
  }

  private add(source: BufferGeometry, hex: number): void {
    const geometry = source.index === null ? source : source.toNonIndexed();
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    const colour = new Color(hex);
    if (this.tint !== null) colour.lerp(this.tint.colour, this.tint.strength);
    const colours = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colours.length; index += 3) {
      colours[index] = colour.r; colours[index + 1] = colour.g; colours[index + 2] = colour.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    this.parts.push(geometry);
  }
}
