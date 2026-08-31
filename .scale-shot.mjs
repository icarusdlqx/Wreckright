import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-davelangy-Wreckright/08c5f3d4-138b-4564-b260-e3cc1fa0d5b3/scratchpad';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5196/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="home-skirmish"]').click();
await page.waitForFunction(() => globalThis.__wreckright !== undefined, { timeout: 40000 });
await page.waitForTimeout(1500);
await page.evaluate(() => globalThis.__wreckright.useGame.getState().patch({ screen: 'mechbay' }));
await page.waitForSelector('[data-testid="mechbay"]');
await page.waitForTimeout(1800);
const picker = page.locator('[data-testid="design-picker"]');
for (const [id, label] of [['wisp_scout','25t'], ['sentinel_brawler','45t'], ['colossus_siege','100t']]) {
  await picker.selectOption(id);
  await page.waitForTimeout(2200);
  await page.locator('[data-testid="mechbay"] canvas').first().screenshot({ path: `${OUT}/scale-${label}-${id}.png` });
}
console.log('captured');
await browser.close();
