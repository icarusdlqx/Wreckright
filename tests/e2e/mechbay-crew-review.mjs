import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runMechbayCrewChecks } from './mechbay-crew.mjs';

const shots = process.env.SHOT_DIR ?? 'reports/mechbay-crew';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
let count = 0;
const failures = [];
try {
  await runMechbayCrewChecks({ browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5217/', shots,
    check(name, ok, detail = '') { count++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(`${name}: ${detail}`); },
  });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`${count}/${count} mechbay and crew checks passed`);
} finally { await browser.close(); }
