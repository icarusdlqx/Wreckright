import { findAmmoBin, type MechEntity, type WeaponMount, type World } from './types';
import { currentHeatTier } from './heat';
import { weaponFireProfile } from './weaponModes';

interface MountLoad {
  mount: WeaponMount;
  heatPerSecond: number;
  damagePerHeat: number;
  readyHeat: number;
}

/** Reserve individual spikes: one hot group must never silence every emitter in it. */
function mountLoads(world: World, mech: MechEntity): MountLoad[] {
  const decisionHorizon = world.rules.simulation.aiDecisionIntervalTicks * world.dt;
  const loads: MountLoad[] = [];
  for (const mount of mech.weapons) {
    if (mount.destroyed || mech.groupIntent[mount.group - 1] !== true) continue;
    const weapon = world.catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) continue;
    if (weapon.ammoPerTon !== null && findAmmoBin(mech, weapon.id) === null) continue;
    const profile = weaponFireProfile(weapon, mount.modeId);
    loads.push({
      mount,
      heatPerSecond: profile.heat / profile.cooldown,
      damagePerHeat: profile.heat === 0 ? Number.POSITIVE_INFINITY
        : profile.damage * profile.projectiles / profile.heat,
      readyHeat: mount.cooldown <= decisionHorizon ? profile.heat : 0,
    });
  }
  // Readiness age prevents a cheap, fast secondary from perpetually taking the
  // budget ahead of the main gun. The stable mount index breaks exact ties.
  return loads.sort((a, b) =>
    (b.mount.governorWaitTicks ?? 0) - (a.mount.governorWaitTicks ?? 0) ||
    (b.damagePerHeat === a.damagePerHeat ? 0 : b.damagePerHeat - a.damagePerHeat) ||
    a.mount.index - b.mount.index,
  );
}

/** Heat safety schedules a safe partial volley without changing the pilot's groups. */
export function applyHeatGovernor(world: World, mech: MechEntity, targetNearlyDead: boolean): void {
  const rules = world.rules.ai.heat;
  const fraction = mech.heat / mech.heatCapacity;
  const currentTier = currentHeatTier(world, mech);
  const shutdownRisk = currentTier.shutdownChancePerSecond > 0 || currentTier.forcedShutdown;
  const loads = mountLoads(world, mech);
  const firstRiskTier = world.rules.heat.tiers.find(
    (tier) => tier.shutdownChancePerSecond > 0 || tier.forcedShutdown,
  );
  const riskHeat = (firstRiskTier?.fraction ?? 1) * mech.heatCapacity;
  const headroom = Math.max(0, riskHeat - mech.heat);
  const intendedReadyHeat = loads.reduce((total, load) => total + load.readyHeat, 0);
  const fullVolleyRisksShutdown = intendedReadyHeat >= headroom && intendedReadyHeat > 0;

  if (targetNearlyDead && fraction < 1 && !shutdownRisk && !fullVolleyRisksShutdown) {
    restoreIntent(mech);
    mech.ai.coolingDown = false;
    return;
  }
  if (fraction <= rules.resumeFraction && !fullVolleyRisksShutdown) {
    mech.ai.coolingDown = false;
    restoreIntent(mech);
    return;
  }
  if (!mech.ai.coolingDown && fraction < rules.holdFireFraction &&
      !shutdownRisk && !fullVolleyRisksShutdown) return;

  mech.ai.coolingDown = true;
  const budget = mech.dissipationPerSecond *
    world.atmosphere.mechanics.heatDissipationFactor * rules.sustainFactor;
  let spent = 0;
  let reserved = 0;
  for (let index = 0; index < mech.groupEnabled.length; index += 1) {
    mech.groupEnabled[index] = false;
  }
  for (const mount of mech.weapons) mount.governorBlocked = true;

  for (const load of loads) {
    const ready = load.readyHeat > 0;
    const unsafe = ready && reserved + load.readyHeat >= headroom;
    // Cooling weapons spend no new heat before the next decision. Count only
    // ready guns, otherwise the first admitted emitter monopolises the budget
    // even while it cannot fire. One safe solo shot may exceed average cooling:
    // its cooldown and the next headroom check enforce the real thermal cost.
    const overBudget = ready && spent > 0 && spent + load.heatPerSecond > budget;
    if (unsafe || overBudget) {
      if (ready) load.mount.governorWaitTicks = (load.mount.governorWaitTicks ?? 0) + 1;
      continue;
    }
    load.mount.governorBlocked = false;
    load.mount.governorWaitTicks = 0;
    mech.groupEnabled[load.mount.group - 1] = true;
    if (ready) {
      spent += load.heatPerSecond;
      reserved += load.readyHeat;
    }
  }
}

/** Hands the guns back to the pilot's last order, including any throttled mount. */
export function restoreIntent(mech: MechEntity): void {
  for (let index = 0; index < mech.groupEnabled.length; index += 1) {
    mech.groupEnabled[index] = mech.groupIntent[index] === true;
  }
  for (const mount of mech.weapons) {
    mount.governorBlocked = false;
    mount.governorWaitTicks = 0;
  }
}
