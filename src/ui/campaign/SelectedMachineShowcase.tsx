import { useMemo } from 'react';
import type { MechRecord } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { machineDisplayName } from '../designLabel';
import { MechPreview } from '../mechbay/MechPreview';
import { ChassisSilhouette } from '../mechbay/ChassisSilhouette';
import { factionLabel } from './factionEconomy';
import { workshopPreviewCondition } from './workshopPreviewCondition';
import './selectedMachineShowcase.css';

export function SelectedMachineShowcase({ catalog, mech, active }: { catalog: Catalog; mech: MechRecord; active: boolean }) {
  const chassis = catalog.chassis.get(mech.design.chassisId);
  const condition = useMemo(() => chassis === undefined ? undefined : workshopPreviewCondition(chassis, mech), [chassis, mech]);
  if (chassis === undefined) return null;
  const armaments = new Map<string, number>();
  for (const mount of mech.design.mounts) armaments.set(mount.weaponId, (armaments.get(mount.weaponId) ?? 0) + 1);
  return (
    <aside className="selected-machine-showcase" data-testid="camp-selected-machine" aria-label="Selected machine inspection">
      <header><p>{factionLabel(chassis.faction)} / {chassis.class}</p><h3>{machineDisplayName(catalog, mech.design)}</h3><span>{chassis.tonnage} tonnes · {chassis.role}</span></header>
      <div className="selected-machine-stage">
        {active ? <MechPreview catalog={catalog} chassis={chassis} design={mech.design} condition={condition} />
          : <ChassisSilhouette chassis={chassis} design={mech.design} />}
        <span className="showcase-stage-caption">{mech.status === 'hulk' ? 'Recovered chassis' : 'Company machine'} · current equipment &amp; condition</span>
        <span className="showcase-scale" aria-hidden="true">{chassis.tonnage}t</span>
      </div>
      <div className="showcase-loadout"><h4>Installed armament</h4>
        {armaments.size === 0 ? <p>No weapons installed. Refit before deployment.</p> : <ul>{[...armaments].map(([id, count]) => <li key={id}><span>{catalog.weapons.get(id)?.name ?? id}</span><strong>×{count}</strong></li>)}</ul>}
        <p className="showcase-note">Select Inspect on a roster card to change this view. Repair and refit orders stay with the machine’s record.</p>
      </div>
    </aside>
  );
}
