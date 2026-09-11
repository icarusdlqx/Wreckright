import { describe, expect, it } from 'vitest';
import { selectionAfterClick } from './selectionAfterClick';

describe('lance and field selection', () => {
  it('replaces normally and toggles only the chosen unit for Shift-click', () => {
    expect(selectionAfterClick([1, 2], 3, false)).toEqual([3]);
    expect(selectionAfterClick([1, 2], 3, true)).toEqual([1, 2, 3]);
    expect(selectionAfterClick([1, 2], 2, true)).toEqual([1]);
  });
});
