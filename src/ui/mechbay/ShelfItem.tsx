import type { InspectorFit } from './Dossier';
import type { DropPayload } from './LocationCard';

/** One ammunition bin or piece of gear on the shelf: pick, drag, or auto-fit. */
export function ShelfItem({
  payload,
  label,
  detail,
  stock,
  fit,
  armed,
  inspected,
  onInspect,
  onArm,
  onAutoFit,
}: {
  payload: DropPayload;
  label: string;
  detail: string;
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
    <li
      className={`bay-stock${unavailable ? ' exhausted' : ''}${armed ? ' armed' : ''}${inspected ? ' inspected' : ''}`}
    >
      <button
        type="button"
        draggable={!unavailable}
        aria-pressed={armed}
        aria-current={inspected ? 'true' : undefined}
        aria-disabled={unavailable || undefined}
        aria-controls="bay-shelf-inspector"
        data-testid={`stock-${payload.kind}-${payload.id}`}
        onFocus={() => onInspect(payload)}
        onClick={() => {
          onInspect(payload);
          if (!unavailable) onArm(payload);
        }}
        onDragStart={(event) => {
          if (unavailable) return event.preventDefault();
          onInspect(payload);
          event.dataTransfer.setData('application/wreckright', JSON.stringify(payload));
          event.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <span className="stock-name">
          {label}
          {stock === undefined ? null : <em className="stock-count">×{Math.max(0, stock)}</em>}
        </span>
        <span className="stock-detail">{detail}</span>
        <span className={`bay-stock__fit ${fit.ok ? 'is-fit' : 'is-blocked'}`}>
          {fit.ok ? 'Fits' : fit.reason}
        </span>
      </button>
      {unavailable ? null : (
        <button
          type="button"
          className="bay-stock__autofit"
          data-testid={`autofit-${payload.kind}-${payload.id}`}
          aria-label={`Fit ${label} automatically`}
          onClick={() => onAutoFit(payload)}
        >
          Fit
        </button>
      )}
    </li>
  );
}
