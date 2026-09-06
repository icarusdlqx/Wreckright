export interface DropPayload {
  kind: 'weapon' | 'equipment' | 'ammo';
  id: string;
}

export function parsedDrop(raw: string): DropPayload | null {
  if (raw === '') return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || candidate.id.trim() === '') return null;
    if (candidate.kind === 'weapon' || candidate.kind === 'equipment' || candidate.kind === 'ammo') {
      return { kind: candidate.kind, id: candidate.id };
    }
  } catch {
    // External drags must not interrupt an unsaved refit.
  }
  return null;
}
