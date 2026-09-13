import { MeshStandardMaterial } from 'three';
import type { Faction } from '../schema/faction';
import type { WeaponModel } from './weaponModelTypes';
import { boxInstances, weaponHousing } from './weaponGeometry';
import type { MechGeometryQuality } from './renderQuality';

/** The captured assembly keeps its finish; the receiving workshop supplies the adapter. */
export function addRefitHardware(
  weapon: WeaponModel,
  hostFaction: Faction,
  scale: number,
  quality: MechGeometryQuality,
): void {
  const nativeFaction = weapon.rig.nativeFaction;
  weapon.root.userData.hostFaction = hostFaction;
  weapon.root.userData.mixedRefit = nativeFaction !== hostFaction;
  if (nativeFaction === hostFaction) return;
  const fieldFit = hostFaction === 'linewrought';
  const material = new MeshStandardMaterial({
    color: fieldFit ? 0xb37b3c : 0x87aead,
    roughness: fieldFit ? 0.78 : 0.38,
    metalness: fieldFit ? 0.28 : 0.48,
  });
  const x = weapon.rig.breech.position.x + scale * 0.05;
  const adapter = weaponHousing('cross-faction-adapter',
    [scale * 0.16, scale * 0.3, scale * 0.34], [x, 0, 0], material, quality);
  adapter.userData.nativeFaction = hostFaction;
  weapon.root.add(adapter);
  if (quality === 'hero') {
    weapon.root.add(boxInstances(fieldFit ? 'field-adapter-clamps' : 'custody-adapter-locks', 4,
      [scale * 0.12, scale * 0.035, scale * 0.055],
      new MeshStandardMaterial({ color: 0x273b40, roughness: 0.6, metalness: 0.5 }),
      (index) => ({ x: x + scale * 0.045, y: (index < 2 ? -1 : 1) * scale * 0.16,
        z: (index % 2 === 0 ? -1 : 1) * scale * 0.11 })));
  }
}
