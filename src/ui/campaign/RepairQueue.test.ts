import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { startRepair } from '../../campaign/repair';
import { Hangar } from './Hangar';
import { MarketPanel, MechBayPanel } from './Panels';

function queuedState() {
  const state = startCampaign(catalog, 'border_dispute', 'visible-repair-queue');
  const [active, queued] = state.mechs;
  if (active === undefined || queued === undefined) throw new Error('campaign needs two machines');
  active.condition.centre_torso.armour -= 1;
  queued.condition.centre_torso.armour -= 1;
  if (!startRepair(catalog, state, active).ok || !startRepair(catalog, state, queued).ok) {
    throw new Error('could not book repair fixtures');
  }
  return { state, active, queued };
}

describe('immediate repair readouts', () => {
  it('shows repaired machines as ready in the company and deployment bay', () => {
    const { state, active, queued } = queuedState();
    const props = { state, mutate: () => undefined };
    const bay = renderToStaticMarkup(createElement(MechBayPanel, props));
    expect(bay).toContain('No repairs required.');
    expect(bay).toContain('Immediate');
    expect(bay).not.toContain('Daily payroll');
    const hangar = renderToStaticMarkup(createElement(Hangar, {
      catalog, ...props, onRefit: () => undefined, onContinue: () => undefined, onCancel: () => undefined,
    }));
    expect(hangar).not.toContain('Queue repair');
    expect(active.status).toBe('ready');
    expect(queued.status).toBe('ready');
  });
  it('makes restored hulls sellable without a waiting stage', () => {
    const { state, active } = queuedState();
    const market = renderToStaticMarkup(createElement(MarketPanel, { state, mutate: () => undefined }));
    expect(market).toContain(`data-testid="market-sell-${active.id}"`);
    expect(market).not.toContain('This paid workshop booking must finish');
  });
});
