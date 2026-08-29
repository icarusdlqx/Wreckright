import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import {
  ARMOUR_DOLL_POSITIONS,
  ArmourPaperDoll,
  armourValueFromHorizontalDrag,
  armourValueFromWheel,
  clampArmourValue,
} from './ArmourPaperDoll';

function stock(id: string): { chassis: Chassis; design: Design } {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing design ${id}`);
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) throw new Error(`missing chassis ${design.chassisId}`);
  return { chassis, design };
}

function render(
  id: string,
  activeLocations: readonly MechLocation[],
  classMedians: Readonly<Partial<Record<MechLocation, number | null>>> = {},
): string {
  const { chassis, design } = stock(id);
  return renderToStaticMarkup(createElement(ArmourPaperDoll, {
    chassis,
    design,
    activeLocations,
    classMedians,
    plateWeightTons: 8.8,
    onPreview: () => undefined,
    onPreviewEnd: () => undefined,
  }));
}

function elementWithTestId(html: string, testId: string, closingTag: string): string {
  const marker = `data-testid="${testId}"`;
  const markerAt = html.indexOf(marker);
  const start = html.lastIndexOf('<', markerAt);
  if (markerAt < 0 || start < 0) throw new Error(`missing ${testId}`);
  const end = html.indexOf(closingTag, start);
  return html.slice(start, end + closingTag.length);
}

describe('armour paper doll presentation', () => {
  it('uses one native button per active location and one native selected slider', () => {
    const active = [
      'head',
      'centre_torso',
      'left_torso',
      'right_torso',
      'left_arm',
      'right_arm',
      'left_leg',
      'right_leg',
    ] as const;
    const { design } = stock('sentinel_brawler');
    const html = render('sentinel_brawler', active, {
      left_torso: design.armour.left_torso + 1,
    });

    expect(html.match(/data-testid="armour-doll-(?!slider)[^"]+"/g)).toHaveLength(active.length);
    expect(html.match(/<button/g)).toHaveLength(active.length);
    expect(html.match(/type="range"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="armour-doll-slider"');
    expect(elementWithTestId(html, 'armour-doll-head', '</button>')).toContain('aria-pressed="true"');
    expect(elementWithTestId(html, 'armour-doll-left_torso', '</button>')).toContain(
      'below class median',
    );
    expect(elementWithTestId(html, 'armour-doll-left_torso', '</button>')).toContain(
      'Below class median',
    );
    expect(elementWithTestId(html, 'armour-doll-left_torso', '</button>')).toContain(
      `${design.armour.left_torso} of`,
    );
    expect(html).toContain('data-armour-state="under-armoured"');
    expect(elementWithTestId(html, 'armour-doll-slider', '>')).toContain(
      'total plating 8.8 tons',
    );
  });

  it('keeps the composed SVG presentational and outside the tab order', () => {
    const html = render('sentinel_brawler', ['head', 'centre_torso']);
    const silhouette = html.slice(
      html.indexOf('class="armour-paper-doll__silhouette"'),
      html.indexOf('</svg>') + '</svg>'.length,
    );

    expect(silhouette).toContain('aria-hidden="true"');
    expect(silhouette).toContain('inert=""');
    expect(silhouette).toContain('data-testid="chassis-silhouette"');
    expect(silhouette).not.toContain('tabindex=');
  });

  it('uses canonical absolute positions for mech, vehicle, and turret subsets', () => {
    const vehicle = render('courser_patrol', [
      'centre_torso',
      'left_torso',
      'right_torso',
      'left_leg',
      'right_leg',
    ]);
    const turret = render('redoubt_emplacement', ['centre_torso']);

    expect(vehicle.match(/data-armour-doll-location=/g)).toHaveLength(5);
    expect(vehicle).not.toContain('data-armour-doll-location="left_arm"');
    expect(turret.match(/data-armour-doll-location=/g)).toHaveLength(1);
    expect(turret).toContain('data-armour-doll-location="centre_torso"');
    expect(turret).toContain(`left:${ARMOUR_DOLL_POSITIONS.centre_torso.x}%`);
    expect(turret).toContain(`top:${ARMOUR_DOLL_POSITIONS.centre_torso.y}%`);
  });
});

describe('armour paper doll gestures', () => {
  it('clamps direct, horizontal-drag, and wheel values at both bounds', () => {
    expect(clampArmourValue(-4, 20)).toBe(0);
    expect(clampArmourValue(99, 20)).toBe(20);
    expect(clampArmourValue(Number.NaN, 20)).toBe(0);

    expect(armourValueFromHorizontalDrag(10, 100, 120, 20)).toBe(15);
    expect(armourValueFromHorizontalDrag(10, 100, -20, 20)).toBe(0);
    expect(armourValueFromHorizontalDrag(18, 100, 200, 20)).toBe(20);

    expect(armourValueFromWheel(10, -1, 20)).toBe(11);
    expect(armourValueFromWheel(10, 1, 20)).toBe(9);
    expect(armourValueFromWheel(20, -1, 20)).toBe(20);
    expect(armourValueFromWheel(0, 1, 20)).toBe(0);
    expect(armourValueFromWheel(10, 0, 20)).toBe(10);
  });
});
