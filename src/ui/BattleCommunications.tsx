import type { World } from '../sim/types';
import { CommandReceipt } from './CommandReceipt';
import { FieldRadioPanel } from './FieldRadioPanel';
import { SupportStatus } from './SupportStatus';

/** Reserve the channel before anyone speaks so messages never move the controls. */
export function BattleCommunications({ world, paused }: { world: World | null; paused: boolean }) {
  return <div className="battle-communications" data-testid="battle-communications">
    <div className="battle-radio-slot">
      <FieldRadioPanel />
      <span className="battle-radio-idle" aria-hidden="true">Company radio · Standing by</span>
    </div>
    <div className="battle-receipt-slot"><CommandReceipt /></div>
    <SupportStatus world={world} paused={paused} />
  </div>;
}
