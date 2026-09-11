import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { BriefingTeam } from './BriefingTeam';
import { briefingLanceFor } from './briefingLance';

describe('briefing pilot and mech pairing', () => {
  it('preserves all five paired seats with only the selected editor exposed', () => {
    const pilots = [...catalog.pilots.keys()].slice(0, 5);
    const model = briefingLanceFor(catalog, 'skirmish_ridge', pilots.map((pilotId, index) => ({
      designId: index === 4 ? null : 'hornet_spotter', pilotId, ...(index === 4 ? { empty: true } : {}),
    })), vi.fn(), vi.fn());
    const html = renderToStaticMarkup(createElement(BriefingTeam, { lance: model }));
    expect(html.match(/data-testid="briefing-berth-\d"/g)).toHaveLength(5);
    expect(html.match(/class="briefing-berth briefing-berth-editor" hidden=""/g)).toHaveLength(4);
    expect(html.match(/class="briefing-pair-mech"/g)).toHaveLength(4);
    expect(html).toContain(`aria-label="Portrait of ${catalog.pilots.get(pilots[0]!)!.name}"`);
    expect(html).toContain('Pilot skills out of five');
    expect(html).toContain('Pilot ability');
    expect(html).toContain('Empty berth');
    expect(html).toContain('data-testid="berth-design-4"');
    expect(html).toContain('data-testid="berth-pilot-4"');
    expect(html).toContain('data-testid="berth-customise-4"');
    expect(html.indexOf('briefing-berth-0')).toBeLessThan(html.indexOf('briefing-berth-4'));
  });

  it('retains scenario vehicles and prevents assigning a pilot already in an occupied seat', () => {
    const scenario = [...catalog.designs.values()].find(design => catalog.chassis.get(design.chassisId)?.frame !== 'mech')!;
    const model = briefingLanceFor(catalog, 'skirmish_ridge', [
      { designId: scenario.id, pilotId: 'kessa_vale' },
      { designId: 'hornet_spotter', pilotId: 'dorn_hess' },
    ], vi.fn(), vi.fn(), 'green');
    const html = renderToStaticMarkup(createElement(BriefingTeam, { lance: model, enemy: true }));
    expect(html).toContain(`value="${scenario.id}" selected=""`);
    expect(html).toContain('(scenario unit)');
    expect(html).toContain('data-testid="enemy-briefing-berth-0"');
    expect(html).toContain('value="dorn_hess" disabled=""');
  });
});
