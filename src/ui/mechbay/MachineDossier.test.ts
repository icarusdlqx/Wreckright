import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { MachineDossier } from './MachineDossier';
import { machinePortraitSource } from './MachinePortrait';

describe('machine field guides', () => {
  it('gives every catalogue machine its own local portrait and concise tradeoffs', () => {
    const sources = new Set<string>();
    for (const chassis of catalog.chassis.values()) {
      const source = machinePortraitSource(chassis.id);
      expect(source, chassis.id).toBeTruthy();
      expect(source).not.toMatch(/^https?:/);
      sources.add(source!);
      expect(chassis.strengths.length, chassis.id).toBeGreaterThan(0);
      expect(chassis.weaknesses.length, chassis.id).toBeGreaterThan(0);
      expect(chassis.summary).not.toMatch(/sealed/i);
      expect(chassis.role).not.toMatch(/sealed/i);
      const html = renderToStaticMarkup(createElement(MachineDossier, { chassis }));
      expect(html).toContain('Strengths');
      expect(html).toContain('Weaknesses');
      expect(html).toContain('Chassis tendencies.');
    }
    expect(sources.size).toBe(catalog.chassis.size);
  });
});
