import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runLoreWikiChecks } from './lore-wiki.mjs';

const shots = process.env.SHOT_DIR ?? 'reports/lore-wiki/after';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
try {
  const options = { browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5218/', shots,
    check(name, passed, detail = '') { results.push({ name, passed: Boolean(passed), detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); },
  };
  await runLoreWikiChecks(options);
  if (process.env.OPENING_ROUTES === '1') {
    const { runOpeningRouteChecks } = await import('./opening-route.mjs');
    await runOpeningRouteChecks(options);
  }
  if (results.some(result => !result.passed)) throw new Error(JSON.stringify(results.filter(result => !result.passed)));
  console.log(`${results.length}/${results.length} archive checks passed`);
} finally {
  await browser.close();
  await writeFile(`${shots}/checks.json`, `${JSON.stringify(results, null, 2)}\n`);
}
