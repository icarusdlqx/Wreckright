import { Color, Mesh, MeshStandardMaterial } from 'three';
import type { MechLocation } from '../schema/common';
import type { LocationAnchors } from './locationAnchors';

interface SurfaceMaterial {
  readonly material: MeshStandardMaterial;
  readonly baseEmissive: Color;
  readonly baseIntensity: number;
}

interface SurfaceEntry {
  readonly materials: SurfaceMaterial[];
  readonly tint: Color;
  flash: number;
  life: number;
  glow: number;
  lit: boolean;
}

/**
 * Per-model emissive state for the plates a hit just struck and the torso
 * panels a hot reactor is cooking. Materials are cloned per location the first
 * time a location needs to light, so an untouched machine still shares its
 * finish batches with every other hull of its chassis.
 */
export interface HullSurfaceRig {
  readonly entries: Map<MechLocation, SurfaceEntry>;
  heatGlow: number;
}

const ARMOUR_FLASH = new Color(0xa8dcff);
const STRUCTURE_FLASH = new Color(0xff7a2e);
const HEAT_GLOW = new Color(0xff5a1c);
const HEAT_LOCATIONS: readonly MechLocation[] = ['centre_torso', 'left_torso', 'right_torso'];
const EMISSIVE = new Color();

function addTint(target: Color, tint: Color, amount: number): void {
  target.r += tint.r * amount;
  target.g += tint.g * amount;
  target.b += tint.b * amount;
}
const FLASH_INTENSITY = 1.05;
const GLOW_INTENSITY = 0.08;

export function createHullSurface(): HullSurfaceRig {
  return { entries: new Map(), heatGlow: 0 };
}

function entryFor(
  rig: HullSurfaceRig,
  anchors: LocationAnchors,
  location: MechLocation,
): SurfaceEntry | null {
  const existing = rig.entries.get(location);
  if (existing !== undefined) return existing;
  const meshes = anchors[location];
  if (meshes === undefined || meshes.length === 0) return null;
  const materials: SurfaceMaterial[] = [];
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshStandardMaterial)) continue;
    // Disposal traverses the model, so the clone is freed with everything else it finds.
    const clone = mesh.material.clone();
    mesh.material = clone;
    materials.push({
      material: clone,
      baseEmissive: clone.emissive.clone(),
      baseIntensity: clone.emissiveIntensity,
    });
  }
  if (materials.length === 0) return null;
  const entry: SurfaceEntry = {
    materials, tint: new Color(), flash: 0, life: 0.3, glow: 0, lit: false,
  };
  rig.entries.set(location, entry);
  return entry;
}

/** Armour rings cold and bright; a shot into the frame glows hot. */
export function flashHullLocation(
  rig: HullSurfaceRig,
  anchors: LocationAnchors,
  location: MechLocation,
  strength: number,
  structureShare: number,
  seconds: number,
): boolean {
  const entry = entryFor(rig, anchors, location);
  if (entry === null) return false;
  const share = Math.max(0, Math.min(1, structureShare));
  const flash = Math.max(0, Math.min(1, strength));
  if (flash >= entry.flash) {
    entry.tint.copy(ARMOUR_FLASH).lerp(STRUCTURE_FLASH, share);
    entry.flash = flash;
    entry.life = Math.max(0.05, seconds);
  }
  return true;
}

export function setHullHeatGlow(rig: HullSurfaceRig, anchors: LocationAnchors, glow: number): void {
  const clamped = Math.max(0, Math.min(1, glow));
  if (clamped === rig.heatGlow) return;
  rig.heatGlow = clamped;
  for (const location of HEAT_LOCATIONS) {
    const entry = clamped > 0 ? entryFor(rig, anchors, location) : rig.entries.get(location) ?? null;
    if (entry !== null) entry.glow = clamped;
  }
}

export function advanceHullSurface(rig: HullSurfaceRig, deltaSeconds: number): void {
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  for (const entry of rig.entries.values()) {
    if (entry.flash > 0) {
      entry.flash = Math.max(0, entry.flash - delta / entry.life);
    }
    const active = entry.flash > 0 || entry.glow > 0;
    if (!active && !entry.lit) continue;
    entry.lit = active;
    for (const surface of entry.materials) {
      EMISSIVE.copy(surface.baseEmissive);
      if (entry.flash > 0) addTint(EMISSIVE, entry.tint, entry.flash * FLASH_INTENSITY);
      if (entry.glow > 0) addTint(EMISSIVE, HEAT_GLOW, entry.glow * GLOW_INTENSITY);
      surface.material.emissive.copy(EMISSIVE);
      surface.material.emissiveIntensity = active
        ? Math.max(surface.baseIntensity, 1)
        : surface.baseIntensity;
    }
  }
}
