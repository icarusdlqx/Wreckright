import { mechIntegrity } from '../../campaign/integrity';
import { estimateRepair } from '../../campaign/repair';
import type { MechRecord } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { MECH_LOCATION_NAMES } from '../mechbay/LocationCard';
import { SlotBoxes } from '../mechbay/SlotBoxes';
import { cbills } from './Panels';

export function YardMachineDetails({ catalog, mech }: { catalog: Catalog; mech: MechRecord }) {
  const integrity = mechIntegrity(catalog, mech);
  const repair = estimateRepair(catalog, mech);
  return <div className="yard-machine-details">
    <p><strong>{Math.round(integrity.fraction * 100)}% intact</strong> · {repair.cost === 0 ? 'No repairs needed' : `${cbills(repair.cost)} repair estimate · ready immediately after payment`}</p>
    <h5>Included fittings</h5>
    <ul>{mech.design.mounts.map((mount, index) => {
      const weapon = catalog.weapons.get(mount.weaponId);
      return <li key={index}><span>{weapon?.name ?? mount.weaponId} · {MECH_LOCATION_NAMES[mount.location]}</span><SlotBoxes count={weapon?.slots ?? 0} /></li>;
    })}</ul>
    {mech.design.mounts.length === 0 ? <p>No weapons installed.</p> : null}
    <p>{mech.design.heatSinks} × {catalog.equipment.get(mech.design.heatSinkId)?.name ?? 'heat sinks'}</p>
    {mech.design.equipment.map((fit, index) => <p key={index}>{catalog.equipment.get(fit.equipmentId)?.name ?? fit.equipmentId} · {MECH_LOCATION_NAMES[fit.location]}</p>)}
    {mech.design.ammo.map((bin, index) => <p key={index}>{bin.tons}t {catalog.weapons.get(bin.weaponId)?.name ?? bin.weaponId} ammunition · {MECH_LOCATION_NAMES[bin.location]}</p>)}
  </div>;
}
