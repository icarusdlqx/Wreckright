export function mutateAfterStableFocus(
  focusTarget: Pick<HTMLElement, 'focus'> | null,
  mutate: () => void,
): void {
  focusTarget?.focus({ preventScroll: true });
  mutate();
}

export function stableRemovalFocusTarget(removeControl: HTMLElement): HTMLButtonElement | null {
  const ownLocation = removeControl.closest('.bay-location')?.querySelector<HTMLButtonElement>('.bay-location-name') ?? null;
  if (ownLocation !== null && !ownLocation.disabled) return ownLocation;
  const mechbay = removeControl.closest('[data-testid="mechbay"]');
  return mechbay?.querySelector<HTMLButtonElement>('.bay-location.selected .bay-location-name:not(:disabled)')
    ?? mechbay?.querySelector<HTMLButtonElement>('.bay-location-name:not(:disabled)')
    ?? mechbay?.querySelector<HTMLButtonElement>('[data-workspace-tab][aria-selected="true"]')
    ?? mechbay?.querySelector<HTMLButtonElement>('[data-testid="bay-exit"]')
    ?? null;
}
