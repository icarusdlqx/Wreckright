import { AdditiveBlending, MeshBasicMaterial } from 'three';

/** Every shot batch draws additively with instance colours as its only tint. */
export function shotPoolMaterial(opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0xffffff,
    // Enabling geometry colours would multiply these instance-only colours by black.
    vertexColors: false,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}
