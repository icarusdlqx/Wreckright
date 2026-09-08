import type { Material } from 'three';

/** Feathered silhouettes keep procedural smoke from reading as solid floating stones. */
export function softenSmokeEdges(material: Material): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = 'varying float vSmokeEdge;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 smokePoint = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        smokePoint = instanceMatrix * smokePoint;
      #endif
      vec3 smokeView = (modelViewMatrix * smokePoint).xyz;
      vSmokeEdge = abs(dot(normalize(normalMatrix * normal), normalize(-smokeView)));
    `);
    shader.fragmentShader = 'varying float vSmokeEdge;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= smoothstep(.08, .8, vSmokeEdge);');
  };
  material.customProgramCacheKey = () => `soft-smoke-${material.type}`;
}
