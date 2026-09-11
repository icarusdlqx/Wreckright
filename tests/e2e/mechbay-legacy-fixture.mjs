import { readFileSync } from 'node:fs';

const mixedSentinel = readFileSync(new URL('../fixtures/legacy-sentinel-brawler.json', import.meta.url));

/** Exercise saved cannon/ammo refits through the same file-import UI players use. */
export async function importLegacySentinel(page) {
  await page.getByTestId('bay-import').setInputFiles({
    name: 'legacy-sentinel-brawler.json', mimeType: 'application/json', buffer: mixedSentinel,
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="bay-status"]')?.textContent?.startsWith('Imported'));
  await page.getByTestId('bay-location-right_arm').locator('[data-testid^="inspect-weapon-"]').waitFor();
}

export async function comparisonMetrics(page) {
  return page.locator('[data-testid^="build-compare-"][data-direction]').evaluateAll(metrics =>
    Object.fromEntries(metrics.map(metric => [metric.dataset.testid.replace('build-compare-', ''), {
      direction: metric.dataset.direction,
      stock: Number(metric.querySelector('.build-compare__before').textContent.replace('−', '-')),
      current: Number(metric.querySelector('.build-compare__values strong').textContent.replace('−', '-')),
    }])));
}

export function addedWeaponComparison(before, after) {
  const entries = Object.entries(after);
  return entries.length === 7 && entries.every(([, metric]) => Number.isFinite(metric.current)
    && metric.direction === (metric.current === metric.stock ? 'neutral' : metric.current > metric.stock ? 'good' : 'bad'))
    && after.speed.current === before.speed.current && after.armour.current === before.armour.current
    && after.heat_margin.current < before.heat_margin.current
    && ['alpha_damage', 'dps_short', 'dps_medium', 'dps_long'].every(id => after[id].current > before[id].current);
}
