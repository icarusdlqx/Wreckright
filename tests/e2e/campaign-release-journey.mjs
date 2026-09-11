import { mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { runCampaignCommandFlow } from './campaign-command-flow.mjs';
import { runCampaignRecovery } from './campaign-recovery.mjs';
import { runCampaignSaveLibraryChecks } from './campaign-save-library.mjs';
import { runMechbayPersistenceChecks } from './mechbay-persistence.mjs';

const url = process.env.BASE_URL ?? 'http://127.0.0.1:5221/';
const folder = process.env.SHOT_DIR ?? 'reports/release-polish/campaign';
const requested = (process.env.CAMPAIGN_BROWSERS ?? 'chromium,firefox')
  .split(',').map(value => value.trim()).filter(Boolean);
const engines = { chromium, firefox };
const failures = [];
let checks = 0;

await mkdir(folder, { recursive: true });
for (const name of requested) {
  const engine = engines[name];
  if (engine === undefined) throw new Error(`Unknown campaign browser: ${name}`);
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } : {}),
  });
  try {
    const baseContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const basePage = await baseContext.newPage();
    await basePage.goto(url);
    const record = (label, ok, detail = '') => {
      checks += 1;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${label}`);
      if (!ok) failures.push(`${name}: ${label}${detail ? ` — ${detail}` : ''}`);
    };
    const browserFolder = `${folder}/${name}`;
    await mkdir(browserFolder, { recursive: true });
    await runCampaignSaveLibraryChecks({ page: basePage, shots: browserFolder, check: record });
    await runCampaignRecovery({ page: basePage, shots: browserFolder, check: record });
    await runMechbayPersistenceChecks({ browser, url, shots: browserFolder, check: record });
    await runCampaignCommandFlow({ browser, url, shots: browserFolder, check: record });
    await baseContext.close();
  } finally {
    await browser.close();
  }
}

if (failures.length > 0) throw new Error(failures.join('\n'));
console.log(`${checks}/${checks} campaign release checks passed across ${requested.join(' and ')}`);
