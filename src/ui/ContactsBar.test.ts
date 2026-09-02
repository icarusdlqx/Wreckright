import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld, spawnDesign } from '../../tests/support';
import { HostileBar, investigationPoint, selectedTargetIds } from './ContactsBar';
import { snapshotUnit } from './snapshot';
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
    onContact: () => undefined,
  });
  return renderToStaticMarkup(
    mobile ? createElement('div', { className: 'mobile-tray' }, contacts) : contacts,
  );
}

function contactButton(html: string): string {
  return html.match(/<button[^>]*data-testid="sensor-contact-91"[^>]*>/)?.[0] ?? '';
}

describe('sensor contact controls', () => {
  it('presents an optical hostile with its complete current identity', () => {
    const world = playerWorld('optical-identity-card');
    const entity = spawnDesign(world, 'hornet_spotter');
    entity.name = "Gadfly GAD-2 'Spotter'";
    const enemy = snapshotUnit(world, entity);
    const html = renderToStaticMarkup(createElement(HostileBar, {
      enemies: [enemy],
      contacts: [],
      targetIds: new Set<number>(),
      hasSelection: true,
      onTarget: () => undefined,
      onContact: () => undefined,
    }));

    expect(html).toContain('Gadfly — 35t Light · Forward spotter · Linewrought');
    expect(html).not.toContain('GAD-2');
  });

  it('offers indirect guidance or investigation without presenting an optical target', () => {
    const html = markup(true);
    const button = contactButton(html);
    expect(html).toContain('aria-label="Battlefield contacts"');
    expect(button).toContain('aria-label="Sensor contact: Heavy mech, ~350m. Current returns guide indirect missiles at 40% of sighted accuracy; other mechs investigate."');
    expect(button).not.toContain('disabled');
    expect(html).toContain('Sensor return · indirect 40% of sighted / investigate');
    expect(html).not.toContain('hostile-health');
  });

  it('keeps the shared mobile contact accessible and disables it without a lance selection', () => {
    const html = markup(false, true);
    const button = contactButton(html);
    expect(html).toContain('class="mobile-tray"');
    expect(button).toContain('disabled');
    expect(button).toContain('Current returns guide indirect missiles at 40% of sighted accuracy');
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
      onContact: () => undefined,
    }));

    expect(html).toContain('last known ~350m');
    expect(html).toContain('Frozen last known · investigate track');
    expect(contactButton(html)).toContain('Frozen last-known returns cannot guide fire');
    expect(contactButton(html)).not.toContain('Current returns guide indirect missiles');
  });
});
