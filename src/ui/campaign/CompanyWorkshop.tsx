import { rebuildHulk } from '../../campaign/refit';
import { dailyPayroll, payrollThrough } from '../../campaign/ledger';
import { estimateRepair, projectedRepairWindow, repairQueue, startRepair } from '../../campaign/repair';
import { isMechAvailable } from '../../campaign/types';
import { mechIntegrity } from '../../campaign/integrity';
import { getCatalog } from '../../schema/load';
import { authoredDesignName } from '../designLabel';
import { workshopFactionLine } from './factionEconomy';
import { MachineIdentity, RepairReadout } from './MachineIdentity';
import { cbills, type PanelProps } from './Panels';
import './companyWorkshop.css';

const catalog = getCatalog();

export type MechBayPanelProps = PanelProps & { onRefit?: (mechId: string) => void };

export function MechBayPanel({ state, mutate, onRefit }: MechBayPanelProps) {
  const payroll = dailyPayroll(catalog, state);
  const bayCapacity = catalog.rules.economy.repair.bayCapacity;
  const bayDescription = `${bayCapacity === 1 ? 'One lift works' : `${bayCapacity} lifts work`} through the queue in order.`;
  const queue = repairQueue(catalog, state);
  const queueByMech = new Map(queue.map((entry) => [entry.mechId, entry]));
  return (
    <section className="camp-bay progression-bay company-workshop" data-testid="camp-bay">
      <header className="company-workshop-heading">
        <div><p>Company workshop</p><h3>Mech bay</h3></div>
        <dl className="company-workshop-ledger">
          <div><dt>Treasury</dt><dd>{cbills(state.cbills)}</dd></div>
          <div><dt>Daily payroll</dt><dd>{cbills(payroll)}</dd></div>
          <div><dt>Paid bookings</dt><dd>{queue.length}</dd></div>
        </dl>
      </header>
      <p className="ledger-note">
        {bayDescription} Workshop bills are paid up front; the {cbills(payroll)} daily
        payroll continues while work is booked.
      </p>
      <ul className="company-workshop-machines">
        {state.mechs.map((mech) => {
          const estimate = estimateRepair(catalog, mech);
          const chassis = catalog.chassis.get(mech.design.chassisId);
          const ready = isMechAvailable(state, mech) && mech.status !== 'hulk';
          const canRefit = ready && mech.status === 'ready' && !state.finished;
          const integrity = mechIntegrity(catalog, mech);
          const projected = projectedRepairWindow(catalog, state, estimate.days);
          const booking = queueByMech.get(mech.id);
          const calendarDays = projected.readyOnDay - state.day;
          const projectedTiming =
            projected.status === 'active'
              ? `ready day ${projected.readyOnDay}`
              : `starts day ${projected.startsOnDay} · ready day ${projected.readyOnDay}`;
          const status = mech.status === 'hulk'
            ? `wreck — ${cbills(estimate.cost)} now · ${projectedTiming} · ${cbills(payrollThrough(catalog, state, calendarDays))} wages`
            : ready
              ? mech.design.mounts.length === 0
                ? 'rebuilt — fit a weapon before deployment'
                : estimate.days === 0
                  ? 'ready'
                  : `damaged — ${cbills(estimate.cost)} now · ${projectedTiming} · ${cbills(payrollThrough(catalog, state, calendarDays))} wages`
              : booking?.status === 'active'
                ? `on a lift · ready day ${mech.readyOnDay} · ${cbills(payrollThrough(catalog, state, mech.readyOnDay - state.day))} wages left`
                : booking?.status === 'inherited'
                  ? `inherited concurrent booking · ready day ${mech.readyOnDay}`
                  : `queued ${booking?.queuePosition ?? 1} · starts day ${booking?.startsOnDay ?? state.day} · ready day ${mech.readyOnDay}`;
          const shortfall = Math.max(0, estimate.cost - state.cbills);
          return (
            <li key={mech.id} className="company-workshop-machine" data-testid={`camp-mech-${mech.id}`}>
              <div className="company-workshop-identity">
                <MachineIdentity catalog={catalog} design={mech.design} />
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
                  <p className="company-workshop-shortfall">Need {cbills(shortfall)} more to book this work.</p>
                ) : null}
              </div>
              <div className="company-workshop-actions">
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
                  >
                    {projected.status === 'active' ? 'Rebuild' : 'Queue rebuild'}
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
                          ? `${authoredDesignName(catalog, target.design)} booked; ready day ${target.readyOnDay}.`
                          : result.reason;
                      })
                    }
                    data-testid={`camp-repair-${mech.id}`}
                  >
                    {projected.status === 'active' ? 'Repair' : 'Queue repair'}
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
    </section>
  );
}
