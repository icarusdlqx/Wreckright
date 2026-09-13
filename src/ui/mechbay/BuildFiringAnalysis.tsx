import type { Catalog } from '../../schema/load';
import type { Design } from '../../schema/design';
import { RangeDamageChart } from './RangeDamageChart';
import { mountedWeaponProfiles } from './rangeDamageChartModel';

/** Detailed comparison stays with the whole build, leaving the shelf for fitting. */
export function BuildFiringAnalysis({ catalog, design, weaponId }: { catalog: Catalog; design: Design; weaponId?: string }) {
  const weapon = catalog.weapons.get(weaponId ?? design.mounts[0]?.weaponId ?? '');
  if (weapon === undefined) return null;
  return <section className="build-firing-analysis" data-testid="build-firing-analysis">
    <h3>{weapon.name} · firing analysis</h3>
    <RangeDamageChart catalog={catalog} weapon={weapon} mountedWeapons={mountedWeaponProfiles(catalog, design.mounts)} />
  </section>;
}
