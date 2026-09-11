import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { availableNodes, startCampaign } from '../../campaign/campaign';
import { catalog } from '../../../tests/support';
import { OpeningRouteGuide } from './OpeningRouteGuide';
import { openingRecommendation } from './openingRoute';

function markup(selectedId: string) {
  const state = startCampaign(catalog, 'border_dispute', 'opening-view');
  state.completedNodes = ['militia_raid'];
  const recommendation = openingRecommendation(catalog, state, availableNodes(catalog, state));
  if (recommendation === null) throw new Error('missing opening recommendation');
  return renderToStaticMarkup(createElement(OpeningRouteGuide, {
    recommendation, selectedId, onReview: () => undefined, onDismiss: () => undefined,
  }));
}

describe('opening route presentation', () => {
  it('connects the next contract to practice and public background without revealing future steps', () => {
    const html = markup('marker_survey');
    expect(html).toContain('contract 2 of 3');
    expect(html).toContain('The Missing Trail');
    expect(html).toContain('Review selected contract');
    expect(html).toContain('Choose one fieldable scout');
    expect(html).toContain('Gadfly field record');
    expect(html).toContain('hornet_hnt2');
    expect(html).toContain('the_refit');
    expect(html).not.toContain('the_sealed');
    expect(html).not.toContain('The Quiet Claim');
    expect(html).toContain('Hide opening guide');
  });

  it('offers an explicit review action when the player has chosen another contract', () => {
    const html = markup('pass_skirmish');
    expect(html).toContain('Review The Missing Trail');
    expect(html).not.toContain('Review selected contract');
    expect(html).toContain('Choose any available contract on the map.');
    expect(html).not.toContain('Sign');
  });
});
