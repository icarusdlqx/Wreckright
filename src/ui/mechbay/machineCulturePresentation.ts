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
    badgeLabel: 'Linewrought',
    explanation: 'Patched armour, proven guns and field repairs. Built to keep working with whatever the crew can recover.',
    className: 'culture-linewrought',
  },
  aurelian: {
    originLabel: 'Aurelian Stock',
    badgeLabel: 'Aurelian Stock',
    explanation: 'Factory-refurbished armour and advanced energy weapons. Efficient firepower, demanding heat and scarce spares.',
    className: 'culture-aurelian',
  },
};

export const CULTURE_FIT_GUIDE =
  'Both origins can be mixed. Mount type, size, boxes, weight and stock decide fit; cooling and ammunition decide how it fights.';

export const FOREIGN_PATTERN_BADGE = 'Mixed refit';

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
