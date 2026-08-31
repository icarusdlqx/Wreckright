import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import {
  EventsRulesSchema,
  REST_DAY_EVENT_TYPES,
  type EventsRules,
  type RestDayEvent,
} from './rulesEvents';

function shippedRules(): EventsRules {
  return structuredClone(catalog.rules.events);
}

function replaceEvent(
  rules: EventsRules,
  type: RestDayEvent['type'],
  patch: Record<string, unknown>,
): unknown {
  return {
    ...rules,
    entries: rules.entries.map((entry) => entry.type === type ? { ...entry, ...patch } : entry),
  };
}

describe('rest-day event rules', () => {
  it('loads the shipped four-event deck with its authored values', () => {
    const rules = shippedRules();

    expect(rules.entries.map((entry) => entry.type).sort()).toEqual(
      [...REST_DAY_EVENT_TYPES].sort(),
    );
    expect(rules.entries.map((entry) => entry.id)).toEqual([
      'supplier_discount_week',
      'pilot_rumour',
      'yard_mishap',
      'contract_payment_dispute',
    ]);
    expect(rules.entries.map((entry) => entry.weight)).toEqual([3, 3, 2, 1]);
    expect(rules.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'supplier_discount', priceFactor: 0.9, durationDays: 7,
      }),
      expect.objectContaining({ type: 'pilot_rumour', xp: 75 }),
      expect.objectContaining({ type: 'yard_mishap', freeRepairDays: 1, bankLimit: 2 }),
      expect.objectContaining({
        type: 'contract_payment_dispute', settlementCredits: 25_000,
      }),
    ]));
  });

  it('requires unique event ids', () => {
    const rules = shippedRules();
    const first = rules.entries[0];
    const second = rules.entries[1];
    if (first === undefined || second === undefined) throw new Error('shipped event deck is incomplete');
    const invalid = {
      ...rules,
      entries: rules.entries.map((entry, index) =>
        index === 1 ? { ...entry, id: first.id } : entry,
      ),
    };

    expect(EventsRulesSchema.safeParse(invalid).error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['entries'], message: 'event ids must be unique' }),
      ]),
    );
  });

  it('requires exactly one event of every supported type', () => {
    const rules = shippedRules();
    const first = rules.entries[0];
    const second = rules.entries[1];
    if (first === undefined || second === undefined) throw new Error('shipped event deck is incomplete');
    const invalid = {
      ...rules,
      entries: rules.entries.map((entry, index) =>
        index === 1 ? { ...first, id: second.id } : entry,
      ),
    };

    expect(EventsRulesSchema.safeParse(invalid).error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['entries'],
          message: 'events must contain exactly one entry of each supported type',
        }),
      ]),
    );
  });

  it.each([
    ['zero weight', 'supplier_discount', { weight: 0 }],
    ['oversized weight', 'supplier_discount', { weight: 101 }],
    ['deep supplier discount', 'supplier_discount', { priceFactor: 0.79 }],
    ['non-discount supplier factor', 'supplier_discount', { priceFactor: 1 }],
    ['long supplier window', 'supplier_discount', { durationDays: 31 }],
    ['zero rumour award', 'pilot_rumour', { xp: 0 }],
    ['oversized rumour award', 'pilot_rumour', { xp: 201 }],
    ['multi-day yard credit', 'yard_mishap', { freeRepairDays: 2 }],
    ['oversized yard bank', 'yard_mishap', { bankLimit: 8 }],
    ['zero dispute settlement', 'contract_payment_dispute', { settlementCredits: 0 }],
    ['oversized dispute settlement', 'contract_payment_dispute', { settlementCredits: 100_001 }],
  ] as const)('rejects %s', (_label, type, patch) => {
    expect(EventsRulesSchema.safeParse(replaceEvent(shippedRules(), type, patch)).success).toBe(false);
  });

  it('rejects unknown authored fields', () => {
    const invalid = replaceEvent(shippedRules(), 'pilot_rumour', { flavourWeight: 2 });
    expect(EventsRulesSchema.safeParse(invalid).success).toBe(false);
  });
});
