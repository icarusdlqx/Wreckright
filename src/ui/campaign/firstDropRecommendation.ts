import { deploymentPlan, type DeploymentPlan } from '../../campaign/deployment';
import { campaignOutcomeCount } from '../../campaign/history';
import { autoFillDeployment } from '../../campaign/lancePresets';
import { mechIntegrity } from '../../campaign/integrity';
import type { CampaignState } from '../../campaign/types';
import { DesignSchema, type Design } from '../../schema/design';
import { validateDesign } from '../../schema/designValidation';
import type { Catalog } from '../../schema/load';
import { machineDisplayName } from '../designLabel';

export interface RecommendedDrop {
  state: CampaignState;
  plan: DeploymentPlan;
  issues: string[];
  allPrime: boolean;
}

export function offersFirstDropOverview(state: CampaignState): boolean {
  return !state.finished && state.contract !== null && campaignOutcomeCount(state) === 0;
}

/** Old saves can retain a stock id after editing, so the id alone cannot promise a Prime build. */
export function isPrimeEquipment(catalog: Catalog, design: Design): boolean {
  const prime = catalog.designs.get(design.id);
  if (prime === undefined) return false;
  const parsed = DesignSchema.safeParse({ ...design, name: prime.name });
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(DesignSchema.parse(prime));
}

/** Preview and launch use the same ordinary roster selection, without changing owned equipment. */
export function recommendedFirstDrop(catalog: Catalog, state: CampaignState): RecommendedDrop | null {
  if (!offersFirstDropOverview(state) || state.contract === null) return null;
  const prepared = structuredClone(state);
  autoFillDeployment(catalog, prepared, state.contract.missionId);
  const plan = deploymentPlan(catalog, prepared, state.contract.missionId);
  const issues = [...plan.issues];
  for (const { mech } of plan.pairs) {
    if (mechIntegrity(catalog, mech).fraction < 1) issues.push(`${machineDisplayName(catalog, mech.design)} needs repairs before using the recommended team. Open Customise team to repair it.`);
    for (const issue of validateDesign(catalog, mech.design).issues) {
      if (issue.severity === 'error') issues.push(`${machineDisplayName(catalog, mech.design)}: ${issue.message}`);
    }
  }
  return { state: prepared, plan, issues,
    allPrime: plan.pairs.length > 0 && plan.pairs.every(({ mech }) => isPrimeEquipment(catalog, mech.design)) };
}
