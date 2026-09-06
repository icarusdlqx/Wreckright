import { completeInitialCampaignSetup } from './campaign-setup.mjs';

const noOverflow = page => page.locator('[data-testid="wiki"]').evaluate(element =>
  [...element.querySelectorAll('.wiki-scroll, .wiki-card, .wiki-article, .wiki-fit')]
    .every(node => node.scrollWidth <= node.clientWidth + 1));
const saved = page => page.evaluate(() => localStorage.getItem('ironline.campaign'));

/** One supplied headless browser; every scenario uses a disposable company. */
export async function runLoreWikiChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(25000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const shot = name => shots ? page.screenshot({ path: `${shots}/wiki-${name}.png` }) : Promise.resolve();
  await page.addInitScript(() => {
    localStorage.setItem('ironline.muted', '1');
    globalThis.__wikiGl = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...rest) {
      if (String(type).includes('webgl')) globalThis.__wikiGl++;
      return original.call(this, type, ...rest);
    };
  });
  try {
    const entry = new URL(url); entry.searchParams.set('playtest', '1'); entry.hash = 'wiki';
    await page.goto(entry.href);
    await page.locator('[data-testid="wiki"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    check('direct archive opens without a game renderer, company or training visit',
      await page.evaluate(() => globalThis.__wikiGl === 0 && localStorage.getItem('ironline.campaign') === null
        && !document.querySelector('[data-testid="home-screen"]') && !document.querySelector('[data-testid="viewport"]')));
    check('archive starts with ten public story articles and four hidden discoveries',
      await page.locator('.wiki-card').count() === 10 && /4 campaign discoveries hidden/.test(await page.locator('.wiki-result-count').innerText()));
    check('direct archive defers playtest consent until the game is entered', await page.locator('[data-testid="playtest-consent"]').count() === 0);
    await shot('story-index');
    await page.locator('[data-testid="wiki-search"]').fill('Tessell');
    await page.locator('.wiki-card').filter({ has: page.getByRole('heading', { name: 'Tessell', exact: true }) }).click();
    await page.getByRole('heading', { name: 'Tessell', exact: true }).waitFor();
    check('story articles resolve into shareable native hash links', page.url().endsWith('#wiki/story/tessell'));
    await shot('tessell');
    await page.goBack();
    await page.locator('[data-testid="wiki-machines"]').click();
    check('all sixteen walker dossiers are present', await page.locator('.wiki-machine-card').count() === 16);
    await page.locator('[data-testid="wiki-filter"]').selectOption('linewrought');
    check('Linewrought collection contains eight machines', await page.locator('.wiki-machine-card').count() === 8);
    await shot('linewrought');
    await page.locator('[data-testid="wiki-filter"]').selectOption('aurelian');
    check('Aurelian collection contains eight machines', await page.locator('.wiki-machine-card').count() === 8);
    await shot('aurelian');
    await page.locator('[data-testid="wiki-search"]').fill('Vesper');
    check('machine search finds names and references within the selected faction',
      await page.locator('.wiki-machine-card[href="#wiki/mech/wisp_wsp1"]').count() === 1 && await page.locator('.wiki-machine-card.wiki-linewrought').count() === 0);
    await page.locator('.wiki-machine-card[href="#wiki/mech/wisp_wsp1"]').click();
    await page.getByRole('heading', { name: 'Vesper', exact: true }).waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('.wiki-mech-portrait img'); return img?.complete && img.naturalWidth > 0; });
    check('dossier shows portrait, live standard armament and actionable tradeoffs',
      await page.locator('.wiki-weapons li').count() > 0 && await page.locator('.wiki-boxes').count() > 0
      && /Strengths/.test(await page.locator('.wiki-article').innerText()) && /Weaknesses/.test(await page.locator('.wiki-article').innerText()));
    await shot('vesper');
    await page.locator('[data-testid="wiki-copy"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="wiki-copy"]')?.textContent === 'Link copied' || document.querySelector('.wiki-copy-fallback input'));
    check('copy link either succeeds or provides a selectable address',
      await page.locator('[data-testid="wiki-copy"]').innerText() === 'Link copied' || await page.locator('.wiki-copy-fallback input').isVisible());
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: () => new Promise(resolve => { globalThis.__finishWikiCopy = resolve; }) } }));
    await page.locator('[data-testid="wiki-copy"]').click();
    await page.evaluate(() => { location.hash = '#wiki/story/tessell'; });
    await page.getByRole('heading', { name: 'Tessell', exact: true }).waitFor();
    await page.evaluate(async () => { globalThis.__finishWikiCopy(); await new Promise(requestAnimationFrame); });
    check('late clipboard permission cannot mark a different article as copied', await page.locator('[data-testid="wiki-copy"]').innerText() === 'Copy link');
    await page.evaluate(() => { location.hash = '#wiki/story/the_two_readings'; });
    await page.locator('[data-testid="wiki-locked"]').waitFor();
    check('direct undiscovered story link does not render its title or body',
      !/The Two Readings|Barrow Warrant|stewardship/i.test(await page.locator('[data-testid="wiki"]').innerText()));
    await page.getByRole('button', { name: 'Read ahead…', exact: true }).click();
    await page.getByRole('button', { name: 'Keep them hidden', exact: true }).click();
    check('spoiler confirmation can be cancelled', await page.locator('[data-testid="wiki-locked"]').isVisible());
    await page.getByRole('button', { name: 'Read ahead…', exact: true }).click();
    await page.locator('[data-testid="wiki-confirm-spoilers"]').click();
    await page.locator('[data-testid="wiki-article"]').waitFor();
    check('explicit spoiler consent reveals story without creating a campaign', await saved(page) === null);
    await page.locator('[data-testid="wiki-spoilers"]').click();
    await page.locator('[data-testid="wiki-locked"]').waitFor();
    await page.evaluate(() => { location.hash = '#wiki/story/%broken'; });
    await page.getByRole('heading', { name: 'Record not found' }).waitFor();
    check('malformed archive links have a recoverable missing-record page', await page.getByRole('link', { name: 'Browse the archive', exact: true }).isVisible());
    await page.locator('[data-testid="wiki-close"]').click();
    await page.locator('[data-testid="home-screen"]').waitFor();
    await page.locator('[data-testid="playtest-consent-decline"]').click();
    await shot('home-entry');
    await page.locator('[data-testid="home-campaign"]').click();
    await completeInitialCampaignSetup(page);
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.click();
    await page.locator('[data-testid="camp-area-workshop"]').click();
    await page.locator('[data-testid^="camp-refit-"]:enabled').nth(1).click();
    await page.waitForSelector('[data-testid="refit-bay"] canvas');
    const centre = page.locator('[data-testid="bay-location-centre_torso"]');
    await centre.getByRole('button', { name: /Remove .* from Centre Torso/ }).click();
    const draft = () => centre.evaluate(element => JSON.stringify({
      parts: [...element.querySelectorAll('button[aria-label^="Remove "]')].map(button => button.getAttribute('aria-label')),
      armour: element.querySelector('.bay-armour-read')?.getAttribute('aria-label'),
    }));
    const refitBefore = await draft();
    const saveBefore = await saved(page);
    const history = page.locator('[data-testid="refit-bay"] .machine-wiki-link');
    const historyName = await history.innerText();
    await history.click();
    await page.locator('[data-testid="wiki-article"]').waitFor();
    check('opening a refit dossier makes the game background inert',
      await page.locator('[data-testid="refit-bay"]').evaluate(element => element.closest('[inert]') !== null));
    for (let i = 0; i < 18; i++) await page.keyboard.press('Tab');
    check('keyboard focus stays inside the archive', await page.evaluate(() => document.querySelector('[data-testid="wiki"]').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="wiki"]').waitFor({ state: 'hidden' });
    const restored = { sameDraft: await draft() === refitBefore, undoRetained: await page.locator('[data-testid="bay-undo"]').isEnabled(), sameSave: await saved(page) === saveBefore,
      focused: await page.evaluate(name => document.activeElement?.textContent === name, historyName),
      visible: await page.locator('[data-testid="refit-bay"]').isVisible() };
    check('Escape returns to the same dirty refit and restores its link focus', Object.values(restored).every(Boolean), JSON.stringify(restored));
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="bay-unsaved-dialog"]').waitFor();
    check('leaving the restored dirty refit asks before discarding', await saved(page) === saveBefore);
    await page.locator('[data-testid="bay-unsaved-discard"]').click();
    await page.locator('[data-testid="refit-bay"]').waitFor({ state: 'hidden' });
    await page.locator('[data-testid="camp-wiki"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-testid="wiki-machines"]').click();
    await shot('mobile-machines');
    check('phone archive has no horizontal overflow', await noOverflow(page));
    await page.locator('[data-testid="wiki-search"]').fill('Bulwark');
    await page.locator('.wiki-machine-card[href="#wiki/mech/bulwark_bwk3"]').click();
    await page.locator('[data-testid="wiki-article"]').waitFor();
    await page.getByRole('heading', { name: 'Bulwark', exact: true }).waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('.wiki-mech-portrait img'); return img?.complete && img.naturalWidth > 0; });
    await shot('mobile-bulwark');
    await page.locator('.wiki-fit').scrollIntoViewIfNeeded();
    await shot('mobile-standard-fit');
    check('phone dossier keeps stock fit, history and return control accessible', await noOverflow(page)
      && await page.locator('.wiki-fit').isVisible() && await page.locator('[data-testid="wiki-close"]').isVisible());
    await page.locator('[data-testid="wiki-close"]').click();
    check('archive browsing leaves the company save unchanged', await saved(page) === saveBefore);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-testid="camp-exit"]').click();
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.locator('[data-testid="lance-bar"]').waitFor();
    // The shipped build has no diagnostic handle; the full development runner also checks live pause ownership.
    if (await page.evaluate(() => Boolean(globalThis.__wreckright))) {
      await page.evaluate(() => globalThis.__wreckright.engine.setPaused(false));
      await page.waitForFunction(() => globalThis.__wreckright?.world.tick > 2);
      await page.evaluate(() => { location.hash = '#wiki/mech/prybar_pry1'; });
      await page.locator('[data-testid="wiki-article"]').waitFor();
      await page.locator('.wiki-article h1').focus();
      const before = await page.evaluate(() => ({ tick: globalThis.__wreckright.world.tick, order: globalThis.__wreckright.useGame.getState().orderMode }));
      await page.keyboard.press('Space'); await page.keyboard.press('m');
      await page.evaluate(() => new Promise(resolve => { let frames = 0; const next = () => ++frames < 12 ? requestAnimationFrame(next) : resolve(); requestAnimationFrame(next); }));
      const paused = await page.evaluate(() => ({ tick: globalThis.__wreckright.world.tick, order: globalThis.__wreckright.useGame.getState().orderMode, paused: globalThis.__wreckright.useGame.getState().paused }));
      check('archive pauses a live battle and blocks field shortcuts', paused.tick === before.tick && paused.order === before.order && paused.paused, JSON.stringify({ before, paused }));
      await page.keyboard.press('Escape');
      await page.waitForFunction(tick => globalThis.__wreckright?.world.tick > tick, before.tick);
      check('closing the archive resumes a battle that was running', await page.evaluate(() => !globalThis.__wreckright.useGame.getState().paused));
      await page.evaluate(() => { globalThis.__wreckright.engine.setPaused(true); location.hash = '#wiki'; });
      await page.locator('[data-testid="wiki"]').waitFor();
      await page.keyboard.press('Escape');
      check('closing the archive preserves an already paused battle', await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused));
    }
    check('wiki journey has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { await shot('error').catch(() => {}); throw error; }
  finally { await context.close(); }
}
