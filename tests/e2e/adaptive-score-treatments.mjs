import { openCampaignDetails } from './unified-navigation.mjs';
import { returnFromAutoPreparation } from './unified-navigation.mjs';
import { runAuthoredScoreLiveChecks } from './authored-score-live.mjs';
import { runAuthoredScoreLoadingChecks } from './authored-score-loading.mjs';
import { discardRefitIfPrompted } from './mechbay-exit.mjs';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import {
  advanceAudioClock,
  audioProbe,
  activeAudioContext,
  waitForScoreReady,
  scoreGainNames,
  installAudioProbe,
  newTargets,
} from './audio-probe.mjs';

const SCORE_SOURCE_COUNT = 3;
const CAMPAIGN_LEVEL = .8 * .54;
const MECHBAY_LEVEL = .8 * .68;

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function fixedScoreGraph(context, active = true) {
  return context.scoreSources.length === SCORE_SOURCE_COUNT
    && context.scoreSources.every(source => source.kind === 'buffer' && source.loop
      && source.starts.length === 1 && source.stops.length === (active ? 0 : 1)
      && source.active === active && source.playbackRate === 1);
}
function sameFixedGraph(before, after) {
  return JSON.stringify(before.scoreSources.map(source => source.id))
    === JSON.stringify(after.scoreSources.map(source => source.id))
    && before.scoreSources.every((source, index) =>
      JSON.stringify(source.starts) === JSON.stringify(after.scoreSources[index].starts));
}
function gainValue(context, role) {
  return context.gains.find(gain => gain.name === scoreGainNames(context)[role])?.value;
}
function cultureMatches(context, share) {
  return Math.abs(gainValue(context, 'ironwork') - (share === 1 ? 0 : Math.cos(share * Math.PI / 2))) < .0001
    && Math.abs(gainValue(context, 'monolith') - (share === 0 ? 0 : Math.sin(share * Math.PI / 2))) < .0001;
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
    await completeInitialCampaignSetup(page);
    await waitForScoreReady(page);
    const scoreIndex = (await audioProbe(page)).length - 1;
    const campaign = activeAudioContext(await audioProbe(page));
    check('training skip creates the campaign score before any second strategic gesture',
      campaign.state === 'running' && campaign.scoreSources.length === SCORE_SOURCE_COUNT);
    check('campaign route owns one fixed strategic score graph',
      campaign.counts.nodes === 14 && campaign.counts.sources === SCORE_SOURCE_COUNT
        && campaign.counts.gains === 9 && campaign.counts.filters === 0
        && fixedScoreGraph(campaign)
        && Math.abs(gainValue(campaign, 'level') - CAMPAIGN_LEVEL) < .0001,
      JSON.stringify({ counts: campaign.counts, topology: campaign.topology }));

    await page.locator('[data-testid="campaign-mute-button"]').click();
    const muted = activeAudioContext(await audioProbe(page));
    check('campaign mute zeros the strategic master without rebuilding its score',
      muted.master === 0 && sameFixedGraph(campaign, muted)
        && (await page.locator('[data-testid="campaign-mute-button"]').innerText()) === 'Unmute all'
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');
    await page.locator('[data-testid="campaign-mute-button"]').click();

    await openCampaignDetails(page);
    await page.locator('[data-testid="camp-node-militia_raid"]').click();
    await page.locator('[data-testid="camp-accept"]').click();
    await returnFromAutoPreparation(page);
    await page.locator('[data-testid="camp-review-machines"]').click();
    await page.waitForSelector('[data-testid="hangar-stage"]');
    await page.locator('[data-testid="prep-seat-0"]').click();
    await page.locator('[data-testid="hangar-continue"]').click();
    await advanceAudioClock(page);
    const beforeRefit = activeAudioContext(await audioProbe(page));
    await page.locator('[data-testid^="manifest-refit-"]:enabled').click();
    await page.waitForSelector('[data-testid="refit-bay"] [data-testid="mechbay"]');
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot().findLast(context => context.state !== 'closed').targets > count, beforeRefit.targets);
    const refit = activeAudioContext(await audioProbe(page));
    const refitTargets = newTargets(beforeRefit, refit);
    check('campaign refit borrows the strategic graph and applies the mechbay treatment',
      (await audioProbe(page)).filter(context => context.state !== 'closed').length === 1 && sameFixedGraph(beforeRefit, refit)
        && JSON.stringify(beforeRefit.counts) === JSON.stringify(refit.counts)
        && includesTarget(refitTargets, scoreGainNames(refit).level, MECHBAY_LEVEL)
        && gainValue(refit, 'rhythm') > gainValue(beforeRefit, 'rhythm'),
      JSON.stringify(refitTargets));

    await advanceAudioClock(page);
    const beforeReturn = activeAudioContext(await audioProbe(page));
    await page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(page);
    await page.waitForSelector('[data-testid="refit-bay"]', { state: 'detached' });
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot().findLast(context => context.state !== 'closed').targets > count, beforeReturn.targets);
    const returned = activeAudioContext(await audioProbe(page));
    const returnTargets = newTargets(beforeReturn, returned);
    check('closing campaign refit restores the map treatment on the same sources',
      sameFixedGraph(refit, returned)
        && includesTarget(returnTargets, scoreGainNames(returned).level, CAMPAIGN_LEVEL)
        && gainValue(returned, 'rhythm') === .16,
      JSON.stringify(returnTargets));

    await page.locator('[data-testid="manifest-cancel"]').click();
    await page.locator('[data-testid="camp-exit"]').click();
    await page.waitForSelector('[data-testid="home-screen"]');
    await advanceAudioClock(page);
    await page.waitForFunction(() => {
      const active = globalThis.__audioProbe.snapshot().findLast(context => context.state !== 'closed');
      return active?.gains.some(gain => Math.abs(gain.value - .8 * .86) < .0001);
    });
    const home = activeAudioContext(await audioProbe(page));
    check('campaign return reuses its strategic sources for the home theme',
      sameFixedGraph(returned, home) && home.state === 'running' && home.closeCalls === 0);
    await page.locator('[data-testid="home-skirmish"]').click();
    await waitForClosed(page, scoreIndex);
    const closed = (await audioProbe(page))[scoreIndex];
    check('leaving strategic screens stops every started source and closes once',
      fixedScoreGraph(closed, false) && closed.closeCalls === 1);
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
    await waitForScoreReady(page);
    const scoreIndex = (await audioProbe(page)).length - 1;
    const bay = activeAudioContext(await audioProbe(page));
    check('standalone mechbay owns one fixed strategic score graph',
      fixedScoreGraph(bay) && Math.abs(gainValue(bay, 'level') - MECHBAY_LEVEL) < .0001
        && gainValue(bay, 'rhythm') > .16,
      JSON.stringify({ counts: bay.counts, topology: bay.topology }));

    await page.locator('[data-testid="bay-mute-button"]').click();
    const muted = activeAudioContext(await audioProbe(page));
    check('standalone mechbay mute shares the persisted master control',
      muted.master === 0 && sameFixedGraph(bay, muted)
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');

    await page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(page);
    await page.waitForSelector('[data-testid="briefing"]');
    await waitForClosed(page, scoreIndex);
    const closed = (await audioProbe(page))[scoreIndex];
    check('leaving standalone mechbay tears down its strategic graph before battle unlock',
      (await audioProbe(page)).filter(context => context.state !== 'closed').length === 0 && fixedScoreGraph(closed, false)
        && closed.closeCalls === 1);
    await page.locator('.viewport canvas:not(.perf-overlay)').click({
      force: true,
      position: { x: 40, y: 40 },
    });
    await waitForScoreReady(page);
    const remountedBattle = activeAudioContext(await audioProbe(page));
    await openDesktopMenu(page);
    const battleMute = page.locator('[data-testid="mute-button"]');
    const returnedLabel = await battleMute.innerText();
    await battleMute.click();
    check('muted standalone bay returns a muted battle whose first toggle audibly restores sound',
      returnedLabel === 'Unmute all' && remountedBattle.master === 0
        && (await battleMute.innerText()) === 'Mute all'
        && activeAudioContext(await audioProbe(page)).master === 0.5
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '0');
    const stereo = await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const ally = world.entities.find((entity) => entity.team === world.playerTeam);
      if (ally === undefined) throw new Error('stereo fixture needs a friendly unit');
      const snapshot = () => globalThis.__audioProbe.snapshot().at(-1);
      const before = snapshot();
      const event = { type: 'shutdown', tick: world.tick, entityId: ally.id, forced: false };
      try {
        engine.audio.setListener({ x: ally.pos.x + 100, y: ally.pos.y }, -Math.PI / 2, 470);
        engine.audio.consume(world, [event]);
        const right = snapshot();
        engine.audio.setListener({ x: ally.pos.x - 100, y: ally.pos.y }, -Math.PI / 2, 470);
        engine.audio.consume(world, [event]);
        const left = snapshot();
        engine.audio.order();
        return { before, right, left, console: snapshot() };
      } finally {
        const camera = engine.renderer.camera;
        engine.audio.setListener(camera.target, camera.azimuth, camera.distance);
      }
    });
    const pannedRight = stereo.right.panners.at(-1);
    const pannedLeft = stereo.left.panners.at(-1);
    check('presented battlefield sources follow camera-relative stereo placement',
      stereo.right.sources.length === stereo.before.sources.length + 1
        && stereo.left.sources.length === stereo.right.sources.length + 1
        && stereo.right.panners.length === stereo.before.panners.length + 1
        && stereo.left.panners.length === stereo.right.panners.length + 1
        && Math.abs(pannedRight.pan - 100 / (470 * 0.55)) < 0.000001
        && Math.abs(pannedLeft.pan + 100 / (470 * 0.55)) < 0.000001,
      JSON.stringify({ right: pannedRight, left: pannedLeft }));
    check('interface feedback stays centred on its separate bus',
      stereo.console.sources.length === stereo.left.sources.length + 1
        && stereo.console.panners.length === stereo.left.panners.length
        && stereo.console.topology.some((node) => node.kind === 'gain'
          && node.id > pannedLeft.id && node.connections.includes('node:5')),
      JSON.stringify({ panners: stereo.console.panners.length, mix: stereo.console.mix }));
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
    await waitForScoreReady(page);
    const scoreIndex = (await audioProbe(page)).length - 1;
    const outfit = activeAudioContext(await audioProbe(page));
    check('battle briefing outfitter reuses the battle score graph',
      fixedScoreGraph(outfit) && Math.abs(gainValue(outfit, 'level') - MECHBAY_LEVEL) < .0001
        && gainValue(outfit, 'rhythm') > .16 && cultureMatches(outfit, 1),
      JSON.stringify({ contexts: (await audioProbe(page)).length, counts: outfit.counts }));

    await advanceAudioClock(page);
    const beforeOppositeBay = activeAudioContext(await audioProbe(page));
    await page.evaluate(() => globalThis.__wreckright.engine.audio.setMechbayScore(0));
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot().findLast(context => context.state !== 'closed').targets > count, beforeOppositeBay.targets);
    const oppositeBay = activeAudioContext(await audioProbe(page));
    check('opposite-culture bay treatment reaches the Linewrought voicing before deployment',
      cultureMatches(oppositeBay, 0));

    const briefingTick = await page.evaluate(() => globalThis.__wreckright.world.tick);
    await advanceAudioClock(page);
    const beforePrimeRestore = activeAudioContext(await audioProbe(page));
    await page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(page);
    await page.waitForSelector('[data-testid="outfit-bay"]', { state: 'detached' });
    await page.waitForFunction((count) =>
      globalThis.__audioProbe.snapshot().findLast(context => context.state !== 'closed').targets > count, beforePrimeRestore.targets);
    const primeRestored = activeAudioContext(await audioProbe(page));
    check('closing an opposite-culture bay restores the primed Aurelian battle voice before a sim step',
      (await page.evaluate(() => globalThis.__wreckright.world.tick)) === briefingTick
        && cultureMatches(primeRestored, 1),
      JSON.stringify(primeRestored.gains));

    await advanceAudioClock(page);
    await page.locator('[data-testid="berth-customise-0"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"] [data-testid="mechbay"]');

    await page.locator('[data-testid="bay-mute-button"]').click();
    const muted = activeAudioContext(await audioProbe(page));
    check('embedded outfitter mute silences the existing battle master',
      muted.master === 0 && sameFixedGraph(outfit, muted)
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');

    await advanceAudioClock(page);
    await page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(page);
    await page.waitForSelector('[data-testid="outfit-bay"]', { state: 'detached' });
    const battle = activeAudioContext(await audioProbe(page));
    await openDesktopMenu(page);
    const battleMute = page.locator('[data-testid="mute-button"]');
    const syncedLabel = await battleMute.innerText();
    await battleMute.click();
    check('embedded outfitter mute synchronises the battle menu and toggles back there',
      syncedLabel === 'Unmute all'
        && (await battleMute.innerText()) === 'Mute all'
        && activeAudioContext(await audioProbe(page)).master === 0.5
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '0');
    await page.locator('[data-testid="desktop-menu-toggle"]').click();
    await page.locator('[data-testid="desktop-menu-sheet"]').waitFor({ state: 'hidden' });
    await advanceAudioClock(page);
    await page.locator('[data-testid="berth-customise-0"]').click();
    await page.waitForSelector('[data-testid="outfit-bay"] [data-testid="mechbay"]');
    const reopened = activeAudioContext(await audioProbe(page));
    check('reopening the battle outfitter allocates no context or score sources',
      (await audioProbe(page)).filter(context => context.state !== 'closed').length === 1 && sameFixedGraph(outfit, battle)
        && sameFixedGraph(battle, reopened)
        && reopened.scoreSources.length === SCORE_SOURCE_COUNT
        && reopened.scoreSources.every((source) => source.starts.length === 1),
      JSON.stringify({ before: outfit.counts, battle: battle.counts, reopened: reopened.counts }));

    await page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(page);
    await page.waitForSelector('[data-testid="briefing"]');
    await openDesktopMenu(page);
    await page.locator('[data-testid="open-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    await completeInitialCampaignSetup(page);
    await waitForScoreReady(page);
    await waitForClosed(page, scoreIndex);
    const separated = await audioProbe(page);
    check('campaign navigation closes the battle graph and opens a separate strategic graph',
      fixedScoreGraph(separated[scoreIndex], false) && fixedScoreGraph(activeAudioContext(separated))
        && separated[scoreIndex].closeCalls === 1 && activeAudioContext(separated).state === 'running');
    const strategic = activeAudioContext(separated);
    await page.locator('[data-testid="camp-exit"]').click();
    await page.waitForSelector('[data-testid="home-screen"]');
    check('campaign return keeps the home theme on its strategic context',
      sameFixedGraph(strategic, activeAudioContext(await audioProbe(page))));
    check('battle outfitter fixture reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

export async function runAdaptiveScoreTreatmentChecks({ browser, url, check }) {
  process.stdout.write('\nadaptive score treatments\n');
  await runAuthoredScoreLiveChecks({ browser, url, check });
  await runAuthoredScoreLoadingChecks({ browser, url, check });
  await checkCampaignAndNestedRefit({ browser, url, check });
  await checkStandaloneMechbay({ browser, url, check });
  await checkBattleOutfitterReuse({ browser, url, check });
}
