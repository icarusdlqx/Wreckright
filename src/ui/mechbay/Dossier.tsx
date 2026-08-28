import type { Faction } from '../../schema/faction';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { weaponSize, weaponSizeLabel } from '../../sim/loadout';
import { equipmentEffectLines } from './equipmentPresentation';
import {
  foreignComponentPresentation,
  machineCulturePresentation,
} from './machineCulturePresentation';
import { FireModeComparison } from './FireModeComparison';
import { RangeBandStrip } from './RangeBandStrip';
import { WeaponGlyph } from './WeaponGlyph';
import { WeaponMeters } from './WeaponMeters';
import {
  weaponCostLine,
  weaponOperatingLine,
  weaponTraitLines,
} from './weaponPresentation';

export interface Inspected {
  kind: 'weapon' | 'ammo' | 'equipment';
  id: string;
}

export interface InspectorFit {
  ok: boolean;
  reason: string | null;
}

/** Heat one sink carries away per second, given the sink the design is using. */
function dissipationPerSink(catalog: Catalog, heatSinkId: string): number {
  const sink = catalog.equipment.get(heatSinkId);
  return (sink?.stats.dissipation ?? 1) * catalog.rules.heat.dissipationPerSinkPerSecond;
}

function round(value: number, places = 1): string {
  return value.toFixed(places).replace(/\.0$/, '');
}

function FitStatus({ fit }: { fit: InspectorFit | null }) {
  if (fit === null) return null;
  return (
    <div
      className={`dossier-fit ${fit.ok ? 'is-fit' : 'is-blocked'}`}
      data-testid="dossier-fit"
      role="note"
    >
      <strong>{fit.ok ? 'Fit' : "Doesn't fit"}</strong>
      <span>{fit.reason ?? 'Ready to place.'}</span>
    </div>
  );
}

function CultureLine({
  faction,
  chassisFaction,
}: {
  faction: Faction;
  chassisFaction: Faction | undefined;
}) {
  const culture = machineCulturePresentation(faction);
  const foreign =
    chassisFaction === undefined
      ? null
      : foreignComponentPresentation(faction, chassisFaction);
  return (
    <span className="dossier-culture">
      <span>{culture.originLabel}</span>
      {foreign === null ? null : <span title={foreign.note}>{foreign.badge}</span>}
    </span>
  );
}

/**
 * The card that explains a piece of kit: what it does, what it costs to run,
 * and how long it lasts. Nearly all of it is derived from the same numbers the
 * simulation uses, so it cannot drift away from what the weapon actually does
 * on the field.
 */
export function Dossier({
  catalog,
  inspected,
  heatSinkId,
  mountedWeapons = [],
  chassisFaction,
  fit = null,
}: {
  catalog: Catalog;
  inspected: Inspected | null;
  heatSinkId: string;
  mountedWeapons?: readonly Weapon[];
  chassisFaction?: Faction;
  fit?: InspectorFit | null;
}) {
  if (inspected === null) {
    return (
      <aside
        id="bay-shelf-inspector"
        className="bay-dossier-card bay-catalog-inspector empty"
        data-testid="bay-dossier-card"
        aria-label="Selected item details"
      >
        <p>Select a weapon, ammo bin, or equipment item.</p>
      </aside>
    );
  }

  if (inspected.kind === 'equipment') {
    const gear = catalog.equipment.get(inspected.id);
    if (gear === undefined) return null;
    return (
      <aside
        id="bay-shelf-inspector"
        className="bay-dossier-card bay-catalog-inspector"
        data-testid="bay-dossier-card"
        data-inspected-kind="equipment"
        aria-label={`Selected item details: ${gear.name}`}
      >
        <h4>{gear.name}</h4>
        <p className="dossier-line">
          {gear.category.replace('_', ' ')} · {gear.tonnage}t · {gear.slots} slot
          {gear.slots === 1 ? '' : 's'}
        </p>
        <CultureLine faction={gear.faction} chassisFaction={chassisFaction} />
        <FitStatus fit={fit} />
        <ul className="dossier-effects">
          {equipmentEffectLines(catalog, gear).map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
      </aside>
    );
  }

  const weapon = catalog.weapons.get(inspected.id);
  if (weapon === undefined) return null;

  if (inspected.kind === 'ammo') {
    const rounds = weapon.ammoPerTon ?? 0;
    const endurance = rounds * weapon.cooldown;
    const ammoSlots = catalog.rules.construction.ammoSlotsPerTon;
    return (
      <aside
        id="bay-shelf-inspector"
        className="bay-dossier-card bay-catalog-inspector"
        data-testid="bay-dossier-card"
        data-inspected-kind="ammo"
        aria-label={`Selected item details: ${weapon.name} ammunition`}
      >
        <h4>{weapon.name} ammunition</h4>
        <p className="dossier-line">
          1 ton · {rounds} rounds · {ammoSlots} slot{ammoSlots === 1 ? '' : 's'}
        </p>
        <CultureLine faction={weapon.faction} chassisFaction={chassisFaction} />
        <FitStatus fit={fit} />
        <p className="dossier-note">
          Feeds {weapon.name}; one ton lasts about {round(endurance)}s at full cycle.
        </p>
      </aside>
    );
  }

  const volley = weapon.damage * weapon.projectiles;
  const perSecond = volley / weapon.cooldown;
  const heatPerSecond = weapon.heat / weapon.cooldown;
  const sinks = Math.ceil(heatPerSecond / dissipationPerSink(catalog, heatSinkId));
  const traits = weaponTraitLines(catalog, weapon);
  // A ton of ammunition, spent as fast as the weapon will fire it.
  const seconds = weapon.ammoPerTon === null ? null : weapon.ammoPerTon * weapon.cooldown;

  return (
    <aside
      id="bay-shelf-inspector"
      className="bay-dossier-card bay-catalog-inspector"
      data-testid="bay-dossier-card"
      data-inspected-kind="weapon"
      aria-label={`Selected item details: ${weapon.name}`}
    >
      <div className="dossier-weapon-heading">
        <WeaponGlyph catalog={catalog} weapon={weapon} />
        <h4>{weapon.name}</h4>
      </div>
      <p className="dossier-line">
        {weaponSizeLabel(catalog, weaponSize(catalog, weapon))} {weapon.type} · {weapon.tonnage}t ·{' '}
        {weapon.slots} slot{weapon.slots === 1 ? '' : 's'}
      </p>
      <CultureLine faction={weapon.faction} chassisFaction={chassisFaction} />
      <FitStatus fit={fit} />
      <WeaponMeters catalog={catalog} weapon={weapon} />

      <dl className="dossier-stats">
        <div>
          <dt>Firepower</dt>
          <dd>
            {round(volley)} a volley
            {weapon.projectiles > 1 ? ` (${weapon.projectiles} × ${round(weapon.damage)})` : ''} ·{' '}
            {round(perSecond)}/s
          </dd>
        </div>
        <div>
          <dt>Heat</dt>
          <dd className={sinks >= 6 ? 'hot' : undefined}>
            {round(weapon.heat)} a shot · {round(heatPerSecond, 2)}/s ·{' '}
            {sinks === 0 ? 'no sinks needed' : `${sinks} sink${sinks === 1 ? '' : 's'} to hold it`}
          </dd>
        </div>
        <div>
          <dt>Ammunition</dt>
          <dd>
            {weapon.ammoPerTon === null
              ? weapon.visual.style === 'flame'
                ? 'No separate fuel bin is tracked'
                : 'None — no ammunition bin required'
              : `${weapon.ammoPerTon} rounds a ton · about ${Math.round((seconds ?? 0) / 6) * 6}s of firing`}
          </dd>
        </div>
        <div>
          <dt>Reach</dt>
          <dd>
            {weapon.range.short}m short · {weapon.range.medium}m medium · {weapon.range.long}m long
            {weapon.range.min > 0
              ? ` · ${Math.round(catalog.rules.combat.minimumRangeFactor * 100)}% accuracy inside ${weapon.range.min}m`
              : ''}
          </dd>
        </div>
      </dl>

      <FireModeComparison weapon={weapon} />
      <RangeBandStrip catalog={catalog} weapon={weapon} mountedWeapons={mountedWeapons} />
      {traits.length === 0 ? null : (
        <ul className="dossier-traits">
          {traits.map((trait) => <li key={trait}>{trait}</li>)}
        </ul>
      )}
      <p className="dossier-note">{weapon.summary}</p>
      <p className="dossier-cost">{weaponCostLine(weapon)}</p>
      <p className="dossier-bargain">{weaponOperatingLine(weapon)}</p>
    </aside>
  );
}
