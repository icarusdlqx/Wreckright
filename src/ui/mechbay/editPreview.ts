import type { RefitAvailability } from '../../campaign/refitQuote';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import { validateDesign } from '../../schema/designValidation';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import {
  ammoLocations,
  blockedEdit as blocked,
  cloneDesign as clone,
  editLine as line,
  editReason as reason,
  placementReasons,
  stockReasons,
  type EditDelta,
  type EditEvaluation,
  type EditIntent,
} from './editPreviewSupport';

export type {
  AmmoContinuation,
  EditComponent,
  EditDelta,
  EditDeltaLine,
  EditEvaluation,
  EditIntent,
  EditReason,
  EditReasonCode,
  EditReasonScope,
  EditStatus,
} from './editPreviewSupport';

function removeUnusedAmmo(design: Design, weaponId: string, deltas: EditDelta[]): void {
  if (design.mounts.some((mount) => mount.weaponId === weaponId)) return;
  const removed = design.ammo.filter((bin) => bin.weaponId === weaponId);
  design.ammo = design.ammo.filter((bin) => bin.weaponId !== weaponId);
  for (const bin of removed) {
    deltas.push({
      component: 'ammo',
      action: 'remove',
      before: line(bin.weaponId, bin.location, bin.tons),
      after: null,
    });
  }
}

/**
 * Previews exactly one bay edit. It never mutates its inputs and deliberately
 * separates impossible local/stock actions from a legal editing step that
 * leaves the whole-machine draft uncommittable.
 */
export function evaluateEdit(
  catalog: Catalog,
  design: Design,
  intent: EditIntent,
  availability?: RefitAvailability,
): EditEvaluation {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) {
    return blocked(catalog, design, [reason(
      'unknown_chassis', 'intent', 'design', `Unknown chassis "${design.chassisId}".`,
    )]);
  }

  const beforeReport = validateDesign(catalog, design);
  const next = clone(design);
  const deltas: EditDelta[] = [];
  let placement: { location: MechLocation; component: 'weapon' | 'ammo' | 'equipment'; itemId: string; weapon: Weapon | null } | null = null;
  let ammoCheck: string | null = null;

  if (intent.type === 'install_weapon' || intent.type === 'replace_weapon') {
    const weapon = catalog.weapons.get(intent.weaponId);
    if (weapon === undefined) {
      return blocked(catalog, design, [reason(
        'unknown_weapon', 'intent', 'weapon', `Unknown weapon "${intent.weaponId}".`, intent.weaponId,
      )]);
    }
    if (intent.type === 'install_weapon') {
      if (next.mounts.length >= 24) {
        return blocked(catalog, design, [reason(
          'mount_limit', 'local', 'weapon', 'This design already has the maximum 24 weapon mounts.', weapon.id,
        )]);
      }
      next.mounts.push({ weaponId: weapon.id, location: intent.location });
      deltas.push({ component: 'weapon', action: 'install', before: null, after: line(weapon.id, intent.location) });
      placement = { location: intent.location, component: 'weapon', itemId: weapon.id, weapon };
    } else {
      const old = next.mounts[intent.index];
      if (old === undefined) {
        return blocked(catalog, design, [reason(
          'unknown_mount', 'intent', 'weapon', `No weapon mount exists at index ${intent.index}.`, weapon.id,
        )]);
      }
      const location = intent.location ?? old.location;
      next.mounts[intent.index] = { weaponId: weapon.id, location };
      const changed = old.weaponId !== weapon.id || old.location !== location;
      if (changed) {
        deltas.push({
          component: 'weapon', action: 'replace', before: line(old.weaponId, old.location), after: line(weapon.id, location),
        });
      }
      if (old.weaponId !== weapon.id) removeUnusedAmmo(next, old.weaponId, deltas);
      if (changed) placement = { location, component: 'weapon', itemId: weapon.id, weapon };
    }
    if (weapon.ammoPerTon !== null) ammoCheck = weapon.id;
  } else if (intent.type === 'remove_weapon' || intent.type === 'move_weapon') {
    const old = next.mounts[intent.index];
    if (old === undefined) {
      return blocked(catalog, design, [reason(
        'unknown_mount', 'intent', 'weapon', `No weapon mount exists at index ${intent.index}.`,
      )]);
    }
    if (intent.type === 'remove_weapon') {
      next.mounts.splice(intent.index, 1);
      deltas.push({ component: 'weapon', action: 'remove', before: line(old.weaponId, old.location), after: null });
      removeUnusedAmmo(next, old.weaponId, deltas);
    } else {
      next.mounts[intent.index] = { ...old, location: intent.location };
      if (old.location !== intent.location) {
        deltas.push({ component: 'weapon', action: 'move', before: line(old.weaponId, old.location), after: line(old.weaponId, intent.location) });
        const weapon = catalog.weapons.get(old.weaponId) ?? null;
        placement = { location: intent.location, component: 'weapon', itemId: old.weaponId, weapon };
      }
    }
  } else if (intent.type === 'add_ammo') {
    const weapon = catalog.weapons.get(intent.weaponId);
    if (weapon === undefined) {
      return blocked(catalog, design, [reason(
        'unknown_weapon', 'intent', 'ammo', `Unknown weapon "${intent.weaponId}".`, intent.weaponId, intent.location,
      )]);
    }
    if (weapon.ammoPerTon === null) {
      return blocked(catalog, design, [reason(
        'energy_ammo', 'intent', 'ammo', `${weapon.name} does not use ammunition.`, weapon.id, intent.location,
      )]);
    }
    if (!next.mounts.some((mount) => mount.weaponId === weapon.id)) {
      return blocked(catalog, design, [reason(
        'orphan_ammo', 'intent', 'ammo', `${weapon.name} ammunition needs a mounted ${weapon.name}.`, weapon.id, intent.location,
      )]);
    }
    const bin = next.ammo.find((entry) => entry.weaponId === weapon.id && entry.location === intent.location);
    if (bin !== undefined && bin.tons >= 10) {
      return blocked(catalog, design, [reason(
        'ammo_bin_limit', 'local', 'ammo', 'An ammunition bin can hold at most 10 tons.', weapon.id, intent.location,
      )]);
    }
    if (bin === undefined && next.ammo.length >= 12) {
      return blocked(catalog, design, [reason(
        'ammo_bin_limit', 'local', 'ammo', 'This design already has the maximum 12 ammunition bins.', weapon.id, intent.location,
      )]);
    }
    const oldTons = bin?.tons ?? 0;
    if (bin === undefined) next.ammo.push({ weaponId: weapon.id, location: intent.location, tons: 1 });
    else bin.tons += 1;
    deltas.push({
      component: 'ammo', action: oldTons === 0 ? 'install' : 'increase',
      before: oldTons === 0 ? null : line(weapon.id, intent.location, oldTons),
      after: line(weapon.id, intent.location, oldTons + 1),
    });
    placement = { location: intent.location, component: 'ammo', itemId: weapon.id, weapon: null };
  } else if (intent.type === 'remove_ammo') {
    const index = next.ammo.findIndex(
      (bin) => bin.weaponId === intent.weaponId && bin.location === intent.location,
    );
    const bin = next.ammo[index];
    if (bin === undefined) {
      return blocked(catalog, design, [reason(
        'unknown_ammo', 'intent', 'ammo', `No ${intent.weaponId} ammunition is fitted at ${intent.location}.`, intent.weaponId, intent.location,
      )]);
    }
    const oldTons = bin.tons;
    if (bin.tons > 1) bin.tons -= 1;
    else next.ammo.splice(index, 1);
    if (next.mounts.some((mount) => mount.weaponId === bin.weaponId)
      && !next.ammo.some((entry) => entry.weaponId === bin.weaponId && entry.tons > 0)) {
      ammoCheck = bin.weaponId;
    }
    deltas.push({
      component: 'ammo', action: oldTons === 1 ? 'remove' : 'decrease',
      before: line(bin.weaponId, bin.location, oldTons),
      after: oldTons === 1 ? null : line(bin.weaponId, bin.location, oldTons - 1),
    });
  } else if (intent.type === 'install_equipment' || intent.type === 'replace_equipment') {
    const equipment = catalog.equipment.get(intent.equipmentId);
    if (equipment === undefined) {
      return blocked(catalog, design, [reason(
        'unknown_equipment', 'intent', 'equipment', `Unknown equipment "${intent.equipmentId}".`, intent.equipmentId,
      )]);
    }
    if (equipment.category === 'heat_sink') {
      return blocked(catalog, design, [reason(
        'cooling_only', 'intent', 'equipment', `${equipment.name} belongs in the cooling controls.`, equipment.id,
      )]);
    }
    if (equipment.category === 'jump_jet' && !chassis.jumpCapable) {
      return blocked(catalog, design, [reason(
        'jump_jets', 'local', 'equipment', `${chassis.name} cannot mount jump jets.`, equipment.id,
      )]);
    }
    if (intent.type === 'install_equipment') {
      if (next.equipment.length >= 12) {
        return blocked(catalog, design, [reason(
          'equipment_limit', 'local', 'equipment', 'This design already has the maximum 12 equipment fits.', equipment.id,
        )]);
      }
      next.equipment.push({ equipmentId: equipment.id, location: intent.location });
      deltas.push({ component: 'equipment', action: 'install', before: null, after: line(equipment.id, intent.location) });
      placement = { location: intent.location, component: 'equipment', itemId: equipment.id, weapon: null };
    } else {
      const old = next.equipment[intent.index];
      if (old === undefined) {
        return blocked(catalog, design, [reason(
          'unknown_equipment_fit', 'intent', 'equipment', `No equipment fit exists at index ${intent.index}.`, equipment.id,
        )]);
      }
      const location = intent.location ?? old.location;
      next.equipment[intent.index] = { equipmentId: equipment.id, location };
      const changed = old.equipmentId !== equipment.id || old.location !== location;
      if (changed) {
        deltas.push({ component: 'equipment', action: 'replace', before: line(old.equipmentId, old.location), after: line(equipment.id, location) });
        placement = { location, component: 'equipment', itemId: equipment.id, weapon: null };
      }
    }
  } else if (intent.type === 'remove_equipment') {
    const old = next.equipment[intent.index];
    if (old === undefined) {
      return blocked(catalog, design, [reason(
        'unknown_equipment_fit', 'intent', 'equipment', `No equipment fit exists at index ${intent.index}.`,
      )]);
    }
    next.equipment.splice(intent.index, 1);
    deltas.push({ component: 'equipment', action: 'remove', before: line(old.equipmentId, old.location), after: null });
  } else {
    if (intent.heatSinkId === undefined && intent.heatSinks === undefined) {
      return blocked(catalog, design, [reason(
        'empty_cooling_change', 'intent', 'cooling', 'Choose a heat-sink type or count to change.',
      )]);
    }
    const heatSinkId = intent.heatSinkId ?? next.heatSinkId;
    const heatSinks = intent.heatSinks ?? next.heatSinks;
    const sink = catalog.equipment.get(heatSinkId);
    if (sink === undefined || sink.category !== 'heat_sink') {
      return blocked(catalog, design, [reason(
        'unknown_heat_sink', 'intent', 'cooling', `"${heatSinkId}" is not a heat sink.`, heatSinkId,
      )]);
    }
    if (!Number.isInteger(heatSinks) || heatSinks < 1 || heatSinks > 40) {
      return blocked(catalog, design, [reason(
        'invalid_heat_sink_count', 'intent', 'cooling', 'Heat-sink count must be a whole number from 1 to 40.', heatSinkId,
      )]);
    }
    const old = line(next.heatSinkId, null, next.heatSinks);
    next.heatSinkId = heatSinkId;
    next.heatSinks = heatSinks;
    if (old.itemId !== heatSinkId || old.quantity !== heatSinks) {
      deltas.push({ component: 'cooling', action: 'change', before: old, after: line(heatSinkId, null, heatSinks) });
    }
  }

  const afterReport = validateDesign(catalog, next);
  if (placement !== null) {
    const local = placementReasons(
      catalog, beforeReport, afterReport, placement.location,
      placement.component, placement.itemId, placement.weapon,
    );
    if (local.length > 0) return blocked(catalog, design, local);
  }
  const stock = stockReasons(catalog, design, next, availability);
  if (stock.length > 0) return blocked(catalog, design, stock);

  if (ammoCheck !== null
    && !next.ammo.some((bin) => bin.weaponId === ammoCheck && bin.tons > 0)) {
    const locations = ammoLocations(catalog, next, ammoCheck);
    const weapon = catalog.weapons.get(ammoCheck);
    if (locations.length === 0) {
      return blocked(catalog, design, [reason(
        'no_ammo_location', 'local', 'ammo', `No location has room for ${weapon?.name ?? ammoCheck} ammunition.`, ammoCheck,
      )]);
    }
    return {
      status: 'needs_ammo',
      nextDesign: next,
      reasons: [reason(
        'needs_ammo', 'continuation', 'ammo', `Choose a shared ammunition-bin location for ${weapon?.name ?? ammoCheck}.`, ammoCheck,
      )],
      deltas,
      report: afterReport,
      continuation: { type: 'choose_ammo_location', weaponId: ammoCheck, locations },
    };
  }

  return {
    status: 'applied',
    nextDesign: next,
    reasons: [],
    deltas,
    report: afterReport,
    continuation: null,
  };
}
