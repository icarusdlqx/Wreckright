import type { Catalog } from '../schema/load';
import type { Rng } from '../sim/rng';
import { logCampaign } from './campaignState';
import type { CampaignState, MissionOutcome, PilotRecord } from './types';

type RestDayEvent = Catalog['rules']['events']['entries'][number];

export const REST_DAY_EVENT_LOG_PREFIX = 'Rest day — ';

function rumourPilots(state: CampaignState): PilotRecord[] {
  return state.pilots
    .filter(
      (pilot) =>
        !pilot.dead &&
        (pilot.gunnery < 5 || pilot.piloting < 5 || pilot.sensors < 5),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function unsettledOutcome(state: CampaignState): MissionOutcome | null {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const outcome = state.history[index];
    if (outcome?.won === true && !outcome.paymentDisputeSettled) return outcome;
  }
  return null;
}

function eligible(state: CampaignState, event: RestDayEvent): boolean {
  switch (event.type) {
    case 'supplier_discount':
      return true;
    case 'pilot_rumour':
      return rumourPilots(state).length > 0;
    case 'yard_mishap':
      return state.eventEffects.freeRepairDays < event.bankLimit;
    case 'contract_payment_dispute':
      return unsettledOutcome(state) !== null;
  }
}

function supplierEvent(catalog: Catalog): Extract<RestDayEvent, { type: 'supplier_discount' }> | null {
  return catalog.rules.events.entries.find(
    (event): event is Extract<RestDayEvent, { type: 'supplier_discount' }> =>
      event.type === 'supplier_discount',
  ) ?? null;
}

/** Purchase-only factor for a day already covered by an awarded supplier week. */
export function supplierDiscountFactor(
  catalog: Catalog,
  state: CampaignState,
  day: number = state.day,
): number {
  const through = state.eventEffects.supplierDiscountThroughDay;
  if (through === null || day > through) return 1;
  return supplierEvent(catalog)?.priceFactor ?? 1;
}

function applySupplier(state: CampaignState, event: Extract<RestDayEvent, { type: 'supplier_discount' }>): string {
  const throughDay = state.day + event.durationDays - 1;
  state.eventEffects.supplierDiscountThroughDay = Math.max(
    state.eventEffects.supplierDiscountThroughDay ?? throughDay,
    throughDay,
  );
  const percent = Math.round((1 - event.priceFactor) * 100);
  return `${event.log} Purchases are ${percent}% off through day ${state.eventEffects.supplierDiscountThroughDay}.`;
}

function applyRumour(
  state: CampaignState,
  event: Extract<RestDayEvent, { type: 'pilot_rumour' }>,
  rng: Rng,
): string {
  const pilot = rng.pick(rumourPilots(state));
  pilot.xp += event.xp;
  return `${event.log} ${pilot.name} gains ${event.xp} XP.`;
}

function applyYard(state: CampaignState, event: Extract<RestDayEvent, { type: 'yard_mishap' }>): string {
  state.eventEffects.freeRepairDays = Math.min(
    event.bankLimit,
    state.eventEffects.freeRepairDays + event.freeRepairDays,
  );
  return `${event.log} ${event.freeRepairDays} free repair day banked ` +
    `(${state.eventEffects.freeRepairDays}/${event.bankLimit}).`;
}

function applyDispute(
  state: CampaignState,
  event: Extract<RestDayEvent, { type: 'contract_payment_dispute' }>,
): string {
  const outcome = unsettledOutcome(state);
  if (outcome === null) return event.log;
  outcome.paymentDisputeSettled = true;
  outcome.payout += event.settlementCredits;
  state.cbills += event.settlementCredits;
  return `${event.log} ${outcome.employerName} pays ${event.settlementCredits} credits.`;
}

/** Draws and applies one eligible weighted card; an empty eligible deck is a quiet day. */
export function applyRestDayEvent(
  catalog: Catalog,
  state: CampaignState,
  rng: Rng,
): RestDayEvent | null {
  const entries = catalog.rules.events.entries
    .filter((event) => event.weight > 0 && eligible(state, event))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (entries.length === 0) return null;

  const event = rng.weighted(entries.map((entry) => ({ value: entry, weight: entry.weight })));
  let text: string;
  switch (event.type) {
    case 'supplier_discount':
      text = applySupplier(state, event);
      break;
    case 'pilot_rumour':
      text = applyRumour(state, event, rng);
      break;
    case 'yard_mishap':
      text = applyYard(state, event);
      break;
    case 'contract_payment_dispute':
      text = applyDispute(state, event);
      break;
  }
  logCampaign(state, `${REST_DAY_EVENT_LOG_PREFIX}${event.title}: ${text}`);
  return event;
}
