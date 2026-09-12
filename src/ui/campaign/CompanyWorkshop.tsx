import { useEffect, useState } from 'react';
import type { CampaignNavigationTarget } from './campaignNavigation';
import { rebuildHulk } from '../../campaign/refit';
import { estimateRepair, projectedRepairWindow, repairQueue, startRepair } from '../../campaign/repair';
import { isMechAvailable } from '../../campaign/types';
import { mechIntegrity } from '../../campaign/integrity';
import { getCatalog } from '../../schema/load';
import { authoredDesignName, machineDisplayName } from '../designLabel';
import { workshopFactionLine } from './factionEconomy';
import { companyMachineLabel } from './companyLabels';
import { MachineIdentity, RepairReadout } from './MachineIdentity';
import { cbills, type PanelProps } from './Panels';
import './companyWorkshop.css';
import { SelectedMachineShowcase } from './SelectedMachineShowcase';

const catalog = getCatalog();

export type MechBayPanelProps = PanelProps & { onRefit?: (mechId: string) => void; previewActive?: boolean; focus?: CampaignNavigationTarget | null };

/** On stacked layouts the inspected machine is above the roster; keep keyboard focus on its order. */
export function revealInspectedMachine(source: Pick<HTMLElement, 'ownerDocument' | 'closest'>): void {
  const view = source.ownerDocument.defaultView;
  if (view === null || typeof view.matchMedia !== 'function'
    || !view.matchMedia('(max-width: 900px), (max-width: 1100px) and (pointer: coarse)').matches) return;
  const showcase = source.closest('.company-workshop-floor')?.querySelector('[data-testid="camp-selected-machine"]');
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  showcase?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
}

export function MechBayPanel({ state, mutate, onRefit, previewActive = false, focus }: MechBayPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectionStatus, setInspectionStatus] = useState('');
  useEffect(() => {
    if (focus?.area === 'workshop' && focus.mechId !== undefined) setSelectedId(focus.mechId);
  }, [focus]);
  const selected = state.mechs.find((mech) => mech.id === selectedId) ?? state.mechs[0];
  const queue = repairQueue(catalog, state);
  const queueByMech = new Map(queue.map((entry) => [entry.mechId, entry]));
  return (
    <section className="camp-bay progression-bay company-workshop" data-testid="camp-bay">
      <header className="company-workshop-heading">
        <div><p>Company workshop</p><h3>Mech bay</h3></div>
        <dl className="company-workshop-ledger">
          <div><dt>Treasury</dt><dd>{cbills(state.cbills)}</dd></div>
          <div><dt>Repair service</dt><dd>Immediate</dd></div>

        </dl>
      </header>
      <p className="ledger-note">Pay for repairs, restore your machine, and deploy. No waiting or daily charges.</p>
      <p className="company-inspection-status" role="status" aria-live="polite" aria-atomic="true"
        data-testid="camp-inspection-status">{inspectionStatus}</p>
      <div className="company-workshop-floor">
      {selected === undefined ? null : <SelectedMachineShowcase catalog={catalog} mech={selected} active={previewActive} />}
      <ul className="company-workshop-machines" aria-label="Company machines and workshop orders">
        {state.mechs.map((mech) => {
          const estimate = estimateRepair(catalog, mech);
          const chassis = catalog.chassis.get(mech.design.chassisId);
          const ready = isMechAvailable(state, mech) && mech.status !== 'hulk';
          const canRefit = ready && mech.status === 'ready' && !state.finished;
          const integrity = mechIntegrity(catalog, mech);
          const projected = projectedRepairWindow(catalog, state, estimate.days);
          const booking = queueByMech.get(mech.id);
          const status = mech.status === 'hulk' ? 'Rebuild needed' : estimate.days > 0 ? 'Damaged' : 'Ready';
          const shortfall = Math.max(0, estimate.cost - state.cbills);
          return (
            <li key={mech.id} className="company-workshop-machine" data-selected={selected?.id === mech.id} data-testid={`camp-mech-${mech.id}`}>
              <div className="company-workshop-identity">
                <MachineIdentity catalog={catalog} design={mech.design} companyLabel={companyMachineLabel(catalog, mech)} />
                {chassis === undefined ? null : (
                  <small className="faction-economy" data-faction={chassis.faction}>
                    {workshopFactionLine(catalog, chassis.faction)}
                  </small>
                )}
                <div className="company-workshop-integrity">
                  <span>Armour &amp; structure</span><strong>{Math.round(integrity.fraction * 100)}%</strong>
                  <div role="progressbar" aria-label={`${authoredDesignName(catalog, mech.design)} integrity`}
                    aria-valuemin={0} aria-valuemax={integrity.maximum} aria-valuenow={integrity.current}>
                    <span style={{ width: `${integrity.fraction * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="bay-mech-state company-workshop-condition">
                <RepairReadout catalog={catalog} state={state} mech={mech} estimate={estimate}
                  projected={projected} booking={booking} ready={ready} status={status} />
                {booking === undefined && (mech.status === 'hulk' || estimate.days > 0) && shortfall > 0 ? (
                  <p className="company-workshop-shortfall">Need {cbills(shortfall)} more to repair this machine.</p>
                ) : null}
              </div>
              <div className="company-workshop-actions">
                <button type="button" aria-pressed={selected?.id === mech.id} onClick={(event) => {
                  setSelectedId(mech.id);
                  setInspectionStatus(`Inspecting ${machineDisplayName(catalog, mech.design)}. Current equipment and condition shown.`);
                  revealInspectedMachine(event.currentTarget);
                }}
                  data-testid={`camp-inspect-${mech.id}`}>Inspect</button>
                {mech.status === 'hulk' ? (
                  <button
                    type="button"
                    onClick={() =>
                      mutate((draft) => {
                        const target = draft.mechs.find((entry) => entry.id === mech.id);
                        if (target === undefined) return null;
                        const result = rebuildHulk(catalog, draft, target);
                        return result.ok
                          ? `${authoredDesignName(catalog, target.design)} repaired and ready to deploy.`
                          : result.reason;
                      })
                    }
                  >
                    Rebuild now
                  </button>
                ) : estimate.days > 0 && mech.status === 'ready' ? (
                  <button
                    type="button"
                    onClick={() =>
                      mutate((draft) => {
                        const target = draft.mechs.find((entry) => entry.id === mech.id);
                        if (target === undefined) return null;
                        const result = startRepair(catalog, draft, target);
                        return result.ok
                          ? `${authoredDesignName(catalog, target.design)} repaired and ready to deploy.`
                          : result.reason;
                      })
                    }
                    data-testid={`camp-repair-${mech.id}`}
                  >
                    Repair now
                  </button>
                ) : null}
                {onRefit === undefined ? null : (
                  <button type="button" disabled={!canRefit} onClick={() => onRefit(mech.id)}
                    title={state.finished ? 'This campaign is complete' : mech.status === 'hulk'
                      ? 'Rebuild this chassis before refitting it' : mech.status === 'repairing'
                        ? 'Finish this workshop booking before refitting'
                        : 'Change this machine’s equipment using company stores'}
                    data-testid={`camp-refit-${mech.id}`}>
                    Refit
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      </div>
    </section>
  );
}
