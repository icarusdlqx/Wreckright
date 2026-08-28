import { type MechEntity, type World } from './types';
import { currentHeatTier, effectiveDissipationPerSecond } from './heat';

interface GroupLoad {
  group: number;
  heatPerSecond: number;
  damagePerHeat: number;
  readyHeat: number;
}

/** What each weapon group costs to run flat out, and what it buys per point of heat. */
function groupLoads(world: World, mech: MechEntity): GroupLoad[] {
  const totals = new Map<number, { heat: number; damage: number; readyHeat: number }>();
  const decisionHorizon = world.rules.simulation.aiDecisionIntervalTicks * world.dt;

  for (const mount of mech.weapons) {
    if (mount.destroyed) continue;
    const weapon = world.catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) continue;
    const entry = totals.get(mount.group) ?? { heat: 0, damage: 0, readyHeat: 0 };
    entry.heat += weapon.heat / weapon.cooldown;
    entry.damage += (weapon.damage * weapon.projectiles) / weapon.cooldown;
    // The governor next runs on the following decision tick. Reserve the
    // entire spike of anything that can fire before then; average heat/second
    // alone lets slow, hot guns jump straight across the shutdown threshold.
    if (mount.cooldown <= decisionHorizon) entry.readyHeat += weapon.heat;
    totals.set(mount.group, entry);
  }

  return [...totals]
    .map(([group, total]) => ({
      group,
      heatPerSecond: total.heat,
      damagePerHeat: total.heat === 0 ? Number.POSITIVE_INFINITY : total.damage / total.heat,
      readyHeat: total.readyHeat,
    }))
    .sort((a, b) => (b.damagePerHeat === a.damagePerHeat
      ? a.group - b.group
      : b.damagePerHeat - a.damagePerHeat));
}

/**
 * Heat discipline is a dial, not a switch. Running hot, a pilot sheds the guns
 * that cost the most heat per point of damage and keeps firing the rest — going
 * fully dark to save four heat is how a duel outlives the mission clock.
 */
export function applyHeatGovernor(world: World, mech: MechEntity, targetNearlyDead: boolean): void {
  const rules = world.rules.ai.heat;
  const fraction = mech.heat / mech.heatCapacity;
  const currentTier = currentHeatTier(world, mech);
  const shutdownRisk = currentTier.shutdownChancePerSecond > 0 || currentTier.forcedShutdown;
  const loads = groupLoads(world, mech);
  const firstRiskTier = world.rules.heat.tiers.find(
    (tier) => tier.shutdownChancePerSecond > 0 || tier.forcedShutdown,
  );
  const riskHeat = (firstRiskTier?.fraction ?? 1) * mech.heatCapacity;
  const headroom = Math.max(0, riskHeat - mech.heat);
  const intendedReadyHeat = loads.reduce(
    (total, load) => total + (mech.groupIntent[load.group - 1] === true ? load.readyHeat : 0),
    0,
  );
  const fullVolleyRisksShutdown = intendedReadyHeat >= headroom && intendedReadyHeat > 0;

  // Finishing fire can spend the warm band, but voluntarily staying in a tier
  // that rolls shutdowns loses more fire than the extra volley can buy.
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

  // Between the two thresholds, leave the current selection alone: flipping guns
  // on and off every half second is worse than either choice.
  if (
    !mech.ai.coolingDown &&
    fraction < rules.holdFireFraction &&
    !shutdownRisk &&
    !fullVolleyRisksShutdown
  ) return;

  mech.ai.coolingDown = true;

  const budget = effectiveDissipationPerSecond(world, mech) * rules.sustainFactor;
  let spent = 0;
  let reserved = 0;

  for (let index = 0; index < mech.groupEnabled.length; index += 1) {
    mech.groupEnabled[index] = false;
  }

  for (const load of loads) {
    // Never fire a group the pilot switched off, whatever the heat budget allows.
    if (mech.groupIntent[load.group - 1] !== true) continue;
    if (spent + load.heatPerSecond > budget) continue;
    if (load.readyHeat > 0 && reserved + load.readyHeat >= headroom) continue;
    spent += load.heatPerSecond;
    reserved += load.readyHeat;
    mech.groupEnabled[load.group - 1] = true;
  }
}

/** Hands the guns back to the pilot's last order. */
export function restoreIntent(mech: MechEntity): void {
  for (let index = 0; index < mech.groupEnabled.length; index += 1) {
    mech.groupEnabled[index] = mech.groupIntent[index] === true;
  }
}
