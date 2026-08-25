import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { createPlaytestJournal, PlaytestProvider } from './playtest';

describe('home screen', () => {
  it('offers the training, campaign and skirmish routes without mounting a battle', () => {
    const journal = createPlaytestJournal({ storage: () => null, now: () => 0 });
    const html = renderToStaticMarkup(
      createElement(PlaytestProvider, { journal, children: createElement(HomeScreen) }),
    );

    expect(html).toContain('data-testid="home-screen"');
    expect(html).toContain('data-testid="home-learn"');
    expect(html).toContain('data-testid="home-campaign"');
    expect(html).toContain('data-testid="home-skirmish"');
    expect(html).toContain('WRECKRIGHT');
    expect(html).toContain('No new machines. Only new owners.');
    expect(html).toContain('Learn Command');
    expect(html).toContain('The Aurelian Continuance has returned to Tessell');
    expect(html).not.toContain('IRONLINE');
    expect(html).not.toContain('The railway repairs itself');
    expect(html).not.toContain('Linewrought company');
    expect(html).not.toContain('data-testid="viewport"');
  });
});
