import { SlotBoxes } from './SlotBoxes';
import type { InspectorFit } from './Dossier';
import type { DropPayload } from './dropPayload';

export function ShelfItem({ payload, label, detail, boxes, stock, fit, armed, inspected, onInspect, onArm, onAutoFit }: {
  payload: DropPayload;
  label: string;
  detail: string;
  boxes?: number;
  stock?: number;
  fit: InspectorFit;
  armed: boolean;
  inspected: boolean;
  onInspect: (payload: DropPayload) => void;
  onArm: (payload: DropPayload) => void;
  onAutoFit: (payload: DropPayload) => void;
}) {
  const exhausted = stock !== undefined && stock <= 0;
  const unavailable = exhausted || !fit.ok;
  return (
    <li className={`bay-stock${unavailable ? ' exhausted' : ''}${armed ? ' armed' : ''}${inspected ? ' inspected' : ''}`}>
      <button
        type="button" draggable={!unavailable} aria-pressed={armed}
        aria-current={inspected ? 'true' : undefined} aria-disabled={unavailable || undefined}
        data-testid={`stock-${payload.kind}-${payload.id}`}
        onFocus={() => onInspect(payload)}
        onClick={() => { onInspect(payload); if (!unavailable) onArm(payload); }}
        onDragStart={(event) => {
          if (unavailable) return event.preventDefault();
          onInspect(payload);
          event.dataTransfer.setData('application/wreckright', JSON.stringify(payload));
          event.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <span className="stock-name">
          {label}{stock === undefined ? null : <em className="stock-count">{Math.max(0, stock)} spare</em>}
        </span>
        <span className="stock-detail">{detail}</span>
        {boxes === undefined ? null : <span className="stock-box-footprint"><SlotBoxes count={boxes} /> {boxes} box{boxes === 1 ? '' : 'es'}</span>}
        <span className={`bay-stock__fit ${unavailable ? 'is-blocked' : 'is-fit'}`}>
          {fit.label === undefined ? '' : `${fit.label} · `}
          {exhausted ? fit.reason ?? '0 spare. Acquire a copy before fitting it.' : fit.ok ? 'Fits' : fit.reason}
        </span>
      </button>
      {unavailable ? null : (
        <button type="button" className="bay-stock__autofit" data-testid={`autofit-${payload.kind}-${payload.id}`}
          aria-label={`Fit ${label} automatically`} onClick={() => onAutoFit(payload)}>Fit</button>
      )}
    </li>
  );
}
