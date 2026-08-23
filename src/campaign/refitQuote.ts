import type { Design } from '../schema/design';
import type { CampaignState, MechRecord, StoreItem, StoreKind } from './types';

export type RefitPartRole = 'weapon' | 'equipment' | 'heat_sink';

export interface RefitStockLine extends StoreItem {
  role: RefitPartRole;
}

export interface RefitShortage extends RefitStockLine {
  available: number;
  missing: number;
}

export interface RefitQuote {
  ok: boolean;
  consumed: RefitStockLine[];
  returned: RefitStockLine[];
  shortages: RefitShortage[];
}

export interface RefitAvailability {
  weapon: ReadonlyMap<string, number>;
  equipment: ReadonlyMap<string, number>;
}

function stockKey(kind: StoreKind, itemId: string): string {
  return `${kind}:${itemId}`;
}

function addMaterial(
  bill: Map<string, RefitStockLine>,
  kind: StoreKind,
  itemId: string,
  count: number,
  role: RefitPartRole,
): void {
  const key = stockKey(kind, itemId);
  const existing = bill.get(key);
  if (existing === undefined) {
    bill.set(key, { kind, itemId, count, role });
    return;
  }
  existing.count += count;
  // A sink is still stored as equipment, but the quote must explain that the
  // missing equipment is the machine's cooling system rather than loose gear.
  if (role === 'heat_sink') existing.role = role;
}

/** Ammunition is deliberately absent: the workshop supplies bins by the ton. */
function materialBill(design: Design): Map<string, RefitStockLine> {
  const bill = new Map<string, RefitStockLine>();
  addMaterial(bill, 'equipment', design.heatSinkId, design.heatSinks, 'heat_sink');
  for (const mount of design.mounts) {
    addMaterial(bill, 'weapon', mount.weaponId, 1, 'weapon');
  }
  for (const fit of design.equipment) {
    addMaterial(bill, 'equipment', fit.equipmentId, 1, 'equipment');
  }
  return bill;
}

function stockCount(store: readonly StoreItem[], kind: StoreKind, itemId: string): number {
  return store.reduce(
    (total, item) =>
      item.kind === kind && item.itemId === itemId ? total + item.count : total,
    0,
  );
}

function ordered(lines: Iterable<RefitStockLine>): RefitStockLine[] {
  return [...lines].sort((left, right) =>
    stockKey(left.kind, left.itemId).localeCompare(stockKey(right.kind, right.itemId)),
  );
}

/**
 * Prices one complete design replacement without changing either design or
 * the store. Every missing line is returned together, so the bay can explain
 * the whole blocked refit instead of making the player fix one crate at a time.
 */
export function quoteRefit(
  state: Pick<CampaignState, 'store'>,
  original: Design,
  next: Design,
): RefitQuote {
  const before = materialBill(original);
  const after = materialBill(next);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const consumed: RefitStockLine[] = [];
  const returned: RefitStockLine[] = [];

  for (const key of keys) {
    const oldLine = before.get(key);
    const nextLine = after.get(key);
    const change = (nextLine?.count ?? 0) - (oldLine?.count ?? 0);
    if (change > 0 && nextLine !== undefined) {
      consumed.push({ ...nextLine, count: change });
    } else if (change < 0 && oldLine !== undefined) {
      returned.push({ ...oldLine, count: -change });
    }
  }

  const sortedConsumed = ordered(consumed);
  const shortages = sortedConsumed.flatMap((line): RefitShortage[] => {
    const available = stockCount(state.store, line.kind, line.itemId);
    const missing = Math.max(0, line.count - available);
    return missing === 0 ? [] : [{ ...line, available, missing }];
  });
  return {
    ok: shortages.length === 0,
    consumed: sortedConsumed,
    returned: ordered(returned),
    shortages,
  };
}

/** Store plus the fittings already on this one mech, kept separate by crate kind. */
export function refitAvailability(
  state: Pick<CampaignState, 'store'>,
  mech: Pick<MechRecord, 'design'>,
): RefitAvailability {
  const weapon = new Map<string, number>();
  const equipment = new Map<string, number>();
  const add = (kind: StoreKind, itemId: string, count: number): void => {
    const inventory = kind === 'weapon' ? weapon : equipment;
    inventory.set(itemId, (inventory.get(itemId) ?? 0) + count);
  };

  for (const item of state.store) add(item.kind, item.itemId, item.count);
  for (const line of materialBill(mech.design).values()) {
    add(line.kind, line.itemId, line.count);
  }
  return { weapon, equipment };
}

/**
 * Applies a successful quote to a cloned store. Returning null leaves the
 * caller's original array and every row in it untouched.
 */
export function settleRefitQuote(
  store: readonly StoreItem[],
  quote: RefitQuote,
): StoreItem[] | null {
  if (!quote.ok) return null;
  const next = store.map((item) => ({ ...item }));

  for (const line of quote.consumed) {
    let remaining = line.count;
    for (const item of next) {
      if (item.kind !== line.kind || item.itemId !== line.itemId) continue;
      const taken = Math.min(item.count, remaining);
      item.count -= taken;
      remaining -= taken;
      if (remaining === 0) break;
    }
    if (remaining > 0) return null;
  }

  const settled = next.filter((item) => item.count > 0);
  for (const line of quote.returned) {
    const existing = settled.find(
      (item) => item.kind === line.kind && item.itemId === line.itemId,
    );
    if (existing === undefined) {
      settled.push({ kind: line.kind, itemId: line.itemId, count: line.count });
    } else {
      existing.count += line.count;
    }
  }
  return settled;
}
