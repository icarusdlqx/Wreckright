import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { acceptContract, availableNodes, startCampaign } from '../../campaign/campaign';
import { catalog } from '../../../tests/support';
import { BarracksPanel } from './BarracksPanel';
import { Hangar } from './Hangar';
import { LanceManifest } from './LanceManifest';
import { MarketPanel, MechBayPanel, StoresPanel } from './Panels';

function legacyCampaign() {
  const state = startCampaign(catalog, 'border_dispute', 'identity-presentation');
  const gadfly = state.mechs.find((mech) => mech.design.id === 'hornet_spotter');
  if (gadfly === undefined) throw new Error('campaign needs a Gadfly fixture');
  gadfly.design.name = "Gadfly GAD-2 'Spotter'";
  return state;
}

describe('campaign machine identity presentation', () => {
  it('uses the current complete identity in owned-machine decision rows', () => {
    const state = legacyCampaign();
    const mutate = () => undefined;
    const identity = 'Gadfly — 35t Light · Forward spotter · Linewrought';
    const views = [
      renderToStaticMarkup(createElement(MechBayPanel, { state, mutate })),
      renderToStaticMarkup(createElement(BarracksPanel, { state, mutate })),
      renderToStaticMarkup(createElement(StoresPanel, { state, mutate })),
      renderToStaticMarkup(createElement(MarketPanel, { state, mutate })),
      renderToStaticMarkup(createElement(Hangar, {
        catalog,
        state,
        mutate,
        onRefit: () => undefined,
        onContinue: () => undefined,
        onCancel: () => undefined,
      })),
    ];

    for (const html of views) {
      expect(html).toContain(identity);
      expect(html).not.toContain('GAD-2');
    }
  });

  it('uses the current complete identity in manifest machine choices', () => {
    const state = legacyCampaign();
    const node = availableNodes(catalog, state)[0];
    if (node === undefined) throw new Error('campaign needs an available contract');
    const signed = acceptContract(catalog, state, node.id, 'standard');
    if (!signed.ok) throw new Error(signed.reason ?? 'could not sign contract fixture');

    const html = renderToStaticMarkup(createElement(LanceManifest, {
      catalog,
      state,
      mutate: () => undefined,
      onLaunch: () => undefined,
      onCancel: () => undefined,
      onRefit: () => undefined,
    }));

    expect(html).toContain(
      'Gadfly — 35t Light · Forward spotter · Linewrought',
    );
    expect(html).not.toContain('GAD-2');
    expect(html).toContain('aria-label="Gadfly integrity"');
  });
});
