import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runSkirmishForceChecks } from './skirmish-forces.mjs';
const shots = process.env.SHOT_DIR ?? 'reports/faction-campaign-playtest/skirmish';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
try {
  await runSkirmishForceChecks({ browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5233/', shots,
    check(name, passed, detail = '') { results.push({ name, passed: Boolean(passed), detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); },
  });
  if (results.some((result) => !result.passed)) throw new Error('Skirmish checks failed');
  console.log(`${results.length}/${results.length} skirmish checks passed`);
} finally {
  await browser.close();
  await writeFile(`${shots}/checks.json`, `${JSON.stringify(results, null, 2)}\n`);
}
