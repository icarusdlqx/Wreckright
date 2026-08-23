import type { Design } from '../../schema/design';

export interface DesignHistory {
  readonly past: readonly Design[];
  readonly present: Design;
  readonly future: readonly Design[];
  /** Repeated previews with one key belong to a single undoable interaction. */
  readonly transaction: string | null;
}

const clone = (design: Design): Design => structuredClone(design);

export function beginDesignHistory(design: Design): DesignHistory {
  return { past: [], present: clone(design), future: [], transaction: null };
}

function same(left: Design, right: Design): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Shows a fluid input preview while recording only its first value as the undo
 * point. Starting any real preview after Undo immediately discards stale redo.
 */
export function previewDesign(
  history: DesignHistory,
  transaction: string,
  design: Design,
): DesignHistory {
  if (same(history.present, design)) {
    return history.transaction !== null && history.transaction !== transaction
      ? { ...history, transaction: null }
      : history;
  }
  if (history.transaction === transaction) {
    return { ...history, present: clone(design) };
  }
  return {
    past: [...history.past, clone(history.present)],
    present: clone(design),
    future: [],
    transaction,
  };
}

export function finishDesignTransaction(
  history: DesignHistory,
  transaction?: string,
): DesignHistory {
  if (
    history.transaction === null
    || (transaction !== undefined && history.transaction !== transaction)
  ) {
    return history;
  }
  return { ...history, transaction: null };
}

export function pushDesign(history: DesignHistory, design: Design): DesignHistory {
  const finished = finishDesignTransaction(history);
  if (same(finished.present, design)) return finished;
  return {
    past: [...finished.past, clone(finished.present)],
    present: clone(design),
    future: [],
    transaction: null,
  };
}

export function undoDesign(history: DesignHistory): DesignHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: clone(previous),
    future: [clone(history.present), ...history.future],
    transaction: null,
  };
}

export function redoDesign(history: DesignHistory): DesignHistory {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, clone(history.present)],
    present: clone(next),
    future: history.future.slice(1),
    transaction: null,
  };
}
