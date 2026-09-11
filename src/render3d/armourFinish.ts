import { Float32BufferAttribute, type BufferGeometry, type MeshStandardMaterialParameters } from 'three';
import type { BlueprintPart } from '../render/blueprint';
import type { Faction } from '../schema/faction';
import { GraphicStandardMaterial } from './graphicMaterials';

/** Local coordinates keep the finish on the plate when an arm pivots or breaks off. */
export function addArmourCoordinates(geometry: BufferGeometry, part: BlueprintPart): BufferGeometry {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const positions = geometry.getAttribute('position');
  const values = new Float32Array(positions.count * 4);
  const enabled = part.tone === 'plate' && part.detail === 'structure'
    && part.shape !== 'cylinder' && part.shape !== 'sphere'
    && part.size[0] > 0.22 && part.size[1] > 0.23 && part.size[2] > 0.18;
  if (bounds !== null && enabled) {
    const sizes = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
    for (let i = 0; i < positions.count; i += 1) {
      values[i * 4] = (positions.getX(i) - bounds.min.x) / Math.max(0.001, sizes[0]!) * 2 - 1;
      values[i * 4 + 1] = (positions.getY(i) - bounds.min.y) / Math.max(0.001, sizes[1]!) * 2 - 1;
      values[i * 4 + 2] = (positions.getZ(i) - bounds.min.z) / Math.max(0.001, sizes[2]!) * 2 - 1;
      values[i * 4 + 3] = 1;
    }
  }
  geometry.setAttribute('armourCoordinate', new Float32BufferAttribute(values, 4));
  return geometry;
}

const ARMOUR_FINISH = `
  vec3 plateNormal = abs(normalize(vArmourNormal));
  vec2 plateUV = plateNormal.z > max(plateNormal.x, plateNormal.y)
    ? vArmourCoordinate.xy : plateNormal.x > plateNormal.y
      ? vArmourCoordinate.zy : vArmourCoordinate.xz;
  float broadFace = smoothstep(0.86, 0.99, max(plateNormal.x, max(plateNormal.y, plateNormal.z)));
  float detail = vArmourCoordinate.w * broadFace;
  vec2 inset = abs(plateUV - vec2(mix(0.09, 0.0, armourCulture), 0.03));
  float border = max(inset.x / 0.71, inset.y / 0.67);
  float aa = max(fwidth(border), 0.003);
  float seam = (1.0 - smoothstep(0.016, 0.016 + aa, abs(border - 1.0))) * detail;
  float panel = (1.0 - smoothstep(0.96, 1.0, border)) * detail;
  vec2 fastener = abs(inset - vec2(0.56, 0.51));
  float boltDistance = length(fastener);
  float bolt = (1.0 - smoothstep(0.033, 0.033 + max(fwidth(boltDistance), 0.004), boltDistance))
    * detail * (1.0 - armourCulture);
  float join = (1.0 - smoothstep(0.015, 0.015 + max(fwidth(plateUV.x), 0.004), abs(plateUV.x + 0.28)))
    * step(0.24, plateUV.y) * detail * (1.0 - armourCulture);
  diffuseColor.rgb *= 1.0 - seam * mix(0.37, 0.25, armourCulture) - bolt * 0.63 - join * 0.32;
  diffuseColor.rgb *= 1.0 - panel * mix(0.055, 0.018, armourCulture);
  roughnessFactor = clamp(roughnessFactor - panel * armourCulture * 0.1, 0.15, 1.0);
`;

/** Panel seams and fasteners add no texture, geometry, draw calls or world-state writes. */
export class ArmourFinishMaterial extends GraphicStandardMaterial {
  constructor(parameters?: MeshStandardMaterialParameters, faction: Faction = 'linewrought') {
    super(parameters);
    this.userData.armourCulture = faction === 'aurelian' ? 1 : 0;
  }

  override onBeforeCompile(shader: Parameters<GraphicStandardMaterial['onBeforeCompile']>[0]): void {
    super.onBeforeCompile(shader);
    shader.uniforms.armourCulture = { value: this.userData.armourCulture ?? 0 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 armourCoordinate;
      varying vec4 vArmourCoordinate;
      varying vec3 vArmourNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vArmourCoordinate = armourCoordinate;
      vArmourNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float armourCulture;
      varying vec4 vArmourCoordinate;
      varying vec3 vArmourNormal;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${ARMOUR_FINISH}`);
  }

  override customProgramCacheKey(): string { return 'graphic-armour-finish-v1'; }
}
