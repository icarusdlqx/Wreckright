import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { acceptContract, availableNodes, dropTeam, startCampaign } from '../../campaign/campaign';
import { payrollThrough } from '../../campaign/ledger';
import { estimateRepair, projectedRepairWindow, startRepair } from '../../campaign/repair';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { Hangar } from './Hangar';
import { LanceManifest } from './LanceManifest';
import { PreparationRoster } from './PreparationRoster';
import { PreparationMachine } from './PreparationMachine';
import { beginPreparation, clearPreparationSeat } from './preparationModel';

function signedCompany() {
  const state = startCampaign(catalog, 'border_dispute', 'expedition-preparation');
  const node = availableNodes(catalog, state)[0];
  if (node === undefined || !acceptContract(catalog, state, node.id, 'standard').ok) {
    throw new Error('could not sign a fixture contract');
  }
  return state;
}

function manifest(state: CampaignState, content: Catalog = catalog) {
  return renderToStaticMarkup(createElement(LanceManifest, {
    catalog: content, state, mutate: () => undefined,
    onLaunch: () => undefined, onCancel: () => undefined, onRefit: () => undefined,
  }));
}

function hangar(state: CampaignState) {
  return renderToStaticMarkup(createElement(Hangar, {
    catalog, state, mutate: () => undefined,
    onContinue: () => undefined, onCancel: () => undefined, onRefit: () => undefined,
  }));
}

function largeCompany(allowance: number) {
  const state = signedCompany();
  const mech = state.mechs[0];
  const pilot = state.pilots[0];
  const mission = catalog.missions.get(state.contract?.missionId ?? '');
  if (mech === undefined || pilot === undefined || mission === undefined) {
    throw new Error('missing company fixture');
  }
  state.mechs = Array.from({ length: 7 }, (_, index) => ({
    ...structuredClone(mech), id: `exp-mech-${index}`,
  }));
  state.pilots = state.mechs.map((entry, index) => ({
    ...structuredClone(pilot), id: `exp-pilot-${index}`, name: `Crew ${index}`,
    mechId: entry.id,
  }));
  const content: Catalog = {
    ...catalog,
    missions: new Map([...catalog.missions, [mission.id, { ...mission, dropTonnage: allowance }]]),
  };
  return { state, content, mission };
}

function aboardIds(html: string) {
  return [...html.matchAll(/<li data-testid="manifest-([^"]+)"/g)].map((match) => match[1]);
}

function seats(html: string) {
  return [...html.matchAll(/data-testid="prep-seat-(\d+)"/g)].map((match) => match[1]);
}

function roster(state: CampaignState, view: 'machines' | 'pilots', content: Catalog = catalog) {
  return renderToStaticMarkup(createElement(PreparationRoster, {
    catalog: content, state, view, mechId: null, pilotId: null,
    onMech: () => undefined, onPilot: () => undefined,
  }));
}

function rosterEntry(html: string, id: string) {
  return html.match(new RegExp(`<button[^>]*data-testid="prep-(?:machine|pilot)-${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';
}

describe('expedition preparation readouts', () => {
  it('shows five persistent seats and a company roster with explicit reserve status', () => {
    const { state, content, mission } = largeCompany(2000);
    beginPreparation(content, state);
    const saved = JSON.stringify(state);
    const before = manifest(state, content);
    expect(aboardIds(before)).toEqual(dropTeam(content, state, mission.id).map((pair) => pair.pilot.id));
    expect(aboardIds(before)).toHaveLength(5);
    expect(seats(before)).toEqual(['0', '1', '2', '3', '4']);
    expect(before).toContain('5/5 machines · 5 ready');
    expect(rosterEntry(before, 'exp-mech-0')).toContain('Seat 1');
    expect(rosterEntry(before, 'exp-mech-5')).toContain('Reserve');
    expect(rosterEntry(before, 'exp-mech-6')).toContain('Reserve');
    const pilots = roster(state, 'pilots', content);
    expect(pilots.match(/data-testid="prep-pilot-/g)).toHaveLength(7);
    expect(rosterEntry(pilots, 'exp-pilot-5')).toContain('Reserve · available');
    expect(rosterEntry(pilots, 'exp-pilot-6')).toContain('Reserve · available');
    expect(JSON.stringify(state)).toBe(saved);
    const first = state.pilots[0];
    if (first === undefined) throw new Error('missing first pilot');
    clearPreparationSeat(state, 0);
    const after = manifest(state, content);
    expect(seats(after)).toEqual(seats(before));
    expect(aboardIds(after)).toHaveLength(4);
    expect(aboardIds(after)).not.toContain(first.id);
    expect(aboardIds(after)).toEqual(dropTeam(content, state, mission.id).map((pair) => pair.pilot.id));
    expect(after).toContain('data-testid="prep-empty-seat-0"');
    expect(rosterEntry(after, 'exp-mech-0')).toContain('Reserve');
    expect(rosterEntry(roster(state, 'pilots', content), first.id)).toContain('Reserve · available');
    expect(first.mechId).toBe('exp-mech-0');
  });

  it('projects the initial legacy drop within tonnage without writing seats or pilot assignments', () => {
    const { state, content, mission } = largeCompany(110);
    const first = state.pilots[0];
    if (first === undefined) throw new Error('missing first pilot');
    first.mechId = null;
    const saved = JSON.stringify(state);
    const html = manifest(state, content);
    expect(aboardIds(html)).toEqual(dropTeam(content, state, mission.id).map((pair) => pair.pilot.id));
    expect(aboardIds(html)).toHaveLength(3);
    expect(seats(html)).toHaveLength(5);
    expect(html).toContain('105/110t');
    expect(html.match(/data-testid="prep-machine-/g)).toHaveLength(7);
    expect(html).not.toContain('over the mission allowance');
    expect(state.deploymentSeats).toBeNull();
    expect(JSON.stringify(state)).toBe(saved);

    const full = largeCompany(2000);
    full.state.pilots = full.state.pilots.slice(0, 4);
    const unassigned = full.state.pilots[0];
    if (unassigned === undefined) throw new Error('missing unassigned pilot');
    unassigned.mechId = null;
    const fullSaved = JSON.stringify(full.state);
    const automaticDrop = manifest(full.state, full.content);
    expect(aboardIds(automaticDrop)).toEqual(dropTeam(full.content, full.state, full.mission.id).map((pair) => pair.pilot.id));
    expect(aboardIds(automaticDrop)).toContain(unassigned.id);
    expect(automaticDrop).toContain(`data-testid="manifest-${unassigned.id}"`);
    expect(seats(automaticDrop)).toHaveLength(5);
    expect(unassigned.mechId).toBeNull();
    expect(JSON.stringify(full.state)).toBe(fullSaved);
  });

  it('shows unavailable reserves in the relevant roster and blocks any selected unavailable cockpit', () => {
    const state = signedCompany();
    const [workshop, unarmed] = state.mechs;
    const injured = state.pilots[2];
    if (workshop === undefined || unarmed === undefined || injured === undefined) {
      throw new Error('missing reserve fixtures');
    }
    workshop.condition.centre_torso.armour -= 1;
    expect(startRepair(catalog, state, workshop).ok).toBe(true);
    unarmed.design.mounts = [];
    injured.recoveryMissions = 1;
    const saved = JSON.stringify(state);
    const html = manifest(state);
    expect(rosterEntry(html, workshop.id)).toContain('Reserve · Workshop');
    expect(rosterEntry(html, unarmed.id)).toContain('Reserve · Needs weapon');
    const injuredEntry = rosterEntry(roster(state, 'pilots'), injured.id);
    expect(injuredEntry).toContain('Injured · misses next mission');
    expect(injuredEntry).toContain('draggable="false"');
    const workshopDetail = renderToStaticMarkup(createElement(PreparationMachine, {
      catalog, state, mech: workshop, mutate: () => undefined, onRefit: () => undefined,
    }));
    expect(workshopDetail).toContain(`<dt>Ready</dt><dd>Day ${workshop.readyOnDay}</dd>`);
    expect(workshopDetail).toContain('<dt>Booking</dt><dd>Paid</dd>');
    expect(aboardIds(html)).toEqual(dropTeam(catalog, state, state.contract?.missionId ?? '').map((pair) => pair.pilot.id));
    expect(aboardIds(html)).toHaveLength(1);
    expect(JSON.stringify(state)).toBe(saved);

    // Explicit choices survive a change in readiness; they are shown as problems,
    // never replaced by a different reserve or silently omitted from the team.
    state.deploymentSeats = state.pilots.map((pilot) => ({ pilotId: pilot.id, mechId: pilot.mechId }));
    state.deploymentSelection = state.pilots.map((pilot) => pilot.id);
    const chosenSave = JSON.stringify(state);
    const chosen = manifest(state);
    expect(aboardIds(chosen)).toEqual(state.deploymentSelection);
    expect(chosen).toContain(`Workshop · day ${workshop.readyOnDay}`);
    expect(chosen).toContain('Needs weapon');
    expect(chosen).toContain('Injured · misses next mission');
    expect(chosen.match(/<button[^>]*data-testid="manifest-launch"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(chosen).toContain(`${injured.name} is wounded. Choose a reserve.`);
    expect(JSON.stringify(state)).toBe(chosenSave);
  });

  it('separates a fieldable damaged machine from its optional repair and payroll quote', () => {
    const state = signedCompany();
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('missing repair fixture');
    mech.condition.centre_torso.armour -= 1;
    const estimate = estimateRepair(catalog, mech);
    const projected = projectedRepairWindow(catalog, state, estimate.days);
    const wages = payrollThrough(catalog, state, projected.readyOnDay - state.day);
    const saved = JSON.stringify(state);
    const html = hangar(state);
    expect(html).toContain('Fieldable · damaged');
    expect(html).toContain(`<dt>Pay now</dt><dd>${estimate.cost.toLocaleString('en-GB')} C</dd>`);
    expect(html).toContain(`<dt>Ready</dt><dd>Day ${projected.readyOnDay}</dd>`);
    expect(html).toContain(`Company payroll until ready: <strong>${wages.toLocaleString('en-GB')} C</strong>`);
    expect(html).toContain('Charged as days pass.');
    expect(html).toContain('class="machine-portrait"');
    expect(html).toContain('Linewrought');
    expect(JSON.stringify(state)).toBe(saved);
  });

  it('shows paid queue slots, completion dates and deadline risk without quoting the work twice', () => {
    const state = signedCompany();
    const [active, queued] = state.mechs;
    if (active === undefined || queued === undefined || state.contract === null) {
      throw new Error('missing booked repair fixtures');
    }
    for (const mech of [active, queued]) {
      mech.condition.centre_torso.armour -= 1;
      expect(startRepair(catalog, state, mech).ok).toBe(true);
    }
    state.contract.deadlineDay = state.day;
    const html = hangar(state);
    expect(html.match(/<dt>Booking<\/dt><dd>Paid<\/dd>/g)).toHaveLength(2);
    expect(html).not.toContain('<dt>Pay now</dt>');
    expect(html).toContain('On the lift');
    expect(html).toContain('In queue · 1');
    expect(html).toContain(`<dt>Starts</dt><dd>Day ${active.readyOnDay}</dd>`);
    expect(html).toContain(`<dd class="is-late">Day ${queued.readyOnDay}</dd>`);
    expect(html).toContain(`Ready after the signed deadline, day ${state.contract.deadlineDay}.`);
  });
});
