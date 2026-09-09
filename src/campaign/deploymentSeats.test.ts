import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, availableNodes, startCampaign } from './campaign';
import { deploymentPlan, prepareDeployment } from './deployment';
import { putPilotInSeat, writeDeploymentSeats } from './deploymentSeats';
import { assign } from './roster';
import { sellMech } from './market';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { beginPreparation, clearPreparationSeat, selectPreparationMech } from '../ui/campaign/preparationModel';

function company() {
  const state = startCampaign(catalog, 'border_dispute', 'explicit-cockpits');
  acceptContract(catalog, state, availableNodes(catalog, state)[0]!.id, 'standard');
  beginPreparation(catalog, state);
  return state;
}
const plan = (state: ReturnType<typeof company>) => deploymentPlan(catalog, state, state.contract!.missionId);

describe('explicit preparation cockpits', () => {
  it('keeps an empty cockpit and its chassis tonnage through save, reload and attempted launch', () => {
    const state = company();
    const before = plan(state);
    const first = state.deploymentSeats![0]!;
    clearPreparationSeat(state, 0, true);
    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(restored.deploymentSeats![0]).toEqual({ mechId: first.mechId, pilotId: null });
    expect(plan(restored).tonnage).toBe(before.tonnage);
    expect(plan(restored).issues).toContain('Seat 1 needs a pilot.');
    expect(() => prepareDeployment(catalog, restored)).toThrow('needs a pilot');
    expect(restored.deploymentSeats![0]!.pilotId).toBeNull();
  });

  it('moves a pilot without silently swapping people or removing the vacated machine', () => {
    const state = company();
    const before = plan(state);
    const [first, second] = state.deploymentSeats!;
    const firstPilotId = first!.pilotId!;
    const secondPilotId = second!.pilotId!;
    putPilotInSeat(state, 1, firstPilotId);
    expect(state.deploymentSeats![0]).toEqual({ mechId: first!.mechId, pilotId: null });
    expect(state.deploymentSeats![1]).toEqual({ mechId: second!.mechId, pilotId: firstPilotId });
    expect(state.pilots.find((pilot) => pilot.id === secondPilotId)!.mechId).toBeNull();
    expect(plan(state).tonnage).toBe(before.tonnage);
    putPilotInSeat(state, 0, secondPilotId);
    expect(plan(state).issues).toEqual([]);
    expect(prepareDeployment(catalog, state).lance.slice(0, 2).map((pair) => pair.pilot.id)).toEqual([secondPilotId, firstPilotId]);
  });

  it('validates an imported cockpit board even when its legacy pilot selection is absent', () => {
    const state = company();
    clearPreparationSeat(state, 0, true);
    state.deploymentSelection = null;
    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(() => prepareDeployment(catalog, restored)).toThrow('Seat 1 needs a pilot.');
    expect(restored.deploymentSeats![0]!.pilotId).toBeNull();
  });

  it('reflects a barracks reassignment in the same saved deployment seats', () => {
    const state = company();
    const [first, second] = state.deploymentSeats!;
    const pilotId = first!.pilotId!;
    assign(state, pilotId, second!.mechId);
    expect(state.deploymentSeats![0]!.pilotId).toBeNull();
    expect(state.deploymentSeats![1]!.pilotId).toBe(pilotId);
    expect(state.deploymentSelection).toEqual(state.deploymentSeats!.flatMap((seat) => seat.pilotId === null ? [] : [seat.pilotId]));
    expect(plan(state).issues).toContain('Seat 1 needs a pilot.');
  });

  it('keeps the chosen machine after its pilot is wounded or killed', () => {
    const state = company();
    const first = state.deploymentSeats![0]!;
    const pilot = state.pilots.find((entry) => entry.id === first.pilotId)!;
    pilot.recoveryMissions = 1;
    expect(plan(state).issues.join()).toContain('wounded');
    pilot.dead = true; pilot.mechId = null;
    expect(plan(state).issues.join()).toContain('no longer on the active roster');
    expect(state.deploymentSeats![0]!.mechId).toBe(first.mechId);
  });

  it('removing a deployment seat does not unassign its pilot from the company machine', () => {
    const state = company();
    const first = { ...state.deploymentSeats![0]! };
    clearPreparationSeat(state, 0);
    expect(state.pilots.find((pilot) => pilot.id === first.pilotId)!.mechId).toBe(first.mechId);
    expect(state.deploymentSeats![0]).toEqual({ mechId: null, pilotId: null });
    expect(plan(state).issues).toEqual([]);
    selectPreparationMech(catalog, state, 0, first.mechId!);
    expect(state.deploymentSeats![0]).toEqual(first);
  });

  it('does not allow a chassis to be counted or deployed twice', () => {
    const state = company();
    const before = serialiseCampaign(state);
    expect(selectPreparationMech(catalog, state, 0, state.deploymentSeats![1]!.mechId!)).toContain('already has a deployment seat');
    expect(serialiseCampaign(state)).toBe(before);
    const seat = state.deploymentSeats![0]!;
    writeDeploymentSeats(state, [seat, seat]);
    expect(plan(state).issues).toContain('A machine cannot occupy two berths.');
  });

  it('keeps the pilot of a sold hull unassigned when another deployment seat changes', () => {
    const state = company();
    const first = { ...state.deploymentSeats![0]! };
    state.contract = null;
    expect(sellMech(catalog, state, first.mechId!).ok).toBe(true);
    const pilot = state.pilots.find((entry) => entry.id === first.pilotId)!;
    expect(pilot.mechId).toBeNull();
    acceptContract(catalog, state, availableNodes(catalog, state)[0]!.id, 'standard');
    clearPreparationSeat(state, 1);
    expect(pilot.mechId).toBeNull();
    expect(state.deploymentSeats![0]).toEqual(first);
    expect(plan(state).issues.join(' ')).toContain(`${pilot.name} needs an armed, fieldable machine.`);
    expect(() => prepareDeployment(catalog, state)).toThrow('needs an armed, fieldable machine');
  });

  it('opens older pilot-only saves with their actual chosen pairings and order', () => {
    const state = company();
    const ordered = [...state.deploymentSelection!].reverse();
    const old = JSON.parse(serialiseCampaign(state));
    delete old.state.deploymentSeats;
    old.state.deploymentSelection = ordered;
    const restored = deserialiseCampaign(JSON.stringify(old), catalog).state!;
    expect(restored.deploymentSeats).toBeNull();
    beginPreparation(catalog, restored);
    expect(restored.deploymentSeats!.map((seat) => seat.pilotId)).toEqual(ordered);
    expect(prepareDeployment(catalog, restored).lance.map((pair) => pair.pilot.id)).toEqual(ordered);
  });
});
