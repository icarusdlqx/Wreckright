import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import type { MissionOutcome, PilotReport } from '../../campaign/types';
import { DebriefCrew, reportedMachine } from './DebriefCrew';

function fixture() {
  const state = startCampaign(catalog, 'border_dispute', 'personal-report');
  const pilot = state.pilots[0]!;
  const mech = state.mechs.find((entry) => entry.id === pilot.mechId)!;
  const report: PilotReport = { pilotId: pilot.id, name: pilot.name, mech: mech.design.name,
    mechId: mech.id, chassisId: mech.design.chassisId, kills: 0, damage: 0, xp: 80, xpBanked: 80,
    sharedXp: 60, serviceNotes: ['Returned without firing a shot.'], promotions: [], fate: 'returned' };
  const outcome: MissionOutcome = { nodeId: 'militia_raid', missionId: 'training_ground',
    employerId: 'kestrel_combine', employerName: 'Kestrel Combine', termsId: 'standard',
    won: true, day: 0, payout: 100, paymentDisputeSettled: false, salvagedChassis: [], salvagedItems: [],
    salvageFinalized: false, salvageOffered: [], salvageCandidates: [], salvageProvenance: [],
    pilotCasualties: [], mechsLost: [], pilotReports: [report] };
  return { state, pilot, mech, report, outcome };
}

describe('personal mission reports', () => {
  it('keeps a surviving pilot paired with their recovered wreck, not a later assignment', () => {
    const { state, pilot, mech, report, outcome } = fixture();
    mech.status = 'hulk';
    pilot.mechId = state.mechs.find((entry) => entry.id !== mech.id)!.id;
    const before = JSON.stringify(state);
    expect(reportedMachine(state, report)).toBe(mech);
    const html = renderToStaticMarkup(createElement(DebriefCrew, { catalog, state, outcome, onAction: vi.fn() }));
    expect(html).toContain(`data-testid="portrait-${pilot.templateId}"`);
    expect(html).toContain('chassis portrait');
    expect(html).toContain('Recovered wreck · rebuilding needed');
    expect(html).toContain('>Returned<');
    expect(html).not.toContain('>Killed in action<');
    expect(html).toContain(`data-testid="debrief-pair-workshop-${mech.id}"`);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps casualty and training state separate from the machine', () => {
    const { state, pilot, report, outcome } = fixture();
    report.fate = 'injured'; pilot.recoveryMissions = 1; pilot.xp = 10000;
    const wounded = renderToStaticMarkup(createElement(DebriefCrew, { catalog, state, outcome, onAction: vi.fn() }));
    expect(wounded).toContain('Wounded · misses next mission');
    expect(wounded).toContain('Choose training');
    expect(wounded).toContain('Includes 60 XP for shared mission progress.');
    report.fate = 'killed'; pilot.dead = true; pilot.mechId = null;
    const killed = renderToStaticMarkup(createElement(DebriefCrew, { catalog, state, outcome, onAction: vi.fn() }));
    expect(killed).toContain('>Killed in action<');
    expect(killed).toContain('Record closed');
    expect(killed).not.toContain('data-testid="debrief-pair-train-');
    expect(killed).toContain('chassis portrait');
  });

  it('preserves legacy report names without guessing a matching machine instance', () => {
    const { state, report, outcome } = fixture();
    delete report.mechId; delete report.chassisId;
    expect(reportedMachine(state, report)).toBeUndefined();
    const html = renderToStaticMarkup(createElement(DebriefCrew, { catalog, state, outcome, onAction: vi.fn() }));
    expect(html).toContain('+80 XP');
    expect(html).toContain('Field machine recorded above; condition is in the Workshop.');
    expect(html).not.toContain('data-testid="debrief-pair-workshop-');
  });
});
