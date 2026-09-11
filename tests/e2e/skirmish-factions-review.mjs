import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runSkirmishFactionChecks } from './skirmish-factions.mjs';
const shots = process.env.SHOT_DIR ?? 'reports/skirmish-factions';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
try {
  await runSkirmishFactionChecks({ browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5250/', shots,
    check(name, passed, detail = '') { results.push({ name, passed: Boolean(passed), detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); },
  });
  if (results.some(result => !result.passed)) throw new Error('Skirmish faction checks failed');
  console.log(`${results.length}/${results.length} skirmish faction checks passed`);
} finally {
  await browser.close();
  await writeFile(`${shots}/checks.json`, `${JSON.stringify(results, null, 2)}\n`);
}
