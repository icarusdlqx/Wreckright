import type { Catalog } from '../../schema/load';
import { parsedDrop, type DropPayload } from './dropPayload';
import type { LocationOccupant } from './locationOccupants';
import { mutateAfterStableFocus, stableRemovalFocusTarget } from './locationFocus';
import { SlotBoxes } from './SlotBoxes';
import type { WeaponReplacement } from './weaponReplacement';

export function FittedPart({ catalog, item, locationName, snap, target, replacement, onInspect, onMove, onRemove, onReplace }: {
  catalog: Catalog;
  item: LocationOccupant;
  locationName: string;
  snap: boolean;
  target: DropPayload | null;
  replacement?: WeaponReplacement;
  onInspect?: (payload: DropPayload) => void;
  onMove?: (payload: DropPayload) => void;
  onRemove: () => void;
  onReplace?: (payload: DropPayload, index: number) => void;
}) {
  const replacing = item.kind === 'weapon' && target?.kind === 'weapon' && target.sourceIndex === undefined && onReplace !== undefined;
  const weapon = item.kind === 'weapon' ? catalog.weapons.get(item.id) : undefined;
  const movable = item.kind === 'weapon' && target === null;
  const source = { kind: item.kind, id: item.id, sourceIndex: item.index };
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
        if (target?.sourceIndex !== undefined || item.kind !== 'weapon' || onReplace === undefined ||
          (!replacing && !Array.from(event.dataTransfer.types).includes('application/wreckright'))) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (item.kind !== 'weapon' || onReplace === undefined) return;
        const payload = parsedDrop(event.dataTransfer.getData('application/wreckright'));
        if (payload?.kind !== 'weapon' || payload.sourceIndex !== undefined) return;
        event.preventDefault();
        event.stopPropagation();
        onReplace(payload, item.index);
      }}
    >
      <button
        type="button" className="slot-block__inspect"
        data-testid={replacing ? `replace-weapon-${item.index}` : `inspect-${item.kind}-${item.index}`}
        draggable={movable} aria-label={label} aria-haspopup={replacing ? 'dialog' : undefined}
        onDragStart={(event) => {
          if (!movable) { event.preventDefault(); return; }
          event.dataTransfer.setData('application/wreckright', JSON.stringify(source));
          event.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (replacing) onReplace(target, item.index);
          else onInspect?.({ kind: item.kind, id: item.id });
        }}
        onFocus={() => { if (!replacing) onInspect?.({ kind: item.kind, id: item.id }); }}
      >
        <SlotBoxes count={item.slots} />
        <span className="fitted-part__identity"><strong>{item.label}</strong>
          <span>{weapon === undefined ? item.kind === 'ammo' ? 'Shared ammunition' : 'Equipment' : weapon.ammoPerTon === null ? 'No ammo needed' : 'Ammo-fed'} · {item.slots} box{item.slots === 1 ? '' : 'es'}</span>
        </span>
        <small className={replacing ? 'replacement-target__hint' : undefined}>
          {replacing
            ? replacement?.ok ? `Preview ${incomingName} here` : `Check replacement: ${replacement?.reason ?? 'Cannot fit here.'}`
            : `${item.kind === 'ammo' ? 'Ammo' : item.kind === 'equipment' ? 'Gear' : 'Weapon'} · ${item.slots} slot${item.slots === 1 ? '' : 's'}`}
        </small>
      </button>
      {item.kind !== 'weapon' || onMove === undefined ? null : <button
        type="button" className="slot-block__move" data-testid={`move-weapon-${item.index}`}
        aria-label={`Move ${item.label} to another location`} disabled={target !== null}
        onClick={(event) => { event.stopPropagation(); onMove(source); }}>Move</button>}
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
