import type { Catalog } from '../../schema/load';
import type { Design } from '../../schema/design';
import type { DesignReport } from '../../schema/designValidation';
import type { HeatProfile } from '../../sim/loadout';
import type { DropPayload } from './dropPayload';
import { MECH_LOCATION_NAMES } from './LocationCard';
import { WeaponGlyph } from './WeaponGlyph';

export function BayReadiness({ catalog, design, report, heat, onAmmo }: {
  catalog: Catalog; design: Design; report: DesignReport; heat: HeatProfile;
  onAmmo: (payload: DropPayload) => void;
}) {
  const { loadout } = report;
  const weapons = [...new Set(design.mounts.map((mount) => mount.weaponId))]
    .map((id) => catalog.weapons.get(id)).filter((weapon) => weapon !== undefined).filter((weapon) => weapon.ammoPerTon !== null);
  return <section className="bay-readiness" data-testid="bay-readiness" aria-label="Loadout readiness">
    <div className="bay-readiness__gauges">
      <div className={loadout.freeTonnage < 0 ? 'is-error' : ''}><span>Weight</span><strong>{loadout.usedWeight.toFixed(1)} / {loadout.tonnage}t</strong>
        <small>{loadout.freeTonnage < 0 ? `Remove ${(-loadout.freeTonnage).toFixed(1)}t before saving` : `${loadout.freeTonnage.toFixed(1)}t available`}</small></div>
      <div><span>Armour</span><strong>{loadout.armourPoints} points</strong><small>{loadout.armourWeight.toFixed(1)}t of protection</small></div>
      <div><span>Cooling / weapon heat</span><strong>{heat.dissipationPerSecond.toFixed(1)} / {heat.heatPerSecond.toFixed(1)} per second</strong>
        <small>{heat.sustainable ? 'Sustained fire is stable' : 'Weapons generate more heat than cooling removes'}</small></div>
      <div><span>Heat limit</span><strong>{heat.heatCapacity.toFixed(0)}</strong><small>Full salvo: {heat.alphaStrikeHeat.toFixed(1)} heat</small></div>
    </div>
    {report.issues.length === 0 ? <p className="bay-ready-message">Ready to save. Changes affect this draft until saved.</p> :
      <div className="bay-readiness__issues" role="status"><strong>{report.valid ? 'Advice for this loadout' : 'Before you can save'}</strong>
        <ul>{report.issues.map((issue, index) => <li key={index} className={issue.severity === 'error' ? 'is-error' : ''}>
          {issue.code === 'overweight' && loadout.freeTonnage < 0
            ? `Overweight by ${(-loadout.freeTonnage).toFixed(1)}t. Remove weapons, extra ammunition or cooling, or reduce armour.` : issue.message}
        </li>)}</ul></div>}
    {weapons.length === 0 ? null : <div className="bay-ammo-supply" data-testid="bay-ammo-supply">
      <header><strong>Ammunition supply</strong><span>Bins feed matching weapons anywhere on this mech. The first bin is fitted automatically.</span></header>
      {weapons.map((weapon) => {
        const bins = design.ammo.filter((bin) => bin.weaponId === weapon.id);
        const tons = bins.reduce((sum, bin) => sum + bin.tons, 0);
        return <div className="bay-ammo-supply__row" key={weapon.id} data-testid={`ammo-supply-${weapon.id}`}>
          <WeaponGlyph catalog={catalog} weapon={weapon} /><div><strong>{weapon.name}</strong>
            <span className={tons === 0 ? 'is-error' : ''}>{tons === 0 ? 'No ammunition fitted' : `${tons}t · ${tons * (weapon.ammoPerTon ?? 0)} rounds`}</span>
            <small>{bins.map((bin) => `${MECH_LOCATION_NAMES[bin.location]}: ${bin.tons}t`).join(' · ')}</small></div>
          <button type="button" onClick={() => onAmmo({ kind: 'ammo', id: weapon.id })} data-testid={`add-ammo-${weapon.id}`}>+ Add 1t</button>
        </div>;
      })}
    </div>}
  </section>;
}
