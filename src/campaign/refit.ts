import { LOCATIONS, type MechLocation } from '../schema/common';
import type { Design } from '../schema/design';
import { validateDesign } from '../schema/designValidation';
import type { Catalog } from '../schema/load';
import { armourFacesForDesign, carryArmourDamage } from '../sim/designArmour';
import { maximiseArmour } from '../sim/loadout';
import { pristineCondition, startRepair } from './repair';
import {
  quoteRefit,
  refitAvailability,
  settleRefitQuote,
  type RefitQuote,
} from './refitQuote';
import { addToStore, takeFromStore, type CampaignState, type MechRecord } from './types';

export { quoteRefit, refitAvailability } from './refitQuote';
export type {
  RefitAvailability,
  RefitPartRole,
  RefitQuote,
  RefitShortage,
  RefitStockLine,
} from './refitQuote';

export interface RefitResult {
  ok: boolean;
  reason: string | null;
  location: MechLocation | null;
}

function copy(design: Design): Design {
  return JSON.parse(JSON.stringify(design)) as Design;
}

/**
 * Refitting rewrites the armour maxima, which leaves the recorded condition
 * pointing at the old numbers. Rescale it rather than replacing it: a refit is
 * bolting a gun on, not a free rebuild, and the damage has to survive it.
 */
function rescaledCondition(
  catalog: Catalog,
  mech: MechRecord,
  design: Design,
): MechRecord['condition'] {
  const fresh = pristineCondition(catalog, design);
  const next = { ...fresh };

  for (const location of LOCATIONS) {
    const was = mech.condition[location];
    const now = fresh[location];
    if (was === undefined || now === undefined) continue;
    const previousMax = armourFacesForDesign(
      catalog.rules.construction,
      mech.design,
      location,
    );
    const nextMax = armourFacesForDesign(catalog.rules.construction, design, location);
    const carried = carryArmourDamage(
      { front: was.armour, rear: was.rearArmour },
      previousMax,
      nextMax,
    );
    next[location] = {
      armour: carried.front,
      rearArmour: carried.rear,
      internal: Math.min(was.internal, now.internal),
      destroyed: was.destroyed,
    };
  }

  return next;
}

function rescaleCondition(catalog: Catalog, mech: MechRecord, design: Design): void {
  mech.condition = rescaledCondition(catalog, mech, design);
}

function withWeapon(design: Design, weaponId: string, location: MechLocation): Design {
  const next = copy(design);
  next.mounts.push({ weaponId, location });
  return next;
}

function withAmmo(design: Design, weaponId: string, location: MechLocation): Design {
  const next = copy(design);
  const existing = next.ammo.find(
    (entry) => entry.weaponId === weaponId && entry.location === location,
  );
  if (existing === undefined) next.ammo.push({ weaponId, location, tons: 1 });
  else existing.tons += 1;
  return next;
}

/**
 * Finds a location where this weapon fits once armour is re-spread. Returns the
 * finished design so the caller does not have to redo the search.
 */
export function planFit(
  catalog: Catalog,
  design: Design,
  weaponId: string,
): { location: MechLocation; design: Design } | null {
  const weapon = catalog.weapons.get(weaponId);
  if (weapon === undefined) return null;

  for (const location of LOCATIONS) {
    let candidate = withWeapon(design, weaponId, location);

    if (weapon.ammoPerTon !== null && !candidate.ammo.some((e) => e.weaponId === weaponId)) {
      const withRounds = withAmmo(candidate, weaponId, location);
      if (validateDesign(catalog, maximiseArmour(catalog, withRounds)).valid) {
        candidate = withRounds;
      }
    }

    const balanced = maximiseArmour(catalog, candidate);
    if (validateDesign(catalog, balanced).valid) return { location, design: balanced };
  }

  return null;
}

/** Moves a weapon out of the store and onto a mech, re-spreading armour to pay for it. */
export function fitFromStore(
  catalog: Catalog,
  state: CampaignState,
  mech: MechRecord,
  weaponId: string,
): RefitResult {
  if (mech.status === 'hulk') {
    return { ok: false, reason: 'rebuild the chassis before refitting it', location: null };
  }
  if (mech.status === 'repairing') {
    return { ok: false, reason: 'this mech is in the repair bay', location: null };
  }

  const plan = planFit(catalog, mech.design, weaponId);
  if (plan === null) {
    return { ok: false, reason: 'no location on this chassis can take it', location: null };
  }

  if (!takeFromStore(state, 'weapon', weaponId)) {
    return { ok: false, reason: 'none of those in stores', location: null };
  }

  rescaleCondition(catalog, mech, plan.design);
  mech.design = plan.design;
  return { ok: true, reason: null, location: plan.location };
}

/** Strips a mounted weapon back into stores. */
export function stripToStore(
  catalog: Catalog,
  state: CampaignState,
  mech: MechRecord,
  mountIndex: number,
): RefitResult {
  const mount = mech.design.mounts[mountIndex];
  if (mount === undefined) return { ok: false, reason: 'no such mount', location: null };
  if (mech.status !== 'ready') {
    return { ok: false, reason: 'this mech is not in the bay', location: null };
  }

  // A design with no weapons fails DesignSchema, and the campaign is serialised
  // without validation — stripping the last mount wrote a save that would not
  // load, silently discarding the run on the next start.
  if (mech.design.mounts.length <= 1) {
    return { ok: false, reason: 'a mech needs at least one weapon', location: null };
  }

  const next = copy(mech.design);
  next.mounts.splice(mountIndex, 1);
  if (!next.mounts.some((candidate) => candidate.weaponId === mount.weaponId)) {
    next.ammo = next.ammo.filter((bin) => bin.weaponId !== mount.weaponId);
  }

  const fitted = maximiseArmour(catalog, next);
  const report = validateDesign(catalog, fitted);
  if (!report.valid) {
    const issue = report.issues.find((entry) => entry.severity === 'error');
    return {
      ok: false,
      reason: issue?.message ?? 'stripping that weapon would leave an illegal build',
      location: issue?.location ?? null,
    };
  }

  const condition = rescaledCondition(catalog, mech, fitted);
  const storeDraft = { ...state, store: state.store.map((item) => ({ ...item })) };
  addToStore(storeDraft, 'weapon', mount.weaponId);
  state.store = storeDraft.store;
  mech.design = fitted;
  mech.condition = condition;

  return { ok: true, reason: null, location: mount.location };
}

/** Turns a salvaged wreck into a mech that can be repaired and flown. */
export function rebuildHulk(
  catalog: Catalog,
  state: CampaignState,
  mech: MechRecord,
): RefitResult {
  if (mech.status !== 'hulk') {
    return { ok: false, reason: 'this chassis is not a wreck', location: null };
  }
  // The field condition is the useful part of recovering a better wreck. The
  // normal workshop quote already combines its missing plate/structure with
  // the fixed chassis rebuild, so use that quote instead of silently erasing
  // the damage for the flat chassis fee.
  const result = startRepair(catalog, state, mech);
  return { ok: result.ok, reason: result.reason, location: null };
}

/** What the company can put on a mech: its stores, plus what is already on it. */
export function refitInventory(
  state: CampaignState,
  mech: MechRecord,
): Map<string, number> {
  const typed = refitAvailability(state, mech);
  const available = new Map<string, number>();
  // Temporary bay adapter. Campaign quotes never use this kind-erasing view;
  // the UI will move to refitAvailability once its shelf accepts typed stock.
  for (const inventory of [typed.weapon, typed.equipment]) {
    for (const [id, count] of inventory) {
      available.set(id, (available.get(id) ?? 0) + count);
    }
  }
  return available;
}

function shortageReason(catalog: Catalog, quote: RefitQuote): string {
  const lines = quote.shortages.map((shortage) => {
    const name = shortage.kind === 'weapon'
      ? catalog.weapons.get(shortage.itemId)?.name
      : catalog.equipment.get(shortage.itemId)?.name;
    return `${shortage.missing} × ${name ?? shortage.itemId} ` +
      `(need ${shortage.count}, hold ${shortage.available})`;
  });
  return `stores are short ${lines.join('; ')}`;
}

/**
 * Books a finished refit through the company's stores.
 *
 * The bay hands back a whole design rather than a sequence of edits, so this
 * works out the difference: what came off goes back on the shelf, what went on
 * comes off it, and a refit the company cannot pay for is refused before
 * anything is written. Ammunition is not stock — it is bought by the ton with
 * the contract, the way a quartermaster would.
 */
export function applyRefit(
  catalog: Catalog,
  state: CampaignState,
  mech: MechRecord,
  next: Design,
): RefitResult {
  if (mech.status === 'hulk') {
    return { ok: false, reason: 'rebuild the chassis before refitting it', location: null };
  }
  if (mech.status === 'repairing') {
    return { ok: false, reason: 'this mech is in the repair bay', location: null };
  }
  if (next.chassisId !== mech.design.chassisId) {
    return { ok: false, reason: 'that build is for a different chassis', location: null };
  }

  const report = validateDesign(catalog, next);
  if (!report.valid) {
    const issue = report.issues.find((entry) => entry.severity === 'error');
    return {
      ok: false,
      reason: issue?.message ?? 'the build is not legal',
      location: issue?.location ?? null,
    };
  }

  const quote = quoteRefit(state, mech.design, next);
  if (!quote.ok) {
    return { ok: false, reason: shortageReason(catalog, quote), location: null };
  }

  const settledStore = settleRefitQuote(state.store, quote);
  if (settledStore === null) {
    return { ok: false, reason: 'stores changed before the refit could be booked', location: null };
  }

  const fitted = copy(next);
  const condition = rescaledCondition(catalog, mech, fitted);
  state.store = settledStore;
  mech.design = fitted;
  mech.condition = condition;
  return { ok: true, reason: null, location: null };
}
