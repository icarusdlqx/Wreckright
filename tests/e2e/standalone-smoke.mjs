import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const shots = process.env.SHOT_DIR ?? './reports/standalone';
await mkdir(shots, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    globalThis.__standaloneGlRequests = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])) globalThis.__standaloneGlRequests++;
      return getContext.apply(this, args);
    };
  });
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  await page.goto(pathToFileURL(resolve('dist-single/wreckright.html')).href);
  // A decoded image is not screenshot-ready until React exposes it and its fade finishes.
  await page.waitForFunction(() => {
    const home = document.querySelector('[data-testid="home-screen"][data-artwork="ready"]');
    const art = home?.querySelector('[data-testid="home-artwork"]');
    if (!(art instanceof HTMLImageElement)) return false;
    const style = getComputedStyle(art);
    const box = art.getBoundingClientRect();
    return art.complete && art.naturalWidth > 0 && art.naturalHeight > 0
      && box.width > 0 && box.height > 0 && style.visibility === 'visible'
      && Number.parseFloat(style.opacity) >= 0.99;
  });
  await page.evaluate(() => document.fonts.ready);
  // The menu may not use every bundled face; load them explicitly before testing availability.
  const fonts = await page.evaluate(async () => Promise.all([
    '600 24px "Barlow Condensed"', '700 24px "Barlow Condensed"', '400 14px "DM Sans"',
  ].map(async font => {
    const faces = await document.fonts.load(font);
    return { font, faces: faces.length,
      loaded: faces.length > 0 && faces.every(face => face.status === 'loaded') && document.fonts.check(font) };
  })));
  const home = await page.evaluate(() => {
    const art = document.querySelector('[data-testid="home-artwork"]').currentSrc;
    return { inlineArt: art.startsWith('data:image/webp;'), artPrefix: art.slice(0, 32), artLength: art.length,
      graphics: globalThis.__standaloneGlRequests,
      battle: document.querySelector('[data-testid="viewport"]') !== null };
  });
  if (!fonts.every(face => face.loaded) || !home.inlineArt || home.graphics !== 0 || home.battle) {
    throw new Error(`Missing inline fonts/art or premature game renderer: ${JSON.stringify({ fonts, home })}`);
  }
  await page.screenshot({ path: `${shots}/home.png` });
  await page.locator('[data-testid="home-wiki"]').click();
  await page.locator('[data-testid="wiki-machines"]').click();
  if (await page.locator('.wiki-machine-card').count() !== 16) throw new Error('Offline archive missing machine dossiers');
  await page.locator('.wiki-machine-card[href="#wiki/mech/prybar_pry1"]').click();
  await page.waitForFunction(() => { const image = document.querySelector('.wiki-mech-portrait img'); return image?.complete && image.naturalWidth > 0; });
  if (!(await page.locator('.wiki-reading').innerText()).includes('Service history')) throw new Error('Offline dossier missing history');
  await page.screenshot({ path: `${shots}/wiki.png` });
  await page.reload();
  await page.locator('[data-testid="wiki-article"]').waitFor();
  if (!(await page.evaluate(() => globalThis.__standaloneGlRequests === 0
    && document.querySelector('[data-testid="home-screen"]') === null
    && document.querySelector('[data-testid="viewport"]') === null))) {
    throw new Error('Direct offline archive mounted a game or allocated WebGL');
  }
  await page.locator('[data-testid="wiki-close"]').click();
  await page.locator('[data-testid="home-campaign"]').click();
  await page.waitForSelector('[data-testid="campaign"]');
  await completeInitialCampaignSetup(page);
  await page.locator('[data-testid="campaign-guide-dismiss"]').click();
  await page.locator('[data-testid="camp-area-workshop"]').click();
  await page.locator('[data-testid^="camp-refit-"]:enabled').first().click();
  await page.waitForSelector('[data-testid="refit-bay"]');
  await page.waitForSelector('[data-testid="refit-bay"] canvas');
  await page.screenshot({ path: `${shots}/workshop-refit.png` });
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="camp-area-operations"]').click();
  await page.locator('[data-testid="camp-accept"]').click();
  await page.locator('[data-testid="camp-deploy"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.locator('[data-testid="briefing-deploy"]').click();
  await page.waitForSelector('[data-testid="viewport"]');
  await page.screenshot({ path: `${shots}/battle.png` });
  if (errors.length || external.length) throw new Error(JSON.stringify({ errors, external }));
  console.log('Standalone smoke passed: inline fonts and home artwork without WebGL, 16 machine dossiers, offline archive reload, workshop refit, contract, deployment; zero external HTTP requests or page errors.');
} finally {
  await browser.close();
}
