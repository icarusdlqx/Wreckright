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
  return [...html.matchAll(/data-testid="manifest-aboard-([^"]+)"/g)].map((match) => match[1]);
}

function benchIds(html: string) {
  return [...html.matchAll(/data-testid="manifest-bench-([^"]+)"/g)].map((match) => match[1]);
}

describe('expedition preparation readouts', () => {
  it('shows exactly the six-berth drop and keeps roster controls in place when a pilot is held back', () => {
    const { state, content, mission } = largeCompany(2000);
    const before = manifest(state, content);
    expect(aboardIds(before)).toEqual(dropTeam(content, state, mission.id).map((pair) => pair.pilot.id));
    expect(aboardIds(before)).toHaveLength(6);
    expect(before).toContain('Reserve — no berth');
    const first = state.pilots[0];
    if (first === undefined) throw new Error('missing first pilot');
    state.benched.push(first.id);
    const after = manifest(state, content);
    expect(benchIds(after)).toEqual(benchIds(before));
    expect(aboardIds(after)).not.toContain(first.id);
    expect(aboardIds(after)).toEqual(dropTeam(content, state, mission.id).map((pair) => pair.pilot.id));
    expect(after).toContain('Held back');
  });

  it('reveals an automatic pairing and weight reserve without writing an assignment', () => {
    const { state, content, mission } = largeCompany(110);
    const first = state.pilots[0];
    if (first === undefined) throw new Error('missing first pilot');
    first.mechId = null;
    const saved = JSON.stringify(state);
    const html = manifest(state, content);
    expect(aboardIds(html)).toEqual(dropTeam(content, state, mission.id).map((pair) => pair.pilot.id));
    expect(html).toContain('Available automatic pairing.');
    expect(html).toContain('Reserve — over the weight allowance');
    expect(JSON.stringify(state)).toBe(saved);

    const full = largeCompany(2000);
    full.state.pilots = full.state.pilots.slice(0, 4);
    const unassigned = full.state.pilots[0];
    if (unassigned === undefined) throw new Error('missing unassigned pilot');
    unassigned.mechId = null;
    const automaticDrop = manifest(full.state, full.content);
    expect(automaticDrop).toContain('Auto-assigned for this drop.');
    expect(aboardIds(automaticDrop)).toContain(unassigned.id);
    expect(unassigned.mechId).toBeNull();
  });

  it('explains workshop, unarmed and injured reserves instead of implying they are boarding', () => {
    const state = signedCompany();
    const [workshop, unarmed] = state.mechs;
    const injured = state.pilots[2];
    if (workshop === undefined || unarmed === undefined || injured === undefined) {
      throw new Error('missing reserve fixtures');
    }
    workshop.condition.centre_torso.armour -= 1;
    expect(startRepair(catalog, state, workshop).ok).toBe(true);
    unarmed.design.mounts = [];
    injured.injuredUntilDay = state.day + 3;
    const html = manifest(state);
    expect(html).toContain(`Reserve — workshop until day ${workshop.readyOnDay}`);
    expect(html).toContain('Mech needs a weapon');
    expect(html).toContain(`Infirmary until day ${injured.injuredUntilDay}`);
    expect(aboardIds(html)).toEqual(dropTeam(catalog, state, state.contract?.missionId ?? '').map((pair) => pair.pilot.id));
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
    expect(html).toContain('data-testid="chassis-silhouette"');
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
