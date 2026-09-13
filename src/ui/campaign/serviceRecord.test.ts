import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { weaponLayoutIdentity } from '../../campaign/pilotContinuity';
import type { MissionOutcome, PilotReport } from '../../campaign/types';
import { PreparationMachine } from './PreparationMachine';
import { machineServiceHistory } from './serviceRecord';

function fixture() {
  const state = startCampaign(catalog, 'border_dispute', 'service-record');
  const mech = state.mechs[0];
  const pilot = state.pilots[0];
  if (mech === undefined || pilot === undefined) throw new Error('missing company fixture');
  const report: PilotReport = {
    pilotId: pilot.id, name: pilot.name, mech: mech.design.name, mechId: mech.id,
    weaponLayout: weaponLayoutIdentity(mech.design), kills: 1, damage: 100, xp: 50,
    xpBanked: 50, promotions: [], fate: 'returned',
  };
  return { state, mech, pilot, report };
}

function outcome(reports: PilotReport[], changes: Partial<MissionOutcome> = {}): MissionOutcome {
  return {
    nodeId: 'militia_raid', missionId: 'line_maintenance', employerId: 'test', employerName: 'Test workshop',
    termsId: 'standard', won: true, day: 0, payout: 100, paymentDisputeSettled: false,
    salvagedChassis: [], salvagedItems: [], salvageOffered: [], salvageFinalized: true,
    salvageCandidates: [], salvageProvenance: [], pilotCasualties: [], mechsLost: [], pilotReports: reports,
    ...changes,
  };
}

describe('machine service record', () => {
  it('follows the owned hull through refits and renames, without assigning its history to a matching name or design', () => {
    const { state, mech, report } = fixture();
    state.history = [outcome([report])];
    const duplicate = { ...structuredClone(mech), id: 'different-owned-hull' };
    expect(machineServiceHistory(catalog, state, duplicate).deployments).toBe(0);
    mech.design.id = 'custom_lamplighter';
    mech.design.name = 'Lamplighter';
    mech.design.mounts[0]!.weaponId = 'er_medium_laser';
    const record = machineServiceHistory(catalog, state, mech);
    expect(record.deployments).toBe(1);
    expect(record.last).toMatchObject({ mission: 'First Notice', machine: report.mech, weaponsChanged: true });
    const html = renderToStaticMarkup(createElement(PreparationMachine, {
      catalog, state, mech, mutate: () => undefined, onRefit: () => undefined,
    }));
    expect(html).toContain('Lamplighter');
    expect(html).toContain('Deployed as');
    expect(html).toContain('Weapons changed since that deployment.');
  });

  it('counts each retained deployment once and selects the last real report including a failed contract', () => {
    const { state, mech, report } = fixture();
    state.history = [outcome([report, report]), outcome([{ ...report, name: 'Reserve pilot' }], {
      nodeId: 'recovery_window', missionId: 'recovery_window', day: 1, won: false,
    })];
    const record = machineServiceHistory(catalog, state, mech);
    expect(record.deployments).toBe(2);
    expect(record.last).toMatchObject({ mission: 'The Quiet Claim', pilot: 'Reserve pilot', won: false });
  });

  it('keeps missing legacy identities unknown and does not count anonymous archived missions', () => {
    const { state, mech, report } = fixture();
    delete report.mechId;
    delete report.weaponLayout;
    state.history = [outcome([report])];
    state.historyArchive.outcomes = 12;
    expect(machineServiceHistory(catalog, state, mech)).toEqual({
      deployments: 0, incomplete: true, last: null, acquisition: null,
    });
  });

  it('does not call an unchanged layout a refit when only its mount order or name changes', () => {
    const { state, mech, report } = fixture();
    state.history = [outcome([report])];
    mech.design.name = 'Lamplighter';
    mech.design.mounts.reverse();
    expect(machineServiceHistory(catalog, state, mech).last?.weaponsChanged).toBe(false);
    delete report.weaponLayout;
    mech.design.mounts = [];
    expect(machineServiceHistory(catalog, state, mech).last?.weaponsChanged).toBe(false);
  });

  it('shows exact hull grant receipts but never infers acquisition from an identical salvaged chassis', () => {
    const { state, mech } = fixture();
    state.history = [outcome([], {
      salvagedChassis: [mech.design.id],
      campaignRewards: [{
        id: 'unclaimed_prybar', label: 'Released Prybar workshop hulk', items: [],
        hulls: [{ mechId: 'another-hull', designId: mech.design.id }], freeRepairDays: 0,
        supplierDiscountThroughDay: null, afterword: 'Recovered at the workshop.',
      }],
    })];
    expect(machineServiceHistory(catalog, state, mech).acquisition).toBeNull();
    state.history[0]!.campaignRewards![0]!.hulls[0]!.mechId = mech.id;
    expect(machineServiceHistory(catalog, state, mech).acquisition).toEqual({
      mission: 'First Notice', label: 'Released Prybar workshop hulk',
    });
  });

  it('renders a compact collapsed preparation disclosure without mutating campaign data', () => {
    const { state, mech, report } = fixture();
    state.history = [outcome([report])];
    const before = JSON.stringify(state);
    const html = renderToStaticMarkup(createElement(PreparationMachine, {
      catalog, state, mech, mutate: () => undefined, onRefit: () => undefined,
    }));
    expect(html).toContain(`data-testid="machine-service-${mech.id}"`);
    expect(html).toContain('<summary>Service record <span>1 recorded deployment</span></summary>');
    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain('open=');
    expect(html).toContain('Last deployment: First Notice');
    expect(html).not.toContain('Deployed as');
    expect(html).not.toContain('Weapons changed since');
    expect(JSON.stringify(state)).toBe(before);
  });
});
