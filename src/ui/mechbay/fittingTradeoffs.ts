import type { Design } from '../../schema/design';
import type { Faction } from '../../schema/faction';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { formatWeaponNumber } from './weaponPresentation';

export interface WeaponFittingTradeoffs {
  source: string;
  integration: string;
  operation: string;
}

/** A captured gun keeps its physical requirements and performance on either root. */
export function weaponFittingTradeoffs(
  catalog: Catalog,
  weapon: Weapon,
  chassisFaction?: Faction,
  heatSinkId?: string,
): WeaponFittingTradeoffs {
  const market = catalog.rules.economy.market.availableFactions.includes(weapon.faction);
  const source = market
    ? 'Replacement weapons: salvage or the Yard, when stocked.'
    : 'Replacement weapons: salvage only; the Yard cannot supply this technology.';
  const foreign = chassisFaction !== undefined && chassisFaction !== weapon.faction;
  const integration = !foreign
    ? `Uses a ${weapon.type} mount and ${weapon.slots} box${weapon.slots === 1 ? '' : 'es'} on either faction's mech.`
    : weapon.faction === 'aurelian'
      ? 'Captured Aurelian technology: keep its full performance, but reserve an energy mount and enough cooling on this Linewrought mech.'
      : weapon.ammoPerTon === null
        ? 'Linewrought refit: uses a compatible energy mount; this flamer heats the target and still adds heat to your mech.'
        : `Linewrought refit: keep its full performance, but reserve a ${weapon.type} mount and extra boxes and tonnage for ammunition on this Aurelian mech.`;
  const heat = weapon.heat / weapon.cooldown;
  const sink = heatSinkId === undefined ? undefined : catalog.equipment.get(heatSinkId);
  const dissipation = sink?.category === 'heat_sink'
    ? (sink.stats.dissipation ?? 1) * catalog.rules.heat.dissipationPerSinkPerSecond
    : 0;
  const cooling = dissipation > 0
    ? `; about ${formatWeaponNumber(heat / dissipation, 1)} fitted sinks' cooling at continuous fire`
    : '';
  const operation = weapon.ammoPerTon === null
    ? `${formatWeaponNumber(heat)} heat/s${cooling}. ${weapon.visual.style === 'flame' ? 'No separate fuel bin is tracked.' : 'No ammunition bin needed; sustained fire can overheat the mech.'}`
    : `${formatWeaponNumber(heat)} heat/s. Each ammo ton adds ${catalog.rules.construction.ammoSlotsPerTon} box${catalog.rules.construction.ammoSlotsPerTon === 1 ? '' : 'es'}, lasts ${formatWeaponNumber(weapon.ammoPerTon * weapon.cooldown)}s at full cycle, and can detonate if breached.`;
  return { source, integration, operation };
}

export interface WeaponConfiguration {
  label: string;
  summary: string;
  nativeWeapons: number;
  foreignWeapons: number;
}

/** The weapons actually mounted decide the label, including player-made refits. */
export function weaponConfiguration(catalog: Catalog, design: Design): WeaponConfiguration | null {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return null;
  let nativeWeapons = 0;
  let foreignWeapons = 0;
  for (const mount of design.mounts) {
    const weapon = catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) continue;
    if (weapon.faction === chassis.faction) nativeWeapons += 1;
    else foreignWeapons += 1;
  }
  const mixed = foreignWeapons > 0;
  return {
    label: mixed ? 'Mixed refit' : chassis.faction === 'aurelian' ? 'Aurelian armament' : 'Linewrought armament',
    summary: mixed
      ? chassis.faction === 'aurelian'
        ? 'Aurelian technology with workshop weapons: more supply options, with mount and ammunition tradeoffs.'
        : 'Workshop weapons with recovered Aurelian technology: compact firepower, with cooling and replacement tradeoffs.'
      : chassis.faction === 'aurelian'
        ? 'Compact energy weapons and advanced emitters; manage heat and recover replacements.'
        : 'Practical workshop weapons; protect the ammunition and keep the supply line open.',
    nativeWeapons,
    foreignWeapons,
  };
}
