import { distance } from '../math';
import { currentSensorTrack, visionFor } from '../sensors';
import { findEntity, type EntityId, type MechEntity, type World } from '../types';
import { hasUsableFiringSolution } from '../weaponEngagement';

interface IndirectCandidate {
  id: EntityId;
  range: number;
}

/**
 * Picks from electronic returns without opening the hidden entities up to AI
 * scoring. Range and order come only from the quantised contact reports.
 */
export function chooseIndirectTrackTarget(world: World, mech: MechEntity): EntityId | null {
  const vision = visionFor(world, mech.team);
  if (vision === null) return null;

  const candidates: IndirectCandidate[] = [];
  for (const report of vision.tracks.values()) {
    if (report.team === mech.team || currentSensorTrack(vision, report.id) === null) continue;
    const target = findEntity(world, report.id);
    // The firing helper resolves electronic geometry from this same coarse
    // report; it never needs the hidden target's exact position for this case.
    if (target === null || !hasUsableFiringSolution(world, mech, target, 'intent')) continue;
    candidates.push({ id: report.id, range: distance(mech.pos, report.pos) });
  }

  candidates.sort((a, b) => a.range - b.range || a.id - b.id);
  return candidates[0]?.id ?? null;
}

/** Assigns a privacy-safe indirect target and forbids called shots through fog. */
export function assignIndirectTrackTarget(world: World, mech: MechEntity): boolean {
  const id = chooseIndirectTrackTarget(world, mech);
  if (id === null) return false;
  mech.targetId = id;
  mech.calledShot = null;
  return true;
}
