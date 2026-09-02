import type { Catalog } from '../schema/load';
import type { CampaignState } from './types';

/** Wages paid each time the campaign calendar advances by one day. */
export function dailyPayroll(catalog: Catalog, state: CampaignState): number {
  const living = state.pilots.filter((pilot) => !pilot.dead).length;
  return living * catalog.rules.economy.pilot.salaryPerDay;
}

/**
 * Interest on an overdraft, charged on the day the calendar week turns.
 * Payroll can run the account below zero and nothing used to notice, which
 * made credit free; this is what makes staying in debt a decision.
 */
export function debtInterest(catalog: Catalog, state: CampaignState): number {
  const debt = catalog.rules.economy.debt;
  if (state.cbills >= 0 || state.day % debt.intervalDays !== 0) return 0;
  return Math.round(-state.cbills * debt.weeklyInterestRate);
}

/** Wages that will leave the account while a fixed wait runs its course. */
export function payrollThrough(catalog: Catalog, state: CampaignState, days: number): number {
  return dailyPayroll(catalog, state) * Math.max(0, days);
}
