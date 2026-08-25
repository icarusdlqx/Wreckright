import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) =>
      !element.hasAttribute('disabled') && element.tabIndex >= 0 && element.getClientRects().length > 0,
  );
}

export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onEscape?: () => void,
): void {
  // Latched rather than depended upon. A caller that passes an inline arrow
  // would otherwise re-run the whole effect on every parent render, and the
  // teardown restores focus to whatever held it before the dialog opened —
  // so a re-render would walk the keyboard user back to the start each time.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocus = initialFocusRef.current ?? focusableWithin(dialogRef.current ?? document.body)[0];

    initialFocus?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      const escape = escapeRef.current;
      if (event.key === 'Escape' && escape !== undefined) {
        event.preventDefault();
        escape();
        return;
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return;

      const focusable = focusableWithin(dialogRef.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      const active = document.activeElement;
      const activeIsFocusable = active instanceof HTMLElement && focusable.includes(active);
      if (!dialogRef.current.contains(active) || !activeIsFocusable) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      priorFocus?.focus();
    };
  }, [dialogRef, initialFocusRef]);
}
