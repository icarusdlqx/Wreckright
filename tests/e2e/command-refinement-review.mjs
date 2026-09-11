import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runCommandRefinementChecks } from './command-refinement.mjs';
import { runRefinementTouchChecks } from './refinement-touch.mjs';
import { runCompanyOutcomeChecks } from './company-outcome-review.mjs';

const shots = process.env.SHOT_DIR ?? 'reports/command-refinement';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
let count = 0;
const failures = [];
try {
  const options = { browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5218/', shots,
    check(name, ok, detail = '') { count++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(`${name}: ${detail}`); },
  };
  if (process.env.OUTCOMES_ONLY === '1') await runCompanyOutcomeChecks(options);
  else {
    if (process.env.TOUCH_ONLY !== '1') await runCommandRefinementChecks(options);
    await runRefinementTouchChecks(options);
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`${count}/${count} command refinement checks passed`);
} finally { await browser.close(); }
