import type { Catalog } from '../../schema/load';
import type { Design } from '../../schema/design';
import type { Chassis } from '../../schema/chassis';
import type { HeatProfile, Loadout } from '../../sim/loadout';
import type { EditIntent } from './editPreview';
import { coolingBankSummary } from './coolingBankModel';
import { setPaidArmourTotal, designArmourLocations, spendRemainingTonnage } from './armourWorkbenchModel';

export function BayQuickSystems({ catalog, chassis, design, loadout, heat, equipmentAvailability, onIntent, onApply }: {
  catalog: Catalog; chassis: Chassis; design: Design; loadout: Loadout; heat: HeatProfile;
  equipmentAvailability?: ReadonlyMap<string, number>;
  onIntent: (intent: EditIntent) => boolean; onApply: (design: Design) => void;
}) {
  const cooling = coolingBankSummary(catalog, chassis, design, heat, equipmentAvailability);
  const maximum = designArmourLocations(catalog, design).reduce((sum, location) => sum + chassis.armourMax[location], 0);
  return <div className="bay-quick-systems" aria-label="Adjust armour and cooling">
    <label>Armour · {loadout.armourPoints}/{maximum}
      <input type="range" min="0" max={maximum} value={loadout.armourPoints} aria-label="Quick armour allocation"
        onChange={(event) => onApply(setPaidArmourTotal(catalog, design, Number(event.target.value)))} />
    </label>
    <button type="button" onClick={() => onApply(spendRemainingTonnage(catalog, design))}>Fit armour to weight</button>
    <label>Cooling type<select value={design.heatSinkId} aria-label="Quick cooling type"
      onChange={(event) => onIntent({ type: 'set_cooling', heatSinkId: event.target.value })}>
      {cooling.choices.map((choice) => <option key={choice.id} value={choice.id} disabled={!choice.canSelect}>{choice.name}</option>)}
    </select></label>
    <label>Heat sinks<input type="number" min={cooling.internalSinks} max={cooling.stock ?? 40} value={design.heatSinks}
      aria-label="Quick heat sink count" onChange={(event) => onIntent({ type: 'set_cooling', heatSinks: Number(event.target.value) })} /></label>
    <span>{cooling.internalSinks} built in · {cooling.fittedSinks} extra / {cooling.fittedTonnage.toFixed(1)}t</span>
  </div>;
}
