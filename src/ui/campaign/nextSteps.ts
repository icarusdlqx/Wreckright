import type { Catalog } from '../../schema/load';
import { estimateRepair, repairQueue } from '../../campaign/repair';
import { availableXp, MAX_SKILL, SKILLS, skillCost } from '../../campaign/roster';
import { isMechAvailable, type CampaignState, type MechRecord } from '../../campaign/types';

export type NextStepTarget = 'contract' | 'bay' | 'roster' | 'store' | 'market';

export interface NextStep {
  id: string;
  tone: 'warn' | 'info';
  text: string;
  target: NextStepTarget;
}

const STEP_LIMIT = 5;

function credits(value: number): string {
  return `${Math.round(value).toLocaleString('en-GB')} C`;
}

function days(count: number): string {
  return `${count} day${count === 1 ? '' : 's'}`;
}

/**
 * What the company should look at next, in the order it matters.
 *
 * The first-contract guide switches itself off after one drop, which is the
 * moment the player first has a damaged machine, a wreck, salvage in stores
 * and four hires on offer. This is the same guidance, computed from the books
 * instead of a script, so it keeps pointing at the next decision for the
 * whole campaign.
 */
export function campaignNextSteps(
  catalog: Catalog,
  state: CampaignState,
  nameOf: (mech: MechRecord) => string,
): NextStep[] {
  const steps: NextStep[] = [];
  const queue = new Map(repairQueue(catalog, state).map((entry) => [entry.mechId, entry]));
  const deadline = state.contract?.deadlineDay ?? null;

  if (state.cbills < 0) {
    steps.push({
      id: 'debt',
      tone: 'warn',
      text: `The company is ${credits(-state.cbills)} in debt; interest accrues while the calendar moves.`,
      target: 'market',
    });
  }

  for (const mech of state.mechs) {
    const name = nameOf(mech);
    const booking = queue.get(mech.id);
    if (booking !== undefined && deadline !== null && mech.readyOnDay > deadline) {
      steps.push({
        id: `late-${mech.id}`,
        tone: 'warn',
        text: `${name} leaves the workshop on day ${mech.readyOnDay}, after the day ${deadline} deadline.`,
        target: 'bay',
      });
      continue;
    }
    if (booking !== undefined) continue;
    const estimate = estimateRepair(catalog, mech);
    if (mech.status === 'hulk') {
      steps.push({
        id: `wreck-${mech.id}`,
        tone: 'warn',
        text: `${name} is a wreck. Rebuild: ${credits(estimate.cost)}, ${days(estimate.days)}.`,
        target: 'bay',
      });
      continue;
    }
    if (!isMechAvailable(state, mech)) continue;
    if (estimate.days > 0) {
      steps.push({
        id: `repair-${mech.id}`,
        tone: 'warn',
        text: `${name} needs repair: ${credits(estimate.cost)}, ${days(estimate.days)}.`,
        target: 'bay',
      });
    } else if (mech.design.mounts.length === 0) {
      steps.push({
        id: `unarmed-${mech.id}`,
        tone: 'warn',
        text: `${name} has no weapon fitted and cannot drop.`,
        target: 'store',
      });
    }
  }

  const seated = new Set(state.pilots.map((pilot) => pilot.mechId).filter((id) => id !== null));
  const idleMech = state.mechs.find(
    (mech) => mech.status === 'ready' && isMechAvailable(state, mech) && !seated.has(mech.id),
  );
  const idlePilot = state.pilots.find((pilot) => !pilot.dead && pilot.mechId === null);
  if (idleMech !== undefined && idlePilot !== undefined) {
    steps.push({
      id: 'seat',
      tone: 'info',
      text: `${idlePilot.name} has no seat; ${nameOf(idleMech)} is empty.`,
      target: 'roster',
    });
  }

  if (state.store.length > 0) {
    const names = state.store.slice(0, 2).map((item) => {
      const record = item.kind === 'weapon' ? catalog.weapons.get(item.itemId) : catalog.equipment.get(item.itemId);
      return record?.name ?? item.itemId;
    });
    const more = state.store.length - names.length;
    steps.push({
      id: 'stores',
      tone: 'info',
      text: `In stores: ${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}. Fit them from the bay.`,
      target: 'store',
    });
  }

  const trainable = state.pilots.filter(
    (pilot) =>
      !pilot.dead &&
      SKILLS.some(
        (skill) => pilot[skill] < MAX_SKILL && availableXp(pilot) >= skillCost(catalog, pilot[skill]),
      ),
  );
  if (trainable.length > 0) {
    steps.push({
      id: 'train',
      tone: 'info',
      text: `${trainable.map((pilot) => pilot.name).join(', ')} can train a skill now.`,
      target: 'roster',
    });
  }

  if (state.contract === null && !state.finished) {
    steps.push({
      id: 'contract',
      tone: 'info',
      text: 'Choose the next contract on the map.',
      target: 'contract',
    });
  }

  return steps
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'warn' ? -1 : 1))
    .slice(0, STEP_LIMIT);
}
