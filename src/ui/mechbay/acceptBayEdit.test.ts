import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { createBayEditAcceptor } from './acceptBayEdit';
import { evaluateDrop } from './mechbayEdits';

describe('rejected fitting context', () => {
  it('reports a rejected weapon drop without changing the shelf filter, armed item or draft', () => {
    const design = catalog.designs.get('hornet_spotter')!;
    const callbacks = {
      commitDraft: vi.fn(), setStatus: vi.fn(), setSelectedLocation: vi.fn(),
      setArmed: vi.fn(), setShelf: vi.fn(), setInspected: vi.fn(),
    };
    const evaluation = evaluateDrop(catalog, design, { kind: 'weapon', id: 'flamer' }, 'head');
    expect(evaluation.status).toBe('blocked');
    expect(createBayEditAcceptor({ catalog, ...callbacks })(evaluation, 'head')).toBe(false);
    expect(callbacks.setStatus).toHaveBeenCalledWith({ tone: 'error', text: evaluation.reasons[0]?.message });
    expect(callbacks.setSelectedLocation).not.toHaveBeenCalled();
    expect(callbacks.setArmed).not.toHaveBeenCalled();
    expect(callbacks.setShelf).not.toHaveBeenCalled();
    expect(callbacks.setInspected).not.toHaveBeenCalled();
    expect(callbacks.commitDraft).not.toHaveBeenCalled();
  });
});
