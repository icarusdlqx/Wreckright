import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getCatalog } from '../../schema/load';
import { getWikiLibrary, PUBLIC_DISCOVERY } from '../../wiki/library';
import { FactionLogo } from '../FactionLogo';
import { WikiArticle } from '../wiki/WikiArticle';
import { CampaignStoryPanel } from './CampaignStoryPanel';

const catalog = getCatalog();

describe('faction identity and campaign story presentation', () => {
  it('gives each side an accessible, self-contained and distinct insignia', () => {
    const marks = ['linewrought', 'aurelian'].map((faction) => renderToStaticMarkup(createElement(FactionLogo,
      { faction: faction as 'linewrought' | 'aurelian' })));
    expect(marks[0]).toContain('aria-label="Linewrought insignia"');
    expect(marks[1]).toContain('aria-label="Aurelian Stock insignia"');
    expect(marks[0]).not.toEqual(marks[1]);
    expect(marks.every((mark) => !mark.includes('<image') && !mark.includes('href='))).toBe(true);
  });

  it('keeps future revelations out of both the visible story and collapsed history', () => {
    const campaign = catalog.campaigns.get('aurelian_recall')!;
    const fresh = renderToStaticMarkup(createElement(CampaignStoryPanel, { campaign, completedNodes: [] }));
    expect(fresh).toContain('An orderly return');
    expect(fresh).not.toContain('Borrowed numbers');
    expect(fresh).not.toContain('What the warrant permits');
    const later = renderToStaticMarkup(createElement(CampaignStoryPanel, { campaign, completedNodes: ['first_warrant', 'root_exchange'] }));
    expect(later).toContain('Borrowed numbers');
    expect(later).toContain('Story so far · 3 entries');
    expect(later).not.toContain('What the warrant permits');
  });

  it('shows the correct culture insignia on all sixteen machine dossiers and both faction articles', () => {
    for (const article of getWikiLibrary().values()) {
      if (article.kind !== 'mech' && !['the_welded', 'the_sealed'].includes(article.id)) continue;
      const faction = article.kind === 'mech' ? article.chassis.faction : article.faction;
      expect(faction, article.id).toBeDefined();
      const markup = renderToStaticMarkup(createElement(WikiArticle, { article, discovery: PUBLIC_DISCOVERY, reveal: true }));
      expect(markup, article.id).toContain(`data-faction-logo="${faction}"`);
    }
  });
});
