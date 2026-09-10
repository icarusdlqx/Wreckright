import { discardRefitIfPrompted } from './mechbay-exit.mjs';
import { readFileSync } from 'node:fs';

const STORAGE_KEY = 'ironline.design.e2e_fire_modes_bulwark';
const source = JSON.parse(
  readFileSync(new URL('../../src/data/designs/bulwark_assault.json', import.meta.url), 'utf8'),
);
// The old Redoubt fixture was an emplacement, which cannot occupy a mech berth.
// A six-slot Bulwark arm carries the same modal cannon in a legal player hull.
const fixture = {
  ...source,
  id: 'e2e_fire_modes_bulwark',
  name: 'Fire Modes Bulwark',
  mounts: [{ weaponId: 'lbx_ac10', location: 'right_arm' }],
  ammo: [{ weaponId: 'lbx_ac10', location: 'right_torso', tons: 1 }],
  equipment: [{ equipmentId: 'case', location: 'right_torso' }],
};

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function freshPage(browser, url, viewport, mobile = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const errors = watchPage(page);
  await page.addInitScript(({ key, design }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(key, JSON.stringify(design));
    localStorage.setItem(
      'ironline.training',
      JSON.stringify({ version: 1, step: 0, status: 'skipped' }),
    );
  }, { key: STORAGE_KEY, design: fixture });
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  return { context, page, errors };
}

async function openFixtureBriefing(page) {
  await page.locator('[data-testid="home-skirmish"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);
  await page.getByTestId('briefing-faction-picker').selectOption('linewrought');
  for (let index = 1; index < 4; index++) {
    await page.getByTestId(`briefing-berth-${index}`).click();
    await page.getByTestId(`berth-design-${index}`).selectOption('empty');
  }
  await page.getByTestId('briefing-berth-0').click();
  const berth = page.locator('[data-testid="berth-design-0"]');
  await berth.selectOption('saved:e2e_fire_modes_bulwark');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="berth-design-0"]')?.value === 'custom',
  );
  await page.waitForFunction(() => globalThis.__wreckright?.world.entities.some(entity => entity.designId === 'e2e_fire_modes_bulwark'));
}

async function prepareBattle(page) {
  await page.locator('[data-testid="briefing-deploy"]').click();
  await page.waitForFunction(
    () => globalThis.__wreckright?.useGame.getState().briefingSeen === true,
  );
  return page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const state = useGame.getState();
    const shooter = world.entities.find(
      (entity) => entity.designId === 'e2e_fire_modes_bulwark',
    );
    const target = world.entities.find(
      (entity) => entity.team !== state.playerTeam && !entity.destroyed,
    );
    if (shooter === undefined || target === undefined) throw new Error('fire-mode fixture missing');
    const mount = shooter.weapons.find((entry) => entry.weaponId === 'lbx_ac10');
    if (mount === undefined) throw new Error('fire-mode mount missing');

    engine.setPaused(true);
    shooter.pos = { x: 420, y: 420 };
    shooter.facing = 0;
    shooter.torsoOffset = 0;
    target.pos = { x: 600, y: 420 };
    target.facing = Math.PI;
    target.torsoOffset = 0;
    world.vision?.visible.add(target.id);
    state.setSelection([shooter.id]);
    engine.renderer.snapshot(world);
    engine.presentation.publish(null);
    engine.renderer.camera.distance = 300;
    engine.renderer.camera.centreOn({ x: 510, y: 420 });
    engine.renderer.camera.update(engine.renderer.viewport);

    return { shooterId: shooter.id, targetId: target.id, mountIndex: mount.index };
  });
}

async function switchState(page, fixtureState) {
  return page.evaluate(({ shooterId, mountIndex }) => {
    const { world } = globalThis.__wreckright;
    const shooter = world.entities.find((entity) => entity.id === shooterId);
    const mount = shooter?.weapons.find((entry) => entry.index === mountIndex);
    if (shooter === undefined || mount === undefined) throw new Error('fire-mode state missing');
    return {
      modeId: mount.modeId,
      cooldown: mount.cooldown,
      cycleDuration: mount.cycleDuration,
      groupEnabled: [...shooter.groupEnabled],
    };
  }, fixtureState);
}

export async function runFireModeStage2Checks({ browser, url, check }) {
  process.stdout.write('\nfire modes\n');
  const desktop = await freshPage(browser, url, { width: 1440, height: 900 });
  try {
    await openFixtureBriefing(desktop.page);
    check('the fire-mode fixture is a legal, deployable Linewrought mech with cannon ammunition',
      await desktop.page.getByTestId('briefing-deploy').isEnabled()
      && await desktop.page.evaluate(() => {
        const world = globalThis.__wreckright.world;
        const mech = world.entities.find(entity => entity.designId === 'e2e_fire_modes_bulwark');
        const chassis = world.catalog.chassis.get(mech?.chassisId);
        return chassis?.frame === 'mech' && chassis.faction === 'linewrought'
          && mech.weapons.length === 1 && mech.weapons[0].weaponId === 'lbx_ac10'
          && mech.ammoBins.some(bin => bin.weaponId === 'lbx_ac10' && bin.rounds > 0);
      }));
    await desktop.page.locator('[data-testid="berth-customise-0"]').click();
    await desktop.page.waitForSelector('[data-testid="outfit-bay"]');
    await desktop.page.locator('[data-testid="inspect-weapon-0"]').click();
    const dossier = desktop.page.locator('#bay-shelf-inspector');
    const fireModes = dossier.getByRole('region', { name: 'Canister Cannon fire mode statistics' });
    await fireModes.waitFor({ state: 'visible' });
    const rows = await fireModes.locator('tbody tr').allTextContents();
    check(
      'the Canister Cannon dossier compares both authored fire modes',
      rows.length === 2 && rows[0]?.includes('Cluster') && rows[0]?.includes('Default') &&
        rows[1]?.includes('Slug'),
      rows.join(' | '),
    );
    check(
      'the fire-mode dossier states the two complete profiles',
      rows[0]?.includes('12') && rows[0]?.includes('10×1.2') && rows[0]?.includes('4/s') &&
        rows[1]?.includes('13.2') && rows[1]?.includes('4.4/s'),
      rows.join(' | '),
    );

    await desktop.page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(desktop.page);
    const battle = await prepareBattle(desktop.page);
    await desktop.page.getByTestId('unit-details-toggle').click();
    const mode = desktop.page.locator(`[data-testid="weapon-mode-${battle.mountIndex}"]`);
    await mode.waitFor({ state: 'visible' });
    const before = await switchState(desktop.page, battle);
    check(
      'a friendly modal mount exposes its current mode and next action',
      before.modeId === 'cluster' &&
        (await mode.getAttribute('aria-label')) ===
          'Canister Cannon mode Cluster. Switch to Slug' &&
        (await mode.getAttribute('aria-pressed')) === null,
    );

    await mode.press('Enter');
    await desktop.page.waitForFunction(
      ({ shooterId, mountIndex }) => {
        const { world } = globalThis.__wreckright;
        return world.entities.find((entity) => entity.id === shooterId)
          ?.weapons.find((entry) => entry.index === mountIndex)?.modeId === 'slug';
      },
      battle,
    );
    const after = await switchState(desktop.page, battle);
    check(
      'keyboard mode switching preserves the charged cycle and group intent',
      after.modeId === 'slug' && after.cooldown === before.cooldown &&
        after.cycleDuration === before.cycleDuration &&
        JSON.stringify(after.groupEnabled) === JSON.stringify(before.groupEnabled),
    );
    await desktop.page.waitForFunction(
      (testId) => {
        const button = document.querySelector(`[data-testid="${testId}"]`);
        return button?.getAttribute('aria-label') ===
          'Canister Cannon mode Slug. Switch to Cluster' && document.activeElement === button;
      },
      `weapon-mode-${battle.mountIndex}`,
    );
    const updatedLabel = await mode.getAttribute('aria-label');
    const activeTestId = await desktop.page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid') ?? null);
    check(
      'the keyed mode control retains focus and offers the next mode',
      updatedLabel === 'Canister Cannon mode Slug. Switch to Cluster' &&
        activeTestId === `weapon-mode-${battle.mountIndex}`,
      JSON.stringify({ updatedLabel, activeTestId }),
    );

    const presentation = await desktop.page.evaluate(({ shooterId, targetId }) => {
      const { engine, world } = globalThis.__wreckright;
      engine.renderer.consumeEvents(world, [{
        type: 'weapon_fired',
        tick: world.tick,
        shooterId,
        targetId,
        weaponId: 'lbx_ac10',
        modeId: 'slug',
      }]);
      return engine.renderer.effects.tracers.stats().families.shell.active;
    }, battle);
    check('Slug presents as one shell tracer', presentation === 1, String(presentation));
    check('desktop fire-mode flow reports no page errors', desktop.errors.length === 0, desktop.errors.join(' | '));
  } finally {
    await desktop.context.close();
  }

  const mobile = await freshPage(browser, url, { width: 390, height: 844 }, true);
  try {
    await openFixtureBriefing(mobile.page);
    const battle = await prepareBattle(mobile.page);
    await mobile.page.locator(`[data-testid="lance-card-${battle.shooterId}"]`).tap();
    await mobile.page.locator('[data-testid="mobile-tab-unit"]').tap();
    const panel = mobile.page.locator('[data-testid="mobile-unit-panel"]');
    const mode = panel.locator(`[data-testid="weapon-mode-${battle.mountIndex}"]`);
    await mode.scrollIntoViewIfNeeded();
    const box = await mode.boundingBox();
    check(
      'the mobile fire-mode control is a reachable touch target',
      box !== null && box.width >= 44 && box.height >= 44,
      JSON.stringify(box),
    );
    await mode.tap();
    const mobileState = await switchState(mobile.page, battle);
    const overflow = await mobile.page.evaluate(() => {
      const panel = document.querySelector('[data-testid="mobile-unit-panel"]');
      return {
        documentClient: document.documentElement.clientWidth,
        documentScroll: document.documentElement.scrollWidth,
        panelClient: panel?.clientWidth ?? 0,
        panelScroll: panel?.scrollWidth ?? Infinity,
      };
    });
    check(
      'mobile mode switching updates the sim without horizontal overflow',
      mobileState.modeId === 'slug' &&
        overflow.documentScroll <= overflow.documentClient + 1 &&
        overflow.panelScroll <= overflow.panelClient + 1,
      JSON.stringify({ mobileState, overflow }),
    );
    check('mobile fire-mode flow reports no page errors', mobile.errors.length === 0, mobile.errors.join(' | '));
  } finally {
    await mobile.context.close();
  }
}
