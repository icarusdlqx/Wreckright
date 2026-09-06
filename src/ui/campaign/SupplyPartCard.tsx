import type { ReactNode } from 'react';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { weaponSize, weaponSizeLabel } from '../../sim/loadout';
import type { DropPayload } from '../mechbay/dropPayload';
import { payloadFootprint, payloadName, SlotBoxes } from '../mechbay/SlotBoxes';
import { WeaponGlyph } from '../mechbay/WeaponGlyph';
import { factionPresentation, formatWeaponNumber } from '../mechbay/weaponPresentation';
import { companyMachineLabel } from './companyLabels';
import { ownedPartFits } from './supplyPresentation';
import './supplyCards.css';

export function SupplyPartCard({ catalog, state, part, count, children }: {
  catalog: Catalog;
  state: CampaignState;
  part: DropPayload;
  count?: number;
  children?: ReactNode;
}) {
  const weapon = part.kind === 'weapon' ? catalog.weapons.get(part.id) : undefined;
  const gear = part.kind === 'equipment' ? catalog.equipment.get(part.id) : undefined;
  const footprint = payloadFootprint(catalog, part);
  const candidates = ownedPartFits(catalog, state, part, count === undefined);
  const fits = candidates.filter(({ fit }) => fit.ok);
  const origin = weapon?.faction ?? gear?.faction;
  return <article className="supply-part-card" data-testid={`supply-part-${part.id}`}>
    <header>{weapon === undefined ? <span className="supply-gear-icon" aria-hidden="true">⚙</span> : <WeaponGlyph catalog={catalog} weapon={weapon} />}
      <div><strong>{payloadName(catalog, part)}</strong><small>{origin === undefined ? '' : factionPresentation(origin).label}</small></div>
      {count === undefined ? null : <span className="supply-part-count">× {count}</span>}
    </header>
    <div className="supply-footprint"><SlotBoxes count={footprint} /><strong>{footprint} box{footprint === 1 ? '' : 'es'}</strong>
      <span>{formatWeaponNumber(weapon?.tonnage ?? gear?.tonnage ?? 0)}t</span></div>
    <p>{weapon === undefined ? gear?.category.replaceAll('_', ' ') : `${weaponSizeLabel(catalog, weaponSize(catalog, weapon))} ${weapon.type} mount · ${formatWeaponNumber(weapon.heat)} heat / shot`}</p>
    <p>{weapon === undefined
      ? gear?.category === 'heat_sink' ? 'Change sink type or quantity in Armour & cooling.' : 'Fits a free equipment space; review the whole loadout before saving.'
      : weapon.ammoPerTon === null ? 'No ammunition bin · uses mech cooling.' : `Ammunition bin required · ${weapon.ammoPerTon} rounds / ton. Workshop supplies bins.`}</p>
    <p className="supply-compatible" data-testid={`supply-fits-${part.id}`}>{fits.length === 0 ? 'No owned machine can fit this part in its current loadout.'
      : `Owned fits: ${fits.map(({ mech, fit }) => `${companyMachineLabel(catalog, mech)}${fit.replacementOnly ? ' (replace)' : ''}`).join(' · ')}`}</p>
    {candidates.some(({ fit }) => !fit.ok) ? <details className="supply-fit-detail"><summary>Compatibility details</summary>
      {candidates.map(({ mech, fit }) => <p key={mech.id}><strong>{companyMachineLabel(catalog, mech)}</strong>: {fit.ok ? fit.replacementOnly ? 'Replacement available.' : 'Fits.' : fit.reason}</p>)}
    </details> : null}
    {children}
  </article>;
}
