import { useCallback, useRef } from 'react';
import type { Catalog } from '../../schema/load';
import { rebuildHulk } from '../../campaign/refit';
import { mechIntegrity } from '../../campaign/integrity';
import {
  estimateRepair,
  projectedRepairWindow,
  repairQueue,
  startRepair,
} from '../../campaign/repair';
import { employerNameFor } from '../../campaign/employers';
import { isMechAvailable, type CampaignState } from '../../campaign/types';
import { cbills } from './Panels';
import { ContractBriefing } from './ContractBriefing';
import { workshopFactionLine } from './factionEconomy';
import { authoredDesignName } from '../designLabel';
import { useDialogFocus } from '../useDialogFocus';
import { MachineIdentity, PreparationSteps, RepairReadout } from './MachineIdentity';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  mutate: (change: (draft: CampaignState) => string | null | void, message?: string) => void;
  /** Opens the bay editor on one machine, for a pre-drop refit. */
  onRefit: (mechId: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * The hangar walk-through: the first stop on the way to a drop.
 *
 * Mission prep is three decisions in a row — what shape the machines are in,
 * who flies which one, and then the launch. This stage is the first of them,
 * made explicit so the flow reads campaign map → mechbay → deployment →
 * battle, rather than the bay being a side door most players never find.
 */
export function Hangar({ catalog, state, mutate, onRefit, onContinue, onCancel }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const close = useCallback(() => cancelRef.current(), []);
  useDialogFocus(dialogRef, dialogRef, close);
  const contract = state.contract;
  const mission = contract === null ? null : catalog.missions.get(contract.missionId);
  const employer =
    contract === null
      ? null
      : employerNameFor(catalog, state.campaignId, contract.employerId, contract.employerName);
  const queue = repairQueue(catalog, state);
  const queueByMech = new Map(queue.map((entry) => [entry.mechId, entry]));

  return (
    <div className="manifest-backdrop" data-testid="hangar-stage">
      <section
        className="manifest hangar exp-prep"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hangar-title"
        tabIndex={-1}
      >
        <header>
          <PreparationSteps stage="bay" />
          <h3 id="hangar-title">Mechlab — prepare the machines</h3>
          <p>
            {mission?.name ?? 'Contract'}
            {employer === null ? '' : ` — ${employer}.`} Check condition and equipment,
            then choose the machines and pilots for the drop.
          </p>
          {contract === null ? null : (
            <details className="exp-prep-contract">
              <summary>Mission orders &amp; signed terms</summary>
              <ContractBriefing catalog={catalog} state={state} missionId={contract.missionId}
                deadlineDay={contract.deadlineDay} nodeId={contract.nodeId} terms={contract} />
            </details>
          )}
          <dl className="exp-prep-summary">
            <div><dt>Fieldable machines</dt><dd>{state.mechs.filter((mech) => isMechAvailable(state, mech) && mech.status !== 'hulk' && mech.design.mounts.length > 0).length}</dd></div>

            <div><dt>Repairs</dt><dd>Immediate</dd></div>
          </dl>
        </header>

        <ul className="manifest-list">
          {state.mechs.map((mech) => {
            const designName = authoredDesignName(catalog, mech.design);
            const estimate = estimateRepair(catalog, mech);
            const chassis = catalog.chassis.get(mech.design.chassisId);
            const ready = isMechAvailable(state, mech) && mech.status !== 'hulk';
            const integrity = mechIntegrity(catalog, mech);
            const health = integrity.fraction;
            const projected = projectedRepairWindow(catalog, state, estimate.days);
            const booking = queueByMech.get(mech.id);
            const status = mech.status === 'hulk' ? `Rebuild: ${cbills(estimate.cost)}; ready immediately` : estimate.days === 0 ? 'Ready' : `Repair: ${cbills(estimate.cost)}; ready immediately`;

            return (
              <li key={mech.id} className="manifest-row" data-testid={`hangar-${mech.id}`}>
                <div className="manifest-pilot">
                  <MachineIdentity catalog={catalog} design={mech.design} />
                  {chassis === undefined ? null : (
                    <small className="faction-economy" data-faction={chassis.faction}>
                      {workshopFactionLine(catalog, chassis.faction)}
                    </small>
                  )}
                </div>

                <div className="manifest-mech">
                  <RepairReadout catalog={catalog} state={state} mech={mech} estimate={estimate}
                    projected={projected} booking={booking} ready={ready} status={status} />
                  <div
                    className="manifest-health"
                    title={`${Math.round(health * 100)}% intact · ${integrity.current}/${integrity.maximum} armour and structure`}
                    role="progressbar"
                    aria-label={`${designName} integrity`}
                    aria-valuemin={0}
                    aria-valuemax={integrity.maximum}
                    aria-valuenow={integrity.current}
                  >
                    <span style={{ width: `${Math.round(health * 100)}%` }} />
                  </div>
                  <div className="manifest-buttons">
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
                        data-testid={`hangar-rebuild-${mech.id}`}
                      >
                        Rebuild now
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!ready || estimate.days === 0}
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
                          data-testid={`hangar-repair-${mech.id}`}
                        >
                          Repair now
                        </button>
                        <button
                          type="button"
                          disabled={!ready}
                          onClick={() => onRefit(mech.id)}
                          title="Change what this machine is carrying before the drop"
                          data-testid={`hangar-refit-${mech.id}`}
                        >
                          Refit
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="manifest-actions">
          <button type="button" onClick={onContinue} data-testid="hangar-continue">
            Continue to deployment
          </button>
          <button type="button" onClick={onCancel} data-testid="hangar-cancel">
            Back to the map
          </button>
        </footer>
      </section>
    </div>
  );
}
