import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { validateDesign } from '../schema/designValidation';
import { issueMove, setPosture } from '../sim/orders';
import { createWorld, stepWorld, toResult } from '../sim/world';
import { setName } from '../ui/mechbay/editor';
import { acceptContract, resolveMission, runMission, startCampaign } from './campaign';
import { deploymentPlan, prepareDeployment } from './deployment';
import { earnedCampaignRewards } from './missionRewards';
import { applyRefit } from './refit';
import { estimateRepair, startRepair } from './repair';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { isPilotAvailable, storeCount } from './types';

const OPENINGS = [
  { campaignId: 'border_dispute', first: 'militia_raid', second: 'recovery_window',
    rewardId: 'marker_eleven_optic', itemId: 'er_medium_laser', source: 'hornet_spotter',
    oldWeapon: 'flamer', variant: 'Lamplighter' },
  { campaignId: 'aurelian_recall', first: 'first_warrant', second: 'cutbank_attestation',
    rewardId: 'apron_seven_optic', itemId: 'er_large_laser', source: 'halberd_prime',
    oldWeapon: 'large_laser', variant: 'Long Watch' },
] as const;

describe('the first earned weapon becomes a useful company refit', () => {
  it.each(OPENINGS)('$campaignId earns, fits, names, saves and uses its recovered optic', { timeout: 60_000 }, (opening) => {
    const state = startCampaign(catalog, opening.campaignId, `opening-equipment:${opening.campaignId}`);
    // The earned part must support this loop without borrowing the demo crate.
    state.store = [];
    expect(acceptContract(catalog, state, opening.first, 'standard').ok).toBe(true);
    const first = runMission(catalog, state);
    expect(first.outcome.won).toBe(true);
    const receipt = first.outcome.campaignRewards?.find((reward) => reward.id.endsWith(`/${opening.rewardId}`));
    expect(receipt?.items).toEqual([{ kind: 'weapon', itemId: opening.itemId, count: 1 }]);
    expect(storeCount(state, 'weapon', opening.itemId)).toBe(1);
    expect(first.outcome.salvagedItems.some((part) => part.itemId === opening.itemId)).toBe(false);

    const mech = state.mechs.find((candidate) => candidate.design.id === opening.source && candidate.status !== 'hulk')!;
    const next = setName(mech.design, opening.variant);
    const mount = next.mounts.find((candidate) => candidate.weaponId === opening.oldWeapon)!;
    const old = catalog.weapons.get(opening.oldWeapon)!;
    const recovered = catalog.weapons.get(opening.itemId)!;
    expect(recovered.tonnage).toBe(old.tonnage);
    expect(recovered.slots).toBe(old.slots);
    expect(recovered.range.long).toBeGreaterThan(old.range.long);
    mount.weaponId = opening.itemId;
    expect(validateDesign(catalog, next).valid).toBe(true);
    const refit = applyRefit(catalog, state, mech, next);
    expect(refit.ok, refit.reason ?? '').toBe(true);
    expect(storeCount(state, 'weapon', opening.itemId)).toBe(0);
    const loaded = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(loaded.mechs.find((candidate) => candidate.id === mech.id)?.design).toEqual(next);
    expect(loaded.claimedRewardIds).toContain(receipt!.id);

    for (const machine of loaded.mechs) {
      if (machine.status !== 'hulk' && estimateRepair(catalog, machine).cost > 0) {
        expect(startRepair(catalog, loaded, machine).ok).toBe(true);
      }
    }
    // The real rescue contract permits two scouts and a battery (135t).
    const selected = opening.campaignId === 'border_dispute'
      ? loaded.pilots.filter((pilot) => isPilotAvailable(loaded, pilot) && loaded.mechs.some((machine) => machine.id === pilot.mechId && machine.status === 'ready' && machine.design.id !== 'bulwark_assault'))
      : loaded.pilots;
    loaded.deploymentSeats = selected.map((pilot) => ({ pilotId: pilot.id, mechId: pilot.mechId }));
    expect(acceptContract(catalog, loaded, opening.second, 'standard').ok).toBe(true);
    let second;
    if (opening.campaignId === 'border_dispute') {
      // Play the stated objective: leave the battery over Pell's cradle and
      // use the refitted scout at the winch, rather than an AI pursuit order.
      const deployment = prepareDeployment(catalog, loaded);
      const world = createWorld(catalog, { seed: deployment.seed, missionId: deployment.missionId,
        playerTeam: 0, playerLance: deployment.entries });
      const scout = world.entities.find((unit) => unit.team === 0 && unit.designId === next.id)!;
      for (const unit of world.entities.filter((unit) => unit.team === 0)) setPosture(unit, 'hold_position');
      const winch = world.zones.find((zone) => zone.id === 'winch_controls')!;
      expect(issueMove(world, scout, winch, true)).toBe(true);
      const budget = Math.ceil(world.mission.maxDurationSeconds / world.dt);
      while (!world.finished && world.tick < budget) stepWorld(world, budget);
      second = resolveMission(catalog, loaded, toResult(world, deployment.seed, budget), deployment.lance, false);
    } else {
      second = runMission(catalog, loaded);
    }
    expect(second.outcome.won, JSON.stringify(second.battle.objectives)).toBe(true);
    expect(second.battle.units.some((unit) => unit.team === 0 && unit.designId === next.id)).toBe(true);
    expect(second.battle.weapons.find((weapon) => weapon.weaponId === opening.itemId)?.shots ?? 0).toBeGreaterThan(0);
  });

  it.each(OPENINGS)('does not backfill or duplicate first-victory rewards in an established $campaignId save', (opening) => {
    const state = startCampaign(catalog, opening.campaignId, 'older-opening');
    expect(acceptContract(catalog, state, opening.first, 'standard').ok).toBe(true);
    const contract = state.contract!;
    state.completedNodes.push(opening.first);
    state.store = [];
    const loaded = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    const mission = catalog.missions.get(contract.missionId)!;
    const completed = mission.objectives.filter((objective) => objective.team === 0).map((objective) => ({
      id: objective.id, label: objective.label, required: objective.required, status: 'complete', progress: 1,
    }));
    expect(earnedCampaignRewards(catalog, loaded, contract, {
      seed: 'older-opening', missionId: contract.missionId, missionStatus: 'success', missionReason: null,
      objectives: completed, ticks: 1, durationSeconds: 0, winner: 0, decided: true, units: [], weapons: [],
    }, 1)).toEqual([]);
    expect(loaded.store).toEqual([]);
    expect(loaded.claimedRewardIds).toEqual(state.claimedRewardIds);
    expect(loaded.claimedRewardIds.some((id) => id.endsWith(`/${opening.rewardId}`))).toBe(false);
  });

  it('requires a real company choice at the third Aurelian deployment, with every opening trio legal', () => {
    const state = startCampaign(catalog, 'aurelian_recall', 'registry-choice');
    const seats = state.pilots.map((pilot) => ({ pilotId: pilot.id, mechId: pilot.mechId }));
    const all = deploymentPlan(catalog, { ...state, deploymentSeats: seats }, 'switchyard_watch');
    expect(all.tonnage).toBeGreaterThan(all.allowance);
    expect(all.issues.some((issue) => issue.includes('over the mission allowance'))).toBe(true);
    for (let omitted = 0; omitted < seats.length; omitted += 1) {
      const trio = deploymentPlan(catalog, { ...state, deploymentSeats: seats.filter((_, index) => index !== omitted) }, 'switchyard_watch');
      expect(trio.issues).toEqual([]);
      expect(trio.pairs).toHaveLength(3);
      expect(trio.tonnage).toBeLessThanOrEqual(trio.allowance);
    }
  });
});
