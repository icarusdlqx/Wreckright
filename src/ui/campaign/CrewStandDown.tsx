import type { Catalog } from '../../schema/load';
import { dailyPayroll } from '../../campaign/ledger';
import { needsCrewStandDown, standDownCost } from '../../campaign/crewRecovery';
import type { CampaignState } from '../../campaign/types';
import './crewStandDown.css';

export function CrewStandDown({ catalog, state, onStandDown }: {
  catalog: Catalog; state: CampaignState; onStandDown: () => void;
}) {
  if (!needsCrewStandDown(catalog, state)) return null;
  const cost = standDownCost(catalog, state);
  const credits = (value: number): string => `${value.toLocaleString('en-GB')} C`;
  return <section className="crew-stand-down" data-testid="crew-stand-down">
    {cost === null ? <p>Accept a contract, then stand the company down from that mission to recover.</p> : <>
      <p>This forfeits the signed contract: <strong>{credits(cost.fee)} recovery fee</strong>,
        {' '}{cost.days} days and {credits(dailyPayroll(catalog, state) * cost.days)} payroll.
        No payout, XP or salvage. The crew misses this mission and returns to duty.</p>
      <button type="button" onClick={onStandDown} data-testid="crew-stand-down-confirm">
        Forfeit contract &amp; recover crew
      </button>
    </>}
  </section>;
}
