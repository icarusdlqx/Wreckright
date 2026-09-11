export interface DropPayload {
  kind: 'weapon' | 'equipment' | 'ammo';
  id: string;
  /** Present only when relocating an installed weapon; no spare is consumed. */
  sourceIndex?: number;
}

export function parsedDrop(raw: string): DropPayload | null {
  if (raw === '') return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || candidate.id.trim() === '') return null;
    if (candidate.kind === 'weapon' || candidate.kind === 'equipment' || candidate.kind === 'ammo') {
      if (candidate.sourceIndex !== undefined) {
        if (candidate.kind !== 'weapon' || !Number.isInteger(candidate.sourceIndex)
          || (candidate.sourceIndex as number) < 0) return null;
        return { kind: candidate.kind, id: candidate.id, sourceIndex: candidate.sourceIndex as number };
      }
      return { kind: candidate.kind, id: candidate.id };
    }
  } catch {
    // External drags must not interrupt an unsaved refit.
  }
  return null;
}
