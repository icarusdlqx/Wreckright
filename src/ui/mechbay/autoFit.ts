import type { RefitAvailability } from '../../campaign/refitQuote';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { computeLoadout } from '../../sim/loadout';
import type { DropPayload } from './LocationCard';
import { evaluateDrop } from './mechbayEdits';

export interface LocationFit {
  readonly ok: boolean;
  /** Why this location refused the held part, ready to show. Null when it fits. */
  readonly reason: string | null;
}

/**
 * Every location judged against one held part, keeping the refusal text.
 *
 * The bay already evaluated all eight locations to decide which to highlight;
 * this keeps the reasons that pass threw away, so a location can say what is
 * wrong instead of only that something is.
 */
export function fitByLocation(
  catalog: Catalog,
  design: Design,
  payload: DropPayload | null,
  availability?: RefitAvailability,
): Map<MechLocation, LocationFit> {
  const fits = new Map<MechLocation, LocationFit>();
  if (payload === null) return fits;

  for (const location of LOCATIONS) {
    const evaluation = evaluateDrop(catalog, design, payload, location, availability);
    fits.set(
      location,
      evaluation.status === 'blocked'
        ? { ok: false, reason: evaluation.reasons[0]?.message ?? 'This location cannot take it.' }
        : { ok: true, reason: null },
    );
  }
  return fits;
}

export function compatibleFrom(fits: ReadonlyMap<MechLocation, LocationFit>): MechLocation[] {
  return LOCATIONS.filter((location) => fits.get(location)?.ok === true);
}

function freeSlotsAt(catalog: Catalog, design: Design, location: MechLocation): number {
  const usage = computeLoadout(catalog, design).perLocation[location];
  return Math.max(0, usage.slotsAvailable - usage.slotsUsed);
}

/**
 * Ammunition is ranked by where it is survivable, not where it is convenient.
 *
 * A blowout cell only protects ammunition in its own location, so a bay that
 * already has one is worth more than any amount of free room elsewhere — and
 * filling it also settles the warning the validator raises for a cell guarding
 * nothing. After that the ordering is simply how bad the location is to lose:
 * a side torso or a limb costs a bin, the centre torso costs the machine, and
 * the head costs the pilot.
 */
const AMMO_LOCATION_RANK: readonly MechLocation[] = [
  'left_torso',
  'right_torso',
  'left_arm',
  'right_arm',
  'left_leg',
  'right_leg',
  'centre_torso',
  'head',
];

export function bestAmmoLocation(
  catalog: Catalog,
  design: Design,
  candidates: readonly MechLocation[],
): MechLocation | null {
  if (candidates.length === 0) return null;

  const shielded = new Set(
    design.equipment
      .filter((fit) => (catalog.equipment.get(fit.equipmentId)?.stats.ammo_blast_containment ?? 0) > 0)
      .map((fit) => fit.location),
  );

  const ranked = [...candidates].sort((a, b) => {
    const cell = Number(shielded.has(b)) - Number(shielded.has(a));
    if (cell !== 0) return cell;
    return AMMO_LOCATION_RANK.indexOf(a) - AMMO_LOCATION_RANK.indexOf(b);
  });
  return ranked[0] ?? null;
}

/**
 * Where a part goes when the player would rather not decide.
 *
 * Guns and gear pack best-fit: the tightest location that still takes the part,
 * so the wide bays stay open for the wide things. Ammunition ignores packing
 * and follows survivability instead.
 */
export function bestLocationFor(
  catalog: Catalog,
  design: Design,
  payload: DropPayload,
  fits: ReadonlyMap<MechLocation, LocationFit>,
): MechLocation | null {
  const candidates = compatibleFrom(fits);
  if (candidates.length === 0) return null;
  if (payload.kind === 'ammo') return bestAmmoLocation(catalog, design, candidates);

  const ranked = [...candidates].sort((a, b) => {
    const room = freeSlotsAt(catalog, design, a) - freeSlotsAt(catalog, design, b);
    if (room !== 0) return room;
    return LOCATIONS.indexOf(a) - LOCATIONS.indexOf(b);
  });
  return ranked[0] ?? null;
}
