import { describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { applyHeatGovernor, restoreIntent } from './governor';
import { isHoldingFire, setGroupEnabled, setHoldFire } from './orders';
import type { MechEntity, World } from './types';

function readyHeat(world: World, mech: MechEntity, enabledOnly: boolean): number {
  return mech.weapons.reduce((total, mount) => {
    if (enabledOnly && mech.groupEnabled[mount.group - 1] !== true) return total;
    return total + (world.catalog.weapons.get(mount.weaponId)?.heat ?? 0);
  }, 0);
}

function configureHeadroom(world: World, mech: MechEntity): number {
  for (const mount of mech.weapons) mount.cooldown = 0;
  const firstRiskTier = world.rules.heat.tiers.find(
    (tier) => tier.shutdownChancePerSecond > 0 || tier.forcedShutdown,
  );
  if (firstRiskTier === undefined) throw new Error('heat rules need a shutdown-risk tier');
  const riskHeat = firstRiskTier.fraction * mech.heatCapacity;
  mech.heat = riskHeat - readyHeat(world, mech, false) / 2;
  return riskHeat;
}

describe('pilot intent versus the reactor governor', () => {
  it('does not report a throttled mech as holding fire', () => {
    const world = playerWorld('intent');
    const mech = unitOf(world, 'sentinel_brawler');

    mech.heat = mech.heatCapacity * 0.95;
    applyHeatGovernor(world, mech, false);

    expect(mech.groupEnabled.some((enabled) => !enabled)).toBe(true);
    // The governor shedding guns is not the pilot ordering weapons cold, and a
    // control that confuses the two inverts itself exactly when it is needed.
    expect(isHoldingFire(mech)).toBe(false);
  });

  it('holds fire on command however hot the mech is', () => {
    const world = playerWorld('intent-hot');
    const mech = unitOf(world, 'sentinel_brawler');

    mech.heat = mech.heatCapacity * 0.95;
    applyHeatGovernor(world, mech, false);
    setHoldFire(mech, !isHoldingFire(mech));

    expect(isHoldingFire(mech)).toBe(true);
    expect(mech.groupIntent.every((enabled) => !enabled)).toBe(true);
    expect(mech.groupEnabled.every((enabled) => !enabled)).toBe(true);
  });

  it('gives the pilot back exactly what they asked for when safety is switched off', () => {
    const world = playerWorld('intent-restore');
    const mech = unitOf(world, 'sentinel_brawler');

    setGroupEnabled(mech, 2, false);
    mech.heat = mech.heatCapacity * 0.95;
    applyHeatGovernor(world, mech, false);
    restoreIntent(mech);

    expect(mech.groupEnabled[1]).toBe(false);
    expect(mech.groupEnabled[0]).toBe(true);
  });

  it('does not spend a finishing volley while already rolling shutdown risk', () => {
    const world = playerWorld('finisher-heat-risk');
    const mech = unitOf(world, 'sentinel_brawler');

    mech.heat = mech.heatCapacity * 0.9;
    applyHeatGovernor(world, mech, true);

    expect(mech.ai.coolingDown).toBe(true);
    expect(mech.groupEnabled.some((enabled) => !enabled)).toBe(true);
  });

  it('reserves rules-derived headroom for every gun ready before the next decision', () => {
    const world = playerWorld('finisher-volley-headroom');
    const mech = unitOf(world, 'sentinel_brawler');
    const riskHeat = configureHeadroom(world, mech);

    applyHeatGovernor(world, mech, true);

    expect(mech.heat + readyHeat(world, mech, true)).toBeLessThan(riskHeat);
    expect(mech.groupEnabled.some((enabled) => !enabled)).toBe(true);

    const replayWorld = playerWorld('finisher-volley-headroom');
    const replay = unitOf(replayWorld, 'sentinel_brawler');
    configureHeadroom(replayWorld, replay);
    applyHeatGovernor(replayWorld, replay, true);
    expect(replay.groupEnabled).toEqual(mech.groupEnabled);
  });
});
