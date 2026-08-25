import {
  verifyTouchDockControls,
  verifyTouchNavigation,
  verifyTouchOrders,
} from './touch-battle.mjs';
import { engageTrainingOpticalContact } from './training-flow.mjs';
import { runMobileMechbayJourney } from './mobile-mechbay.mjs';

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const TABLET = { width: 1024, height: 768 };
const COMPACT_QUERY = '(max-width: 640px), (pointer: coarse) and (max-width: 1100px)';

async function mobilePage(browser, url, viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  const homeWithoutEngine = await page.evaluate(() => globalThis.__wreckright === undefined);
  await page.locator('[data-testid="home-learn"]').tap();
  await page.waitForFunction(() => globalThis.__wreckright !== undefined, { timeout: 30_000 });
  await page.waitForSelector('[data-testid="briefing"]');
  await page.waitForFunction(() => globalThis.__wreckright.useGame.getState().ready);
  return { context, page, errors, homeWithoutEngine };
}

async function overflowOf(page, selector) {
  return page.locator(selector).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
}

async function documentOverflow(page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

async function oneColumn(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const columns = getComputedStyle(element).gridTemplateColumns.trim();
    return columns !== '' && columns.split(/\s+/).length === 1;
  });
}

async function fullyInViewport(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
}

async function briefingActionState(page) {
  return page.locator('[data-testid="briefing-actions"]').evaluate((actions) => {
    const briefing = actions.closest('[data-testid="briefing"]');
    const deploy = actions.querySelector('[data-testid="briefing-deploy"]');
    if (!(briefing instanceof HTMLElement) || !(deploy instanceof HTMLElement)) {
      throw new Error('briefing actions are incomplete');
    }
    const panelRect = briefing.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    const deployRect = deploy.getBoundingClientRect();
    return {
      position: getComputedStyle(actions).position,
      contained:
        actionRect.left >= panelRect.left &&
        actionRect.right <= panelRect.right &&
        actionRect.bottom <= panelRect.bottom + 1,
      deployVisible:
        deployRect.left >= 0 &&
        deployRect.top >= 0 &&
        deployRect.right <= innerWidth &&
        deployRect.bottom <= innerHeight,
    };
  });
}

async function openBattleMenu(page) {
  const sheet = page.locator('[data-testid="mobile-menu-sheet"]');
  if (!(await sheet.isVisible())) await page.locator('[data-testid="mobile-menu-toggle"]').tap();
  await sheet.waitFor({ state: 'visible' });
}

async function unlockRangeDrill(page, check, prefix) {
  await engageTrainingOpticalContact({ page, check, prefix, touch: true });
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
  await page.waitForSelector('[data-testid="mobile-tab-support"]');
}


async function runOrientation({ browser, url, shots, check, viewport, label, shotLabel }) {
  const { context, page, errors, homeWithoutEngine } = await mobilePage(browser, url, viewport);
  try {
    const prefix = `mobile ${label}`;
    check(`${prefix} Home does not mount the battle engine`, homeWithoutEngine);
    check(
      `${prefix} uses a coarse touch layout`,
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    );
    check(
      `${prefix} matches the compact boundary`,
      await page.evaluate((query) => matchMedia(query).matches, COMPACT_QUERY),
    );

    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    check(
      `${prefix} leaves browser zoom available`,
      viewportMeta?.includes('viewport-fit=cover') === true &&
        !viewportMeta.includes('user-scalable') &&
        !viewportMeta.includes('maximum-scale'),
      viewportMeta ?? 'viewport meta missing',
    );

    const rootAtBriefing = await documentOverflow(page);
    const briefing = await overflowOf(page, '[data-testid="briefing"]');
    const actions = await briefingActionState(page);
    check(
      `${prefix} briefing has no horizontal overflow`,
      rootAtBriefing.scrollWidth <= rootAtBriefing.clientWidth + 1 &&
        briefing.scrollWidth <= briefing.clientWidth + 1,
      `root ${rootAtBriefing.scrollWidth}/${rootAtBriefing.clientWidth}, briefing ${briefing.scrollWidth}/${briefing.clientWidth}`,
    );
    check(
      `${prefix} keeps deploy pinned and reachable on the opening briefing`,
      actions.position === 'sticky' && actions.contained && actions.deployVisible,
      JSON.stringify(actions),
    );
    await page.screenshot({ path: `${shots}/11-mobile-${shotLabel}-briefing.png` });

    await page.locator('[data-testid="briefing-deploy"]').tap();
    await page.waitForSelector('[data-testid="mobile-dock"]');
    await page.waitForSelector('[data-testid="training-coach"]');
    await page.waitForFunction(() => globalThis.__wreckright.useGame.getState().briefingSeen);
    check(`${prefix} deploy starts the battle`, (await page.locator('[data-testid="mobile-dock"]').count()) === 1);
    check(
      `${prefix} keeps the compact topbar and dock on screen`,
      (await fullyInViewport(page, '[data-testid="topbar"]')) &&
        (await fullyInViewport(page, '[data-testid="mobile-dock"]')),
    );

    const firstLance = page.locator('[data-testid="lance-bar"] button').first();
    check(
      `${prefix} selection lesson hides the untaught dock`,
      (await page.locator('[data-testid="mobile-queue"]').count()) === 0 &&
        (await page.locator('[data-testid="command-move"]').count()) === 0,
    );
    await firstLance.tap();
    await page.waitForSelector('[data-testid="command-move"]');
    check(
      `${prefix} first lance card accepts a touch`,
      (await page.evaluate(() => globalThis.__wreckright.useGame.getState().selection.length)) === 1 &&
        (await firstLance.getAttribute('aria-pressed')) === 'true',
    );

    await page.locator('[data-testid="mobile-select-all"]').tap();
    const allSelected = await page.evaluate(() => {
      const state = globalThis.__wreckright.useGame.getState();
      const alive = state.units.filter((unit) => unit.team === state.playerTeam && unit.alive);
      return alive.length > 1 && alive.every((unit) => state.selection.includes(unit.id));
    });
    check(`${prefix} select-all chooses the live lance`, allSelected);

    await firstLance.tap();
    await unlockRangeDrill(page, check, prefix);
    check(
      `${prefix} range drill restores the full mobile dock`,
      (await page.locator('[data-testid="mobile-tab-support"]').count()) === 1 &&
        (await page.locator('[data-testid="mobile-tab-contacts"]').count()) === 1 &&
        (await page.locator('[data-testid="mobile-tab-unit"]').count()) === 1,
    );

    await verifyTouchDockControls({ page, check, prefix });

    await verifyTouchNavigation({ page, check, prefix });
    if (label === 'portrait') await verifyTouchOrders({ page, check, prefix });
    await page.screenshot({ path: `${shots}/12-mobile-${shotLabel}-battle.png` });

    await openBattleMenu(page);
    await page.locator('[data-testid="choose-mission"]').tap();
    await page.waitForSelector('[data-testid="briefing"]');
    await openBattleMenu(page);
    await page.locator('[data-testid="open-campaign"]').tap();
    await page.waitForSelector('[data-testid="campaign"]');

    const campaign = await overflowOf(page, '[data-testid="campaign"]');
    check(`${prefix} campaign is one column`, await oneColumn(page, '[data-testid="campaign"]'));
    check(
      `${prefix} campaign has no horizontal overflow`,
      campaign.scrollWidth <= campaign.clientWidth + 1,
      `${campaign.scrollWidth}/${campaign.clientWidth}`,
    );
    await page.locator('[data-testid="camp-manual-toggle"]').tap();
    await page.waitForSelector('[data-testid="camp-manual"]');
    check(
      `${prefix} field manual puts touch controls first`,
      (await page.locator('.manual-control-columns > section').first().getAttribute('data-testid')) ===
        'manual-touch-controls',
    );
    await page.locator('[data-testid="camp-manual-close"]').tap();
    await page.waitForSelector('[data-testid="camp-manual"]', { state: 'detached' });
    await page.locator('.camp-node.available').first().tap();
    await page.locator('[data-testid="camp-terms-salvage_first"]').tap();
    check(
      `${prefix} campaign contract controls accept touch`,
      await page.locator('[data-testid="camp-terms-salvage_first"]').isChecked(),
    );
    const posting = page.locator('[data-testid="camp-hall"] button').first();
    if ((await posting.count()) > 0) {
      await posting.scrollIntoViewIfNeeded();
      await posting.tap();
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('data-testid') === 'camp-contract',
      );
      check(
        `${prefix} side posting reveals its signable terms`,
        await page.locator('[data-testid="camp-contract"]').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return document.activeElement === element && bounds.top >= -1 && bounds.top < innerHeight;
        }),
      );
    }
    await page.screenshot({ path: `${shots}/13-mobile-${shotLabel}-campaign.png` });

    await page.locator('[data-testid="camp-exit"]').tap();
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.locator('[data-testid="home-skirmish"]').tap();
    await page.waitForSelector('[data-testid="briefing"]');
    await openBattleMenu(page);
    await page.locator('[data-testid="open-mechbay"]').tap();
    await page.waitForSelector('[data-testid="mechbay"]');

    await runMobileMechbayJourney({
      page,
      check,
      prefix,
      shots,
      shotLabel,
    });
    check(`${prefix} reports no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await context.close();
  }
}

export async function runMobilePlaythrough({ browser, url, shots, check }) {
  process.stdout.write('\nmobile portrait\n');
  await runOrientation({
    browser,
    url,
    shots,
    check,
    viewport: PORTRAIT,
    label: 'portrait',
    shotLabel: 'portrait',
  });
  process.stdout.write('\nmobile landscape\n');
  await runOrientation({
    browser,
    url,
    shots,
    check,
    viewport: LANDSCAPE,
    label: 'landscape',
    shotLabel: 'landscape',
  });
  process.stdout.write('\ncoarse tablet\n');
  await runOrientation({
    browser,
    url,
    shots,
    check,
    viewport: TABLET,
    label: 'tablet',
    shotLabel: 'tablet',
  });

  // The coarse context above owns the touch contract. A separate context
  // proves width alone does not turn an ordinary tablet-sized window into the
  // finger layout.
  const desktopContext = await browser.newContext({ viewport: TABLET });
  const desktopPage = await desktopContext.newPage();
  try {
    await desktopPage.addInitScript(() => localStorage.clear());
    await desktopPage.goto(url);
    await desktopPage.waitForSelector('[data-testid="home-screen"]');
    await desktopPage.locator('[data-testid="home-learn"]').click();
    await desktopPage.waitForSelector('[data-testid="briefing"]');
    check(
      '1024px fine-pointer desktop keeps the desktop layout',
      !(await desktopPage.evaluate((query) => matchMedia(query).matches, COMPACT_QUERY)) &&
        (await desktopPage.locator('.mobile-topbar').count()) === 0,
    );
  } finally {
    await desktopContext.close();
  }
}
