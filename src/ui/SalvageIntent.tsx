import type { MechLocation } from '../schema/common';
import type { Catalog } from '../schema/load';
import type { UnitSnapshot } from './store';
import './salvageIntent.css';

export function salvageAimAdvice(target: UnitSnapshot, location: MechLocation | null): string {
  const legs = ['left_leg', 'right_leg'] as const;
  if (legs.every(part => target.locations[part].destroyed)) {
    return 'Immobilised, but can still fire. Preserve its core and win through another objective to attempt recovery.';
  }
  if (location === 'centre_torso') return 'Coring ends the threat, but leaves much less chance of recovering its hull.';
  if (location === 'left_leg' || location === 'right_leg') {
    return legs.some(part => target.locations[part].destroyed)
      ? 'One leg is already gone. Disable the remaining leg, preserve the core, then win through another objective.'
      : 'Disable both legs, preserve the core, then win through another objective. One lost leg alone is not a capture.';
  }
  if (location === 'head') return 'A head kill can preserve the hull, but risks killing its pilot; ejection is possible. Recovery still rolls.';
  if (location !== null) {
    const exposed = target.weapons.filter(weapon => weapon.location === location && !weapon.destroyed);
    return exposed.length > 0
      ? `Silences ${exposed.map(weapon => weapon.name).join(', ')} here. Destroying this section also reduces its parts' recovery odds.`
      : 'A destroyed section is harder to salvage. Preserve sections holding weapons you want to recover.';
  }
  return 'Disable both legs for a better hull recovery chance. Shoot off a weapon arm to stop its fire, at a cost to salvage.';
}

/** Advice uses only an optically identified snapshot, never concealed damage. */
export function SalvageIntent({ catalog, target, location = null }: {
  catalog: Catalog; target: UnitSnapshot; location?: MechLocation | null;
}) {
  if (!target.identified || !target.alive || catalog.chassis.get(target.chassisId)?.frame !== 'mech') return null;
  const odds = catalog.rules.salvage.chassisRecoveryByOutcome;
  return <section className="salvage-intent" data-testid="salvage-intent" aria-label="Tactical salvage advice">
    <strong>Disable or destroy</strong>
    <p>{salvageAimAdvice(target, location)}</p>
    <div className="salvage-intent-odds">
      {([{ label: 'Legs disabled', value: odds.legged }, { label: 'Core destroyed', value: odds.centre_torso }]).map(row =>
        <div key={row.label}><span>{row.label}</span><meter min={0} max={1} value={row.value} aria-label={`${row.label} base hull recovery`} /><b>{Math.round(row.value * 100)}%</b></div>)}
    </div>
    <small>Immobilised mechs can still fire and count toward elimination objectives. Those missions still require neutralising them.</small>
    <small>Hull condition odds before contract share. Recovery is never guaranteed; skirmishes keep no salvage.</small>
  </section>;
}
