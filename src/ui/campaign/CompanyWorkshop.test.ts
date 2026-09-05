import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { estimateRepair, startRepair } from '../../campaign/repair';
import type { CampaignState } from '../../campaign/types';
import { MechBayPanel } from './Panels';
import { revealInspectedMachine } from './CompanyWorkshop';

function workshop(state: CampaignState, onRefit?: (id: string) => void): string {
  return renderToStaticMarkup(createElement(MechBayPanel, {
    state, mutate: () => undefined, ...(onRefit === undefined ? {} : { onRefit }),
  }));
}

function refitButton(markup: string, mechId: string): string {
  const button = [...markup.matchAll(/<button\b[^>]*>/g)]
    .find(([tag]) => tag.includes(`data-testid="camp-refit-${mechId}"`))?.[0];
  if (button === undefined) throw new Error(`missing refit button for ${mechId}`);
  return button;
}

describe('company workshop', () => {
  it('offers the optional refit entry without a contract and shows real machine identities', () => {
    const state = startCampaign(catalog, 'border_dispute', 'workshop-entry');
    const first = state.mechs[0];
    if (first === undefined) throw new Error('missing workshop fixture');
    const before = JSON.stringify(state);
    expect(state.contract).toBeNull();
    expect(workshop(state)).not.toContain('data-testid="camp-refit-');
    const markup = workshop(state, () => undefined);
    expect(refitButton(markup, first.id)).not.toContain('disabled');
    expect(markup).toContain('data-testid="chassis-silhouette"');
    expect(markup).toContain('Armour &amp; structure');
    expect(markup).toContain('Daily payroll');
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([
    { stacked: false, reduced: false, behavior: null },
    { stacked: true, reduced: false, behavior: 'smooth' },
    { stacked: true, reduced: true, behavior: 'instant' },
  ] as const)('reveals stacked inspections without stealing focus: $stacked / $reduced', ({ stacked, reduced, behavior }) => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    const matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reduced : stacked,
    }));
    const source = {
      ownerDocument: { defaultView: { matchMedia } },
      closest: (selector: string) => selector === '.company-workshop-floor' ? {
        querySelector: (selector: string) => selector === '[data-testid="camp-selected-machine"]'
          ? { scrollIntoView, focus } : null,
      } : null,
      focus,
    } as unknown as HTMLElement;
    revealInspectedMachine(source);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 640px), (max-width: 1100px) and (pointer: coarse)');
    if (behavior === null) expect(scrollIntoView).not.toHaveBeenCalled();
    else expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior });
    expect(focus).not.toHaveBeenCalled();
  });

  it('disables refit for every booking and hulk, including a booking whose date has passed', () => {
    const state = startCampaign(catalog, 'border_dispute', 'workshop-bookings');
    const first = state.mechs[0];
    if (first === undefined) throw new Error('missing workshop fixture');
    for (const status of ['hulk', 'repairing'] as const) {
      first.status = status;
      first.readyOnDay = state.day;
      expect(refitButton(workshop(state, () => undefined), first.id)).toContain('disabled');
    }
    first.status = 'ready';
    first.design.mounts = [];
    expect(refitButton(workshop(state, () => undefined), first.id)).not.toContain('disabled');
    state.finished = true;
    expect(refitButton(workshop(state, () => undefined), first.id)).toContain('disabled');
  });

  it('shows an unpaid shortfall but retains the original repair action and paid queue accounting', () => {
    const state = startCampaign(catalog, 'border_dispute', 'workshop-finances');
    const first = state.mechs[0];
    if (first === undefined) throw new Error('missing workshop fixture');
    first.condition.centre_torso.armour -= 1;
    const estimate = estimateRepair(catalog, first);
    const balance = state.cbills;
    state.cbills = 0;
    const before = JSON.stringify(state);
    const quote = workshop(state);
    expect(quote).toContain(`Need ${estimate.cost.toLocaleString('en-GB')} C more to book this work.`);
    expect(quote).toContain(`data-testid="camp-repair-${first.id}"`);
    expect(JSON.stringify(state)).toBe(before);

    state.cbills = balance;
    expect(startRepair(catalog, state, first).ok).toBe(true);
    state.cbills = 0;
    const booked = workshop(state);
    expect(booked).toContain('<dt>Booking</dt><dd>Paid</dd>');
    expect(booked).toContain('Company payroll until ready:');
    expect(booked).not.toContain('more to book this work');
    expect(booked).not.toContain(`data-testid="camp-repair-${first.id}"`);
  });
});
