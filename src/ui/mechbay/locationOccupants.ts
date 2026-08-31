import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { weaponSize } from '../../sim/loadout';

export interface LocationOccupant {
  key: string;
  kind: 'weapon' | 'ammo' | 'equipment';
  id: string;
  index: number;
  label: string;
  slots: number;
  tone: string;
  oversized: boolean;
}

export function buildLocationOccupants(
  catalog: Catalog,
  design: Design,
  location: MechLocation,
  maximumWeaponSize: number,
): { occupants: LocationOccupant[]; sizeOver: boolean } {
  const occupants: LocationOccupant[] = [];
  let sizeOver = false;

  design.mounts.forEach((mount, index) => {
    if (mount.location !== location) return;
    const weapon = catalog.weapons.get(mount.weaponId);
    const oversized = weapon !== undefined && weaponSize(catalog, weapon) > maximumWeaponSize;
    if (oversized) sizeOver = true;
    occupants.push({
      key: `m${index}`,
      kind: 'weapon',
      id: mount.weaponId,
      index,
      label: weapon?.name ?? mount.weaponId,
      slots: weapon?.slots ?? 1,
      tone: weapon?.type ?? 'energy',
      oversized,
    });
  });

  design.ammo.forEach((load, index) => {
    if (load.location !== location) return;
    const weapon = catalog.weapons.get(load.weaponId);
    occupants.push({
      key: `a${index}`,
      kind: 'ammo',
      id: load.weaponId,
      index,
      label: `${weapon?.name ?? load.weaponId} ammo ×${load.tons}`,
      slots: Math.max(1, Math.round(load.tons * catalog.rules.construction.ammoSlotsPerTon)),
      tone: 'ammo',
      oversized: false,
    });
  });

  design.equipment.forEach((fit, index) => {
    if (fit.location !== location) return;
    const gear = catalog.equipment.get(fit.equipmentId);
    occupants.push({
      key: `e${index}`,
      kind: 'equipment',
      id: fit.equipmentId,
      index,
      label: gear?.name ?? fit.equipmentId,
      slots: gear?.slots ?? 1,
      tone: 'gear',
      oversized: false,
    });
  });

  return { occupants, sizeOver };
}
