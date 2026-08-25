import type { Faction } from '../../schema/faction';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';

export interface MachineCulturePresentation {
  /** Short maker name used on component cards. */
  originLabel: string;
  /** Full chassis identity. This is the primary Mechbay badge copy. */
  badgeLabel: string;
  explanation: string;
  className: string;
}

const CULTURES: Record<Faction, MachineCulturePresentation> = {
  linewrought: {
    originLabel: 'Linewrought',
    badgeLabel: 'Linewrought — Workshop',
    explanation: 'Workshop-serviced around exposed systems; mixed-pattern refits are expected.',
    className: 'culture-linewrought',
  },
  aurelian: {
    originLabel: 'Aurelian Stock',
    badgeLabel: 'Aurelian Stock — Sealed',
    explanation: 'Factory-sealed around integrated systems; the bay can still refit compatible parts.',
    className: 'culture-aurelian',
  },
};

export const CULTURE_FIT_GUIDE =
  'Culture is informational; mount, slots, tonnage, and stock decide fit.';

export const FOREIGN_PATTERN_BADGE = 'Foreign pattern — origin only';

export function machineCulturePresentation(faction: Faction): MachineCulturePresentation {
  return CULTURES[faction];
}

export function foreignComponentPresentation(
  componentFaction: Faction,
  chassisFaction: Faction,
): { badge: string; note: string } | null {
  if (componentFaction === chassisFaction) return null;
  const component = machineCulturePresentation(componentFaction);
  const chassis = machineCulturePresentation(chassisFaction);
  return {
    badge: FOREIGN_PATTERN_BADGE,
    note: `${component.originLabel} component on a ${chassis.originLabel} chassis. ${CULTURE_FIT_GUIDE}`,
  };
}

/** Whether the current build mixes component and chassis manufacturing cultures. */
export function designUsesForeignComponents(
  catalog: Catalog,
  design: Design,
  chassisFaction: Faction,
): boolean {
  const foreignWeapon = design.mounts.some((mount) => {
    const weapon = catalog.weapons.get(mount.weaponId);
    return weapon !== undefined && weapon.faction !== chassisFaction;
  });
  const foreignEquipment = design.equipment.some((fit) => {
    const equipment = catalog.equipment.get(fit.equipmentId);
    return equipment !== undefined && equipment.faction !== chassisFaction;
  });
  const heatSink = catalog.equipment.get(design.heatSinkId);
  const foreignHeatSink = heatSink !== undefined && heatSink.faction !== chassisFaction;
  return foreignWeapon || foreignEquipment || foreignHeatSink;
}
