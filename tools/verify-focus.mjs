import { mkdir, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const groups = {
  fitting: {
    tests: [
      'src/sim/loadout.test.ts', 'src/campaign/refitQuote.test.ts',
      'src/campaign/crossFactionFitting.test.ts', 'src/campaign/weaponSaveMigration.test.ts',
      'src/ui/mechbay/fittingTradeoffs.test.ts', 'src/ui/mechbay/visualFitting.test.ts',
      'src/ui/mechbay/FittedPart.test.ts', 'src/ui/mechbay/LocationCard.test.ts',
      'src/ui/mechbay/editor.test.ts', 'src/ui/mechbay/Mechbay.test.ts',
    ],
  },
  saves: {
    tests: [
      'src/campaign/saveStorage.test.ts', 'src/campaign/saveLibrary.test.ts',
      'src/campaign/progressionSave.test.ts', 'src/campaign/weaponSaveMigration.test.ts',
      'src/ui/playtest/journal.test.ts',
    ],
    browser: [
      { file: 'tests/e2e/campaign-release-journey.mjs', env: { CAMPAIGN_BROWSERS: 'chromium' } },
      { file: 'tests/e2e/playtest-report-review.mjs' },
    ],
  },
  audio: {
    tests: readdirSync('src/ui').filter((file) => file.startsWith('audio') && file.endsWith('.test.ts'))
      .map((file) => `src/ui/${file}`),
    browser: [{ file: 'tests/e2e/audio-weapons-render.mjs' }],
  },
  combat: {
    tests: readdirSync('src/render3d').filter((file) => file.endsWith('.test.ts'))
      .map((file) => `src/render3d/${file}`),
    browser: [{ file: 'tests/e2e/combat-motion-review.mjs' }],
  },
  campaign: {
    tests: [
      'src/campaign/missionProgression.test.ts', 'src/campaign/economyBalance.test.ts',
      'src/campaign/acceptance.test.ts', 'src/ui/campaign/campaignFlow.test.ts',
      'src/ui/campaign/CompanyWorkflow.test.ts',
    ],
    browser: [{ file: 'tests/e2e/campaign-release-journey.mjs', env: { CAMPAIGN_BROWSERS: 'chromium' } }],
  },
};
const ports = { fitting: 5291, saves: 5292, audio: 5293, combat: 5294, campaign: 5295 };

const groupName = process.argv[2];
if (!(groupName in groups)) {
  console.error(`Choose one focused group: ${Object.keys(groups).join(', ')}`);
  process.exit(2);
}
const group = groups[groupName];
const reportDir = resolve('reports/focused', groupName);
await mkdir(reportDir, { recursive: true });
const log = [];

function run(command, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* startup */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Local preview did not start at ${url}`);
}

async function checked(label, command, args, env = {}) {
  process.stdout.write(`• ${label} ... `);
  const result = await run(command, args, env);
  log.push(`\n## ${label}\n${result.output}`);
  if (result.code !== 0) {
    console.log('FAILED');
    const tail = result.output.trim().split('\n').slice(-24).join('\n');
    console.error(tail);
    throw new Error(`${label} failed; full output is in ${reportDir}/run.log`);
  }
  console.log('passed');
}

let preview = null;
try {
  await checked('focused unit tests', process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', ...group.tests]);
  if (group.browser?.length) {
    const port = ports[groupName];
    const url = `http://127.0.0.1:${port}/`;
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    preview.stdout.on('data', (chunk) => log.push(String(chunk)));
    preview.stderr.on('data', (chunk) => log.push(String(chunk)));
    await waitFor(url);
    for (const check of group.browser) {
      await checked(check.file, process.execPath, [check.file], {
        BASE_URL: url,
        SHOT_DIR: resolve(reportDir, check.file.split('/').at(-1).replace('.mjs', '')),
        ...check.env,
      });
    }
  }
  console.log(`Focused ${groupName} verification passed. Evidence: ${reportDir}`);
} finally {
  preview?.kill('SIGTERM');
  await writeFile(resolve(reportDir, 'run.log'), `${log.join('\n')}\n`);
}
