import { readFileSync } from 'node:fs';

const STORAGE_KEY = 'ironline.design.e2e_range_cairn';
const source = JSON.parse(
  readFileSync(new URL('../../src/data/designs/cairn_battery.json', import.meta.url), 'utf8'),
);
const fixture = {
  ...source,
  id: 'e2e_range_cairn',
  name: 'Range Chart Cairn',
};

const viewports = [
  { label: 'desktop', width: 1440, height: 900, mobile: false },
  { label: 'portrait', width: 390, height: 844, mobile: true },
  { label: 'landscape', width: 844, height: 390, mobile: true },
  { label: 'tablet', width: 1024, height: 768, mobile: false },
];

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openFixture(browser, url, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = watchPage(page);
  await page.addInitScript(({ key, design }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(key, JSON.stringify(design));
    localStorage.setItem(
      'ironline.training',
      JSON.stringify({ version: 1, step: 0, status: 'skipped' }),
    );
  }, { key: STORAGE_KEY, design: fixture });
  await page.goto(url);
  await page.locator('[data-testid="home-skirmish"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);
  const berth = page.locator('[data-testid="berth-design-0"]');
  await berth.selectOption('saved:e2e_range_cairn');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="berth-design-0"]')?.value === 'custom',
  );
  await page.locator('[data-testid="berth-customise-0"]').click();
  await page.waitForSelector('[data-testid="outfit-bay"]');
  const inspect = page.getByRole('button', { name: 'Inspect Longshot 10', exact: true });
  await inspect.scrollIntoViewIfNeeded();
  await inspect.focus();
  await inspect.press('Enter');
  const chart = page.locator('[data-testid="range-damage-chart"]');
  await chart.waitFor({ state: 'visible' });
  await chart.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  return { context, page, chart, errors };
}

export async function runRangeDamageChartChecks({ browser, url, shots, check }) {
  process.stdout.write('\nrange damage chart\n');
  for (const viewport of viewports) {
    const run = await openFixture(browser, url, viewport);
    try {
      const prefix = `${viewport.label} range chart`;
      const inspected = run.chart.locator('svg[data-chart="inspected"]');
      const loadout = run.chart.locator('svg[data-chart="loadout"]');
      const descriptions = await run.chart.locator('desc').allTextContents();
      check(
        `${prefix} exposes separate inspected and current-loadout graphics`,
        (await run.chart.locator('svg[role="img"]').count()) === 2 &&
          (await inspected.getAttribute('focusable')) === 'false' &&
          (await loadout.getAttribute('focusable')) === 'false',
      );
      check(
        `${prefix} states the fixed domain and Longshot minimum-range notch`,
        (await run.chart.getAttribute('data-range-maximum')) === '600' &&
          (await inspected.getAttribute('data-min-range')) === '60' &&
          descriptions.some((line) => line.includes('inside 60 metres')) &&
          descriptions.some((line) => line.includes('current mounts')) &&
          descriptions.some((line) => line.includes('full 0 to 600 metre chart')),
        descriptions.join(' | '),
      );
      const stack = run.chart.locator('[data-chart-series="loadout"]');
      const stackFacts = await stack.evaluateAll((groups) => groups.map((group) => ({
        weapon: group.getAttribute('data-weapon-id'),
        count: group.getAttribute('data-mount-count'),
      })));
      check(
        `${prefix} stacks the exact four-mount Cairn battery`,
        stackFacts.length === 3 &&
          stackFacts.some(({ weapon, count }) => weapon === 'lrm20' && count === '1') &&
          stackFacts.some(({ weapon, count }) => weapon === 'lrm10' && count === '1') &&
          stackFacts.some(({ weapon, count }) => weapon === 'streak_srm6' && count === '2'),
        JSON.stringify(stackFacts),
      );
      const geometry = await run.chart.evaluate((element) => {
        const dossier = element.closest('[data-testid="bay-dossier-card"]');
        const bay = element.closest('[data-testid="mechbay"]');
        const rect = element.getBoundingClientRect();
        const dossierRect = dossier?.getBoundingClientRect();
        return {
          chartOverflow: element.scrollWidth - element.clientWidth,
          dossierOverflow: (dossier?.scrollWidth ?? 0) - (dossier?.clientWidth ?? 0),
          bayOverflow: (bay?.scrollWidth ?? 0) - (bay?.clientWidth ?? 0),
          contained: dossierRect !== undefined &&
            rect.left >= dossierRect.left - 1 && rect.right <= dossierRect.right + 1,
          verticallyContained: dossierRect !== undefined &&
            rect.top >= dossierRect.top - 1 && rect.bottom <= dossierRect.bottom + 1,
        };
      });
      check(
        `${prefix} remains horizontally contained and reachable`,
        geometry.chartOverflow <= 1 && geometry.dossierOverflow <= 1 &&
          geometry.bayOverflow <= 1 && geometry.contained &&
          (viewport.label !== 'tablet' || geometry.verticallyContained),
        JSON.stringify(geometry),
      );
      check(`${prefix} reports no page errors`, run.errors.length === 0, run.errors.join(' | '));
      await run.page.screenshot({
        path: `${shots}/16-range-damage-${viewport.label}.png`,
      });
    } finally {
      await run.context.close();
    }
  }
}
