import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Briefing } from './Briefing';

describe('briefing deployment gate', () => {
  it('keeps an invalid setup on the ground with its reason attached', () => {
    const html = renderToStaticMarkup(
      createElement(Briefing, {
        name: 'Ridge Pass',
        text: 'Hold the road.',
        objectives: [],
        resourcePoints: 0,
        deployDisabled: true,
        deployReason: 'Use at least three letters or numbers.',
        onDeploy: () => undefined,
      }),
    );

    expect(html).toContain('data-testid="briefing-deploy"');
    expect(html).toContain('data-testid="briefing-actions"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="Use at least three letters or numbers."');
  });

  it('keeps the training briefing fixed and offers the campaign exit', () => {
    const html = renderToStaticMarkup(
      createElement(Briefing, {
        name: 'Range Walk',
        text: 'Range control has the line.',
        objectives: [],
        resourcePoints: 80,
        setup: createElement('div', { 'data-testid': 'setup-controls' }),
        lance: {
          berths: [],
          designs: [],
          saved: [],
          pilots: [],
          total: 0,
          allowance: 0,
          onDesign: () => undefined,
          onPilot: () => undefined,
          onCustomise: () => undefined,
        },
        training: { onSkip: () => undefined },
        onDeploy: () => undefined,
      }),
    );

    expect(html).toContain('Begin range walk');
    expect(html).toContain('data-testid="training-skip"');
    expect(html).toContain('Skip to campaign');
    expect(html).not.toContain('data-testid="setup-controls"');
    expect(html).not.toContain('data-testid="briefing-lance"');
    expect(html).not.toContain('Resource Points');
    expect(html).not.toContain('Refit loadout');
  });

  it('prints complete machine identity options without appending duplicate tonnage', () => {
    const identity = 'Gadfly — 35t Light · Forward spotter · Linewrought';
    const html = renderToStaticMarkup(
      createElement(Briefing, {
        name: 'Ridge Pass',
        text: 'Hold the road.',
        objectives: [],
        resourcePoints: 80,
        lance: {
          berths: [{
            index: 0,
            designValue: 'hornet_spotter',
            customLabel: null,
            pilotId: 'kessa_vale',
            tonnage: 35,
            pilot: null,
          }],
          designs: [{ value: 'hornet_spotter', label: identity }],
          saved: [],
          pilots: [{ id: 'kessa_vale', name: 'Kessa Vale' }],
          total: 35,
          allowance: 180,
          onDesign: () => undefined,
          onPilot: () => undefined,
          onCustomise: () => undefined,
        },
        onDeploy: () => undefined,
      }),
    );

    expect(html).toContain(identity);
    expect(html).not.toContain(`${identity} — 35t`);
  });
});
