import type { Catalog } from '../../schema/load';
import { parsedDrop, type DropPayload } from './dropPayload';
import type { LocationOccupant } from './locationOccupants';
import { mutateAfterStableFocus, stableRemovalFocusTarget } from './locationFocus';
import { SlotBoxes } from './SlotBoxes';
import type { WeaponReplacement } from './weaponReplacement';

export function FittedPart({ catalog, item, locationName, snap, target, replacement, onInspect, onRemove, onReplace }: {
  catalog: Catalog;
  item: LocationOccupant;
  locationName: string;
  snap: boolean;
  target: DropPayload | null;
  replacement?: WeaponReplacement;
  onInspect?: (payload: DropPayload) => void;
  onRemove: () => void;
  onReplace?: (payload: DropPayload, index: number) => void;
}) {
  const replacing = item.kind === 'weapon' && target?.kind === 'weapon' && onReplace !== undefined;
  const incomingName = replacing ? catalog.weapons.get(target.id)?.name ?? target.id : '';
  const label = replacing ? `Preview replacing ${item.label} with ${incomingName} in ${locationName}` : `Inspect ${item.label}`;
  return (
    <li
      className={`slot-block tone-${item.tone}${item.oversized ? ' too-big' : ''}${snap ? ' snap-target' : ''}${replacing ? ` replacement-target ${replacement?.ok ? 'can-replace' : 'cannot-replace'}` : ''}`}
      data-testid={item.kind === 'weapon' ? `replacement-target-${item.index}` : undefined}
      data-replacement-fit={replacing ? String(replacement?.ok === true) : undefined}
      title={item.oversized ? `${item.label} — too large for this mount` : `${item.label} — ${item.slots} slots`}
      onDragOver={(event) => {
        // Native dragover can precede React's dragged-part render. Its payload is
        // protected here; recognize our format now and validate its kind on drop.
        if (item.kind !== 'weapon' || onReplace === undefined ||
          (!replacing && !Array.from(event.dataTransfer.types).includes('application/wreckright'))) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (item.kind !== 'weapon' || onReplace === undefined) return;
        const payload = parsedDrop(event.dataTransfer.getData('application/wreckright'));
        if (payload?.kind !== 'weapon') return;
        event.preventDefault();
        event.stopPropagation();
        onReplace(payload, item.index);
      }}
    >
      <button
        type="button" className="slot-block__inspect"
        data-testid={replacing ? `replace-weapon-${item.index}` : `inspect-${item.kind}-${item.index}`}
        aria-label={label} aria-haspopup={replacing ? 'dialog' : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (replacing) onReplace(target, item.index);
          else onInspect?.({ kind: item.kind, id: item.id });
        }}
        onFocus={() => { if (!replacing) onInspect?.({ kind: item.kind, id: item.id }); }}
      >
        <span>{item.label}</span>
        <SlotBoxes count={item.slots} />
        <small>{item.kind === 'ammo' ? 'Ammo' : item.kind === 'equipment' ? 'Gear' : 'Weapon'} · {item.slots} slot{item.slots === 1 ? '' : 's'}</small>
        {replacing ? <span className="replacement-target__hint">
          {replacement?.ok ? `Preview ${incomingName} here` : `Check replacement: ${replacement?.reason ?? 'Cannot fit here.'}`}
        </span> : null}
      </button>
      <button
        type="button" className="slot-block__remove" data-testid={`remove-${item.kind}-${item.index}`}
        aria-label={`Remove ${item.label} from ${locationName}`} title={`Remove ${item.label} from ${locationName}`}
        onClick={(event) => {
          event.stopPropagation();
          mutateAfterStableFocus(stableRemovalFocusTarget(event.currentTarget), onRemove);
        }}
      >Remove</button>
    </li>
  );
}
