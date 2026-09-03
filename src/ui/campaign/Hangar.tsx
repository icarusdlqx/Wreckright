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
import { authoredDesignName, companyMachineLabel } from '../designLabel';
import { useDialogFocus } from '../useDialogFocus';

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
  const fieldable = state.mechs.filter(
    (mech) => isMechAvailable(state, mech) && mech.status !== 'hulk' && mech.design.mounts.length > 0,
  );
  const needsWork = state.mechs.filter(
    (mech) => mech.status === 'hulk' || estimateRepair(catalog, mech).days > 0,
  );
  const allReady = needsWork.length === 0 && fieldable.length === state.mechs.length;
  const deadline = contract?.deadlineDay ?? null;

  return (
    <div className="manifest-backdrop" data-testid="hangar-stage">
      <section
        className="manifest hangar"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hangar-title"
        tabIndex={-1}
      >
        <header>
          <h3 id="hangar-title">
            {allReady
              ? `Mechbay — all ${state.mechs.length} machines are ready`
              : `Mechbay — ${fieldable.length} of ${state.mechs.length} machines can drop`}
          </h3>
          <p data-testid="hangar-lead">
            {mission?.name ?? 'Contract'}
            {employer === null ? '' : ` — ${employer}.`}{' '}
            {allReady
              ? 'Nothing needs the workshop. Refit a machine if you want to change its guns, or continue to the drop manifest.'
              : 'Repairs and rebuilds are optional: a damaged machine can still drop, and one on a lift is simply left behind. Book what you want, then continue.'}
          </p>
          {contract === null ? null : (
            <ContractBriefing
              catalog={catalog}
              state={state}
              missionId={contract.missionId}
              deadlineDay={contract.deadlineDay}
              nodeId={contract.nodeId}
              terms={contract}
            />
          )}
        </header>

        <ul className="manifest-list">
          {state.mechs.map((mech) => {
            const designName = authoredDesignName(catalog, mech.design);
            const label = companyMachineLabel(catalog, state.mechs, mech);
            const estimate = estimateRepair(catalog, mech);
            const chassis = catalog.chassis.get(mech.design.chassisId);
            const ready = isMechAvailable(state, mech) && mech.status !== 'hulk';
            const integrity = mechIntegrity(catalog, mech);
            const health = integrity.fraction;
            const projected = projectedRepairWindow(catalog, state, estimate.days);
            const booking = queueByMech.get(mech.id);
            const projectedTiming =
              projected.status === 'active'
                ? `ready day ${projected.readyOnDay}`
                : `starts day ${projected.startsOnDay}, ready day ${projected.readyOnDay}`;
            const lateForContract =
              deadline !== null &&
              ((booking !== undefined && mech.readyOnDay > deadline) ||
                (booking === undefined && estimate.days > 0 && projected.readyOnDay > deadline));
            const status =
              mech.status === 'hulk'
                ? `Wreck — ${cbills(estimate.cost)}, ${projectedTiming}`
                : !ready
                  ? booking?.status === 'active'
                    ? `On a lift — ready day ${mech.readyOnDay}`
                    : booking?.status === 'inherited'
                      ? `Inherited concurrent booking — ready day ${mech.readyOnDay}`
                      : `Queued ${booking?.queuePosition ?? 1} — starts day ${booking?.startsOnDay ?? state.day}, ready day ${mech.readyOnDay}`
                  : mech.design.mounts.length === 0
                    ? 'Rebuilt — fit a weapon before deployment'
                    : estimate.days === 0
                      ? 'Ready'
                      : `Damaged — ${cbills(estimate.cost)}, ${projectedTiming}`;

            return (
              <li key={mech.id} className="manifest-row" data-testid={`hangar-${mech.id}`}>
                <div className="manifest-pilot">
                  <span className="pilot-name">{label}</span>
                  {chassis === undefined ? null : (
                    <small className="faction-economy" data-faction={chassis.faction}>
                      {workshopFactionLine(catalog, chassis.faction)}
                    </small>
                  )}
                  <small className="manifest-status">{status}</small>
                  {lateForContract ? (
                    <small className="manifest-warning" data-testid={`hangar-late-${mech.id}`}>
                      Not back before the day {deadline} deadline
                    </small>
                  ) : null}
                </div>

                <div className="manifest-mech">
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
                              ? `${authoredDesignName(catalog, target.design)} booked; ready day ${target.readyOnDay}.`
                              : result.reason;
                          })
                        }
                        data-testid={`hangar-rebuild-${mech.id}`}
                      >
                        {projected.status === 'active' ? 'Rebuild' : 'Queue rebuild'}
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
                                ? `${authoredDesignName(catalog, target.design)} booked; ready day ${target.readyOnDay}.`
                                : result.reason;
                            })
                          }
                          data-testid={`hangar-repair-${mech.id}`}
                        >
                          {projected.status === 'active' ? 'Repair' : 'Queue repair'}
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
            {fieldable.length === 0
              ? 'Continue to deployment'
              : `Continue with ${fieldable.length} machine${fieldable.length === 1 ? '' : 's'}`}
          </button>
          <button type="button" onClick={onCancel} data-testid="hangar-cancel">
            Back to the map
          </button>
        </footer>
      </section>
    </div>
  );
}
