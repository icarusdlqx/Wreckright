import type { CSSProperties } from 'react';
import type { Catalog } from '../../schema/load';
import type { DropPayload } from './dropPayload';
import './visualFitting.css';

/** A compact footprint is a count of boxes, never a second placement rule. */
export function slotBoxColumns(count: number): number {
  return Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(0, count)))));
}

/** A slot keeps the same physical size on the shelf and on every machine part. */
export function SlotBoxes({ count, incoming = 0 }: { count: number; incoming?: number }) {
  return (
    <span className="rack-cells slot-boxes" aria-hidden="true"
      data-box-count={count} style={{ '--box-columns': slotBoxColumns(count) } as CSSProperties}>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} className={`rack-cell${index < incoming ? ' rack-cell--incoming' : ''}`} />
      ))}
    </span>
  );
}

export function payloadFootprint(catalog: Catalog, payload: DropPayload | null): number {
  if (payload === null) return 0;
  if (payload.kind === 'weapon') return catalog.weapons.get(payload.id)?.slots ?? 0;
  if (payload.kind === 'equipment') return catalog.equipment.get(payload.id)?.slots ?? 0;
  return catalog.rules.construction.ammoSlotsPerTon;
}

export function payloadName(catalog: Catalog, payload: DropPayload): string {
  if (payload.kind === 'equipment') return catalog.equipment.get(payload.id)?.name ?? payload.id;
  const name = catalog.weapons.get(payload.id)?.name ?? payload.id;
  return payload.kind === 'ammo' ? `${name} ammunition` : name;
}
