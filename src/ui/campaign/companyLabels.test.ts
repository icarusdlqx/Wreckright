import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { buyMech, marketListings } from '../../campaign/market';
import { assignWithReceipt, companyMachineLabel, occupiedSeatLabel } from './companyLabels';

describe('company machine identity and seats', () => {
  it('distinguishes identical chassis and keeps the label through sorting', () => {
    const state = startCampaign(catalog, 'border_dispute', 'labels');
    const labels = state.mechs.map((mech) => companyMachineLabel(catalog, mech));
    expect(new Set(labels).size).toBe(state.mechs.length);
    state.mechs.reverse();
    expect(state.mechs.map((mech) => companyMachineLabel(catalog, mech))).toEqual(labels.reverse());
  });
  it('labels a purchased machine without exposing its generated ID or changing that save identity', () => {
    const state = startCampaign(catalog, 'aurelian_recall', 'purchased-label');
    const listing = marketListings(catalog, state)[0];
    expect(listing).toBeDefined();
    state.cbills = listing!.price;
    const serial = state.nextId;
    const beforeCount = state.mechs.length;
    expect(buyMech(catalog, state, listing!.id).ok).toBe(true);
    expect(state.cbills).toBe(0);
    const purchased = state.mechs.at(-1)!;
    expect(state.mechs).toHaveLength(beforeCount + 1);
    expect(purchased.id).toBe(`mech_${serial}`);
    expect(companyMachineLabel(catalog, purchased)).toMatch(new RegExp(` · Bay ${serial}$`));
    expect(companyMachineLabel(catalog, purchased)).not.toContain('mech_');
    expect(purchased.id).toBe(`mech_${serial}`);
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
