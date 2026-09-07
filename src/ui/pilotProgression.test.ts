import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from '../campaign/campaign';
import * as roster from '../campaign/roster';
import { PilotDetail } from './campaign/PilotDetail';
import { nextSpecialityThreshold, skillTraining, traitEffects } from './pilotProgression';

function firstPilot() {
  const pilot = startCampaign(catalog, 'border_dispute', 'progression').pilots[0];
  if (pilot === undefined) throw new Error('campaign has no pilots');
  return pilot;
}

function arne() {
  const state = startCampaign(catalog, 'aurelian_recall', 'arne-progression');
  const pilot = state.pilots.find((entry) => entry.templateId === 'arne_gedde');
  if (pilot === undefined) throw new Error('missing Arne fixture');
  return { state, pilot };
}

function arneMarkup({ state, pilot }: ReturnType<typeof arne>): string {
  return renderToStaticMarkup(createElement(PilotDetail, {
    state, pilot, mutate: () => undefined,
  }));
}

describe('pilot progression readouts', () => {
  it('describes the multipliers authored on a speciality', () => {
    const marksman = catalog.rules.pilotTraits.entries.marksman;
    const hardToKill = catalog.rules.pilotTraits.entries.hard_to_kill;
    if (marksman === undefined || hardToKill === undefined) throw new Error('missing traits');

    expect(traitEffects(marksman)).toEqual(['+10% weapon accuracy']);
    expect(traitEffects(hardToKill)).toEqual(['-50% fatality risk after mech loss']);
  });

  it('shows what the next level costs and changes', () => {
    const pilot = firstPilot();
    const training = skillTraining(catalog, pilot, 'sensors');

    expect(training.cost).toBeGreaterThan(0);
    expect(training.nextLevel).toBe(pilot.sensors + 1);
    expect(training.nextEffect).not.toBe(training.currentEffect);
    expect(training.nextEffect).toMatch(/m sensor reach/);
  });

  it('points at the next authored speciality mark', () => {
    const pilot = firstPilot();
    pilot.traits = [];
    pilot.gunnery = 3;
    pilot.piloting = 3;
    pilot.sensors = 3;

    expect(nextSpecialityThreshold(catalog, pilot)).toBe(
      catalog.rules.pilotTraits.pickAtTotalSkill[0],
    );
  });

  it.each([
    { traits: [], total: 9, expected: 11 },
    { traits: ['marksman'], total: 10, expected: 13 },
    { traits: ['marksman', 'butcher'], total: 10, expected: 15 },
    { traits: ['marksman', 'butcher'], total: 11, expected: 15 },
    { traits: ['marksman', 'butcher'], total: 13, expected: 15 },
    { traits: ['veteran', 'quick_study'], total: 10, expected: 11 },
    { traits: ['marksman', 'veteran'], total: 10, expected: 13 },
  ])('predicts an additional pick for $traits at total $total', ({ traits, total, expected }) => {
    const pilot = firstPilot();
    pilot.traits = traits;
    pilot.gunnery = 5;
    pilot.piloting = Math.min(5, total - 6);
    pilot.sensors = total - pilot.gunnery - pilot.piloting;
    const before = structuredClone(pilot);

    expect(nextSpecialityThreshold(catalog, pilot)).toBe(expected);
    expect(pilot).toEqual(before);

    for (let mark = total + 1; mark < expected; mark += 1) {
      const projected = { ...pilot, piloting: Math.min(5, mark - 6), sensors: Math.max(1, mark - 10) };
      expect(roster.pendingTraitPicks(catalog, projected)).toBe(0);
    }
    const promoted = { ...pilot, piloting: Math.min(5, expected - 6), sensors: Math.max(1, expected - 10) };
    expect(roster.pendingTraitPicks(catalog, promoted)).toBeGreaterThan(0);
  });

  it('keeps Arne’s milestone honest through a real skill purchase and later speciality choice', () => {
    const fixture = arne();
    const { pilot } = fixture;
    pilot.piloting = 3;
    pilot.xp = 1160;
    expect(arneMarkup(fixture)).toContain('Next speciality at 15 total skill — 5 levels to go.');

    expect(roster.raiseSkill(catalog, pilot, 'sensors')).toEqual({ ok: true, reason: null, cost: 760 });
    expect(roster.availableXp(pilot)).toBe(400);
    expect(pilot).toMatchObject({ gunnery: 5, piloting: 3, sensors: 3, traits: ['marksman', 'butcher'] });
    expect(roster.pendingTraitPicks(catalog, pilot)).toBe(0);
    const afterTraining = arneMarkup(fixture);
    expect(afterTraining).toContain('Next speciality at 15 total skill — 4 levels to go.');
    expect(afterTraining).not.toContain('Speciality earned');

    pilot.piloting = 5;
    pilot.sensors = 5;
    const earned = arneMarkup(fixture);
    expect(earned).toContain('Speciality earned. Choose one:');
    expect(earned).toContain(`data-testid="camp-pick-${pilot.id}-evasive"`);
    expect(earned).not.toContain(`data-testid="camp-pick-${pilot.id}-marksman"`);
    expect(roster.chooseTrait(catalog, pilot, 'evasive').ok).toBe(true);
    expect(arneMarkup(fixture)).toContain('Speciality track complete.');
    expect(nextSpecialityThreshold(catalog, pilot)).toBeNull();
  });

  it('does not promise a milestone for dead, capped or fully skilled pilots', () => {
    const { pilot } = arne();
    pilot.dead = true;
    expect(nextSpecialityThreshold(catalog, pilot)).toBeNull();
    pilot.dead = false;
    pilot.traits.push('evasive');
    expect(nextSpecialityThreshold(catalog, pilot)).toBeNull();
    pilot.traits = [];
    pilot.gunnery = pilot.piloting = pilot.sensors = 5;
    expect(nextSpecialityThreshold(catalog, pilot)).toBeNull();
  });

  it('does not promise a future milestone when all offered specialities are already held', () => {
    const { pilot } = arne();
    const limited = structuredClone(catalog);
    for (const [id, trait] of Object.entries(limited.rules.pilotTraits.entries)) {
      if (!pilot.traits.includes(id)) trait.trainable = false;
    }
    expect(pilot.traits.length).toBeLessThan(limited.rules.pilotTraits.maxTraits);
    expect(roster.offeredTraits(limited, pilot)).toEqual([]);
    expect(nextSpecialityThreshold(limited, pilot)).toBeNull();
  });

  it('does not render an empty choice after earning a pick when none are offered', () => {
    const fixture = arne();
    fixture.pilot.gunnery = fixture.pilot.piloting = fixture.pilot.sensors = 5;
    expect(roster.pendingTraitPicks(catalog, fixture.pilot)).toBe(1);
    const offered = vi.spyOn(roster, 'offeredTraits').mockReturnValue([]);
    try {
      const markup = arneMarkup(fixture);
      expect(markup).toContain('No further specialities available.');
      expect(markup).not.toContain('Speciality earned');
      expect(markup).not.toContain('Next speciality');
    } finally {
      offered.mockRestore();
    }
  });
});
