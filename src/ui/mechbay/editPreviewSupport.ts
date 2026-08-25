import type { RefitAvailability } from '../../campaign/refitQuote';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import { validateDesign, type DesignReport } from '../../schema/designValidation';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { weaponSize } from '../../sim/loadout';

export type EditIntent =
  | { type: 'install_weapon'; weaponId: string; location: MechLocation }
  | { type: 'replace_weapon'; index: number; weaponId: string; location?: MechLocation }
  | { type: 'remove_weapon'; index: number }
  | { type: 'move_weapon'; index: number; location: MechLocation }
  | { type: 'add_ammo'; weaponId: string; location: MechLocation }
  | { type: 'remove_ammo'; weaponId: string; location: MechLocation }
  | { type: 'install_equipment'; equipmentId: string; location: MechLocation }
  | { type: 'replace_equipment'; index: number; equipmentId: string; location?: MechLocation }
  | { type: 'remove_equipment'; index: number }
  | { type: 'set_cooling'; heatSinkId?: string; heatSinks?: number };

export type EditStatus = 'applied' | 'blocked' | 'needs_ammo';
export type EditComponent = 'design' | 'weapon' | 'ammo' | 'equipment' | 'cooling';
export type EditReasonScope = 'intent' | 'local' | 'stock' | 'continuation';
export type EditReasonCode =
  | 'unknown_chassis' | 'unknown_weapon' | 'unknown_mount' | 'mount_limit'
  | 'hardpoint' | 'hardpoint_size' | 'location_slots' | 'stock'
  | 'energy_ammo' | 'orphan_ammo' | 'unknown_ammo' | 'ammo_bin_limit'
  | 'needs_ammo' | 'no_ammo_location'
  | 'unknown_equipment' | 'unknown_equipment_fit' | 'equipment_limit'
  | 'cooling_only' | 'jump_jets'
  | 'empty_cooling_change' | 'unknown_heat_sink' | 'invalid_heat_sink_count';

export interface EditReason {
  readonly code: EditReasonCode;
  readonly scope: EditReasonScope;
  readonly component: EditComponent;
  readonly itemId: string | null;
  readonly location: MechLocation | null;
  readonly required: number | null;
  readonly available: number | null;
  readonly missing: number | null;
  readonly message: string;
}

export interface EditDeltaLine {
  readonly itemId: string;
  readonly location: MechLocation | null;
  readonly quantity: number;
}

export interface EditDelta {
  readonly component: Exclude<EditComponent, 'design'>;
  readonly action: 'install' | 'replace' | 'remove' | 'move' | 'increase' | 'decrease' | 'change';
  readonly before: EditDeltaLine | null;
  readonly after: EditDeltaLine | null;
}

export interface AmmoContinuation {
  readonly type: 'choose_ammo_location';
  readonly weaponId: string;
  readonly locations: readonly MechLocation[];
}

interface EditEvaluationBase {
  readonly nextDesign: Design;
  readonly reasons: readonly EditReason[];
  readonly deltas: readonly EditDelta[];
  /** Full-machine legality is advisory while editing and authoritative at commit. */
  readonly report: DesignReport;
}

export type EditEvaluation =
  | (EditEvaluationBase & { readonly status: 'applied'; readonly continuation: null })
  | (EditEvaluationBase & { readonly status: 'blocked'; readonly continuation: null })
  | (EditEvaluationBase & {
      readonly status: 'needs_ammo';
      readonly continuation: AmmoContinuation;
    });

export const cloneDesign = (design: Design): Design => structuredClone(design);

export function editReason(
  code: EditReasonCode,
  scope: EditReasonScope,
  component: EditComponent,
  message: string,
  itemId: string | null = null,
  location: MechLocation | null = null,
  counts: { required: number; available: number; missing: number } | null = null,
): EditReason {
  return {
    code, scope, component, itemId, location,
    required: counts?.required ?? null,
    available: counts?.available ?? null,
    missing: counts?.missing ?? null,
    message,
  };
}

export function blockedEdit(
  catalog: Catalog,
  design: Design,
  reasons: readonly EditReason[],
): EditEvaluation {
  const nextDesign = cloneDesign(design);
  return {
    status: 'blocked', nextDesign, reasons, deltas: [],
    report: validateDesign(catalog, nextDesign), continuation: null,
  };
}

export function editLine(
  itemId: string,
  location: MechLocation | null,
  quantity = 1,
): EditDeltaLine {
  return { itemId, location, quantity };
}

/**
 * Refusals are read mid-build by someone deciding what to do next, so they say
 * what is missing rather than reciting both sides of the arithmetic.
 */
function slotShortfall(missing: number): string {
  return `Not enough room here — ${missing} slot${missing === 1 ? '' : 's'} short.`;
}

function hardpointShortfall(type: string, capacity: number): string {
  return capacity === 0
    ? `This location has no ${type} hardpoints.`
    : `Every ${type} hardpoint here is already taken.`;
}


export function placementReasons(
  catalog: Catalog,
  before: DesignReport,
  after: DesignReport,
  location: MechLocation,
  component: 'weapon' | 'ammo' | 'equipment',
  itemId: string,
  weapon: Weapon | null,
): EditReason[] {
  const prior = before.loadout.perLocation[location];
  const next = after.loadout.perLocation[location];
  const reasons: EditReason[] = [];
  const priorSlotExcess = Math.max(0, prior.slotsUsed - prior.slotsAvailable);
  const nextSlotExcess = Math.max(0, next.slotsUsed - next.slotsAvailable);
  if (nextSlotExcess > priorSlotExcess) {
    reasons.push(editReason(
      'location_slots', 'local', component,
      slotShortfall(next.slotsUsed - next.slotsAvailable),
      itemId, location,
      { required: next.slotsUsed, available: next.slotsAvailable, missing: nextSlotExcess },
    ));
  }
  if (weapon === null) return reasons;

  const priorHardpointExcess = Math.max(
    0, prior.hardpointsUsed[weapon.type] - prior.hardpointsAvailable[weapon.type],
  );
  const nextHardpointExcess = Math.max(
    0, next.hardpointsUsed[weapon.type] - next.hardpointsAvailable[weapon.type],
  );
  if (nextHardpointExcess > priorHardpointExcess) {
    reasons.push(editReason(
      'hardpoint', 'local', 'weapon',
      hardpointShortfall(weapon.type, next.hardpointsAvailable[weapon.type]),
      itemId, location,
      {
        required: next.hardpointsUsed[weapon.type],
        available: next.hardpointsAvailable[weapon.type],
        missing: nextHardpointExcess,
      },
    ));
  }
  const size = weaponSize(catalog, weapon);
  if (size > next.size) {
    reasons.push(editReason(
      'hardpoint_size', 'local', 'weapon',
      `${weapon.name} needs a size-${size} hardpoint; this location accepts size ${next.size}.`,
      itemId, location,
      { required: size, available: next.size, missing: size - next.size },
    ));
  }
  return reasons;
}

function materialCounts(design: Design): RefitAvailability {
  const weapon = new Map<string, number>();
  const equipment = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, count: number): void => {
    map.set(id, (map.get(id) ?? 0) + count);
  };
  for (const mount of design.mounts) add(weapon, mount.weaponId, 1);
  add(equipment, design.heatSinkId, design.heatSinks);
  for (const fit of design.equipment) add(equipment, fit.equipmentId, 1);
  return { weapon, equipment };
}

export function stockReasons(
  catalog: Catalog,
  before: Design,
  after: Design,
  availability: RefitAvailability | undefined,
): EditReason[] {
  if (availability === undefined) return [];
  const prior = materialCounts(before);
  const next = materialCounts(after);
  const reasons: EditReason[] = [];
  for (const kind of ['weapon', 'equipment'] as const) {
    for (const [itemId, required] of next[kind]) {
      const available = availability[kind].get(itemId) ?? 0;
      const missing = Math.max(0, required - available);
      const priorMissing = Math.max(0, (prior[kind].get(itemId) ?? 0) - available);
      if (missing <= priorMissing) continue;
      const equipment = kind === 'equipment' ? catalog.equipment.get(itemId) : undefined;
      const component: EditComponent = kind === 'weapon'
        ? 'weapon'
        : equipment?.category === 'heat_sink' ? 'cooling' : 'equipment';
      const name = kind === 'weapon'
        ? catalog.weapons.get(itemId)?.name ?? itemId
        : equipment?.name ?? itemId;
      reasons.push(editReason(
        'stock', 'stock', component,
        `${required} ${name} required; ${available} available (${missing} short).`,
        itemId, null, { required, available, missing },
      ));
    }
  }
  return reasons;
}

export function ammoLocations(
  catalog: Catalog,
  design: Design,
  weaponId: string,
): MechLocation[] {
  const report = validateDesign(catalog, design);
  const ammoSlots = catalog.rules.construction.ammoSlotsPerTon;
  return LOCATIONS.filter((location) => {
    const bin = design.ammo.find(
      (entry) => entry.weaponId === weaponId && entry.location === location,
    );
    if (bin !== undefined && bin.tons >= 10) return false;
    if (bin === undefined && design.ammo.length >= 12) return false;
    const usage = report.loadout.perLocation[location];
    return usage.slotsUsed + ammoSlots <= usage.slotsAvailable;
  });
}
