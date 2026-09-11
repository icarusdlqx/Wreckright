import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runCompactDesktopChecks } from './compact-desktop.mjs';
import { runCommanderRadioChecks } from './commander-radio.mjs';

const shots = process.env.SHOT_DIR ?? 'reports/compact-desktop';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: [
  '--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
] });
let count = 0;
try {
  const options = { browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5230/', shots,
    check(name, passed, detail = '') {
      console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
      if (!passed) throw new Error(`${name}: ${detail}`);
      count += 1;
    },
  };
  await runCompactDesktopChecks(options);
  await runCommanderRadioChecks(options);
  console.log(`${count}/${count} compact desktop checks passed`);
} finally { await browser.close(); }
