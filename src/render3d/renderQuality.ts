import type { BlueprintDetail } from '../render/blueprint/types';

export type MechGeometryQuality = 'tactical' | 'hero';
export type ModelDetail = BlueprintDetail;

export interface MechRenderOptions {
  geometry: MechGeometryQuality;
  detail: ModelDetail;
}

export const TACTICAL_MECH_RENDER: Readonly<MechRenderOptions> = Object.freeze({
  geometry: 'tactical',
  detail: 'structure',
});

export const HERO_MECH_RENDER: Readonly<MechRenderOptions> = Object.freeze({
  geometry: 'hero',
  detail: 'hero',
});

// The limited surface fittings remain legible at the normal 470m tactical
// camera. Full inspection detail still never enters the field.
export const SURFACE_DETAIL_ENTER_DISTANCE = 520;
export const SURFACE_DETAIL_LEAVE_DISTANCE = 580;

/** Hysteresis keeps a wheel resting on the boundary from flickering detail. */
export function battlefieldDetailForDistance(
  distance: number,
  lowFx: boolean,
  previous: ModelDetail = 'structure',
): ModelDetail {
  if (lowFx || !Number.isFinite(distance)) return 'structure';
  if (previous !== 'structure') {
    return distance < SURFACE_DETAIL_LEAVE_DISTANCE ? 'surface' : 'structure';
  }
  return distance <= SURFACE_DETAIL_ENTER_DISTANCE ? 'surface' : 'structure';
}

export function includesDetail(level: ModelDetail, wanted: BlueprintDetail): boolean {
  const rank: Record<ModelDetail, number> = { structure: 0, surface: 1, hero: 2 };
  return rank[wanted] <= rank[level];
}
/** Storage is optional in an embedded or private browsing session. */
export function readLowFx(): boolean {
  try {
    return localStorage.getItem('ironline.lowfx') === '1';
  } catch {
    return false;
  }
}
