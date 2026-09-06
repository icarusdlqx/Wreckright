import type { RefitAvailability } from '../../campaign/refitQuote';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { computeLoadout, weaponSize, weaponSizeLabel } from '../../sim/loadout';
import { remainingInventory } from './bayFit';
import type { InspectorFit } from './Dossier';
import type { DropPayload } from './LocationCard';
import { evaluateDrop } from './mechbayEdits';
import { evaluateWeaponReplacement } from './weaponReplacement';

function fitAt(
  catalog: Catalog,
  design: Design,
  payload: DropPayload,
  location: MechLocation,
  availability?: RefitAvailability,
): InspectorFit {
  const evaluation = evaluateDrop(catalog, design, payload, location, availability);
  if (evaluation.status === 'blocked') {
    return {
      ok: false,
      reason: evaluation.reasons[0]?.message ?? 'That part does not fit here.',
    };
  }
  return {
    ok: true,
    reason:
      evaluation.status === 'needs_ammo'
        ? 'Fits here. One ton of ammunition will be stowed automatically.'
        : null,
  };
}

/** Exact shelf fit, either for the selected location or anywhere on the machine. */
export function shelfFit(
  catalog: Catalog,
  design: Design,
  payload: DropPayload,
  availability: RefitAvailability | undefined,
  selectedLocation: MechLocation | null,
): InspectorFit {
  const remaining = remainingInventory(availability, design);
  if (remaining !== undefined && payload.kind !== 'ammo'
    && (remaining[payload.kind].get(payload.id) ?? 0) <= 0) {
    const installed = payload.kind === 'weapon'
      ? design.mounts.some((mount) => mount.weaponId === payload.id)
      : design.equipment.some((fit) => fit.equipmentId === payload.id);
    return {
      ok: false, label: installed ? 'Installed' : 'No spare',
      reason: installed
        ? '0 spare. Already fitted; remove a copy to make it available in stores.'
        : '0 spare. Acquire a copy before fitting it.',
    };
  }
  const locations = selectedLocation === null ? [...LOCATIONS] : [selectedLocation];
  const attempts = locations.map((location) => ({ location, fit: fitAt(catalog, design, payload, location, availability) }));
  const fit = attempts.find((attempt) => attempt.fit.ok)?.fit;
  if (fit !== undefined) return selectedLocation === null ? { ok: true, reason: null } : fit;

  if (payload.kind === 'weapon') {
    const canReplace = design.mounts.some((mount, index) =>
      (selectedLocation === null || mount.location === selectedLocation)
      && evaluateWeaponReplacement(catalog, design, index, payload.id, availability).ok);
    if (canReplace) return {
      ok: true, label: 'Replace', replacementOnly: true,
      reason: 'Pick or drag onto an installed weapon to preview a replacement.',
    };
    if (selectedLocation === null) {
      const weapon = catalog.weapons.get(payload.id);
      if (weapon !== undefined) {
        const usage = computeLoadout(catalog, design).perLocation;
        const mounts = attempts.filter(({ location }) => usage[location].hardpointsAvailable[weapon.type] > 0);
        if (mounts.length === 0) return { ok: false, reason: `This machine has no ${weapon.type} weapon mounts.` };
        const sized = mounts.filter(({ location }) => usage[location].size >= weaponSize(catalog, weapon));
        if (sized.length === 0) return { ok: false, reason: `${weapon.name} needs a ${weaponSizeLabel(catalog, weaponSize(catalog, weapon))} ${weapon.type} mount; none on this machine is large enough.` };
        const relevant = sized[0];
        if (relevant !== undefined) return {
          ok: false, reason: `${relevant.location.replaceAll('_', ' ')}: ${relevant.fit.reason ?? 'No fitting space remains.'}`,
        };
      }
    }
  }
  return {
    ok: false,
    reason: attempts[0]?.fit.reason ?? 'No compatible location remains on this machine.',
  };
}
