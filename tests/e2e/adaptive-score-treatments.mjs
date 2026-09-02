import {
  advanceAudioClock,
  audioProbe,
  includesValues,
  installAudioProbe,
  newTargets,
  scoreFrequencyTargets,
} from './audio-probe.mjs';

const SCORE_SOURCE_COUNT = 5;
const SCORE_SOURCE_IDS = [6, 8, 13, 15, 19];
const CAMPAIGN_LEVEL = 0.052 * 0.6;
const MECHBAY_LEVEL = 0.052 * 0.72;
const CAMPAIGN_PULSE_HZ = 0.72;
const MECHBAY_PULSE_HZ = 0.72 + 0.3 * 1.45;
const LINEWROUGHT_PITCHES = [43.65, 65.41, 87.31, 103.83];
const AURELIAN_PITCHES = [46.25, 69.3, 103.83, 130.81];
const FIXED_TOPOLOGY = [
  '0:destination>',
  '1:compressor>node:0',
  '2:gain>node:1',
  '3:gain>node:2',
  '4:gain>node:3',
  '5:filter>node:4',
  '6:oscillator>node:7',
  '7:gain>node:5',
  '8:oscillator>node:9',
  '9:gain>node:5',
  '10:gain>node:3',
  '11:filter>node:10',
  '12:gain>node:11',
  '13:oscillator>node:14',
  '14:gain>node:12',
  '15:oscillator>node:16',
  '16:gain>param:gain-12',
  '17:gain>node:3',
  '18:filter>node:17',
  '19:oscillator>node:18',
];

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function fixedTopology(context) {
  const boundary = Math.max(...context.scoreSources.map((source) => source.id));
  return context.topology
    .filter((node) => node.id <= boundary)
    .map((node) => `${node.id}:${node.kind}>${node.connections.join(',')}`);
}

function fixedScoreGraph(context, active = true) {
  return JSON.stringify(context.scoreSources.map((source) => source.id))
      === JSON.stringify(SCORE_SOURCE_IDS)
    && context.scoreSources.every((source) => source.kind === 'oscillator'
      && source.starts.length === 1 && source.stops.length === (active ? 0 : 1)
      && source.active === active)
    && JSON.stringify(fixedTopology(context)) === JSON.stringify(FIXED_TOPOLOGY);
}

function sameFixedGraph(before, after) {
  return JSON.stringify(before.scoreSources.map((source) => source.id))
      === JSON.stringify(after.scoreSources.map((source) => source.id))
    && JSON.stringify(fixedTopology(before)) === JSON.stringify(fixedTopology(after));
}

function includesTarget(entries, name, value, epsilon = 0.0001) {
  return entries.some((entry) => entry.name === name && Math.abs(entry.value - value) <= epsilon);
}

async function freshPage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = watchPage(page);
  await installAudioProbe(page, SCORE_SOURCE_COUNT);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ironline.training',
      JSON.stringify({ version: 1, step: 0, status: 'skipped' }),
    );
  });
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  return { context, page, errors };
}

async function openDesktopMenu(page) {
  const sheet = page.locator('[data-testid="desktop-menu-sheet"]');
  if (!(await sheet.isVisible())) await page.locator('[data-testid="desktop-menu-toggle"]').click();
  await sheet.waitFor({ state: 'visible' });
}

async function waitForClosed(page, index) {
  await page.waitForFunction((wanted) => {
    const context = globalThis.__audioProbe.snapshot()[wanted];
    return context?.state === 'closed' && context.closeCalls === 1;
  }, index);
}

async function checkCampaignAndNestedRefit({ browser, url, check }) {
  const fixture = await freshPage(browser, url);
  const { context, page, errors } = fixture;
  try {
    await page.locator('[data-testid="home-learn"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.locator('[data-testid="training-skip"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 1);
    const campaign = (await audioProbe(page))[0];
    check('training skip creates the campaign score before any second strategic gesture',
      campaign.state === 'running' && campaign.scoreSources.length === SCORE_SOURCE_COUNT);
    check('campaign route owns one fixed strategic score graph',
      campaign.counts.nodes === 20 && campaign.counts.sources === SCORE_SOURCE_COUNT
        && campaign.counts.gains === 10 && campaign.counts.filters === 3
        && fixedScoreGraph(campaign)
        && includesTarget(campaign.automation, 'gain-3', CAMPAIGN_LEVEL),
      JSON.stringify({ counts: campaign.counts, topology: fixedTopology(campaign) }));

    await page.locator('[data-testid="campaign-mute-button"]').click();
    const muted = (await audioProbe(page))[0];
    check('campaign mute zeros the strategic master without rebuilding its score',
      muted.master === 0 && sameFixedGraph(campaign, muted)
        && (await page.locator('[data-testid="campaign-mute-button"]').innerText()) === 'Sound off'
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');
    await page.locator('[data-testid="campaign-mute-button"]').click();

    await page.locator('[data-testid="camp-node-militia_raid"]').click();
    await page.locator('[data-testid="camp-accept"]').click();
    await page.locator('[data-testid="camp-review-machines"]').click();
    await page.waitForSelector('[data-testid="hangar-stage"]');
    await advanceAudioClock(page);
    const beforeRefit = (await audioProbe(page))[0];
    await page.locator('[data-testid^="hangar-refit-"]:not([disabled])').first().click();
    await page.waitForSelector('[data-testid="refit-bay"] [data-testid="mechbay"]');
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot()[0].targets > count, beforeRefit.targets);
    const refit = (await audioProbe(page))[0];
    const refitTargets = newTargets(beforeRefit, refit);
    check('campaign refit borrows the strategic graph and applies the mechbay treatment',
      (await audioProbe(page)).length === 1 && sameFixedGraph(beforeRefit, refit)
        && JSON.stringify(beforeRefit.counts) === JSON.stringify(refit.counts)
        && includesTarget(refitTargets, 'gain-3', MECHBAY_LEVEL)
        && includesTarget(refitTargets, 'source-15-frequency', MECHBAY_PULSE_HZ),
      JSON.stringify(refitTargets));

    await advanceAudioClock(page);
    const beforeReturn = (await audioProbe(page))[0];
    await page.locator('[data-testid="bay-exit"]').click();
    await page.waitForSelector('[data-testid="refit-bay"]', { state: 'detached' });
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot()[0].targets > count, beforeReturn.targets);
    const returned = (await audioProbe(page))[0];
    const returnTargets = newTargets(beforeReturn, returned);
    check('closing campaign refit restores the map treatment on the same sources',
      sameFixedGraph(refit, returned)
        && includesTarget(returnTargets, 'gain-3', CAMPAIGN_LEVEL)
        && includesTarget(returnTargets, 'source-15-frequency', CAMPAIGN_PULSE_HZ),
      JSON.stringify(returnTargets));

    await page.locator('[data-testid="hangar-cancel"]').click();
    await page.locator('[data-testid="camp-exit"]').click();
    await page.waitForSelector('[data-testid="home-screen"]');
    await waitForClosed(page, 0);
    const closed = (await audioProbe(page))[0];
    check('leaving campaign stops every strategic source and closes its context once',
      fixedScoreGraph(closed, false) && closed.closeCalls === 1 && closed.state === 'closed');
    check('campaign treatment fixture reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

async function checkStandaloneMechbay({ browser, url, check }) {
  const fixture = await freshPage(browser, url);
  const { context, page, errors } = fixture;
  try {
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);
    await openDesktopMenu(page);
    await page.locator('[data-testid="open-mechbay"]').click();
    await page.waitForSelector('[data-testid="mechbay"]');
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 1);
    const bay = (await audioProbe(page))[0];
    check('standalone mechbay owns one fixed strategic score graph',
      fixedScoreGraph(bay) && includesTarget(bay.automation, 'gain-3', MECHBAY_LEVEL)
        && includesTarget(bay.automation, 'source-15-frequency', MECHBAY_PULSE_HZ),
      JSON.stringify({ counts: bay.counts, topology: fixedTopology(bay) }));

    await page.locator('[data-testid="bay-mute-button"]').click();
    const muted = (await audioProbe(page))[0];
    check('standalone mechbay mute shares the persisted master control',
      muted.master === 0 && sameFixedGraph(bay, muted)
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');

    await page.locator('[data-testid="bay-exit"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await waitForClosed(page, 0);
    const closed = (await audioProbe(page))[0];
    check('leaving standalone mechbay tears down its strategic graph before battle unlock',
      (await audioProbe(page)).length === 1 && fixedScoreGraph(closed, false)
        && closed.closeCalls === 1);
    await page.locator('.viewport canvas:not(.perf-overlay)').click({
      force: true,
      position: { x: 40, y: 40 },
    });
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 2);
    const remountedBattle = (await audioProbe(page))[1];
    await openDesktopMenu(page);
    const battleMute = page.locator('[data-testid="mute-button"]');
    const returnedLabel = await battleMute.innerText();
    await battleMute.click();
    check('muted standalone bay returns a muted battle whose first toggle audibly restores sound',
      returnedLabel === 'Sound off' && remountedBattle.master === 0
        && (await battleMute.innerText()) === 'Sound on'
        && (await audioProbe(page))[1].master === 0.5
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '0');
    check('standalone mechbay score fixture reports no page errors', errors.length === 0,
      errors.join(' | '));
  } finally {
    await context.close();
  }
}

async function checkBattleOutfitterReuse({ browser, url, check }) {
  const fixture = await freshPage(browser, url);
  const { context, page, errors } = fixture;
  try {
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);
    await page.locator('[data-testid="briefing-faction-picker"]').selectOption('aurelian');
    await page.waitForFunction(() => {
      const wreckright = globalThis.__wreckright;
      if (wreckright === undefined) return false;
      const { world } = wreckright;
      const friendlies = world.entities.filter((entity) => entity.team === world.playerTeam);
      return friendlies.length > 0 && friendlies.every((entity) =>
        world.catalog.chassis.get(entity.chassisId)?.faction === 'aurelian');
    });
    await page.locator('[data-testid="berth-customise-0"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"] [data-testid="mechbay"]');
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 1);
    const outfit = (await audioProbe(page))[0];
    check('battle briefing outfitter reuses the battle score graph',
      fixedScoreGraph(outfit) && includesTarget(outfit.automation, 'gain-3', MECHBAY_LEVEL)
        && includesTarget(outfit.automation, 'source-15-frequency', MECHBAY_PULSE_HZ)
        && includesValues(outfit.scoreSources.map((source) => source.startFrequency), AURELIAN_PITCHES),
      JSON.stringify({ contexts: (await audioProbe(page)).length, counts: outfit.counts }));

    await advanceAudioClock(page);
    const beforeOppositeBay = (await audioProbe(page))[0];
    await page.evaluate(() => globalThis.__wreckright.engine.audio.setMechbayScore(0));
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot()[0].targets > count, beforeOppositeBay.targets);
    const oppositeBay = (await audioProbe(page))[0];
    check('opposite-culture bay treatment reaches the Linewrought voicing before deployment',
      includesValues(scoreFrequencyTargets(beforeOppositeBay, oppositeBay), LINEWROUGHT_PITCHES));

    const briefingTick = await page.evaluate(() => globalThis.__wreckright.world.tick);
    await advanceAudioClock(page);
    const beforePrimeRestore = (await audioProbe(page))[0];
    await page.locator('[data-testid="bay-exit"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"]', { state: 'detached' });
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot()[0].targets > count, beforePrimeRestore.targets);
    const primeRestored = (await audioProbe(page))[0];
    check('closing an opposite-culture bay restores the primed Aurelian battle voice before a sim step',
      (await page.evaluate(() => globalThis.__wreckright.world.tick)) === briefingTick
        && includesValues(
          scoreFrequencyTargets(beforePrimeRestore, primeRestored),
          AURELIAN_PITCHES,
        ),
      JSON.stringify(scoreFrequencyTargets(beforePrimeRestore, primeRestored)));

    await advanceAudioClock(page);
    await page.locator('[data-testid="berth-customise-0"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"] [data-testid="mechbay"]');

    await page.locator('[data-testid="bay-mute-button"]').click();
    const muted = (await audioProbe(page))[0];
    check('embedded outfitter mute silences the existing battle master',
      muted.master === 0 && sameFixedGraph(outfit, muted)
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');

    await advanceAudioClock(page);
    await page.locator('[data-testid="bay-exit"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"]', { state: 'detached' });
    const battle = (await audioProbe(page))[0];
    await openDesktopMenu(page);
    const battleMute = page.locator('[data-testid="mute-button"]');
    const syncedLabel = await battleMute.innerText();
    await battleMute.click();
    check('embedded outfitter mute synchronises the battle menu and toggles back there',
      syncedLabel === 'Sound off'
        && (await battleMute.innerText()) === 'Sound on'
        && (await audioProbe(page))[0].master === 0.5
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '0');
    await page.locator('[data-testid="desktop-menu-toggle"]').click();
    await page.locator('[data-testid="desktop-menu-sheet"]').waitFor({ state: 'hidden' });
    await advanceAudioClock(page);
    await page.locator('[data-testid="berth-customise-0"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"] [data-testid="mechbay"]');
    const reopened = (await audioProbe(page))[0];
    check('reopening the battle outfitter allocates no context or score sources',
      (await audioProbe(page)).length === 1 && sameFixedGraph(outfit, battle)
        && sameFixedGraph(battle, reopened)
        && reopened.scoreSources.length === SCORE_SOURCE_COUNT
        && reopened.scoreSources.every((source) => source.starts.length === 1),
      JSON.stringify({ before: outfit.counts, battle: battle.counts, reopened: reopened.counts }));

    await page.locator('[data-testid="bay-exit"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await openDesktopMenu(page);
    await page.locator('[data-testid="open-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 2);
    await waitForClosed(page, 0);
    const separated = await audioProbe(page);
    check('campaign navigation closes the battle graph and opens a separate strategic graph',
      fixedScoreGraph(separated[0], false) && fixedScoreGraph(separated[1])
        && separated[0].closeCalls === 1 && separated[1].state === 'running');
    await page.locator('[data-testid="camp-exit"]').click();
    await page.waitForSelector('[data-testid="home-screen"]');
    await waitForClosed(page, 1);
    check('battle outfitter fixture reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

export async function runAdaptiveScoreTreatmentChecks({ browser, url, check }) {
  process.stdout.write('\nadaptive score treatments\n');
  await checkCampaignAndNestedRefit({ browser, url, check });
  await checkStandaloneMechbay({ browser, url, check });
  await checkBattleOutfitterReuse({ browser, url, check });
}
