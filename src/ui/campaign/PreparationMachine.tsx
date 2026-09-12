import type { Catalog } from '../../schema/load';
import type { CampaignState, MechRecord } from '../../campaign/types';
import { isMechAvailable } from '../../campaign/types';
import { mechIntegrity } from '../../campaign/integrity';
import { estimateRepair, projectedRepairWindow, repairQueue, startRepair } from '../../campaign/repair';
import { rebuildHulk } from '../../campaign/refit';
import { authoredDesignName } from '../designLabel';
import { WeaponGlyph } from '../mechbay/WeaponGlyph';
import { formatWeaponNumber } from '../mechbay/weaponPresentation';
import { MachineIdentity, RepairReadout } from './MachineIdentity';
import { MachineServiceRecord } from './MachineServiceRecord';
import type { CampaignChange } from './campaignSession';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  mech: MechRecord;
  mutate: (change: CampaignChange, message?: string) => void;
  onRefit: (id: string) => void;
}

export function PreparationMachine({ catalog, state, mech, mutate, onRefit }: Props) {
  const estimate = estimateRepair(catalog, mech);
  const projected = projectedRepairWindow(catalog, state, estimate.days);
  const booking = repairQueue(catalog, state).find((entry) => entry.mechId === mech.id);
  const ready = isMechAvailable(state, mech) && mech.status !== 'hulk';
  const integrity = mechIntegrity(catalog, mech);
  const weapons = [...new Set(mech.design.mounts.map((mount) => mount.weaponId))];
  return <section className="prep-machine-detail" data-testid={`hangar-${mech.id}`}>
    <MachineIdentity catalog={catalog} design={mech.design} />
    <div className="manifest-condition" data-testid={`manifest-condition-${mech.id}`}>
      <strong className={integrity.fraction < 1 ? 'is-damaged' : ''}>{Math.round(integrity.fraction * 100)}% intact{integrity.fraction < 1 ? ' · damaged' : ''}</strong>
      {Object.entries(mech.condition).filter(([, part]) => part.destroyed).map(([location]) => <span className="is-damaged" key={location}>Missing {location.replaceAll('_', ' ')}</span>)}
    </div>
    <div className="manifest-health" role="progressbar" aria-label={`${authoredDesignName(catalog, mech.design)} integrity`}
      aria-valuemin={0} aria-valuemax={integrity.maximum} aria-valuenow={integrity.current}>
      <span style={{ width: `${integrity.fraction * 100}%` }} />
    </div>
    <div className="prep-machine-actions">
      <button type="button" onClick={() => onRefit(mech.id)} disabled={!ready}
        title={ready ? 'Change this machine’s installed equipment.' : 'Finish workshop work or rebuild this machine before refitting.'}
        data-testid={`hangar-refit-${mech.id}`}>Refit loadout</button>
      <button type="button" disabled={estimate.cost > state.cbills || (mech.status !== 'hulk' && (!ready || estimate.days === 0))}
        title={estimate.cost > state.cbills ? `Need ${estimate.cost.toLocaleString()} C for repairs.` : 'Pay the repair cost and restore this mech immediately.'}
        data-testid={`hangar-${mech.status === 'hulk' ? 'rebuild' : 'repair'}-${mech.id}`}
        onClick={() => mutate((draft) => {
          const target = draft.mechs.find((entry) => entry.id === mech.id);
          if (target === undefined) return 'Machine unavailable.';
          const result = target.status === 'hulk' ? rebuildHulk(catalog, draft, target) : startRepair(catalog, draft, target);
          return result.ok ? `${authoredDesignName(catalog, target.design)} repaired and ready to deploy.` : result.reason;
        })}>{mech.status === 'hulk' ? 'Rebuild now' : 'Repair now'} · {estimate.cost.toLocaleString()} C</button>
    </div>
    <RepairReadout catalog={catalog} state={state} mech={mech} estimate={estimate} projected={projected}
      booking={booking} ready={ready} status={ready ? 'Machine available' : 'Workshop work required'} />
    <MachineServiceRecord catalog={catalog} state={state} mech={mech} />
    <h4>Installed weapons</h4>
    <ul className="prep-weapons">
      {weapons.map((id) => {
        const weapon = catalog.weapons.get(id);
        if (weapon === undefined) return null;
        const count = mech.design.mounts.filter((mount) => mount.weaponId === id).length;
        const ammo = mech.design.ammo.filter((bin) => bin.weaponId === id).reduce((total, bin) => total + bin.tons, 0);
        return <li key={id}><WeaponGlyph catalog={catalog} weapon={weapon} />
          <div><strong>{count} × {weapon.name}</strong><span>{formatWeaponNumber(weapon.damage * weapon.projectiles)} damage / salvo · {weapon.range.long} m max range</span>
            <small>{weapon.ammoPerTon === null ? 'No ammunition required' : `${ammo}t ammunition · ${Math.floor(ammo * weapon.ammoPerTon)} salvos shared across ${count} mount${count === 1 ? '' : 's'}`}</small></div></li>;
      })}
    </ul>
  </section>;
}
