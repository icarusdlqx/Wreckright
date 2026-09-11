import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCampaign } from '../campaign/campaign';
import { serialiseCampaign } from '../campaign/save';
import { markCampaignStorageReady } from '../campaign/storage';
import { catalog } from '../../tests/support';
import { HomeScreen } from './HomeScreen';
import { createPlaytestJournal, PlaytestProvider } from './playtest';

const stored = new Map<string, string>();

function markup(): string {
  const journal = createPlaytestJournal({ storage: () => null, now: () => 0 });
  return renderToStaticMarkup(
    createElement(PlaytestProvider, { journal, children: createElement(HomeScreen) }),
  );
}

function routeTag(html: string, id: string): string {
  const tag = html.match(new RegExp(`<(?:button|a)\\b[^>]*data-testid="${id}"[^>]*>`))?.[0];
  if (tag === undefined) throw new Error(`Missing menu route: ${id}`);
  return tag;
}

beforeEach(() => {
  stored.clear();
  markCampaignStorageReady();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  markCampaignStorageReady();
});

describe('home screen', () => {
  it('offers four native choices and settings without mounting a battle or 3D theatre', () => {
    const html = markup();

    expect(html).toContain('data-testid="home-screen"');
    expect(html).toContain('data-testid="home-learn"');
    expect(html).toContain('data-testid="home-campaign"');
    expect(html).toContain('data-testid="home-load-game"');
    expect(html).toContain('data-testid="home-new-campaign"');
    expect(html).toContain('data-testid="home-skirmish"');
    expect(routeTag(html, 'home-wiki')).toContain('href="#wiki"');
    expect(html).toContain('Wiki <span class="home-wiki-subtitle">· Story &amp; mechs</span>');
    expect(html).toContain('aria-label="Game settings"');
    expect(html).toContain('data-testid="audio-music"');
    expect(html).toContain('WRECKRIGHT');
    expect(html).toContain('No new machines. Only new owners.');
    expect(html).toContain('Learn Command');
    expect(html).toContain('The Aurelian Continuance has returned to Tessell');
    expect(html).not.toContain('IRONLINE');
    expect(html).not.toContain('The railway repairs itself');
    expect(html).not.toContain('Linewrought company');
    expect(html).not.toContain('data-testid="viewport"');
    expect(html).not.toContain('home-theatre');
    expect(html).not.toContain('<canvas');
    expect(html).toMatch(/<img[^>]*data-testid="home-artwork"[^>]*alt=""[^>]*aria-hidden="true"/);
    expect(stored.size).toBe(0);
  });

  it('recommends Learn Command to a new player while keeping every other choice available', () => {
    const html = markup();
    expect(routeTag(html, 'home-learn')).toContain('class="home-route primary"');
    for (const id of ['home-campaign', 'home-skirmish', 'home-wiki']) {
      expect(routeTag(html, id)).not.toContain('primary');
      expect(routeTag(html, id)).not.toContain('disabled');
    }
  });

  it('prioritises an unfinished range lesson even with a saved company, without changing either save', () => {
    stored.set('ironline.training', JSON.stringify({ version: 1, step: 2, status: 'active' }));
    stored.set('ironline.campaign', serialiseCampaign(startCampaign(catalog, 'border_dispute', 'menu-resume')));
    const before = [...stored];
    const html = markup();
    expect(html).toContain('Resume the Range');
    expect(html).toContain('Continue Campaign');
    expect(routeTag(html, 'home-learn')).toContain('class="home-route primary"');
    expect(routeTag(html, 'home-campaign')).not.toContain('primary');
    expect([...stored]).toEqual(before);
  });

  it.each(['border_dispute', 'aurelian_recall'])('recognises a saved %s company as the recommended continuation', (campaignId) => {
    stored.set('ironline.campaign', serialiseCampaign(startCampaign(catalog, campaignId, 'menu-company')));
    const before = [...stored];
    const html = markup();
    expect(html).toContain('Continue Campaign');
    expect(routeTag(html, 'home-campaign')).toContain('class="home-route primary"');
    expect(routeTag(html, 'home-learn')).not.toContain('primary');
    expect([...stored]).toEqual(before);
  });

  it.each(['complete', 'skipped'])('recommends a new campaign after a %s range lesson', (status) => {
    stored.set('ironline.training', JSON.stringify({ version: 1, step: 4, status }));
    const html = markup();
    expect(html).toContain('Learn Command');
    expect(html).toContain('Start Campaign');
    expect(routeTag(html, 'home-campaign')).toContain('class="home-route primary"');
  });

  it('keeps all routes available when browser storage cannot be read', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage unavailable'); } });
    const html = markup();
    for (const id of ['home-learn', 'home-campaign', 'home-skirmish', 'home-wiki']) {
      expect(routeTag(html, id)).not.toContain('disabled');
    }
    expect(html).toContain('Start Campaign');
    expect(routeTag(html, 'home-learn')).toContain('class="home-route primary"');
  });
});
