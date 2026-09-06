import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { FittedPart } from './FittedPart';
import { evaluateWeaponReplacement } from './weaponReplacement';

interface ElementProps {
  children?: ReactNode;
  'data-testid'?: string;
  onClick?: (event: { stopPropagation: () => void }) => void;
  onDragOver?: (event: { preventDefault: () => void; stopPropagation: () => void; dataTransfer: { types: string[]; dropEffect: string } }) => void;
  onDrop?: (event: { preventDefault: () => void; stopPropagation: () => void; dataTransfer: { getData: () => string } }) => void;
}
function descendants(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...descendants(node.props.children)];
}
function fixture(weaponId = 'machine_gun', targeting = true) {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel');
  const onReplace = vi.fn();
  const onRemove = vi.fn();
  const target = { kind: 'weapon' as const, id: weaponId };
  const part = FittedPart({
    catalog, locationName: 'Right Arm', snap: false, target: targeting ? target : null, onReplace, onRemove,
    replacement: evaluateWeaponReplacement(catalog, design, 0, weaponId),
    item: { kind: 'weapon', id: 'ac5', index: 0, key: 'm0', label: 'Field Autocannon', slots: 4, tone: 'ballistic', oversized: false },
  });
  return { part, target, onReplace, onRemove };
}

describe('occupied weapon replacement target', () => {
  it('makes a picked weapon previewable with a native keyboard/touch button without removing the old gun', () => {
    const { part, target, onReplace, onRemove } = fixture();
    const html = renderToStaticMarkup(part);
    expect(html).toContain('data-testid="replace-weapon-0"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Preview replacing Field Autocannon with Machine Gun in Right Arm');
    expect(html).toContain('data-replacement-fit="true"');
    const button = descendants(part).find((node) => node.props['data-testid'] === 'replace-weapon-0');
    const event = { stopPropagation: vi.fn() };
    button?.props.onClick?.(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onReplace).toHaveBeenCalledWith(target, 0);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('uses the actual native drop payload and stops it bubbling into empty-slot placement', () => {
    const { part, onReplace, onRemove } = fixture();
    const payload = { kind: 'weapon', id: 'ac2' };
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { getData: () => JSON.stringify(payload) } };
    descendants(part)[0]?.props.onDrop?.(event);
    expect(onReplace).toHaveBeenCalledWith(payload, 0);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('accepts an internal native drag before targeting renders, then previews its actual weapon payload', () => {
    const { part, onReplace, onRemove } = fixture('machine_gun', false);
    const native = {
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
      dataTransfer: { types: ['application/wreckright'], dropEffect: 'none' },
    };
    const handlers = descendants(part)[0]?.props;
    handlers?.onDragOver?.(native);
    expect(native.preventDefault).toHaveBeenCalledOnce();
    expect(native.stopPropagation).toHaveBeenCalledOnce();
    expect(native.dataTransfer.dropEffect).toBe('copy');
    expect(onReplace).not.toHaveBeenCalled();
    const payload = { kind: 'weapon', id: 'ac2' };
    handlers?.onDrop?.({ preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { getData: () => JSON.stringify(payload) } });
    expect(onReplace).toHaveBeenCalledWith(payload, 0);
    expect(onRemove).not.toHaveBeenCalled();
    const external = { ...native, preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { types: ['text/plain'], dropEffect: 'none' } };
    handlers?.onDragOver?.(external);
    expect(external.preventDefault).not.toHaveBeenCalled();
    expect(external.stopPropagation).not.toHaveBeenCalled();
  });

  it('keeps an invalid replacement inspectable and ignores malformed payloads', () => {
    const { part, onReplace } = fixture('medium_laser');
    const html = renderToStaticMarkup(part);
    expect(html).toContain('data-replacement-fit="false"');
    expect(html).toContain('Check replacement:');
    expect(html).not.toContain('disabled=""');
    descendants(part)[0]?.props.onDrop?.({ preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { getData: () => '{bad' } });
    expect(onReplace).not.toHaveBeenCalled();
  });
});
