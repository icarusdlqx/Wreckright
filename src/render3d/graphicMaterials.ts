import { MeshStandardMaterial, ShaderChunk } from 'three';

// Shape the direct diffuse light into broad illustrated planes. The original
// light colour, shadow attenuation, fog, emissive lamps and metal response stay
// in Three's normal pipeline; there is no extra draw or screen-space pass.
const GRAPHIC_LIGHTS = ShaderChunk.lights_physical_pars_fragment.replace(
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  `float graphicNormalLight = saturate( dot( geometryNormal, directLight.direction ) );
  float graphicBands =
    0.32 * smoothstep( 0.12, 0.17, graphicNormalLight ) +
    0.34 * smoothstep( 0.44, 0.50, graphicNormalLight ) +
    0.34 * smoothstep( 0.77, 0.83, graphicNormalLight );
  float dotNL = mix( graphicNormalLight, graphicBands, 0.72 );`,
);

/** A subclass keeps the shader treatment when battle damage clones a finish. */
export class GraphicStandardMaterial extends MeshStandardMaterial {
  override onBeforeCompile(shader: Parameters<MeshStandardMaterial['onBeforeCompile']>[0]): void {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>', GRAPHIC_LIGHTS,
    );
  }

  override customProgramCacheKey(): string { return 'graphic-expedition-v1'; }
}
