import type { LocationOccupant } from './locationOccupants';
import { slotBoxColumns } from './SlotBoxes';
import type { CSSProperties } from 'react';

/** The rack counts existing slots. Automatic packing never creates unusable gaps. */
export function RackCapacity({ capacity, occupants, incoming = 0 }: {
  capacity: number;
  occupants: readonly LocationOccupant[];
  incoming?: number;
}) {
  const filled = occupants.flatMap((part) => Array.from({ length: part.slots }, (_, index) => ({ part, first: index === 0 })));
  const cells = Math.max(capacity, filled.length);
  return <span className="rack-capacity" data-testid="rack-capacity" data-capacity={capacity}
    style={{ '--box-columns': slotBoxColumns(capacity) } as CSSProperties}
    aria-label={`${filled.length} occupied and ${Math.max(0, capacity - filled.length)} free fitting boxes`}>
    {Array.from({ length: cells }, (_, index) => {
      const occupied = filled[index];
      const pending = occupied === undefined && index - filled.length < incoming;
      return <i key={index} aria-hidden="true"
        className={`rack-cell ${occupied === undefined ? 'rack-capacity__free' : `rack-capacity__used tone-${occupied.part.tone}`}${pending ? ' rack-cell--incoming' : ''}`}
        title={occupied === undefined ? pending ? 'Held part will fit here' : 'Free fitting box' : occupied.part.label}
        data-occupant={occupied?.part.key}>
        {occupied?.first ? occupied.part.kind === 'ammo' ? 'A' : occupied.part.kind === 'equipment' ? 'G' : 'W' : null}
      </i>;
    })}
  </span>;
}
