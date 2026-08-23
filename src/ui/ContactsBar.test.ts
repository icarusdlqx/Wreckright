import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HostileBar, investigationPoint, selectedTargetIds } from './ContactsBar';
import type { ContactSnapshot } from './store';

const CONTACT: ContactSnapshot = {
  id: 91,
  team: 1,
  label: 'Heavy mech',
  position: { x: 504, y: 312 },
  approximateRange: 350,
  current: true,
  source: 'sensor',
};

function markup(hasSelection: boolean, mobile = false): string {
  const contacts = createElement(HostileBar, {
    enemies: [],
    contacts: [CONTACT],
    targetIds: new Set<number>(),
    hasSelection,
    onTarget: () => undefined,
    onInvestigate: () => undefined,
  });
  return renderToStaticMarkup(
    mobile ? createElement('div', { className: 'mobile-tray' }, contacts) : contacts,
  );
}

function contactButton(html: string): string {
  return html.match(/<button[^>]*data-testid="sensor-contact-91"[^>]*>/)?.[0] ?? '';
}

describe('sensor contact controls', () => {
  it('offers a desktop investigation order without presenting a direct target', () => {
    const html = markup(true);
    const button = contactButton(html);
    expect(html).toContain('aria-label="Battlefield contacts"');
    expect(button).toContain('aria-label="Investigate sensor contact: Heavy mech, ~350m. This is not a firing solution."');
    expect(button).not.toContain('disabled');
    expect(html).toContain('Sensor return · investigate track');
    expect(html).not.toContain('hostile-health');
  });

  it('keeps the shared mobile contact accessible and disables it without a lance selection', () => {
    const html = markup(false, true);
    const button = contactButton(html);
    expect(html).toContain('class="mobile-tray"');
    expect(button).toContain('disabled');
    expect(button).toContain('This is not a firing solution');
  });

  it('passes only the quantized point into an investigation order', () => {
    const point = investigationPoint(CONTACT);
    expect(point).toEqual({ x: 504, y: 312 });
    expect(Object.keys(point).sort()).toEqual(['x', 'y']);
    expect(point).not.toBe(CONTACT.position);
  });

  it('highlights the exact targeted contact when optical names are duplicated', () => {
    const targets = selectedTargetIds(
      [
        { id: 1, targetId: 42 },
        { id: 2, targetId: null },
      ],
      [1],
    );

    expect(targets.has(41)).toBe(false);
    expect(targets.has(42)).toBe(true);
  });

  it('labels a remembered return as frozen rather than current', () => {
    const html = renderToStaticMarkup(createElement(HostileBar, {
      enemies: [],
      contacts: [{ ...CONTACT, current: false }],
      targetIds: new Set<number>(),
      hasSelection: true,
      onTarget: () => undefined,
      onInvestigate: () => undefined,
    }));

    expect(html).toContain('last known ~350m');
    expect(html).toContain('Frozen last known · investigate track');
  });
});
