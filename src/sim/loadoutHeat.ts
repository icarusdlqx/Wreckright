import type { Design } from '../schema/design';
import type { Catalog } from '../schema/load';

export interface HeatProfile {
  alphaStrikeHeat: number;
  heatPerSecond: number;
  dissipationPerSecond: number;
  netHeatPerSecond: number;
  heatCapacity: number;
  sustainableFraction: number;
  shutdownRiskFraction: number;
  secondsToShutdownRisk: number | null;
  secondsToForcedShutdown: number | null;
  sustainable: boolean;
  alphaSafe: boolean;
}

export function computeHeatProfile(catalog: Catalog, design: Design): HeatProfile {
  const rules = catalog.rules.heat;
  const sink = catalog.equipment.get(design.heatSinkId);
  const dissipationPerSink = sink?.stats.dissipation ?? 1;

  let alphaStrikeHeat = 0;
  let heatPerSecond = 0;

  for (const mount of design.mounts) {
    const weapon = catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) continue;
    alphaStrikeHeat += weapon.heat;
    heatPerSecond += weapon.heat / weapon.cooldown;
  }

  const dissipationPerSecond =
    design.heatSinks * dissipationPerSink * rules.dissipationPerSinkPerSecond;
  const heatCapacity = rules.capacityBase + rules.capacityPerSink * design.heatSinks;
  const netHeatPerSecond = heatPerSecond - dissipationPerSecond;

  // The sim starts rolling shutdown checks at the first risky tier, not at 100%.
  const riskTier = rules.tiers.find(
    (tier) => tier.forcedShutdown || tier.shutdownChancePerSecond > 0,
  );
  const shutdownRiskFraction = riskTier?.fraction ?? 1;

  // An alpha strike lands before any dissipation, so the climb starts from there.
  const secondsToReach = (fraction: number): number | null => {
    const threshold = fraction * heatCapacity;
    if (alphaStrikeHeat >= threshold) return 0;
    if (netHeatPerSecond <= 0) return null;
    return (threshold - alphaStrikeHeat) / netHeatPerSecond;
  };

  return {
    alphaStrikeHeat,
    heatPerSecond,
    dissipationPerSecond,
    netHeatPerSecond,
    heatCapacity,
    sustainableFraction: heatPerSecond === 0 ? 1 : Math.min(1, dissipationPerSecond / heatPerSecond),
    shutdownRiskFraction,
    secondsToShutdownRisk: secondsToReach(shutdownRiskFraction),
    secondsToForcedShutdown: secondsToReach(1),
    sustainable: netHeatPerSecond <= 0,
    alphaSafe: alphaStrikeHeat < shutdownRiskFraction * heatCapacity,
  };
}
