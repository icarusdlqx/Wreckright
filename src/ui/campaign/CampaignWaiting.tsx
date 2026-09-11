import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { companyWait, nextRepairWait } from './campaignFlow';

const credits = (value: number): string => `${value.toLocaleString('en-GB')} C`;

export function CampaignWaiting({ catalog, state, onWait }: {
  catalog: Catalog; state: CampaignState; onWait: (day: number) => void;
}) {
  const tomorrow = companyWait(catalog, state, state.day + 1);
  const repair = nextRepairWait(catalog, state);
  return <details className="campaign-waiting" data-testid="camp-waiting">
    <summary>Wait / workshop time</summary>
    <div className="campaign-waiting-panel">
      <strong>Waiting pays wages. It does not start the next mission.</strong>
      <p>Use this to finish booked repairs or refresh yard offers. Wounded pilots who must miss a mission do not recover by waiting.</p>
      {repair === null ? <p>No repairs are currently booked.</p> : <>
        <button type="button" disabled={repair.blocked !== null} onClick={() => onWait(repair.targetDay)} data-testid="camp-wait-repair"
          title={repair.blocked ?? `Pay ${credits(repair.wages)} in wages and finish booked work through day ${repair.targetDay}.`}>
          Wait for next repair · {repair.days} day{repair.days === 1 ? '' : 's'} · {credits(repair.wages)} wages
        </button>
        <small>Ready day {repair.targetDay}. {repair.blocked ?? 'Only already-booked work is completed.'}</small>
      </>}
      <button type="button" disabled={tomorrow.blocked !== null} onClick={() => onWait(tomorrow.targetDay)} data-testid="camp-advance"
        title={tomorrow.blocked ?? `Pay ${credits(tomorrow.wages)} in wages and move the calendar to day ${tomorrow.targetDay}.`}>
        Wait 1 day · {credits(tomorrow.wages)} wages
      </button>
      <small>{tomorrow.blocked ?? 'Rest-day events may also change the treasury. No repairs are booked automatically.'}</small>
    </div>
  </details>;
}
