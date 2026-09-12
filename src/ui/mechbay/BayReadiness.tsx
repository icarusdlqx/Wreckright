import type { Catalog } from '../../schema/load';
import type { Design } from '../../schema/design';
import type { DesignReport } from '../../schema/designValidation';
import type { HeatProfile } from '../../sim/loadout';
import type { DropPayload } from './dropPayload';
import { MECH_LOCATION_NAMES } from './LocationCard';
import { WeaponGlyph } from './WeaponGlyph';
import { CapacityOverview } from './CapacityOverview';
import { designArmourLocations } from './armourWorkbenchModel';

export function BayReadiness({ catalog, design, report, heat, onAmmo }: {
  catalog: Catalog; design: Design; report: DesignReport; heat: HeatProfile;
  onAmmo: (payload: DropPayload) => void;
}) {
  const { loadout } = report;
  const chassis = catalog.chassis.get(design.chassisId)!;
  const armourMaximum = designArmourLocations(catalog, design).reduce((sum, location) => sum + chassis.armourMax[location], 0);
  const weapons = [...new Set(design.mounts.map((mount) => mount.weaponId))]
    .map((id) => catalog.weapons.get(id)).filter((weapon) => weapon !== undefined).filter((weapon) => weapon.ammoPerTon !== null);
  return <section className="bay-readiness" data-testid="bay-readiness" aria-label="Loadout readiness">
    <CapacityOverview chassis={chassis} loadout={loadout} heat={heat} armourMaximum={armourMaximum} />
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
