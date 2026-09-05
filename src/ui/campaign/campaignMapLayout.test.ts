import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { CampaignMap } from './CampaignMap';
import {
  campaignAnchor, layoutCampaignMap, MAP_EDGE_PADDING, MAP_LABEL_GAP, MAP_LEGEND_SPACE,
  type CampaignMapCard, type CampaignMapLabel,
} from './campaignMapLayout';

function assertFits(cards: readonly CampaignMapCard[], width: number, height: number) {
  for (const card of cards) {
    expect(card.x - card.width / 2).toBeGreaterThanOrEqual(MAP_EDGE_PADDING - 0.001);
    expect(card.x + card.width / 2).toBeLessThanOrEqual(width - MAP_EDGE_PADDING + 0.001);
    expect(card.y - card.height / 2).toBeGreaterThanOrEqual(MAP_EDGE_PADDING - 0.001);
    expect(card.y + card.height / 2).toBeLessThanOrEqual(height - MAP_EDGE_PADDING - MAP_LEGEND_SPACE + 0.001);
  }
  for (const [index, first] of cards.entries()) {
    for (const second of cards.slice(index + 1)) {
      const separateX = Math.abs(first.x - second.x) + 0.001 >= (first.width + second.width) / 2 + MAP_LABEL_GAP;
      const separateY = Math.abs(first.y - second.y) + 0.001 >= (first.height + second.height) / 2 + MAP_LABEL_GAP;
      expect(separateX || separateY, `${first.id} overlaps ${second.id}`).toBe(true);
    }
  }
}

describe.each([...catalog.campaigns.values()])('$name campaign label layout', (campaign) => {
  it.each([343, 570, 855])('keeps every card inside %ipx without overlap, for early and late campaign states', (width) => {
    for (const stage of ['first', 'all-available', 'all-locked'] as const) {
      const labels = campaign.nodes.map((node, index) => ({
        id: node.id, position: node.position,
        available: stage === 'all-available' || (stage === 'first' && index === 0),
      }));
      const snapshot = JSON.stringify(labels);
      const result = layoutCampaignMap(labels, { width, height: width < 480 ? 420 : 550 });
      expect(result.cards.size).toBe(campaign.nodes.length);
      assertFits([...result.cards.values()], result.width, result.height);
      expect(layoutCampaignMap(labels, { width, height: width < 480 ? 420 : 550 })).toEqual(result);
      expect(JSON.stringify(labels)).toBe(snapshot);
      expect(result.nodeWidth).toBe(width === 343 ? 112 : width === 570 ? 120 : 144);
    }
  });

  it('renders stable SSR labels with route endpoints at fixed authored sites', () => {
    const props = { campaign, catalog, stateOf: () => 'available' as const,
      selectedId: null, onSelect: () => undefined };
    const html = renderToStaticMarkup(createElement(CampaignMap, props));
    expect(renderToStaticMarkup(createElement(CampaignMap, props))).toBe(html);
    const result = layoutCampaignMap(campaign.nodes.map((node) => ({
      id: node.id, position: node.position, available: true,
    })));
    for (const node of campaign.nodes) {
      const card = result.cards.get(node.id);
      if (card === undefined) throw new Error('missing layout card');
      const x = card.x / result.width * 100;
      const y = card.y / result.height * 100;
      expect(html).toContain(`left:${x}%;top:${y}%`);
      for (const prerequisite of node.requires) {
        const from = campaign.nodes.find((candidate) => candidate.id === prerequisite);
        if (from === undefined) continue;
        const start = campaignAnchor(from.position);
        const end = campaignAnchor(node.position);
        expect(html).toContain(`x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"`);
      }
    }
    expect(html).toContain('--camp-node-width:144px');
    expect(html).toContain(`--camp-map-min-height:${result.minimumHeight + 2}px`);
  });

  it.each([343, 570, 855])('settles ResizeObserver feedback at %ipx, including the two-pixel map border', (width) => {
    const labels = campaign.nodes.map((node, index) => ({
      id: node.id, position: node.position, available: index === 0,
    }));
    const border = 2;
    const cssBaseHeight = width < 480 ? 420 : 550;
    let clientHeight = cssBaseHeight - border;
    const minimums: number[] = [];
    const observed: number[] = [];
    for (let frame = 0; frame < 8; frame += 1) {
      const result = layoutCampaignMap(labels, { width, height: clientHeight });
      minimums.push(result.minimumHeight);
      // CampaignMap turns the required client area into a border-box CSS minimum.
      clientHeight = Math.max(cssBaseHeight, result.minimumHeight + border) - border;
      observed.push(clientHeight);
      assertFits([...result.cards.values()], result.width, result.height);
    }
    expect(new Set(minimums).size).toBe(1);
    expect(new Set(observed.slice(1)).size).toBe(1);

    const intrinsic = minimums[0] ?? 0;
    for (const viewportHeight of [intrinsic + 300, intrinsic + 1, cssBaseHeight - border]) {
      const result = layoutCampaignMap(labels, { width, height: viewportHeight });
      expect(result.minimumHeight).toBe(intrinsic);
      assertFits([...result.cards.values()], result.width, result.height);
    }
  });
});

describe('presentation bounds and measured cards', () => {
  it('retains unobstructed authored positions and clamps edge cards', () => {
    const labels: CampaignMapLabel[] = [
      { id: 'centre', position: { x: 0.5, y: 0.5 }, available: true },
      { id: 'edge', position: { x: 0.94, y: 0.1 }, available: false },
    ];
    const result = layoutCampaignMap(labels, { width: 855, height: 550 });
    expect(result.cards.get('centre')).toMatchObject({ x: 427.5, y: 275 });
    expect(result.cards.get('edge')).toMatchObject({ x: 855 - 12 - 72, y: 55 });
    assertFits([...result.cards.values()], result.width, result.height);
  });

  it('reserves actual wrapped-label heights and grows dense mobile maps', () => {
    const labels = Array.from({ length: 11 }, (_, index) => ({
      id: String(index), position: { x: 0.5, y: 0.5 }, available: true, height: 90,
    }));
    const result = layoutCampaignMap(labels, { width: 343, height: 420 });
    expect(result.minimumHeight).toBeGreaterThan(420);
    expect(result.cards.size).toBe(11);
    expect([...result.cards.values()].every((card) => card.height === 90)).toBe(true);
    assertFits([...result.cards.values()], result.width, result.height);
  });

  it('keeps an empty map valid for a loading or future content state', () => {
    const result = layoutCampaignMap([], { width: 343, height: 420 });
    expect(result.cards.size).toBe(0);
    expect(result.height).toBe(420);
  });
});


describe('fixed theatre sites', () => {
  it('keeps route anchors at authored positions while narrow layouts move collision labels', () => {
    const campaign = [...catalog.campaigns.values()][0]!;
    const labels = campaign.nodes.map((node) => ({ id: node.id, position: node.position, available: true }));
    const narrow = layoutCampaignMap(labels, { width: 343, height: 550 });
    let displaced = false;
    for (const node of campaign.nodes) {
      const site = campaignAnchor(node.position);
      const card = narrow.cards.get(node.id)!;
      if (Math.abs(card.x / narrow.width * 100 - site.x) > 1 || Math.abs(card.y / narrow.height * 100 - site.y) > 1) displaced = true;
    }
    expect(displaced).toBe(true);
    const markup = renderToStaticMarkup(createElement(CampaignMap, { campaign, catalog, selectedId: null,
      stateOf: () => 'available' as const, onSelect: () => undefined }));
    const route = campaign.nodes.find((node) => node.requires.length > 0)!;
    const from = campaign.nodes.find((node) => node.id === route.requires[0])!;
    const start = campaignAnchor(from.position);
    const end = campaignAnchor(route.position);
    expect(markup).toContain(`x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" class="camp-route`);
  });
});
