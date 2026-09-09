import { activeAudioContext, audioProbe, installAudioProbe, waitForScoreReady } from './audio-probe.mjs';

export async function runAuthoredScoreLoadingChecks({ browser, url, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await installAudioProbe(page);
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(url);
    await page.waitForSelector('[data-testid="home-screen"]');
    check('home theme waits for the first user gesture', (await audioProbe(page)).length === 0);
    await page.locator('.home-introduction h1').click();
    await waitForScoreReady(page);
    const home = activeAudioContext(await audioProbe(page));
    check('home starts the original stereo theme and its synchronized faction colors',
      JSON.stringify(home.scoreSources.map(source => source.channels)) === JSON.stringify([2, 1, 1])
        && new Set(home.scoreSources.map(source => source.starts[0])).size === 1
        && home.scoreSources.every(source => source.loop && source.playbackRate === 1));
    await page.locator('[data-testid="home-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    await waitForScoreReady(page);
    const campaign = activeAudioContext(await audioProbe(page));
    check('home to campaign keeps the already unlocked score through route effects',
      (await audioProbe(page)).length === 1 && campaign.closeCalls === 0
        && JSON.stringify(campaign.scoreSources.map(source => source.starts))
          === JSON.stringify(home.scoreSources.map(source => source.starts)));

    await page.reload();
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.evaluate(() => globalThis.__audioProbe.deferDecodes(true));
    await page.locator('.home-introduction h1').click();
    await page.waitForFunction(() => globalThis.__audioProbe.pendingDecodes() === 3);
    const loading = activeAudioContext(await audioProbe(page));
    check('pending decode owns only the fixed three-source music cohort',
      loading.scoreSources.length === 3 && loading.scoreSources.every(source => source.starts.length === 0));
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot()[0].state === 'closed');
    await page.evaluate(() => globalThis.__audioProbe.releaseDecodes());
    await page.waitForFunction(() => globalThis.__audioProbe.pendingDecodes() === 0);
    const cancelled = (await audioProbe(page))[0];
    check('leaving home during decode never revives or starts the abandoned music',
      cancelled.closeCalls === 1 && cancelled.scoreSources.length === 3
        && cancelled.scoreSources.every(source => source.starts.length === 0 && source.stops.length === 0 && !source.loaded));
    await page.locator('.viewport canvas:not(.perf-overlay)').click({ force: true, position: { x: 40, y: 40 } });
    await waitForScoreReady(page);
    check('the next battle can load its own theme after cancellation',
      (await audioProbe(page)).length === 2 && activeAudioContext(await audioProbe(page)).scoreSources.every(source => source.starts.length === 1));
    check('authored score loading reports no page errors', errors.length === 0, errors.join(' | '));
  } finally { await context.close(); }
}
