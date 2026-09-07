import type { SkirmishBerth } from './lance';

/** Failed writes must survive leaving the battle route while this page remains open. */
export class UnsavedSkirmishRosters {
  private readonly pending = new Map<string, { lance: SkirmishBerth[]; label: string }>();

  record(key: string, lance: SkirmishBerth[], label: string, saved: boolean): void {
    if (saved) this.pending.delete(key);
    else this.pending.set(key, { lance: structuredClone(lance), label });
  }

  lances(): Record<string, SkirmishBerth[]> {
    return Object.fromEntries([...this.pending].map(([key, entry]) => [key, structuredClone(entry.lance)]));
  }

  labels(): string[] { return [...this.pending.values()].map((entry) => entry.label); }
}

export const unsavedSkirmishRosters = new UnsavedSkirmishRosters();
