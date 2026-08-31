import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Catalog } from '../schema/load';
import type { Rng, WeightedEntry } from '../sim/rng';
import { advanceDays, startCampaign } from './campaign';
import { CAMPAIGN_LOG_LIMIT } from './campaignState';
import { employerHistories } from './employers';
import {
  applyRestDayEvent,
  REST_DAY_EVENT_LOG_PREFIX,
  supplierDiscountFactor,
} from './events';
import { deserialiseCampaign, serialiseCampaign } from './save';
import type { CampaignState, MissionOutcome } from './types';

type EventType = CatalogEvent['type'];
type CatalogEvent = (typeof catalog.rules.events.entries)[number];

function selecting(type: EventType, pickIndex = 0): Rng {
  const rng: Rng = {
    nextUint32: () => 1,
    next: () => 0,
    int: (minimum) => minimum,
    range: (minimum) => minimum,
    chance: () => true,
    pick: <T>(items: readonly T[]) => items[pickIndex % items.length] as T,
    shuffle: <T>(items: readonly T[]) => [...items],
    weighted: <T>(entries: readonly WeightedEntry<T>[]) => {
      const selected = entries.find(
        (entry) => (entry.value as { type?: string }).type === type,
      );
      if (selected === undefined) throw new Error(`event ${type} was not eligible`);
      return selected.value;
    },
    fork: () => rng,
    save: () => ({ x: 1, y: 2, z: 3, w: 4 }),
    restore: () => undefined,
  };
  return rng;
}

function state(seed = 'rest-day-events'): CampaignState {
  return startCampaign(catalog, 'border_dispute', seed);
}

function onlyEvent(type: EventType): Catalog {
  const entries = catalog.rules.events.entries.map((event) => ({
    ...event,
    weight: event.type === type ? event.weight : 0,
  }));
  return {
    ...catalog,
    rules: {
      ...catalog.rules,
      events: { ...catalog.rules.events, entries },
    },
  };
}

function outcome(overrides: Partial<MissionOutcome> = {}): MissionOutcome {
  return {
    nodeId: 'militia_raid',
    missionId: 'raid_ridge',
    employerId: 'kestrel_combine',
    employerName: 'Kestrel Combine',
    termsId: 'standard',
    won: true,
    day: 1,
    payout: 100,
    salvagedChassis: [],
    salvagedItems: [],
    salvageOffered: [],
    salvageFinalized: true,
    salvageCandidates: [],
    salvageProvenance: [],
    pilotCasualties: [],
    mechsLost: [],
    pilotReports: [],
    ...overrides,
    paymentDisputeSettled: overrides.paymentDisputeSettled ?? false,
  };
}

function eventLog(state: CampaignState): string[] {
  return state.log
    .filter((entry) => entry.text.startsWith(REST_DAY_EVENT_LOG_PREFIX))
    .map((entry) => `${entry.day}:${entry.text}`);
}

function eventSnapshot(state: CampaignState): object {
  return {
    day: state.day,
    cbills: state.cbills,
    rng: state.rng,
    effects: state.eventEffects,
    xp: state.pilots.map((pilot) => [pilot.id, pilot.xp]),
    logs: eventLog(state),
  };
}

describe('rest-day events', () => {
  it('applies the authored supplier, rumour and yard effects', () => {
    const run = state();
    run.day = 5;

    expect(applyRestDayEvent(catalog, run, selecting('supplier_discount'))?.id)
      .toBe('supplier_discount_week');
    expect(run.eventEffects.supplierDiscountThroughDay).toBe(11);
    expect(supplierDiscountFactor(catalog, run)).toBe(0.9);
    expect(supplierDiscountFactor(catalog, run, 12)).toBe(1);

    run.day = 6;
    applyRestDayEvent(catalog, run, selecting('supplier_discount'));
    expect(run.eventEffects.supplierDiscountThroughDay).toBe(12);

    const expectedPilot = [...run.pilots].sort((left, right) => left.id.localeCompare(right.id))[0];
    if (expectedPilot === undefined) throw new Error('campaign has no pilots');
    applyRestDayEvent(catalog, run, selecting('pilot_rumour'));
    expect(expectedPilot.xp).toBe(75);

    applyRestDayEvent(catalog, run, selecting('yard_mishap'));
    applyRestDayEvent(catalog, run, selecting('yard_mishap'));
    expect(run.eventEffects.freeRepairDays).toBe(2);
    expect(eventLog(run)).toHaveLength(5);
  });

  it('filters cards that cannot produce a positive effect', () => {
    const rumourless = state('no-rumour');
    for (const pilot of rumourless.pilots) {
      pilot.gunnery = 5;
      pilot.piloting = 5;
      pilot.sensors = 5;
    }
    expect(applyRestDayEvent(
      onlyEvent('pilot_rumour'),
      rumourless,
      selecting('pilot_rumour'),
    )).toBeNull();

    const fullYard = state('full-yard');
    fullYard.eventEffects.freeRepairDays = 2;
    expect(applyRestDayEvent(
      onlyEvent('yard_mishap'),
      fullYard,
      selecting('yard_mishap'),
    )).toBeNull();

    const undisputed = state('no-dispute');
    expect(applyRestDayEvent(
      onlyEvent('contract_payment_dispute'),
      undisputed,
      selecting('contract_payment_dispute'),
    )).toBeNull();
    expect(eventLog(rumourless)).toEqual([]);
    expect(eventLog(fullYard)).toEqual([]);
    expect(eventLog(undisputed)).toEqual([]);
  });

  it('settles each latest live winning outcome once and keeps the employer ledger exact', () => {
    const run = state('payment-dispute');
    const disputeCatalog = onlyEvent('contract_payment_dispute');
    const startCash = run.cbills;
    const first = outcome({ employerId: 'kestrel_combine', payout: 100 });
    const latest = outcome({
      nodeId: 'supply_line',
      employerId: 'halloran_freight',
      employerName: 'Halloran Freight',
      payout: 200,
    });
    run.history.push(first, latest, outcome({ nodeId: 'failed', won: false, payout: 0 }));

    applyRestDayEvent(disputeCatalog, run, selecting('contract_payment_dispute'));
    expect(latest).toMatchObject({ payout: 25_200, paymentDisputeSettled: true });
    expect(first).toMatchObject({ payout: 100, paymentDisputeSettled: false });
    expect(run.cbills).toBe(startCash + 25_000);

    applyRestDayEvent(disputeCatalog, run, selecting('contract_payment_dispute'));
    expect(first).toMatchObject({ payout: 25_100, paymentDisputeSettled: true });
    expect(applyRestDayEvent(disputeCatalog, run, selecting('contract_payment_dispute')))
      .toBeNull();

    const campaign = catalog.campaigns.get(run.campaignId);
    if (campaign === undefined) throw new Error('campaign missing');
    const paid = employerHistories(
      campaign,
      run.history,
      run.employerFailures,
      run.historyArchive.employers,
    ).reduce((total, employer) => total + employer.paid, 0);
    expect(paid).toBe(run.history.reduce((total, record) => total + record.payout, 0));
    expect(run.cbills).toBe(startCash + 50_000);
  });

  it('is identical for batched and repeated day advancement', () => {
    const batched = state('batched-rest-days');
    const repeated = state('batched-rest-days');

    advanceDays(catalog, batched, 12);
    for (let day = 0; day < 12; day += 1) advanceDays(catalog, repeated, 1);

    expect(eventSnapshot(batched)).toEqual(eventSnapshot(repeated));
  });

  it('prunes stale disputes on the same day in batched and repeated waits', () => {
    const batched = state('history-batch-11');
    const repeated = state('history-batch-11');
    for (const run of [batched, repeated]) {
      run.day = catalog.rules.economy.sideContracts.refreshDays - 1;
      run.history.push(
        outcome({ day: 0, payout: 100 }),
        outcome({
          nodeId: 'latest_report',
          day: run.day,
          payout: 200,
          paymentDisputeSettled: true,
        }),
      );
    }

    advanceDays(catalog, batched, 2);
    advanceDays(catalog, repeated, 1);
    advanceDays(catalog, repeated, 1);

    expect(eventSnapshot(batched)).toEqual(eventSnapshot(repeated));
    expect(batched.history).toEqual(repeated.history);
    expect(batched.historyArchive).toEqual(repeated.historyArchive);
  });

  it('continues the same seeded stream after saving and loading', () => {
    const uninterrupted = state('rest-day-save');
    const checkpoint = state('rest-day-save');
    advanceDays(catalog, uninterrupted, 10);
    advanceDays(catalog, checkpoint, 4);

    const restored = deserialiseCampaign(serialiseCampaign(checkpoint), catalog).state;
    if (restored === null) throw new Error('checkpoint did not load');
    advanceDays(catalog, restored, 6);

    expect(eventSnapshot(restored)).toEqual(eventSnapshot(uninterrupted));
  });

  it('gives different campaign seeds different days between battles', () => {
    const first = state('rest-day-seed-a');
    const second = state('rest-day-seed-b');
    advanceDays(catalog, first, 10);
    advanceDays(catalog, second, 10);

    expect(eventLog(first)).not.toEqual(eventLog(second));
  });

  it('does not draw or consume campaign RNG after the campaign is finished', () => {
    const run = state('finished-rest-days');
    run.finished = true;
    const before = run.rng;

    advanceDays(catalog, run, 1);

    expect(eventLog(run)).toEqual([]);
    expect(run.rng).toEqual(before);
  });

  it('loads additive event defaults without reopening historical payments', () => {
    const run = state('legacy-rest-days');
    run.history.push(outcome());
    const legacy = JSON.parse(serialiseCampaign(run)) as {
      state: {
        eventEffects?: unknown;
        history: Array<{ paymentDisputeSettled?: boolean }>;
      };
    };
    delete legacy.state.eventEffects;
    delete legacy.state.history[0]?.paymentDisputeSettled;

    const restored = deserialiseCampaign(JSON.stringify(legacy), catalog).state;
    expect(restored?.eventEffects).toEqual({
      supplierDiscountThroughDay: null,
      freeRepairDays: 0,
    });
    expect(restored?.history[0]?.paymentDisputeSettled).toBe(true);
  });

  it('keeps event-heavy campaign logs bounded', () => {
    const run = state('bounded-event-log');
    run.log = [];
    for (let day = 1; day <= CAMPAIGN_LOG_LIMIT + 8; day += 1) {
      run.day = day;
      applyRestDayEvent(catalog, run, selecting('supplier_discount'));
    }

    expect(run.log).toHaveLength(CAMPAIGN_LOG_LIMIT);
    expect(run.log.every((entry) => entry.text.startsWith(REST_DAY_EVENT_LOG_PREFIX))).toBe(true);
    expect(run.log[0]?.day).toBe(CAMPAIGN_LOG_LIMIT + 8);
  });
});
