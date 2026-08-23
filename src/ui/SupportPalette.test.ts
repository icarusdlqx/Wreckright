import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupportPalette } from './SupportPalette';
import type { SupportOption } from './supportOptions';

const OPTIONS: readonly SupportOption[] = [
  {
    id: 'sensor_probe',
    label: 'Sensor Probe',
    cost: 200,
    effect: 'Detect and classify coarse contacts within 260m for 30s with no delay; does not reveal terrain or grant optical line of sight or targeting.',
    placement: 'Click or tap the centre of the sweep.',
  },
  {
    id: 'air_strike',
    label: 'Air Strike',
    cost: 700,
    effect: 'Seven impacts across a lane after 4s.',
    placement: 'Drag the lane on desktop.',
  },
  {
    id: 'repair_truck',
    label: 'Repair Truck',
    cost: 500,
    effect: 'Restore armour around a temporary field rig.',
    placement: 'Click or tap where damaged mechs can gather.',
  },
];

function markup(
  embedded = false,
  active: SupportOption['id'] | null = null,
  notice: string | null = null,
): string {
  return renderToStaticMarkup(
    createElement(SupportPalette, {
      options: OPTIONS,
      resourcePoints: 400,
      active,
      notice,
      reservesLeft: 0,
      embedded,
      onPick: () => undefined,
    }),
  );
}

describe('compact support palette', () => {
  it('uses one disclosure in the desktop HUD and keeps every call discoverable', () => {
    const html = markup();

    expect(html).toContain('data-testid="support-toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('class="support-drawer"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('data-testid="support-sensor_probe"');
    expect(html).toContain('data-testid="support-air_strike"');
    expect(html).toContain('data-testid="support-repair_truck"');
    expect(html).toContain('does not reveal terrain or grant optical line of sight or targeting');
    expect(html).toContain('300 RP short.');
    const air = html.match(/<button[^>]+data-testid="support-air_strike"[^>]*>/u)?.[0];
    expect(air).toContain('aria-disabled="true"');
  });

  it('surfaces a rejected placement next to the still-armed call', () => {
    const html = markup(false, 'sensor_probe', 'that point is off the map');

    expect(html).toContain('data-testid="support-notice"');
    expect(html).toContain('Support: that point is off the map.');
    expect(html).toContain('role="status"');
  });

  it('keeps the selected call visible after the drawer closes', () => {
    const html = markup(false, 'sensor_probe');

    expect(html).toContain('class="support-toggle active"');
    expect(html).toContain('<span>Sensor Probe</span>');
    expect(html).toContain('aria-pressed="true"');
  });

  it('opens choices directly inside the dedicated mobile Support tray', () => {
    const html = markup(true);

    expect(html).not.toContain('data-testid="support-toggle"');
    expect(html).toContain('class="support open embedded"');
    expect(html).not.toContain('hidden=""');
    expect(html).toContain('data-testid="resource-points"');
  });
});
