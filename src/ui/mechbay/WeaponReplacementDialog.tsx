import { useRef } from 'react';
import type { Catalog } from '../../schema/load';
import { computeHeatProfile, computeLoadout } from '../../sim/loadout';
import { useDialogFocus } from '../useDialogFocus';
import { MECH_LOCATION_NAMES } from './LocationCard';
import { foreignComponentPresentation } from './machineCulturePresentation';
import { SlotBoxes } from './SlotBoxes';
import type { ReplacementRequest, WeaponReplacement } from './weaponReplacement';
import { WeaponGlyph } from './WeaponGlyph';
import './weaponReplacement.css';

const number = (value: number): string => value.toFixed(1).replace(/\.0$/, '');
const signed = (value: number): string => `${value > 0 ? '+' : ''}${number(value)}`;

export function WeaponReplacementDialog({ catalog, request, preview, stocked, error, onConfirm, onCancel }: {
  catalog: Catalog;
  request: ReplacementRequest;
  preview: WeaponReplacement;
  stocked: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, cancelRef, onCancel, () =>
    document.querySelector('[data-testid="bay-armed-cancel"]')
    ?? document.querySelector(`[data-testid="bay-location-${request.source.mounts[request.index]?.location}"] .bay-location-name:not(:disabled)`)
    ?? document.querySelector('[data-testid="bay-exit"]'));
  const original = request.source.mounts[request.index];
  const oldWeapon = original === undefined ? undefined : catalog.weapons.get(original.weaponId);
  const newWeapon = catalog.weapons.get(request.weaponId);
  if (original === undefined || oldWeapon === undefined || newWeapon === undefined) return null;

  const next = preview.evaluation.nextDesign;
  const before = computeLoadout(catalog, request.source);
  const after = preview.evaluation.report.loadout;
  const beforeHeat = computeHeatProfile(catalog, request.source);
  const afterHeat = computeHeatProfile(catalog, next);
  const location = MECH_LOCATION_NAMES[original.location];
  const localBefore = before.perLocation[original.location];
  const localAfter = after.perLocation[original.location];
  const ammoChanges = preview.evaluation.deltas.filter((delta) => delta.component === 'ammo');
  const newAmmoTons = next.ammo.filter((bin) => bin.weaponId === newWeapon.id).reduce((total, bin) => total + bin.tons, 0);
  const chassisFaction = catalog.chassis.get(request.source.chassisId)?.faction;
  const foreign = chassisFaction === undefined ? null : foreignComponentPresentation(newWeapon.faction, chassisFaction);
  const refusal = error ?? preview.reason;

  return (
    <div className="bay-replacement-backdrop" onClick={(event) => event.stopPropagation()}>
      <section ref={dialogRef} className="bay-replacement-dialog" role="dialog" aria-modal="true"
        aria-labelledby="bay-replacement-title" aria-describedby="bay-replacement-intro"
        data-testid="bay-replacement-preview" tabIndex={-1}>
        <header><span className="replacement-eyebrow">{location} · replacement preview</span>
          <h2 id="bay-replacement-title">Swap this weapon?</h2>
          <p id="bay-replacement-intro">Review the whole change before adding it to your draft.</p>
        </header>
        <div className="replacement-comparison">
          {[{ weapon: oldWeapon, label: 'Out' }, { weapon: newWeapon, label: 'In' }].map(({ weapon, label }) => (
            <div key={label} className="replacement-weapon">
              <span className="replacement-eyebrow">{label}</span><WeaponGlyph catalog={catalog} weapon={weapon} />
              <strong>{weapon.name}</strong><SlotBoxes count={weapon.slots} />
              <span>{weapon.slots} box{weapon.slots === 1 ? '' : 'es'} · {number(weapon.tonnage)}t · {weapon.type}</span>
            </div>
          ))}
        </div>
        {foreign === null ? null : <p className="replacement-culture">{foreign.badge}: {foreign.note}</p>}
        {preview.ok ? <>
          <dl className="replacement-effects" aria-label="Replacement consequences">
            <div><dt>{location} boxes used</dt><dd>{localBefore.slotsUsed} → {localAfter.slotsUsed} / {localAfter.slotsAvailable}</dd></div>
            <div><dt>Whole machine weight</dt><dd>{number(before.usedWeight)} → {number(after.usedWeight)} / {number(after.tonnage)}t <small>({signed(after.usedWeight - before.usedWeight)}t, including ammo)</small></dd></div>
            <div><dt>Weapon heat each second</dt><dd>{number(beforeHeat.heatPerSecond)} → {number(afterHeat.heatPerSecond)} <small>Cooling removes {number(afterHeat.dissipationPerSecond)}/s</small></dd></div>
            <div><dt>Net heat each second</dt><dd>{signed(beforeHeat.netHeatPerSecond)} → {signed(afterHeat.netHeatPerSecond)} <small>{afterHeat.sustainable ? 'Cooling keeps up at full fire.' : 'Full fire builds heat; pace your volleys.'}</small></dd></div>
          </dl>
          {after.freeTonnage < 0 ? <p className="replacement-warning" role="note">This draft will be {number(-after.freeTonnage)}t overweight. Remove weight before saving or applying the refit.</p> : null}
          <div className="replacement-log">
            <h3>Stores &amp; ammunition</h3>
            <p>{stocked ? `Return 1 ${oldWeapon.name} to stores. Use 1 spare ${newWeapon.name}.` : `Remove ${oldWeapon.name}; fit ${newWeapon.name} from unlimited workshop stores.`}</p>
            {ammoChanges.map((delta, index) => {
              const removed = delta.before !== null && delta.after === null;
              const line = removed ? delta.before : delta.after;
              if (line === null) return null;
              const tons = removed ? line.quantity : line.quantity - (delta.before?.quantity ?? 0);
              const where = line.location === null ? '' : ` in ${MECH_LOCATION_NAMES[line.location].toLowerCase()}`;
              return <p key={index}>{removed ? 'Remove' : 'Stow'} {number(tons)}t {catalog.weapons.get(line.itemId)?.name ?? line.itemId} ammunition{where}.</p>;
            })}
            <p>{newWeapon.ammoPerTon === null ? `${newWeapon.name} needs no separate ammunition bin.` : `${newWeapon.name}: ${number(newAmmoTons)}t ammunition after replacement (${number(newAmmoTons * newWeapon.ammoPerTon)} rounds).`}</p>
            {stocked && ammoChanges.length > 0 ? <p>Ammunition bins are supplied by the workshop; they do not consume weapon spares.</p> : null}
          </div>
        </> : null}
        {refusal === null ? null : <p className="replacement-warning" role="alert" data-testid="bay-replacement-refusal">{refusal}</p>}
        <footer>
          <p>One change in the draft. Undo restores the old weapon, ammo and spare counts.</p>
          <div><button ref={cancelRef} type="button" data-testid="bay-replacement-cancel" onClick={onCancel}>Keep current weapon</button>
            <button type="button" className="primary" data-testid="bay-replacement-confirm" disabled={!preview.ok || error !== null} onClick={onConfirm}>Confirm replacement</button></div>
        </footer>
      </section>
    </div>
  );
}
