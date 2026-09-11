import type { Design } from '../../schema/design';
import { LOCATIONS } from '../../schema/common';
import type { Catalog } from '../../schema/load';
import { MECH_LOCATION_NAMES } from './LocationCard';
import { buildLocationOccupants } from './locationOccupants';
import { RackCapacity } from './RackCapacity';
import { SlotBoxes } from './SlotBoxes';
import { WeaponGlyph } from './WeaponGlyph';
import { formatWeaponNumber as number } from './weaponPresentation';
import { weaponFireProfile } from '../../sim/weaponModes';
import './loadoutMap.css';

/** Read-only companion to the bay: always derived from this exact fit. */
export function LoadoutMap({ catalog, design }: { catalog: Catalog; design: Design }) {
  const chassis = catalog.chassis.get(design.chassisId)!;
  return <div className="loadout-map" data-testid="loadout-map" data-design-id={design.id}>
    <p className="loadout-map__key">1 box = 1 fitting slot · W weapon · A ammunition · G equipment. Empty boxes are free.</p>
    <div className="loadout-map__locations">{LOCATIONS.map((location) => {
      const rack = chassis.hardpoints[location];
      const { occupants } = buildLocationOccupants(catalog, design, location, rack.size);
      const used = occupants.reduce((sum, part) => sum + part.slots, 0);
      return <section key={location} className="loadout-map__location" data-location={location} aria-label={MECH_LOCATION_NAMES[location]}>
        <header><strong>{MECH_LOCATION_NAMES[location]}</strong><span>{used}/{rack.slots} boxes</span>
          <RackCapacity capacity={rack.slots} occupants={occupants} /></header>
        {occupants.length === 0 ? <p className="loadout-map__empty">Unoccupied</p> : <ul>{occupants.map((part) => {
          const weapon = part.kind === 'weapon' ? catalog.weapons.get(part.id) : undefined;
          const profile = weapon === undefined ? null : weaponFireProfile(weapon, design.mounts[part.index]?.modeId);
          const ammoWeapon = part.kind === 'ammo' ? catalog.weapons.get(part.id) : undefined;
          const rounds = weapon?.ammoPerTon == null ? null : design.ammo
            .filter((bin) => bin.weaponId === weapon.id)
            .reduce((sum, bin) => sum + bin.tons * weapon.ammoPerTon!, 0);
          return <li key={part.key} className={`loadout-map__part tone-${part.tone}`} data-kind={part.kind} data-part-id={part.id}>
            <div className="loadout-map__art">{weapon === undefined ? <span>{part.kind === 'ammo' ? 'AMMO' : 'GEAR'}</span> :
              <WeaponGlyph catalog={catalog} weapon={weapon} />}<SlotBoxes count={part.slots} /></div>
            <div><strong>{part.label}</strong><span>{part.slots} {part.slots === 1 ? 'box' : 'boxes'}</span>
              {weapon === undefined || profile === null ? null : <>
                {profile.name === null ? null : <span>{profile.name} mode</span>}
                <span>{number(profile.damage * profile.projectiles / profile.cooldown)} damage/s · {weapon.range.long} m range · {number(profile.heat / profile.cooldown)} heat/s</span>
                <span className={rounds === 0 ? 'loadout-map__warning' : undefined}>{rounds === null
                  ? 'No ammunition required' : rounds === 0 ? 'Needs ammunition — no matching bin fitted' : `${number(rounds)} shared rounds on this mech`}</span>
              </>}
              {ammoWeapon === undefined ? null : <span>{number((ammoWeapon.ammoPerTon ?? 0) * design.ammo[part.index]!.tons)} rounds in this bin</span>}
            </div>
          </li>;
        })}</ul>}
      </section>;
    })}</div>
  </div>;
}
