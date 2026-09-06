import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { assignWithReceipt, companyMachineLabel, occupiedSeatLabel } from './companyLabels';

describe('company machine identity and seats', () => {
  it('distinguishes identical chassis and keeps the label through sorting', () => {
    const state = startCampaign(catalog, 'border_dispute', 'labels');
    const labels = state.mechs.map((mech) => companyMachineLabel(catalog, mech));
    expect(new Set(labels).size).toBe(state.mechs.length);
    state.mechs.reverse();
    expect(state.mechs.map((mech) => companyMachineLabel(catalog, mech))).toEqual(labels.reverse());
  });
  it('shows the occupant and states exactly who becomes unassigned', () => {
    const state = startCampaign(catalog, 'border_dispute', 'seats');
    const pilot = state.pilots[0]!;
    const displaced = state.pilots[1]!;
    const mech = state.mechs.find((entry) => entry.id === displaced.mechId)!;
    expect(occupiedSeatLabel(catalog, state, mech)).toContain(displaced.name);
    const receipt = assignWithReceipt(catalog, state, pilot.id, mech.id);
    expect(receipt).toContain(`${displaced.name} is now unassigned`);
    expect(displaced.mechId).toBeNull();
    expect(pilot.mechId).toBe(mech.id);
    expect(assignWithReceipt(catalog, state, pilot.id, 'missing')).toBe('Machine unavailable.');
    expect(pilot.mechId).toBe(mech.id);
  });
});
