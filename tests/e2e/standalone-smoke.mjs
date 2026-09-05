import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const shots = process.env.SHOT_DIR ?? './reports/standalone';
await mkdir(shots, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  await page.goto(pathToFileURL(resolve('dist-single/wreckright.html')).href);
  await page.waitForSelector('.home-machine canvas');
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ['600 24px "Barlow Condensed"', '700 24px "Barlow Condensed"', '400 14px "DM Sans"'].every((font) => document.fonts.check(font)));
  if (!fonts || await page.locator('.home-machine canvas').count() !== 2) throw new Error('Missing inline font or machine preview');
  await page.screenshot({ path: `${shots}/home.png` });
  await page.locator('[data-testid="home-campaign"]').click();
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
  console.log('Standalone smoke passed: inline fonts, two home models, workshop refit, contract, deployment; zero external HTTP requests or page errors.');
} finally {
  await browser.close();
}
