import type { SkirmishBerth, SkirmishFaction } from './lance';

/** Failed writes must survive leaving the battle route while this page remains open. */
export class UnsavedSkirmishRosters {
  private readonly pending = new Map<string, { lance: SkirmishBerth[]; label: string; faction?: SkirmishFaction }>();

  record(key: string, lance: SkirmishBerth[], label: string, saved: boolean, faction?: SkirmishFaction): void {
    if (saved) this.pending.delete(key);
    else this.pending.set(key, { lance: structuredClone(lance), label, ...(faction === undefined ? {} : { faction }) });
  }

  lances(): Record<string, SkirmishBerth[]> {
    return Object.fromEntries([...this.pending].map(([key, entry]) => [key, structuredClone(entry.lance)]));
  }

  factions(): Record<string, SkirmishFaction> {
    return Object.fromEntries([...this.pending].flatMap(([key, entry]) =>
      entry.faction === undefined ? [] : [[key, entry.faction]]));
  }

  labels(): string[] { return [...this.pending.values()].map((entry) => entry.label); }
}

export const unsavedSkirmishRosters = new UnsavedSkirmishRosters();
