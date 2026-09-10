import type { Design } from '../schema/design';
import type { Catalog } from '../schema/load';
import type { SkirmishFaction } from './lance';

/** Faction limits the hull, not the provenance of the weapons fitted to it. */
export function skirmishDesignAllowed(catalog: Catalog, design: Design | null | undefined, faction: SkirmishFaction): boolean {
  const chassis = design == null ? undefined : catalog.chassis.get(design.chassisId);
  return chassis?.frame === 'mech' && (faction === 'mixed' || chassis.faction === faction);
}

export function skirmishFactionName(faction: SkirmishFaction): string {
  return faction === 'linewrought' ? 'Linewrought' : faction === 'aurelian' ? 'Aurelian Stock' : 'Mixed company';
}
