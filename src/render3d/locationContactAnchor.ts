import { Matrix4, Ray, Vector3, type Mesh } from 'three';
import type { MechLocation } from '../schema/common';
import { locationWorldAnchor, type LocationAnchors } from './locationAnchors';

const INVERSE = new Matrix4();
const WORLD_RAY = new Ray();
const LOCAL_RAY = new Ray();
const CENTRE = new Vector3();
const PART_CENTRE = new Vector3();
const CANDIDATE = new Vector3();
const RAY_REACH = 4096;
const SURFACE_CLEARANCE = .65;

function intersect(part: Mesh, out: Vector3): boolean {
  if (part.geometry.boundingBox === null) part.geometry.computeBoundingBox();
  const box = part.geometry.boundingBox;
  if (box === null || box.isEmpty()) return false;
  INVERSE.copy(part.matrixWorld).invert();
  LOCAL_RAY.copy(WORLD_RAY).applyMatrix4(INVERSE);
  if (LOCAL_RAY.intersectBox(box, out) === null) return false;
  out.applyMatrix4(part.matrixWorld);
  return true;
}

/** Hit flashes sit on the incoming face of the struck plate cluster, not inside it.
 * Uses the existing structural parts and reusable rays; no per-hit scene/geometry allocation.
 * Ordinary readouts keep their centre anchor. An open frame can have no plate on the
 * centre ray, so that case resolves against the closest actual part in the cluster. */
export function locationContactAnchor(anchors: LocationAnchors, location: MechLocation,
  incomingBearing: number, out: Vector3): boolean {
  const parts = anchors[location];
  if (parts === undefined || !locationWorldAnchor(anchors, location, CENTRE)) return false;
  const bearing = Number.isFinite(incomingBearing) ? incomingBearing : 0;
  WORLD_RAY.direction.set(Math.cos(bearing), 0, Math.sin(bearing));
  WORLD_RAY.origin.copy(CENTRE).addScaledVector(WORLD_RAY.direction, -RAY_REACH);
  let nearest = Infinity;
  let closestPart: Mesh | undefined;
  let closestCentre = Infinity;
  for (const part of parts) {
    PART_CENTRE.setFromMatrixPosition(part.matrixWorld);
    const distance = PART_CENTRE.distanceToSquared(CENTRE);
    if (distance < closestCentre) { closestCentre = distance; closestPart = part; }
    if (!intersect(part, CANDIDATE)) continue;
    const rayDistance = CANDIDATE.distanceToSquared(WORLD_RAY.origin);
    if (rayDistance < nearest) { nearest = rayDistance; out.copy(CANDIDATE); }
  }
  if (nearest === Infinity) {
    if (closestPart === undefined) return false;
    PART_CENTRE.setFromMatrixPosition(closestPart.matrixWorld);
    WORLD_RAY.origin.copy(PART_CENTRE).addScaledVector(WORLD_RAY.direction, -RAY_REACH);
    if (!intersect(closestPart, out)) return false;
  }
  out.addScaledVector(WORLD_RAY.direction, -SURFACE_CLEARANCE);
  return true;
}
