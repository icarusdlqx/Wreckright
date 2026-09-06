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
  const dirty = designHasChanges(saved, design);
  const requestExit = (): void => { if (dirty) setConfirming(true); else onExit(); };
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
    dirty, confirming, requestExit, save,
    reset: setSaved,
    keepEditing: () => setConfirming(false),
    discard: onExit,
    saveAndExit: () => { if (save()) onExit(); else setConfirming(false); },
  };
}

export function DraftExitDialog({ saveable, onSave, onDiscard, onKeep }: {
  saveable: boolean;
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
      {!saveable ? <p>Resolve the build issues before saving, or keep editing to review them.</p> : null}
      <footer>
        <button ref={keep} type="button" onClick={onKeep} data-testid="bay-unsaved-keep">Keep editing</button>
        <button type="button" onClick={onDiscard} data-testid="bay-unsaved-discard">Discard changes</button>
        <button type="button" className="primary" onClick={onSave} disabled={!saveable} data-testid="bay-unsaved-save">Save and leave</button>
      </footer>
    </section>
  </div>;
}
