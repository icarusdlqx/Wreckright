import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { PilotAppearanceSchema } from '../schema/pilotAppearance';
import { PilotPortrait } from './PilotPortrait';

describe('authored pilot identity', () => {
  it('resolves saved crew identities from their original template in every portrait size', () => {
    const pilot = catalog.pilots.get('kessa_vale')!;
    const html = renderToStaticMarkup(createElement(PilotPortrait, { pilot: { id: 'pilot-81', templateId: pilot.id, name: 'Kessa Vale' }, compact: true }));
    expect(html).toContain('data-testid="portrait-kessa_vale"');
    expect(html).toContain('data-expression="resolute"');
    expect(html).toContain('Portrait of Kessa Vale');
    expect(html).toContain('is-compact');
  });

  it('keeps the whole crew individually authored without shared appearance records', () => {
    const appearances = [...catalog.pilots.values()].map(pilot => pilot.portrait);
    expect(appearances.every(appearance => appearance !== undefined)).toBe(true);
    expect(new Set(appearances.map(appearance => JSON.stringify(appearance))).size).toBe(appearances.length);
    expect(new Set(appearances.map(appearance => appearance?.style)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(appearances.map(appearance => appearance?.kit)).size).toBe(5);
  });

  it('accepts older cosmetic records and unknown crew without breaking rendering', () => {
    const older = { skin: '#c68d67', hair: '#252c30', jacket: '#394c52', accent: '#ed9d5c', style: 'crop', face: 'angular', detail: 'earpiece' };
    expect(PilotAppearanceSchema.parse(older)).toMatchObject({ expression: 'calm', kit: 'workcoat', accessory: 'none', age: 'mature' });
    const html = renderToStaticMarkup(createElement(PilotPortrait, { pilot: { id: 'imported-crew', name: 'Visiting pilot' } }));
    expect(html).toContain('Portrait of Visiting pilot');
    expect(html).toContain('viewBox="0 0 160 200"');
  });
});
