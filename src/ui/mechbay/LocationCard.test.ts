import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { computeLoadout } from '../../sim/loadout';
import {
  LocationCard,
  mutateAfterStableFocus,
  stableRemovalFocusTarget,
} from './LocationCard';

type CardProps = Parameters<typeof LocationCard>[0];

interface TestButtonProps {
  children?: ReactNode;
  'data-testid'?: string;
  onClick?: (event: {
    stopPropagation: () => void;
    currentTarget: {
      closest: () => { querySelector: () => Pick<HTMLElement, 'focus'> | null } | null;
    };
  }) => void;
  onFocus?: () => void;
}

function descendants(node: ReactNode): ReactElement<TestButtonProps>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<TestButtonProps>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

function fixtureProps(
  location: 'left_arm' | 'right_arm' | 'right_torso',
  overrides: Partial<CardProps> = {},
): CardProps {
  const design = catalog.designs.get('sentinel_brawler');
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (design === undefined || chassis === undefined) throw new Error('missing Sentinel fixture');
  const loadout = computeLoadout(catalog, design);
  return {
    catalog,
    chassis,
    design,
    location,
    usage: loadout.perLocation[location],
    onDrop: () => undefined,
    onRemoveMount: () => undefined,
    onRemoveAmmo: () => undefined,
    onRemoveEquipment: () => undefined,
    ...overrides,
  };
}

function render(location: 'left_arm' | 'right_torso', compatible: boolean): string {
  return renderToStaticMarkup(createElement(LocationCard, fixtureProps(location, {
    armed: { kind: 'weapon', id: 'medium_laser' },
    compatible,
  })));
}

describe('location workbench card', () => {
  it('moves focus to a stable location control before a removal mutates the row', () => {
    const order: string[] = [];
    const focus = vi.fn(() => order.push('focus'));
    const mutate = vi.fn(() => order.push('mutate'));

    mutateAfterStableFocus({ focus }, mutate);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(mutate).toHaveBeenCalledOnce();
    expect(order).toEqual(['focus', 'mutate']);
  });

  it('falls back to the selected enabled location when the removed location is disabled', () => {
    const ownLocation = { disabled: true, focus: vi.fn() };
    const selectedLocation = { disabled: false, focus: vi.fn() };
    const ownCard = { querySelector: () => ownLocation };
    const mechbay = {
      querySelector: (selector: string) =>
        selector.includes('.selected') ? selectedLocation : null,
    };
    const removeControl = {
      closest: (selector: string) => selector === '.bay-location' ? ownCard : mechbay,
    };

    expect(stableRemovalFocusTarget(removeControl as unknown as HTMLElement)).toBe(selectedLocation);
  });

  it('marks only compatible weapon locations as placement targets', () => {
    const invalid = render('left_arm', false);
    const valid = render('right_torso', true);

    expect(invalid).not.toContain('armed-target');
    expect(invalid).toContain('disabled=""');
    expect(valid).toContain('armed-target');
    expect(valid).toContain('data-compatible="true"');
    expect(valid).not.toContain('disabled=""');
  });

  it('reads an explicit design front and rear allocation', () => {
    const design = catalog.designs.get('sentinel_brawler');
    const chassis = catalog.chassis.get('sentinel_snl2');
    if (design === undefined || chassis === undefined) throw new Error('missing Sentinel fixture');
    const exact = structuredClone(design);
    exact.rearArmour = { centre_torso: 3, left_torso: 4, right_torso: 5 };
    const loadout = computeLoadout(catalog, exact);
    const html = renderToStaticMarkup(createElement(LocationCard, {
      catalog,
      chassis,
      design: exact,
      location: 'right_torso',
      usage: loadout.perLocation.right_torso,
      onDrop: () => undefined,
      onRemoveMount: () => undefined,
      onRemoveAmmo: () => undefined,
      onRemoveEquipment: () => undefined,
    }));

    expect(html).toContain(`bay-armour-compact">${exact.armour.right_torso - 5}+5<`);
    expect(html).toContain('47 front · 5 rear · 52/52 total');
    expect(html).toContain('aria-label="Armour: 47 front, 5 rear, 52 of 52 total"');
  });

  it('keeps the resting card to its name, rack, and compressed armour line', () => {
    const html = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_torso')));

    expect(html).toContain('aria-label="Right Torso location, 2 of 6 slots used');
    expect(html).toContain('data-testid="slots-grid-right_torso"');
    expect(html).toContain('bay-armour-compact');
    expect(html).not.toContain('class="bay-slots');
    expect(html).not.toContain('class="bay-hardpoints"');
    expect(html).not.toContain('class="bay-location-flags"');
    expect(html).not.toContain('bay-location-refusal');
  });

  it('marks only the newly landed occupant for class-driven snap feedback', () => {
    const html = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_torso', {
      snapTarget: { kind: 'equipment', id: 'case' },
      snapPhase: 1,
    })));

    expect(html.match(/snap-target/g)).toHaveLength(1);
    expect(html).toMatch(/slot-block tone-gear snap-target[^>]*>[\s\S]*?Blowout Cell/);
    expect(html).not.toMatch(/slot-block tone-ammo snap-target/);
  });

  it('inspects fitted weapons, ammunition, and gear without removing them', () => {
    const onInspect = vi.fn();
    const onDrop = vi.fn();
    const onRemoveMount = vi.fn();
    const onRemoveAmmo = vi.fn();
    const onRemoveEquipment = vi.fn();
    const shared = {
      armed: { kind: 'weapon' as const, id: 'medium_laser' },
      onInspect,
      onDrop,
      onRemoveMount,
      onRemoveAmmo,
      onRemoveEquipment,
    };
    const arm = LocationCard(fixtureProps('right_arm', shared));
    const torso = LocationCard(fixtureProps('right_torso', shared));
    const buttons = [...descendants(arm), ...descendants(torso)];
    const control = (testId: string): ReactElement<TestButtonProps> => {
      const match = buttons.find((button) => button.props['data-testid'] === testId);
      if (match === undefined) throw new Error(`missing ${testId}`);
      return match;
    };
    const stableFocus = vi.fn();
    const event = {
      stopPropagation: vi.fn(),
      currentTarget: {
        closest: () => ({ querySelector: () => ({ focus: stableFocus }) }),
      },
    };

    control('inspect-weapon-0').props.onClick?.(event);
    control('inspect-ammo-0').props.onFocus?.();
    control('inspect-equipment-0').props.onClick?.(event);

    expect(onInspect.mock.calls).toEqual([
      [{ kind: 'weapon', id: 'ac5' }],
      [{ kind: 'ammo', id: 'ac5' }],
      [{ kind: 'equipment', id: 'case' }],
    ]);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onRemoveMount).not.toHaveBeenCalled();
    expect(onRemoveAmmo).not.toHaveBeenCalled();
    expect(onRemoveEquipment).not.toHaveBeenCalled();

    control('remove-weapon-0').props.onClick?.(event);
    control('remove-ammo-0').props.onClick?.(event);
    control('remove-equipment-0').props.onClick?.(event);

    expect(onRemoveMount).toHaveBeenCalledWith(0);
    expect(onRemoveAmmo).toHaveBeenCalledWith(0);
    expect(onRemoveEquipment).toHaveBeenCalledWith(0);
    expect(stableFocus).toHaveBeenCalledTimes(3);
    expect(stableFocus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(event.stopPropagation).toHaveBeenCalledTimes(5);
  });

  it('labels compatible, blocked, selected, and invalid states in text', () => {
    const design = catalog.designs.get('sentinel_brawler');
    if (design === undefined) throw new Error('missing Sentinel fixture');
    const broken = structuredClone(design);
    broken.mounts.push({ weaponId: 'ac20', location: 'left_arm' });
    const html = renderToStaticMarkup(createElement(LocationCard, {
      ...fixtureProps('left_arm'),
      design: broken,
      usage: computeLoadout(catalog, broken).perLocation.left_arm,
      selected: true,
      armed: { kind: 'weapon', id: 'medium_laser' },
      compatible: false,
    }));

    expect(html).toContain('Selected');
    expect(html).toContain('Cannot fit held part');
    expect(html).toContain('Weapon too large');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('data-invalid="true"');
  });

  it('says what each location takes, in shelf words', () => {
    const torso = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_torso')));
    expect(torso).toContain('data-testid="capacity-right_torso"');
    expect(torso).toContain('Takes 2 energy · 1 ballistic, up to medium');

    const arm = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_arm')));
    expect(arm).toContain('Takes 1 ballistic, up to heavy');
  });

  it('offers a swap beside removal only on fitted weapons, and only when asked', () => {
    const onSwapMount = vi.fn();
    const html = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_torso', {
      onSwapMount,
    })));
    expect(html).not.toContain('slot-block__swap');

    const arm = LocationCard(fixtureProps('right_arm', { onSwapMount }));
    const swap = descendants(arm).find(
      (button) => button.props['data-testid'] === 'swap-weapon-0',
    );
    if (swap === undefined) throw new Error('missing swap control');
    const event = {
      stopPropagation: vi.fn(),
      currentTarget: { closest: () => null },
    };
    swap.props.onClick?.(event);
    expect(onSwapMount).toHaveBeenCalledWith(0);
    expect(event.stopPropagation).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_arm', {
      onSwapMount,
    })));
    expect(markup).toContain('slot-block--swappable');
    expect(markup).toContain('aria-label="Swap Field Autocannon in Right Arm"');
    expect(markup).toContain('aria-label="Remove Field Autocannon from Right Arm"');
  });

  it('renders separate, plainly named inspect and remove controls', () => {
    const html = renderToStaticMarkup(createElement(LocationCard, fixtureProps('right_torso')));

    expect(html).toContain('aria-label="Inspect Field Autocannon ammo ×1"');
    expect(html).toContain('aria-label="Remove Field Autocannon ammo ×1 from Right Torso"');
    expect(html).toContain('aria-label="Inspect Blowout Cell"');
    expect(html).toContain('aria-label="Remove Blowout Cell from Right Torso"');
    expect(html).not.toContain('Click to remove');
  });
});
