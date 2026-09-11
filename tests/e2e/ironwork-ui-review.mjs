/** Uses an existing server and one disposable headless browser; never starts a server. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { captureIronworkMobile, runIronworkUiChecks } from './ironwork-ui.mjs';

const url = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:5183/');
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('BASE_URL must point to the running Vite server');
const shots = resolve(process.env.SHOT_DIR ?? 'reports/ironwork-ui-review');
await mkdir(shots, { recursive: true });
const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed: Boolean(passed), detail });
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name}${!passed && detail ? ` — ${detail}` : ''}\n`);
};

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  await runIronworkUiChecks({ browser, url: url.href, check, shots });
  await captureIronworkMobile({ browser, url: url.href, check, shots });
} catch (error) {
  check('review completed without an execution error', false, error instanceof Error ? error.stack : String(error));
} finally {
  await browser?.close();
  const passed = results.filter((result) => result.passed).length;
  const report = { url: url.href, passed, total: results.length, results };
  await writeFile(resolve(shots, 'checks.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\n${passed}/${results.length} checks passed. Evidence: ${shots}\n`);
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}
