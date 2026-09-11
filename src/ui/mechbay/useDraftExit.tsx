import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Design } from '../../schema/design';
import { useDialogFocus } from '../useDialogFocus';
import { designHasChanges } from './draftChanges';
import './draftExit.css';

export function useDraftExit({ design, bayRef, onExit, onSave }: {
  design: Design;
  bayRef: RefObject<HTMLDivElement | null>;
  onExit: () => void;
  onSave: () => boolean;
}) {
  const [saved, setSaved] = useState(design);
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const pending = useRef<() => void>(onExit);
  const dirty = designHasChanges(saved, design);
  const dirtyNow = useRef(dirty);
  dirtyNow.current = dirty;
  const requestAction = (action: () => void, replacing = true): void => {
    // File reads can finish after another edit has produced a new render.
    if (!dirtyNow.current) { action(); return; }
    pending.current = action;
    setSwitching(replacing);
    setConfirming(true);
  };
  const requestExit = (): void => requestAction(onExit, false);
  const latest = useRef(requestExit);
  latest.current = requestExit;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || bayRef.current?.closest('[inert]') !== null) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bayRef]);
  const save = (): boolean => {
    if (!onSave()) return false;
    setSaved(design);
    return true;
  };
  return {
    dirty, confirming, switching, requestExit, requestAction, save,
    reset: setSaved,
    keepEditing: () => setConfirming(false),
    discard: () => { setConfirming(false); pending.current(); },
    saveAndExit: () => { if (save()) pending.current(); setConfirming(false); },
  };
}

export function DraftExitDialog({ saveable, switching = false, onSave, onDiscard, onKeep }: {
  saveable: boolean;
  switching?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeep: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialog, keep, onKeep);
  return <div className="bay-draft-backdrop">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="bay-draft-title"
      className="bay-draft-dialog" data-testid="bay-unsaved-dialog" tabIndex={-1}>
      <span className="bay-draft-eyebrow">Unsaved refit</span>
      <h2 id="bay-draft-title">Keep these changes?</h2>
      <p>Your fitted weapons, armour and cooling changes are still a draft.</p>
      {switching ? <p>Save this loadout before switching, or discard the draft to load the selected machine.</p> : null}
      {!saveable ? <p>Resolve the build issues before saving, or keep editing to review them.</p> : null}
      <footer>
        <button ref={keep} type="button" onClick={onKeep} data-testid="bay-unsaved-keep">Keep editing</button>
        <button type="button" onClick={onDiscard} data-testid="bay-unsaved-discard">Discard changes</button>
        <button type="button" className="primary" onClick={onSave} disabled={!saveable} data-testid="bay-unsaved-save">{switching ? 'Save and switch' : 'Save and leave'}</button>
      </footer>
    </section>
  </div>;
}
