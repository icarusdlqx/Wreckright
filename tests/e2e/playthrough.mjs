import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { openTactics, runDesktopSupportChecks } from './battle-hud.mjs';
import {
  checkBriefingInputSafety,
  checkDeployedInputSafety,
  closeDesktopBattleMenu,
  clearControlFocus,
  openDesktopBattleMenu,
} from './input-safety.mjs';
import { checkIncomingFireDirection } from './incoming-fire-direction.mjs';
import { runFireModeStage2Checks } from './fire-modes.mjs';
import { runNightOperationsChecks } from './night-operations.mjs';
import { runCultureSilhouetteChecks } from './culture-silhouettes.mjs';
import { runTerrainWearChecks } from './terrain-wear.mjs';
import { runAdaptiveScoreChecks } from './adaptive-score.mjs';
import { runAdaptiveScoreTreatmentChecks } from './adaptive-score-treatments.mjs';
import { runLastSilentMomentsChecks } from './last-silent-moments.mjs';
import { runCommanderViewChecks } from './commander-view.mjs';
import { runMinimapControlChecks } from './minimap-control.mjs';
import { runReadableRouteChecks } from './readable-routes.mjs';
import { runCampaignRecovery } from './campaign-recovery.mjs';
import { runMobilePlaythrough } from './mobile-playthrough.mjs';
import { runRangeDamageChartChecks } from './range-damage-chart.mjs';
import {
  runCampaignRefitMechbayJourney,
  runSkirmishMechbayJourney,
} from './mechbay-workspace.mjs';
import { engageTrainingOpticalContact } from './training-flow.mjs';

const PORT = Number(process.env.E2E_PORT ?? 5183);
const URL = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOT_DIR ?? './reports/e2e';

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    process.stdout.write(`  ✓ ${name}\n`);
    return true;
  }
  failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
  process.stdout.write(`  ✗ ${name}${detail === '' ? '' : ` — ${detail}`}\n`);
  return false;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not up yet
    }
    await sleep(250);
  }
  throw new Error(`dev server did not start at ${url}`);
}

const state = (page) => page.evaluate(() => globalThis.__wreckright.useGame.getState());
const sim = (page) =>
  page.evaluate(() => {
    const { world } = globalThis.__wreckright;
    return {
      tick: world.tick,
      finished: world.finished,
      winner: world.winner,
      entities: world.entities.map((entity) => ({
        id: entity.id,
        team: entity.team,
        autopilot: entity.autopilot,
        pos: { x: entity.pos.x, y: entity.pos.y },
        motion: entity.motion,
        heat: entity.heat,
        targetId: entity.targetId,
        pathLength: entity.path.length,
        hasMoveOrder: entity.orders.move !== null,
        attackTarget: entity.orders.attack?.targetId ?? null,
        calledShot: entity.orders.attack?.calledShot ?? null,
        groupEnabled: [...entity.groupEnabled],
        destroyed: entity.destroyed,
      })),
      visibleEnemies: world.vision === null ? null : [...world.vision.visible],
    };
  });

async function arrowCameraShift(page, key) {
  const before = await page.evaluate(() => {
    const { engine, world } = globalThis.__wreckright;
    const { camera, viewport } = engine.renderer;
    camera.centreOn({
      x: (world.terrain.width * world.terrain.tileSize) / 2,
      y: (world.terrain.height * world.terrain.tileSize) / 2,
    });
    camera.update(viewport);
    return { ...camera.target };
  });

  await clearControlFocus(page);
  await page.keyboard.down(key);
  await sleep(220);
  await page.keyboard.up(key);

  return page.evaluate((previousTarget) => {
    const { camera, viewport } = globalThis.__wreckright.engine.renderer;
    camera.update(viewport);
    const previousOnScreen = camera.worldToScreen(previousTarget, viewport);
    return {
      x: previousOnScreen.x - viewport.width / 2,
      y: previousOnScreen.y - viewport.height / 2,
    };
  }, before);
}

async function freshHomePage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.clear());
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  return { context, page };
}

async function forceTrainingResult(page, status) {
  await page.evaluate((nextStatus) => {
    const { useGame, world } = globalThis.__wreckright;
    const winner = nextStatus === 'success' ? useGame.getState().playerTeam : 1;
    world.finished = true;
    world.winner = winner;
    world.missionStatus = nextStatus;
    world.missionReason = nextStatus === 'success' ? 'range certified' : 'range failed';
    useGame.getState().patch({
      finished: true,
      winner,
      missionStatus: nextStatus,
      missionReason: world.missionReason,
    });
  }, status);
  await page.waitForSelector('[data-testid="training-result-actions"]');
}

async function verifyAlternateTrainingRoutes(browser, url) {
  const skipped = await freshHomePage(browser, url);
  try {
    await skipped.page.locator('[data-testid="home-learn"]').click();
    await skipped.page.waitForSelector('[data-testid="briefing"]');
    await skipped.page.locator('[data-testid="training-skip"]').click();
    await skipped.page.waitForSelector('[data-testid="campaign"]');
    check(
      'training briefing skip opens the campaign explicitly',
      (await skipped.page.locator('[data-testid="home-screen"]').count()) === 0 &&
        (await skipped.page.evaluate(() =>
          JSON.parse(localStorage.getItem('ironline.training') ?? '{}').status,
        )) === 'skipped',
    );
  } finally {
    await skipped.context.close();
  }

  const failed = await freshHomePage(browser, url);
  try {
    await failed.page.locator('[data-testid="home-learn"]').click();
    await failed.page.waitForSelector('[data-testid="briefing"]');
    await failed.page.locator('[data-testid="briefing-deploy"]').click();
    await failed.page.waitForSelector('[data-testid="training-coach"]');
    await forceTrainingResult(failed.page, 'failure');
    check(
      'failed training offers retry first and a campaign exit',
      (await failed.page.locator('[data-testid="training-retry"]').count()) === 1 &&
        (await failed.page.locator('[data-testid="training-continue-anyway"]').count()) === 1 &&
        (await failed.page.locator('[data-testid="new-field"]').count()) === 0,
    );
    await failed.page.locator('[data-testid="training-continue-anyway"]').click();
    await failed.page.waitForSelector('[data-testid="campaign"]');
    check(
      'continue anyway records the training exit',
      (await failed.page.evaluate(() =>
        JSON.parse(localStorage.getItem('ironline.training') ?? '{}').status,
      )) === 'skipped',
    );
  } finally {
    await failed.context.close();
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  // detached puts npx and vite in their own process group, so shutdown can
  // kill the group: signalling npx alone orphans vite, which keeps the stdio
  // pipes open and the finished script waiting forever to exit.
  // Worktrees share the dependency install during validation. Force Vite to
  // rebuild its root-specific dep graph so a prior worktree cannot leave React
  // optimized against a different source root.
  const server = spawn('npx', ['vite', '--force', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  // The sandbox image ships its own Chromium; Playwright's pinned revision is not present.
  const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({
    executablePath: existsSync(executablePath) ? executablePath : undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });

  try {
    await waitForServer(URL);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });

    await page.addInitScript(() => {
      if (sessionStorage.getItem('wreckright.e2e.initialised') !== null) return;
      localStorage.clear();
      sessionStorage.setItem('wreckright.e2e.initialised', 'true');
    });
    await page.goto(URL);
    await page.waitForSelector('[data-testid="home-screen"]');
    check(
      'a fresh profile opens on Home without mounting the engine',
      (await page.locator('.viewport canvas').count()) === 0 &&
        (await page.evaluate(() => globalThis.__wreckright === undefined)),
    );
    check(
      'Home offers learn, campaign, and skirmish routes',
      (await page.locator('[data-testid="home-learn"]').count()) === 1 &&
        (await page.locator('[data-testid="home-campaign"]').count()) === 1 &&
        (await page.locator('[data-testid="home-skirmish"]').count()) === 1 &&
        (await page.locator('#home-title').innerText()) === 'WRECKRIGHT' &&
        (await page.locator('.home-kicker').textContent()) === 'No new machines. Only new owners.' &&
        (await page.locator('[data-testid="home-learn"] strong').textContent()) === 'Learn Command',
    );
    await page.locator('[data-testid="home-learn"]').click();
    await page.waitForFunction(() => globalThis.__wreckright !== undefined, { timeout: 30_000 });
    await page.waitForSelector('[data-testid="briefing"]');
    check(
      'Learn Command opens the authored training field',
      (await page.evaluate(() => globalThis.__wreckright.world.mission.id)) === 'training_ground' &&
        (await page.evaluate(() =>
          globalThis.__wreckright.world.entities.filter((entity) => entity.team === 0).length,
        )) === 2,
    );
    const trainingBriefingText = await page.locator('[data-testid="briefing"]').innerText();
    check(
      'training briefing is fixed and omits skirmish setup',
      trainingBriefingText.includes('Begin range walk') &&
        trainingBriefingText.includes('Skip to campaign') &&
        (await page.locator('[data-testid="mission-picker"]').count()) === 0 &&
        (await page.locator('[data-testid="briefing-battle-code"]').count()) === 0 &&
        (await page.locator('[data-testid="briefing-lance"]').count()) === 0 &&
        !trainingBriefingText.includes('Resource Points'),
    );
    await page.screenshot({ path: `${SHOTS}/00-training-briefing.png` });
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForSelector('[data-testid="training-coach"]');
    await page.waitForSelector('[data-testid="lance-bar"]');
    const trainingPausedAt = (await sim(page)).tick;
    await sleep(500);
    check(
      'range walk deploys paused',
      (await state(page)).paused && (await sim(page)).tick === trainingPausedAt,
    );
    check(
      'selection lesson starts with only lance and camera affordances',
      (await page.locator('[data-testid="training-coach"]').innerText()).includes('1 · Select') &&
        (await page.locator('[data-testid="command-palette"]').count()) === 0 &&
        (await page.locator('[data-testid="hostile-bar"]').count()) === 0,
    );

    await page.locator('[data-testid="lance-bar"] button').first().click();
    await page.waitForSelector('[data-testid="command-move"]');
    check(
      'move lesson exposes Move but not combat orders',
      (await page.locator('[data-testid="command-attack"]').count()) === 0 &&
        (await page.locator('[data-testid="command-hold_fire"]').count()) === 0,
    );
    await engageTrainingOpticalContact({ page, check });
    check(
      'heat lesson adds the heat readout and safety controls',
      (await page.locator('[data-testid="command-hold_fire"]').count()) === 1 &&
        (await page.locator('[data-testid="command-heat_safety"]').count()) === 1 &&
        (await page.locator('[data-testid="command-run"]').count()) === 0,
    );
    await page.evaluate(() => {
      const { useGame } = globalThis.__wreckright;
      const current = useGame.getState();
      const selected = new Set(current.selection);
      current.patch({
        units: current.units.map((unit) =>
          selected.has(unit.id) ? { ...unit, heat: Math.max(1, unit.heat) } : unit,
        ),
      });
    });
    await page.waitForSelector('[data-testid="tactics-toggle"]');
    check(
      'range drill keeps advanced orders behind Tactics',
      !(await page.locator('[data-testid="command-run"]').isVisible()),
    );
    await openTactics(page);
    await page.waitForSelector('[data-testid="command-run"]');
    check(
      'range drill restores the complete battle interface',
      (await page.locator('[data-testid="minimap"]').count()) === 1 &&
        (await page.locator('[data-testid="sidebar"]').count()) === 1 &&
        (await page.locator('[data-testid="objective-list"]').count()) === 1 &&
        (await page.locator('[data-testid="resource-points"]').count()) === 1 &&
        (await page.locator('[data-testid="speed-controls"]').count()) === 1,
    );
    await page.screenshot({ path: `${SHOTS}/00-training-coach.png` });
    await forceTrainingResult(page, 'success');
    check(
      'successful training offers campaign first and range replay second',
      (await page.locator('[data-testid="training-start-campaign"]').count()) === 1 &&
        (await page.locator('[data-testid="training-replay"]').count()) === 1 &&
        (await page.locator('[data-testid="result-mission-picker"]').count()) === 0,
    );
    await page.locator('[data-testid="training-start-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    check(
      'successful training reaches first-contract guidance',
      (await page.locator('[data-testid="campaign-guide"]').innerText()).includes(
        '1 · Choose the job',
      ),
    );
    await page.locator('[data-testid="camp-exit"]').click();
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForFunction(
      () => globalThis.__wreckright?.world.mission.id === 'skirmish_ridge',
      { timeout: 30_000 },
    );
    await verifyAlternateTrainingRoutes(browser, URL);

    process.stdout.write('\nboot\n');
    const canvas = await page.locator('.viewport canvas:not(.perf-overlay)').boundingBox();
    check('canvas is mounted at full size', (canvas?.width ?? 0) > 1000 && (canvas?.height ?? 0) > 700);
    check('no page errors during boot', pageErrors.length === 0, pageErrors.join(' | '));

    const boot = await sim(page);
    check('eight mechs deployed', boot.entities.length === 8, `got ${boot.entities.length}`);
    check(
      'player lance is under player control',
      boot.entities.filter((entity) => entity.team === 0).every((entity) => !entity.autopilot),
    );
    check(
      'opposing lance is on autopilot',
      boot.entities.filter((entity) => entity.team === 1).every((entity) => entity.autopilot),
    );

    process.stdout.write('\nbriefing\n');
    await page.waitForSelector('[data-testid="briefing"]');
    check('the mission opens on a briefing', (await page.locator('[data-testid="briefing"]').count()) === 1);
    check(
      'the briefing lists the objectives',
      (await page.locator('[data-testid="briefing"] li').count()) >= 2,
    );
    const beforeBriefing = (await sim(page)).tick;
    await sleep(600);
    check('the sim is held while briefing', (await sim(page)).tick === beforeBriefing);
    await page.screenshot({ path: `${SHOTS}/01-boot.png` });

    await checkBriefingInputSafety({
      page,
      check,
      sim,
      state,
      beforeBriefing,
      shots: SHOTS,
    });

    const battleCode = page.locator('[data-testid="briefing-battle-code"]');
    await battleCode.fill('x');
    check(
      'an invalid Battle code blocks deployment',
      await page.locator('[data-testid="briefing-deploy"]').isDisabled(),
    );
    await battleCode.fill('Ridge Touch 0000002A');
    await page.locator('[data-testid="briefing-deploy"]').click();
    await sleep(1200);
    const running = await sim(page);
    check('deploying starts the clock', running.tick > beforeBriefing, `${beforeBriefing} → ${running.tick}`);
    check(
      'typing then tapping deploy locks the normalized Battle code',
      (await page.evaluate(() => globalThis.__wreckright.useGame.getState().battleCode)) ===
        'ridge-touch-0000002a',
    );
    await checkDeployedInputSafety({ page, check, state });

    const pausedBeforeFeedback = (await state(page)).paused;
    await openDesktopBattleMenu(page);
    await page.locator('[data-testid="feedback-link"]').click();
    await page.waitForSelector('[data-testid="playtest-feedback"]');
    check(
      'Feedback opens from a pointer click',
      (await page.locator('[data-testid="playtest-feedback"]').count()) === 1 &&
        (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) ===
          'playtest-close',
    );
    await page.locator('[data-testid="playtest-enable"]').click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-testid') === 'playtest-close',
    );
    await page.keyboard.press('Space');
    await page.waitForSelector('[data-testid="playtest-feedback"]', { state: 'detached' });
    check(
      'Space after enabling feedback closes the dialog without toggling battle',
      (await state(page)).paused === pausedBeforeFeedback,
    );
    await closeDesktopBattleMenu(page);

    process.stdout.write('\nselection\n');
    await page.locator('[data-testid="lance-bar"] button').first().click();
    check('lance card selects a mech', (await state(page)).selection.length === 1);
    await page.waitForSelector('[data-testid="paper-doll"]');
    check('paper doll renders eight locations', (await page.locator('.doll-cell').count()) === 8);
    check('heat bar renders', (await page.locator('[data-testid="heat-bar"]').count()) === 1);
    check(
      'weapon groups render with cooldown rings',
      (await page.locator('.cooldown-ring').count()) > 0,
    );
    await page.locator('[data-testid="tactical-details"] summary').click();
    check(
      'tactical readouts expose ability, stability, alpha heat and governor state',
        (await page.locator('[data-testid="tactical-readout"]').count()) === 1 &&
        (await page.locator('[data-testid="stability-readout"]').innerText()).includes('/') &&
        (await page.locator('[data-testid="alpha-readout"]').innerText()).includes('%') &&
        (await page.locator('[data-testid="governor-readout"]').count()) === 1,
    );
    check(
      'the default command row exposes only primary orders',
      (await page.locator('[data-testid="command-move"]').isVisible()) &&
        (await page.locator('[data-testid="command-attack"]').isVisible()) &&
        (await page.locator('[data-testid="tactics-toggle"]').isVisible()) &&
        !(await page.locator('[data-testid="command-hold_fire"]').isVisible()),
    );
    await openTactics(page);
    check(
      'ability and alpha commands show live readiness',
      (await page.locator('[data-testid="command-ability"]').innerText()).includes('READY') &&
        (await page.locator('[data-testid="command-alpha_strike"]').innerText()).includes('READY'),
    );
    check(
      'Tactics discloses formation and advanced orders',
      (await page.locator('[data-testid="command-alpha_strike"]').innerText()).includes('READY') &&
        (await page.locator('[data-testid="command-hold_fire"]').isVisible()) &&
        (await page.locator('.tactics-formation').isVisible()),
    );
    await page.screenshot({ path: `${SHOTS}/02-selected.png` });

    process.stdout.write('\npause\n');
    await clearControlFocus(page);
    await page.keyboard.press('Space');
    await page.waitForSelector('[data-testid="paused-banner"]');
    const pausedTick = (await sim(page)).tick;
    await sleep(900);
    const stillPaused = await sim(page);
    check('pause freezes the simulation', stillPaused.tick === pausedTick, `${pausedTick} → ${stillPaused.tick}`);
    check('pause banner is shown', (await page.locator('[data-testid="paused-banner"]').count()) === 1);

    process.stdout.write('\nincoming fire direction\n');
    await checkIncomingFireDirection({ page, check, shots: SHOTS });

    process.stdout.write('\norders while paused\n');
    const selectedId = (await state(page)).selection[0];
    const box = await page.locator('.viewport canvas:not(.perf-overlay)').boundingBox();
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.32, { button: 'right' });

    const afterOrder = await sim(page);
    const ordered = afterOrder.entities.find((entity) => entity.id === selectedId);
    check('right-click issues a move order while paused', ordered?.hasMoveOrder === true);
    check('a path was planned', (ordered?.pathLength ?? 0) > 0, `path length ${ordered?.pathLength}`);
    check(
      'simulation is still frozen after issuing orders',
      (await sim(page)).tick === pausedTick,
    );
    await page.screenshot({ path: `${SHOTS}/03-paused-order.png` });

    // A click on a mech that wobbles a few pixels — a human hand, or a stalled
    // frame delivering a burst of pointer moves — must still be a click. It
    // once became an empty box-select that cleared the selection, after which
    // the destination order that followed did nothing at all, silently.
    const wobbleTarget = await page.evaluate(() => {
      const { engine, world, useGame } = globalThis.__wreckright;
      const s = useGame.getState();
      s.setSelection([]);
      const mine = world.entities.filter((e) => e.team === s.playerTeam);
      const body = engine.renderer.screenBodyOf(mine[0]);
      const bounds = document
        .querySelector('.viewport canvas:not(.perf-overlay)')
        .getBoundingClientRect();
      return { id: mine[0].id, x: bounds.left + body.x, y: bounds.top + body.y };
    });
    await page.mouse.move(wobbleTarget.x, wobbleTarget.y);
    await page.mouse.down();
    await page.mouse.move(wobbleTarget.x + 9, wobbleTarget.y + 6);
    await page.mouse.up();
    const afterWobble = await state(page);
    check(
      'a wobbly click still selects the mech',
      afterWobble.selection.includes(wobbleTarget.id),
      JSON.stringify(afterWobble.selection),
    );

    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45, { button: 'right' });
    const afterWobbleOrder = await sim(page);
    const wobbleOrdered = afterWobbleOrder.entities.find((e) => e.id === wobbleTarget.id);
    check(
      'the destination order after a wobbly click lands with a route',
      wobbleOrdered?.hasMoveOrder === true && (wobbleOrdered?.pathLength ?? 0) > 0,
      `move ${wobbleOrdered?.hasMoveOrder}, path ${wobbleOrdered?.pathLength}`,
    );

    process.stdout.write('\nresume and move\n');
    await page.keyboard.press('Space');
    await sleep(1500);
    const moved = await sim(page);
    const mover = moved.entities.find((entity) => entity.id === selectedId);
    const start = afterOrder.entities.find((entity) => entity.id === selectedId);
    const travelled = Math.hypot(mover.pos.x - start.pos.x, mover.pos.y - start.pos.y);
    check('the ordered mech actually moves', travelled > 5, `travelled ${travelled.toFixed(1)}m`);
    check('resuming restarts the clock', moved.tick > pausedTick);

    process.stdout.write('\nformation move\n');
    await page.keyboard.press('Space');
    const formation = await page.evaluate(() => {
      const { engine, world, useGame } = globalThis.__wreckright;
      const ids = world.entities.filter((entity) => entity.team === 0 && !entity.destroyed).map((entity) => entity.id);
      const centre = ids.reduce((sum, id) => {
        const entity = world.entities.find((candidate) => candidate.id === id);
        return { x: sum.x + entity.pos.x / ids.length, y: sum.y + entity.pos.y / ids.length };
      }, { x: 0, y: 0 });
      let destination = { x: 500, y: 500 };
      let best = Number.POSITIVE_INFINITY;
      for (let row = 3; row < world.terrain.height - 3; row += 1) {
        for (let column = 3; column < world.terrain.width - 3; column += 1) {
          let open = true;
          for (let y = -3; y <= 3 && open; y += 1) {
            for (let x = -3; x <= 3; x += 1) {
              if (!world.terrain.passable(column + x, row + y)) open = false;
            }
          }
          if (!open) continue;
          const candidate = world.terrain.tileCentre(column, row);
          const range = Math.hypot(candidate.x - centre.x, candidate.y - centre.y);
          const score = Math.abs(range - 120);
          if (score < best) {
            best = score;
            destination = candidate;
          }
        }
      }
      useGame.getState().setSelection(ids);
      engine.orderMove(destination, false);
      return ids.map((id) => world.entities.find((entity) => entity.id === id)?.orders.move?.to);
    });
    check(
      'a group move gives every mech a distinct destination',
      new Set(formation.map((point) => `${point?.x.toFixed(1)}:${point?.y.toFixed(1)}`)).size === formation.length,
      JSON.stringify(formation),
    );
    await page.screenshot({ path: `${SHOTS}/03-formation-order.png` });
    await page.evaluate((id) => globalThis.__wreckright.useGame.getState().setSelection([id]), selectedId);
    await page.keyboard.press('Space');

    process.stdout.write('\nweapon groups and hold fire\n');
    await page.locator('[data-testid="group-2"]').click();
    const toggled = await sim(page);
    check(
      'clicking a group toggles it off',
      toggled.entities.find((entity) => entity.id === selectedId).groupEnabled[1] === false,
    );
    await page.locator('[data-testid="command-hold_fire"]').click();
    const holding = await sim(page);
    check(
      'hold fire disables every group',
      holding.entities
        .find((entity) => entity.id === selectedId)
        .groupEnabled.every((enabled) => !enabled),
    );
    await page.locator('[data-testid="command-hold_fire"]').click();

    process.stdout.write('\ncalled shot\n');
    await page.locator('[data-testid="doll-left_leg"]').click();
    check('called shot mode arms from the paper doll', (await state(page)).orderMode === 'called_shot');
    check('called shot location is recorded', (await state(page)).calledShotLocation === 'left_leg');

    process.stdout.write('\ncamera\n');
    const zoomPointer = { x: box.width * 0.72, y: box.height * 0.46 };
    const before = await page.evaluate((screen) => {
      const { renderer } = globalThis.__wreckright.engine;
      return {
        target: { ...renderer.camera.target },
        distance: renderer.camera.distance,
        anchor: renderer.camera.screenToWorld(
          screen,
          renderer.viewport,
          renderer.groundMesh,
        ),
      };
    }, zoomPointer);
    await page.mouse.move(box.x + zoomPointer.x, box.y + zoomPointer.y);
    await page.mouse.wheel(0, -600);
    const afterZoom = await page.evaluate((screen) => {
      const { renderer } = globalThis.__wreckright.engine;
      return {
        target: { ...renderer.camera.target },
        distance: renderer.camera.distance,
        anchor: renderer.camera.screenToWorld(
          screen,
          renderer.viewport,
          renderer.groundMesh,
        ),
      };
    }, zoomPointer);
    // Zooming in pulls the eye closer: wheel-up shrinks the camera distance.
    check(
      'wheel zooms the camera',
      afterZoom.distance < before.distance,
      `${before.distance} → ${afterZoom.distance}`,
    );
    check(
      'wheel zoom keeps the ground under the pointer',
      Math.hypot(
        afterZoom.anchor.x - before.anchor.x,
        afterZoom.anchor.y - before.anchor.y,
      ) < 1,
    );
    const arrowShifts = {
      ArrowLeft: await arrowCameraShift(page, 'ArrowLeft'),
      ArrowRight: await arrowCameraShift(page, 'ArrowRight'),
      ArrowUp: await arrowCameraShift(page, 'ArrowUp'),
      ArrowDown: await arrowCameraShift(page, 'ArrowDown'),
    };
    check(
      'left arrow moves the view left',
      arrowShifts.ArrowLeft.x > 5 && Math.abs(arrowShifts.ArrowLeft.y) < 1,
      JSON.stringify(arrowShifts.ArrowLeft),
    );
    check(
      'right arrow moves the view right',
      arrowShifts.ArrowRight.x < -5 && Math.abs(arrowShifts.ArrowRight.y) < 1,
      JSON.stringify(arrowShifts.ArrowRight),
    );
    check(
      'up arrow moves the view up',
      arrowShifts.ArrowUp.y > 5 && Math.abs(arrowShifts.ArrowUp.x) < 1,
      JSON.stringify(arrowShifts.ArrowUp),
    );
    check(
      'down arrow moves the view down',
      arrowShifts.ArrowDown.y < -5 && Math.abs(arrowShifts.ArrowDown.x) < 1,
      JSON.stringify(arrowShifts.ArrowDown),
    );

    const centreError = async () =>
      page.evaluate(() => {
        const { engine, useGame, world } = globalThis.__wreckright;
        const selected = new Set(useGame.getState().selection);
        const units = world.entities.filter((entity) => selected.has(entity.id));
        const sum = units.reduce(
          (point, entity) => ({ x: point.x + entity.pos.x, y: point.y + entity.pos.y }),
          { x: 0, y: 0 },
        );
        const expected = { x: sum.x / units.length, y: sum.y / units.length };
        return {
          error: Math.hypot(
            engine.renderer.camera.target.x - expected.x,
            engine.renderer.camera.target.y - expected.y,
          ),
          tolerance: world.terrain.tileSize * 4,
        };
      });
    await page.locator('[data-testid="centre-selection"]').click();
    const buttonCentre = await centreError();
    check('centre button finds the selection', buttonCentre.error < buttonCentre.tolerance);

    process.stdout.write('\nfog of war\n');
    const fog = await sim(page);
    check(
      'fog hides at least some of the opposing lance at range',
      fog.visibleEnemies !== null && fog.visibleEnemies.length < 4,
      `${fog.visibleEnemies?.length ?? '?'} of 4 enemies visible`,
    );

    process.stdout.write('\nrun the battle to a conclusion\n');
    await openDesktopBattleMenu(page);
    await page.locator('[data-testid="feedback-link"]').focus();
    const outcome = await page.evaluate(async () => {
      const { engine } = globalThis.__wreckright;
      const deadline = Date.now() + 25_000;
      while (!engine.world.finished && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let step = 0; step < 400 && !engine.world.finished; step += 1) {
          engine.forceStep();
        }
      }
      return { finished: engine.world.finished, winner: engine.world.winner, tick: engine.world.tick };
    });

    check('battle reaches a conclusion', outcome.finished === true, JSON.stringify(outcome));
    await page.waitForSelector('[data-testid="outcome"]', { timeout: 5000 }).catch(() => {});
    check('battle debrief is shown', (await page.locator('.battle-results').count()) === 1);
    await page.waitForFunction(() => document.activeElement?.classList.contains('battle-results'));
    check(
      'battle debrief receives focus without skipping its report',
      await page.evaluate(() => document.activeElement?.classList.contains('battle-results')),
    );
    const debriefInputBefore = await page.evaluate(() => {
      const { engine, useGame } = globalThis.__wreckright;
      return {
        paused: useGame.getState().paused,
        orderMode: useGame.getState().orderMode,
        camera: { ...engine.renderer.camera.target },
      };
    });
    await page.keyboard.press('Space');
    await page.keyboard.down('ArrowRight');
    await sleep(120);
    await page.keyboard.up('ArrowRight');
    const debriefInputAfter = await page.evaluate(() => {
      const { engine, useGame } = globalThis.__wreckright;
      return {
        paused: useGame.getState().paused,
        orderMode: useGame.getState().orderMode,
        camera: { ...engine.renderer.camera.target },
      };
    });
    check(
      'battle controls stay suspended behind the debrief',
      JSON.stringify(debriefInputAfter) === JSON.stringify(debriefInputBefore),
    );
    await page.keyboard.press('Tab');
    check(
      'battle debrief tabs into its first action',
      (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) ===
        'replay-mission',
    );
    await page.locator('[data-testid="choose-mission"]').focus();
    await page.keyboard.press('Tab');
    check(
      'battle debrief traps forward focus',
      (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) ===
        'replay-mission',
    );
    await page.keyboard.press('Shift+Tab');
    check(
      'battle debrief traps reverse focus',
      (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) ===
        'choose-mission',
    );
    check(
      'the debrief reports battle and lance statistics',
      (await page.locator('.battle-results-summary > div').count()) === 4 &&
        (await page.locator('.battle-results-row').count()) === 5,
    );
    check(
      'skirmish debrief offers replay or another briefing',
      (await page.locator('[data-testid="replay-mission"]').count()) === 1 &&
        (await page.locator('[data-testid="choose-mission"]').count()) === 1,
    );
    check('battle log recorded destructions', (await page.locator('[data-testid="event-log"] li').count()) > 0);
    await page.screenshot({ path: `${SHOTS}/04-outcome.png` });
    await page.evaluate(() => localStorage.clear());

    process.stdout.write('\nobjectives and support\n');
    await page.locator('[data-testid="result-mission-picker"]').selectOption('base_capture_ridge');
    await page.locator('[data-testid="choose-mission"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    check(
      'closing the battle debrief returns focus',
      (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) ===
        'feedback-link',
    );
    check(
      'switching mission shows its briefing',
      (await page.locator('[data-testid="briefing"] h2').innerText()).includes('Base Capture'),
    );
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForSelector('[data-testid="objective-list"]');

    const mission = await page.evaluate(() => {
      const { world } = globalThis.__wreckright;
      return {
        id: world.mission.id,
        zones: world.zones.length,
        objectives: world.objectives.length,
        triggers: world.triggers.length,
        rp: world.resources.get(0),
        reserves: world.reserves.length,
        reserveCost: world.rules.support.reinforcement.cost,
        airCost: world.rules.support.air_strike.cost,
        airDelay: world.rules.support.air_strike.delaySeconds,
        airShots: world.rules.support.air_strike.shots,
        truckCost: world.rules.support.repair_truck.cost,
        truckDelay: world.rules.support.repair_truck.delaySeconds,
        sensorCost: world.rules.support.sensor_probe.cost,
        sensorAccuracyPercent: Math.round(
          world.rules.support.sensor_probe.indirectAccuracyFactor * 100,
        ),
      };
    });
    check('the base capture mission is loaded', mission.id === 'base_capture_ridge', mission.id);
    check(
      'deployed setup is locked until the run is left explicitly',
      (await page.locator('[data-testid="setup-locked"]').count()) === 1 &&
        (await page.locator('[data-testid="mission-picker"]').isDisabled()) &&
        (await page.locator('[data-testid="difficulty-picker"]').isDisabled()),
    );
    await page.evaluate(() => {
      globalThis.__setupEngine = globalThis.__wreckright.engine;
    });
    await openDesktopBattleMenu(page);
    await page.locator('[data-testid="restart-battle"]').click();
    await page.waitForFunction(
      () =>
        globalThis.__wreckright.engine !== globalThis.__setupEngine &&
        globalThis.__wreckright.engine.world.mission.id === 'base_capture_ridge',
    );
    await page.waitForFunction(() => {
      const state = globalThis.__wreckright.useGame.getState();
      return state.objectives.length >= 3 && state.zones.length === 2;
    });
    const restarted = await page.evaluate(() => {
      delete globalThis.__setupEngine;
      const state = globalThis.__wreckright.useGame.getState();
      return { briefingSeen: state.briefingSeen, paused: state.paused };
    });
    check(
      'restart redeploys the same setup immediately',
      restarted.briefingSeen && !restarted.paused,
    );
    check('it has two comm posts and three objectives', mission.zones === 2 && mission.objectives === 3);
    check('the objective tracker is on screen', (await page.locator('[data-testid="objective-list"] li').count()) >= 3);
    check('the zone tracker lists both posts', (await page.locator('[data-testid="zone-list"] li').count()) === 2);
    check('resource points are shown', (await page.locator('[data-testid="resource-points"]').innerText()).includes('RP'));
    await runMinimapControlChecks({ page, check, shots: SHOTS });
    await runCommanderViewChecks({ page, check, shots: SHOTS });
    await runReadableRouteChecks({ page, check, shots: SHOTS });
    await runDesktopSupportChecks({ page, check, state, mission, shots: SHOTS });

    const triggered = await page.evaluate(async () => {
      const { engine } = globalThis.__wreckright;
      const world = engine.world;
      const zone = world.zones.find((z) => z.id === 'south_post');
      const relief = world.triggers.find((trigger) => trigger.id === 'relief_lance');
      const authoredEnemies = world.mission.lances
        .filter((lance) => lance.team === 1)
        .reduce((count, lance) => count + lance.units.length, 0);
      for (const entity of world.entities) {
        if (entity.team === 0) entity.pos = { x: zone.x, y: zone.y };
        else entity.pos = { x: 30, y: 30 };
      }
      const enemiesBefore = world.entities.filter((e) => e.team === 1).length;
      for (let step = 0; step < 400 && !world.finished; step += 1) engine.forceStep();
      return {
        owner: world.zones.find((z) => z.id === 'south_post').owner,
        authoredEnemies,
        enemiesBefore,
        enemiesAfter: world.entities.filter((e) => e.team === 1).length,
        reliefFired: relief?.fired ?? 0,
        spawnLog: globalThis.__wreckright.useGame.getState().log.join(' | '),
      };
    });
    check('holding a comm post captures it', triggered.owner === 0);
    check(
      'capturing the south post calls in the relief lance',
      triggered.reliefFired === 1 &&
        triggered.enemiesAfter === triggered.authoredEnemies + 2,
      `${triggered.enemiesBefore} → ${triggered.enemiesAfter}; fired ${triggered.reliefFired}`,
    );
    // The engine drains world.events into the renderer each step, so the visible
    // battle log is the durable record of what the trigger announced.
    check(
      'the relief lance was announced to the player',
      /relief lance/i.test(triggered.spawnLog),
      triggered.spawnLog.slice(0, 120),
    );
    await page.screenshot({ path: `${SHOTS}/10-objectives.png` });

    await runSkirmishMechbayJourney({ page, check, shots: SHOTS });

    process.stdout.write('\nlarge battlefield navigation\n');
    await page.locator('[data-testid="briefing-mission-picker"]').selectOption('exchange_register');
    check(
      'Cutbank is available from the visible mission picker',
      (await page.locator('[data-testid="briefing"] h2').innerText()).includes('Cutbank Registry'),
    );
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForFunction(
      () => globalThis.__wreckright.world.mission.id === 'exchange_register',
    );
    const largeField = await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const width = world.terrain.width * world.terrain.tileSize;
      const height = world.terrain.height * world.terrain.tileSize;
      engine.renderer.camera.panBy(-100_000, -100_000);
      const first = { ...engine.renderer.camera.target };
      engine.renderer.camera.panBy(200_000, 200_000);
      const second = { ...engine.renderer.camera.target };
      return {
        cells: world.terrain.width * world.terrain.height,
        width,
        height,
        first,
        second,
      };
    });
    check(
      'Cutbank loads the complete 56 by 56 field',
      largeField.cells === 3136 && largeField.width === 1344 && largeField.height === 1344,
      JSON.stringify(largeField),
    );
    check(
      'large-map panning clamps without exposing an unbounded void',
      largeField.first.x > 0 &&
        largeField.first.y > 0 &&
        largeField.second.x < largeField.width &&
        largeField.second.y < largeField.height,
      JSON.stringify(largeField),
    );
    const largeArrowShifts = {
      ArrowLeft: await arrowCameraShift(page, 'ArrowLeft'),
      ArrowRight: await arrowCameraShift(page, 'ArrowRight'),
      ArrowUp: await arrowCameraShift(page, 'ArrowUp'),
      ArrowDown: await arrowCameraShift(page, 'ArrowDown'),
    };
    check(
      'large-map arrows preserve browser reading direction',
      largeArrowShifts.ArrowLeft.x > 5 &&
        largeArrowShifts.ArrowRight.x < -5 &&
        largeArrowShifts.ArrowUp.y > 5 &&
        largeArrowShifts.ArrowDown.y < -5,
      JSON.stringify(largeArrowShifts),
    );
    check(
      'the large field remains represented on the minimap',
      (await page.locator('canvas.minimap').count()) === 1,
    );
    await page.screenshot({ path: `${SHOTS}/15-cutbank-large-field.png` });
    await page.evaluate(() => globalThis.__wreckright.useGame.getState().pushLog('old field marker'));
    await openDesktopBattleMenu(page);
    await page.locator('[data-testid="choose-mission"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    check(
      'choosing another field clears the previous mission log',
      (await page.evaluate(() => globalThis.__wreckright.useGame.getState().log.length)) === 0,
    );

    process.stdout.write('\ncampaign\n');
    await page.evaluate(() => localStorage.clear());
    await openDesktopBattleMenu(page);
    await page.locator('[data-testid="open-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');

    const day = async () =>
      Number((await page.locator('[data-testid="camp-day"]').innerText()).replace('Day ', ''));
    const cash = async () =>
      Number(
        (await page.locator('[data-testid="camp-cbills"]').innerText()).replace(/[^0-9-]/g, ''),
      );

    const campaignNodeIds = await page.locator('.camp-node').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')?.replace('camp-node-', '') ?? ''),
    );
    const expectedCampaignNodeIds = [
      'militia_raid',
      'pass_skirmish',
      'supply_line',
      'ridge_hold',
      'causeway_push',
      'foundry_sweep_node',
      'shale_overwatch_node',
      'depot_burn',
      'depot_take',
      'cutbank_register',
      'blackglass_receipt',
    ];
    check(
      'campaign map draws the four-act route, both recoveries and both depot endings',
      campaignNodeIds.length === expectedCampaignNodeIds.length &&
        expectedCampaignNodeIds.every((id) => campaignNodeIds.includes(id)),
      campaignNodeIds.join(', '),
    );
    check('only the opening node is available', (await page.locator('.camp-node.available').count()) === 1);
    const openingCompany = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ironline.campaign')).state,
    );
    check(
      'the opening company has four machines and four pilots on its books',
      openingCompany.mechs.length === 4 && openingCompany.pilots.length === 4,
    );
    check('stores start empty', openingCompany.store.length === 0);
    check(
      'first-drop guidance begins at choosing the job',
      (await page.locator('[data-testid="campaign"]').getAttribute('data-first-drop-stage')) ===
        'choose' &&
        (await page.locator('[data-testid="campaign-guide"]').innerText()).includes(
          '1 · Choose the job',
        ),
    );

    const firstRunCode = await page.locator('[data-testid="camp-seed"]').innerText();
    check(
      'a new campaign exposes a readable run code',
      /^Run [a-z]+-[a-z]+-[0-9a-f]{8}$/.test(firstRunCode),
      firstRunCode,
    );
    await page.locator('[data-testid="camp-restart"]').click();
    const restartedCode = await page.locator('[data-testid="camp-seed"]').innerText();
    const persistedRun = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ironline.campaign')).state.seed,
    );
    check('restart rolls a fresh run code', restartedCode !== firstRunCode, restartedCode);
    check('the fresh run is saved immediately', restartedCode === `Run ${persistedRun}`);

    await runCampaignRecovery({ page, shots: SHOTS, check });

    await page.locator('[data-testid="camp-manual-toggle"]').click();
    await page.waitForSelector('[data-testid="manual-controls"]');
    check(
      'the field manual takes keyboard focus',
      await page.locator('[data-testid="camp-manual-close"]').evaluate(
        (element) => element === document.activeElement,
      ),
    );
    const manualText = await page.locator('[data-testid="camp-manual"]').textContent();
    check(
      'the field manual carries desktop, touch and support controls',
      manualText.includes('Mouse and keyboard') &&
        manualText.includes('Touch') &&
        manualText.includes('Support calls'),
    );
    check(
      'the manual names only the current camera grammar',
      manualText.includes('Arrow keys') && !manualText.includes('WASD'),
    );
    await page.screenshot({ path: `${SHOTS}/08-field-manual.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${SHOTS}/08-field-manual-touch.png` });
    await page.keyboard.press('Escape');
    check(
      'Escape closes the manual and returns focus',
      (await page.locator('[data-testid="camp-manual"]').count()) === 0 &&
        (await page.locator('[data-testid="camp-manual-toggle"]').evaluate(
          (element) => element === document.activeElement,
        )),
    );
    await page.setViewportSize({ width: 1440, height: 900 });

    const offerFor = async (termsId) => {
      const choice = page.locator(`[data-testid="camp-terms-${termsId}"]`);
      await choice.click();
      return choice.evaluate((element) => element.closest('label')?.innerText ?? '');
    };
    const payoutHeavy = await offerFor('fee_first');
    const salvageHeavy = await offerFor('salvage_first');
    const selectedTermsText = await page.locator('[data-testid="camp-contract"]').innerText();
    check(
      'named packages trade payout against salvage',
      payoutHeavy !== salvageHeavy &&
        payoutHeavy.includes('0% salvage') &&
        !salvageHeavy.includes('0% salvage'),
      `${payoutHeavy} vs ${salvageHeavy}`,
    );
    check(
      'contract terms name success pay, field clock and wage exposure',
      selectedTermsText.includes('on success only') &&
        selectedTermsText.includes('clock') &&
        selectedTermsText.includes('maximum through deadline'),
      selectedTermsText,
    );
    await page.screenshot({ path: `${SHOTS}/08-contract-terms.png` });

    const dayBefore = await day();
    await page.locator('[data-testid="camp-advance"]').click();
    check('advancing a day moves the clock', (await day()) === dayBefore + 1);

    // Back to the war for the rest of the run: the authored node is the one
    // whose payout, salvage and unlocks the later checks are written against.
    await page.locator('[data-testid="camp-node-militia_raid"]').click();

    await page.locator('[data-testid="camp-terms-salvage_first"]').click();
    await page.locator('[data-testid="camp-accept"]').click();
    check('signing shows the active contract', (await page.locator('[data-testid="camp-deploy"]').count()) === 1);
    check(
      'signing advances first-drop guidance to Prepare drop',
      (await page.locator('[data-testid="campaign"]').getAttribute('data-first-drop-stage')) ===
        'prepare' &&
        (await page.locator('[data-testid="campaign-guide"]').innerText()).includes(
          '2 · Prepare the drop',
        ) &&
        (await page.locator('[data-testid="camp-deploy"]').innerText()).includes('Prepare drop'),
    );
    check(
      'the active contract preserves its named package',
      (await page.locator('[data-testid="camp-active-terms"]').textContent()) === 'Salvage first',
    );

    await page.locator('[data-testid="camp-save"]').click();
    const savedCampaign = await page.evaluate(() => localStorage.getItem('ironline.campaign'));
    check('the campaign saves to storage', savedCampaign !== null && savedCampaign.length > 100);

    const cashBefore = await cash();
    // Deploying walks the prep corridor: the hangar first — repairs and
    // refits — then the manifest, and launching from it starts the drop.
    await page.locator('[data-testid="camp-deploy"]').click();
    await page.waitForSelector('[data-testid="hangar-stage"]');
    check(
      'Prepare drop opens the guided hangar stage with the company machines',
      (await page.locator('[data-testid="campaign"]').getAttribute('data-first-drop-stage')) ===
        'bay' &&
        (await page.locator('[data-testid="campaign-guide"]').innerText()).includes(
          '3 · Check the machines',
        ) &&
        ((await page.locator('[data-testid^="hangar-"][data-testid*="mech_"]').count()) > 0 ||
          (await page.locator('.hangar .manifest-row').count()) > 0),
    );
    await page.locator('[data-testid="hangar-continue"]').click();
    await page.waitForSelector('[data-testid="lance-manifest"]');
    check(
      'hangar continue opens the guided manifest stage',
      (await page.locator('[data-testid="campaign"]').getAttribute('data-first-drop-stage')) ===
        'manifest' &&
        (await page.locator('[data-testid="campaign-guide"]').innerText()).includes(
          '4 · Launch the lance',
        ),
    );
    // Five rated bars per pilot, not three lines of prose: what the player
    // needs off this screen is to be able to tell two pilots apart.
    const rated = page.locator('.manifest-row [data-testid="pilot-stats"]').first();
    check(
      'the manifest lists the crew with their skills',
      (await page.locator('.manifest-row').count()) >= 4 &&
        (await rated.locator('li').count()) === 5 &&
        (await rated.innerText()).includes('Gunnery'),
    );
    check(
      'the manifest marks who is actually dropping',
      (await page.locator('.manifest-row.drops').count()) > 0,
    );

    // Holding a pilot back takes them out of the drop, and calling them up
    // puts them back: the bench is the only reason this screen exists.
    const dropsBefore = await page.locator('.manifest-row.drops').count();
    const bench = page.locator('[data-testid^="manifest-bench-"]').first();
    await bench.click();
    check(
      'holding a pilot back removes them from the drop',
      (await page.locator('.manifest-row.drops').count()) === dropsBefore - 1,
    );
    await bench.click();
    check(
      'calling them up puts them back',
      (await page.locator('.manifest-row.drops').count()) === dropsBefore,
    );

    // The bay opens on one of the company's own machines, stocked from its own
    // stores — mission prep is who drops, in what, carrying what.
    await runCampaignRefitMechbayJourney({ page, check });

    await page.locator('[data-testid="manifest-launch"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    check('the contracted mission opens on its briefing', true);
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForSelector('[data-testid="lance-bar"]');
    check('deploying launches the contracted mission', (await page.locator('.viewport canvas:not(.perf-overlay)').count()) === 1);

    const deployed = await page.evaluate(() => {
      const { world } = globalThis.__wreckright;
      return {
        mission: world.mission.id,
        playerMechs: world.entities.filter((e) => e.team === 0).map((e) => e.name),
      };
    });
    check(
      'the mission is the opening Linewrought contract',
      deployed.mission === 'line_maintenance',
      deployed.mission,
    );
    check('the campaign lance deployed', deployed.playerMechs.length === 4, deployed.playerMechs.join(', '));

    await page.evaluate(async () => {
      const { engine } = globalThis.__wreckright;
      const deadline = Date.now() + 25_000;
      while (!engine.world.finished && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let step = 0; step < 400 && !engine.world.finished; step += 1) engine.forceStep();
      }
    });
    await page.waitForSelector('[data-testid="return-to-campaign"]');
    await page.screenshot({ path: `${SHOTS}/07-campaign-battle.png` });

    await page.locator('[data-testid="return-to-campaign"]').click();
    await page.locator('[data-testid="return-to-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');

    // Coming home opens the debrief: what the drop earned each pilot.
    await page.waitForSelector('[data-testid="debrief"]');
    check(
      'the debrief accounts for every pilot who dropped',
      (await page.locator('[data-testid^="debrief-fate-"]').count()) > 0,
    );
    const debriefText = await page.locator('[data-testid="debrief"]').innerText();
    check('the debrief reports experience earned', debriefText.includes('+') && debriefText.includes('XP'));
    check('the debrief records banked experience', debriefText.includes('banked'));
    check(
      'the debrief names the signed package',
      (await page.locator('[data-testid="debrief"] header').innerText()).includes('Salvage first'),
    );
    await page.locator('[data-testid="debrief-close"]').click();

    check(
      'first-drop guidance retires after the opening outcome',
      (await page.locator('[data-testid="campaign-guide"]').count()) === 0 &&
        (await page.locator('[data-testid="campaign"]').getAttribute('data-first-drop-stage')) ===
          null,
    );
    check('the lance is visible on the company books', (await page.locator('[data-testid="camp-bay"] li').count()) >= 4);
    check(
      'the barracks lists the company pilots',
      (await page.locator('li[data-testid^="camp-pilot-"]').count()) >= 4,
    );

    const posted = await page.locator('[data-testid="camp-hall"] li').count();
    check('the hiring hall is posting work', posted > 0, `${posted} postings`);
    const postingFacts = await page.locator('[data-testid="camp-hall"] button').first().innerText();
    check(
      'a posting states its battlefield and rated opposition',
      postingFacts.includes('drop /') && postingFacts.includes('rated opposition'),
      postingFacts,
    );
    check(
      'the board states when it renews',
      (await page.locator('[data-testid="camp-hall"] .hall-note').innerText()).includes(
        'New work arrives on day',
      ),
    );

    const hallName = await page.locator('[data-testid="camp-hall"] .hall-name').first().innerText();
    await page.locator('[data-testid="camp-hall"] button').first().click();
    const shown = await page.locator('[data-testid="camp-contract"] h3').innerText();
    check(
      'a posting drives the contract panel',
      shown.toLowerCase() === hallName.toLowerCase(),
      `${shown} vs ${hallName}`,
    );

    const resolvedState = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ironline.campaign')).state,
    );
    check('the contract resolved into history', resolvedState.history.length === 1);
    check('the contract slot is clear again', resolvedState.contract === null);
    check(
      'drop experience waits for a training choice',
      resolvedState.pilots.some((pilot) => pilot.xp > 0) &&
        resolvedState.pilots.every((pilot) => pilot.spentXp === 0),
    );
    const rosterText = await page.locator('[data-testid="camp-roster"]').innerText();
    check(
      'the barracks states experience and daily payroll',
      rosterText.includes('XP banked') && rosterText.includes('/day'),
    );

    if (resolvedState.history[0].won) {
      check('winning paid out', (await cash()) > cashBefore, `${cashBefore} → ${await cash()}`);
      check('salvage reached stores', resolvedState.store.length > 0);
      check(
        'the next contracts unlocked',
        (await page.locator('.camp-node.available').count()) >= 1,
      );
    } else {
      check('a critical loss leaves the victory route open', resolvedState.failedNodes.length === 0);
      check('the failed contract returns to the board', resolvedState.finished === false);
      check(
        'recovery terms are explained',
        resolvedState.log.some((entry) => entry.text.includes('returns to the board')),
      );
    }

    check('battle damage came home', (await page.locator('[data-testid="camp-bay"] li').count()) >= 4);
    await page.screenshot({ path: `${SHOTS}/08-campaign.png` });

    await page.locator('[data-testid="camp-load"]').click();
    const afterReload = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ironline.campaign')).state,
    );
    check(
      'reloading preserves the campaign exactly',
      JSON.stringify(afterReload) === JSON.stringify(resolvedState),
    );

    check('no page errors across the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await runFireModeStage2Checks({ browser, url: URL, check });
    await runRangeDamageChartChecks({ browser, url: URL, shots: SHOTS, check });
    await runNightOperationsChecks({ browser, url: URL, shots: SHOTS, check });
    await runCultureSilhouetteChecks({ browser, url: URL, shots: SHOTS, check });
    await runTerrainWearChecks({ browser, url: URL, shots: SHOTS, check });
    await runAdaptiveScoreChecks({ browser, url: URL, check });
    await runAdaptiveScoreTreatmentChecks({ browser, url: URL, check });
    await runLastSilentMomentsChecks({ browser, url: URL, check });
    await runMobilePlaythrough({ browser, url: URL, shots: SHOTS, check });
  } finally {
    await browser.close();
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }

  process.stdout.write(`\n${checks - failures.length}/${checks} checks passed\n`);
  if (failures.length > 0) {
    process.stdout.write(`\nFAILURES:\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}

await main();
