import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commanderViewActive,
  resetCommanderView,
  setCommanderView,
  subscribeCommanderView,
  toggleCommanderView,
} from './commanderViewState';

describe('Commander view state', () => {
  afterEach(resetCommanderView);

  it('publishes only real transitions', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCommanderView(listener);

    setCommanderView(true);
    setCommanderView(true);
    expect(commanderViewActive()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    resetCommanderView();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('toggles and resets the shared mode', () => {
    expect(toggleCommanderView()).toBe(true);
    expect(toggleCommanderView()).toBe(false);

    setCommanderView(true);
    resetCommanderView();
    expect(commanderViewActive()).toBe(false);
  });
});
