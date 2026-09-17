import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { acceptContract, startCampaign } from '../../campaign/campaign';
import { deploymentPlan } from '../../campaign/deployment';
import { autoFillDeployment } from '../../campaign/lancePresets';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { RecommendedFirstDrop } from './RecommendedFirstDrop';
import { isPrimeEquipment, offersFirstDropOverview, recommendedFirstDrop } from './firstDropRecommendation';

function signedCompany(faction = 'border_dispute'): CampaignState {
  const state = startCampaign(catalog, faction, 'first-drop-recommendation');
  const result = acceptContract(catalog, state, faction === 'border_dispute' ? 'militia_raid' : 'first_warrant', 'standard');
  if (!result.ok) throw new Error(result.reason ?? 'Could not sign first mission');
  return state;
}

function render(state: CampaignState) {
  return renderToStaticMarkup(createElement(RecommendedFirstDrop, {
    catalog, state, onUseTeam: () => undefined, onCustomise: () => undefined,
    onRefit: () => undefined, onCancel: () => undefined,
  }));
}

describe('recommended first deployment', () => {
  it.each(['border_dispute', 'aurelian_recall'])('previews a ready %s team without changing the company or granting equipment', faction => {
    const state = signedCompany(faction);
    const before = structuredClone(state);
    const recommended = recommendedFirstDrop(catalog, state)!;
    expect(recommended.plan.pairs.length).toBeGreaterThan(0);
    expect(recommended.plan.tonnage).toBeLessThanOrEqual(recommended.plan.allowance);
    expect(recommended.plan.pairs.length).toBeLessThanOrEqual(recommended.plan.slots);
    expect(recommended.issues).toEqual([]);
    expect(recommended.allPrime).toBe(true);
    expect(state).toEqual(before);
    expect(recommended.state.mechs).toEqual(before.mechs);
    expect(recommended.state.store).toEqual(before.store);
    expect(recommended.state.cbills).toBe(before.cbills);
    const manuallyFilled = structuredClone(state);
    autoFillDeployment(catalog, manuallyFilled, state.contract!.missionId);
    expect(deploymentPlan(catalog, recommended.state, state.contract!.missionId)).toEqual(deploymentPlan(catalog, manuallyFilled, state.contract!.missionId));
    const html = render(state);
    for (const { pilot, mech } of recommended.plan.pairs) {
      expect(html).toContain(pilot.name);
      expect(html).toContain(`first-drop-machine-${mech.id}`);
      for (const mount of mech.design.mounts) expect(html).toContain(catalog.weapons.get(mount.weaponId)!.name);
    }
    expect(html).toContain('Already armed. Already paired.');
    expect(html).toContain('Customise team');
  });

  it('keeps a saved variant and reports its actual ammunition rather than promising Prime equipment', () => {
    const state = signedCompany();
    const mech = state.mechs[0]!;
    mech.design.id = 'players-field-scout';
    mech.design.name = 'Field Scout';
    const before = structuredClone(mech.design);
    const result = recommendedFirstDrop(catalog, state)!;
    expect(result.allPrime).toBe(false);
    expect(result.state.mechs[0]!.design).toEqual(before);
    const html = render(state);
    expect(html).toContain('Field Scout');
    expect(html).toContain('This team uses the equipment you have fitted');
    expect(html).not.toContain('Already armed. Already paired.');
    expect(html).toContain('salvos fitted');
  });

  it('recognises an edited legacy stock id and blocks ammunition-free weapons without resetting them', () => {
    const state = signedCompany();
    const mech = state.mechs.find(entry => entry.design.ammo.length > 0)!;
    mech.design.ammo = [];
    expect(isPrimeEquipment(catalog, mech.design)).toBe(false);
    const result = recommendedFirstDrop(catalog, state)!;
    expect(result.issues.some(issue => /ammunition|ammo/i.test(issue))).toBe(true);
    const html = render(state);
    expect(html).toContain('No ammunition fitted');
    expect(html).toMatch(/data-testid="first-drop-use-team"[^>]*disabled/);
    expect(result.state.mechs.find(entry => entry.id === mech.id)!.design.ammo).toEqual([]);
  });

  it('honours smaller mission limits and pairs an unassigned pilot without changing the preview source', () => {
    const state = signedCompany();
    state.pilots[0]!.mechId = null;
    const mission = catalog.missions.get(state.contract!.missionId)!;
    const content: Catalog = { ...catalog, missions: new Map([...catalog.missions, [mission.id, {
      ...mission, maxPlayerUnits: 1, dropTonnage: 40,
    }]]) };
    const before = structuredClone(state);
    const result = recommendedFirstDrop(content, state)!;
    expect(result.plan.pairs).toHaveLength(1);
    expect(result.plan.tonnage).toBeLessThanOrEqual(40);
    expect(result.issues).toEqual([]);
    expect(state).toEqual(before);
  });

  it('explains repairs and refuses an empty recommendation', () => {
    const damaged = signedCompany();
    damaged.mechs[0]!.condition.left_arm.armour -= 1;
    expect(recommendedFirstDrop(catalog, damaged)!.issues.join(' ')).toContain('needs repairs');
    const empty = signedCompany();
    empty.pilots.forEach(pilot => { pilot.recoveryMissions = 1; });
    const result = recommendedFirstDrop(catalog, empty)!;
    expect(result.plan.pairs).toHaveLength(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(render(empty)).toMatch(/data-testid="first-drop-use-team"[^>]*disabled/);
  });

  it('only offers the overview before any outcome, including archived outcomes', () => {
    const state = signedCompany();
    expect(offersFirstDropOverview(state)).toBe(true);
    state.historyArchive.outcomes = 1;
    expect(recommendedFirstDrop(catalog, state)).toBeNull();
    state.historyArchive.outcomes = 0;
    state.finished = true;
    expect(recommendedFirstDrop(catalog, state)).toBeNull();
    state.finished = false;
    state.contract = null;
    expect(recommendedFirstDrop(catalog, state)).toBeNull();
  });
});
