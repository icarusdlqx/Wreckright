import type { Chassis } from '../../schema/chassis';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { HeatProfile } from '../../sim/loadout';

export interface CoolingIntent {
  type: 'set_cooling';
  heatSinkId?: string;
  heatSinks?: number;
}

export interface HeatSinkChoice {
  id: string;
  name: string;
  dissipationPerSecond: number;
  tonnage: number;
  slots: number;
  stock: number | null;
  selected: boolean;
  canSelect: boolean;
}

export interface CoolingBankSummary {
  sinkName: string;
  internalSinks: number;
  fittedSinks: number;
  fittedTonnage: number;
  fittedSlots: number;
  dissipationPerSink: number;
  sustainedTarget: number;
  riskHeat: number;
  stock: number | null;
  stockSpare: number | null;
  stockShortage: number;
  choices: readonly HeatSinkChoice[];
}

function sinkDissipation(catalog: Catalog, sinkId: string): number {
  const sink = catalog.equipment.get(sinkId);
  const factor = sink?.stats.dissipation ?? 1;
  return factor * catalog.rules.heat.dissipationPerSinkPerSecond;
}

export function sustainedCoolingCount(
  catalog: Catalog,
  chassis: Chassis,
  design: Design,
  sustainedWeaponHeat: number,
): number {
  const perSink = sinkDissipation(catalog, design.heatSinkId);
  const needed = perSink <= 0 ? design.heatSinks : Math.ceil(sustainedWeaponHeat / perSink);
  return Math.max(chassis.internalHeatSinks, needed);
}

/**
 * Availability is the complete refit allowance for this machine: stores plus
 * the fittings already on it. Undefined means a non-campaign bay with no stock
 * limit. This mirrors the quote layer without teaching the component campaign
 * rules.
 */
export function coolingBankSummary(
  catalog: Catalog,
  chassis: Chassis,
  design: Design,
  heat: HeatProfile,
  availability?: ReadonlyMap<string, number>,
): CoolingBankSummary {
  const sink = catalog.equipment.get(design.heatSinkId);
  const fittedSinks = Math.max(0, design.heatSinks - chassis.internalHeatSinks);
  const stock = availability === undefined ? null : (availability.get(design.heatSinkId) ?? 0);

  const choices = [...catalog.equipment.values()]
    .filter((entry) => entry.category === 'heat_sink')
    .map((entry): HeatSinkChoice => {
      const entryStock = availability === undefined ? null : (availability.get(entry.id) ?? 0);
      const selected = entry.id === design.heatSinkId;
      return {
        id: entry.id,
        name: entry.name,
        dissipationPerSecond: sinkDissipation(catalog, entry.id),
        tonnage: entry.tonnage,
        slots: entry.slots,
        stock: entryStock,
        selected,
        canSelect: selected || entryStock === null || entryStock >= design.heatSinks,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    sinkName: sink?.name ?? design.heatSinkId,
    internalSinks: chassis.internalHeatSinks,
    fittedSinks,
    fittedTonnage: fittedSinks * (sink?.tonnage ?? 0),
    fittedSlots: fittedSinks * (sink?.slots ?? 0),
    dissipationPerSink: sinkDissipation(catalog, design.heatSinkId),
    sustainedTarget: sustainedCoolingCount(catalog, chassis, design, heat.heatPerSecond),
    riskHeat: heat.heatCapacity * heat.shutdownRiskFraction,
    stock,
    stockSpare: stock === null ? null : Math.max(0, stock - design.heatSinks),
    stockShortage: stock === null ? 0 : Math.max(0, design.heatSinks - stock),
    choices,
  };
}

export function coolingCountIntent(heatSinks: number): CoolingIntent {
  return { type: 'set_cooling', heatSinks };
}

export function coolingTypeIntent(heatSinkId: string): CoolingIntent {
  return { type: 'set_cooling', heatSinkId };
}
