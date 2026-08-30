import { useSyncExternalStore } from 'react';

type CommanderViewListener = () => void;

let active = false;
const listeners = new Set<CommanderViewListener>();

export function commanderViewActive(): boolean {
  return active;
}

export function subscribeCommanderView(listener: CommanderViewListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCommanderView(activeNow: boolean): void {
  if (active === activeNow) return;
  active = activeNow;
  for (const listener of listeners) listener();
}

export function toggleCommanderView(): boolean {
  setCommanderView(!active);
  return active;
}

export function resetCommanderView(): void {
  setCommanderView(false);
}

export function useCommanderView(): boolean {
  return useSyncExternalStore(subscribeCommanderView, commanderViewActive, () => false);
}
