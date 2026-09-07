import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from '../campaign/campaign';
import { asPilot } from '../campaign/roster';
import { deserialiseCampaign, serialiseCampaign } from '../campaign/save';
import { PilotSchema } from '../schema/pilot';
import { PilotCallSchema } from '../schema/pilotPersonality';
import { PilotProfile } from './PilotProfile';
import { pilotPersonality } from './pilotPersonality';

describe('authored pilot personalities', () => {
  it('gives every pilot a distinct temperament and distinct lines for each supported situation', () => {
    const pilots = [...catalog.pilots.values()];
    expect(pilots).toHaveLength(24);
    expect(new Set(pilots.map((pilot) => pilot.personality?.label)).size).toBe(pilots.length);
    for (const call of PilotCallSchema.options) {
      const lines = pilots.map((pilot) => pilot.personality?.lines[call][0]);
      expect(lines.every((line) => typeof line === 'string' && line.length > 0)).toBe(true);
      expect(new Set(lines).size).toBe(pilots.length);
    }
  });

  it('keeps voice optional for old/custom pilot data', () => {
    const source = catalog.pilots.get('juno_reyes')!;
    const { personality: _personality, ...legacy } = source;
    expect(PilotSchema.parse(legacy).personality).toBeUndefined();
    expect(pilotPersonality(catalog, legacy)?.label).toBe('Fiery risk-taker');
    expect(pilotPersonality(catalog, { id: 'unknown_custom_pilot' })).toBeUndefined();
  });

  it('retains the same personality through company save, reload, and battle conversion without new save fields', () => {
    for (const faction of ['border_dispute', 'aurelian_recall']) {
      const state = startCampaign(catalog, faction, 'personality-save');
      const saved = serialiseCampaign(state);
      expect(saved).not.toContain('"personality":');
      const result = deserialiseCampaign(saved, catalog);
      expect(result.error).toBeNull();
      for (const record of result.state!.pilots) {
        const authored = catalog.pilots.get(record.templateId)!.personality;
        expect(authored).toBeDefined();
        expect(pilotPersonality(catalog, record)).toBe(authored);
        expect(pilotPersonality(catalog, asPilot(record))).toBe(authored);
      }
    }
  });

  it('shows personality alongside biography and skill strengths on an existing crew record', () => {
    const state = startCampaign(catalog, 'aurelian_recall', 'personality-profile');
    const pilot = state.pilots.find((entry) => entry.templateId === 'petra_lindqvist')!;
    const markup = renderToStaticMarkup(createElement(PilotProfile, { pilot }));
    expect(markup).toContain('Temperament · Cool observer');
    expect(markup).toContain('Wry, measured and difficult to rattle.');
    expect(markup).toContain('Strength:');
    expect(markup).toContain('Portrait of Petra Lindqvist');
  });
});
