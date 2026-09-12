import { returnFromAutoPreparation } from './unified-navigation.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { checkHomeTheatre } from './home-theatre.mjs';

const shots = process.env.SHOT_DIR ?? 'reports/main-menu/after';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
const options = { browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5218/', shots,
  check(name, passed, detail = '') {
    results.push({ name, passed: Boolean(passed), detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  },
};

async function targetGeometry(locator) {
  return locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height, top: box.top, bottom: box.bottom,
      reachable: box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= innerWidth + 1
        && box.top >= -1 && box.bottom <= innerHeight + 1
        && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
  });
}

async function checkResponsiveMenu(viewport, label) {
  const context = await browser.newContext({ viewport, hasTouch: true, reducedMotion: 'reduce' });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await page.goto(options.url, { waitUntil: 'load' });
    await page.locator('[data-testid="home-screen"][data-artwork="ready"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${shots}/menu-${label}-initial.png` });
    const before = await page.evaluate(() => ({
      company: localStorage.getItem('ironline.campaign'), training: localStorage.getItem('ironline.training'),
    }));
    const routes = [];
    for (const id of ['home-learn', 'home-campaign', 'home-mechbay', 'home-skirmish', 'home-wiki']) {
      const route = page.locator(`[data-testid="${id}"]`);
      // Small or short screens may scroll; every choice must remain usable when reached.
      await route.scrollIntoViewIfNeeded();
      routes.push({ id, ...await targetGeometry(route) });
    }
    const fits = await page.locator('[data-testid="home-screen"]').evaluate(element =>
      element.scrollWidth <= element.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    options.check(`${label}: all menu choices remain reachable without horizontal overflow`,
      fits && routes.every(route => route.reachable && route.width >= 44 && route.height >= 44),
      JSON.stringify(routes));
    await page.screenshot({ path: `${shots}/menu-${label}-routes.png` });

    const settings = page.locator('[data-testid="audio-settings"]');
    await settings.scrollIntoViewIfNeeded();
    const trigger = await targetGeometry(settings);
    await settings.click();
    const panel = page.locator('[data-testid="audio-settings-panel"]');
    await panel.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="audio-settings"]')?.getAttribute('aria-expanded') === 'true');
    const close = panel.getByRole('button', { name: 'Close settings' });
    await close.scrollIntoViewIfNeeded();
    const closing = await targetGeometry(close);
    options.check(`${label}: Settings opens with a reachable close control`,
      trigger.reachable && closing.reachable && await settings.getAttribute('aria-expanded') === 'true',
      JSON.stringify({ trigger, closing }));
    await page.screenshot({ path: `${shots}/menu-${label}-settings.png` });
    await close.click();
    await panel.waitFor({ state: 'hidden' });
    await settings.click();
    await panel.waitFor();
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('[data-testid="audio-settings"]')?.getAttribute('aria-expanded') === 'false');
    options.check(`${label}: Settings closes by button and Escape`,
      await settings.getAttribute('aria-expanded') === 'false');

    let reachedWiki = false;
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'home-wiki')) {
        reachedWiki = true;
        break;
      }
    }
    const wiki = page.locator('[data-testid="home-wiki"]');
    const keyboardTarget = await targetGeometry(wiki);
    options.check(`${label}: keyboard Tab reaches an unobstructed Wiki link`,
      reachedWiki && keyboardTarget.reachable, JSON.stringify(keyboardTarget));
    if (reachedWiki) {
      await page.keyboard.press('Enter');
      await page.locator('[data-testid="wiki"]').waitFor();
      const entered = new URL(page.url()).hash === '#wiki';
      await page.keyboard.press('Escape');
      await page.locator('[data-testid="wiki"]').waitFor({ state: 'hidden' });
      await page.locator('[data-testid="home-screen"]').waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'home-wiki');
      const returned = await page.evaluate(previous => ({
        focus: document.activeElement?.getAttribute('data-testid') === 'home-wiki',
        unchanged: localStorage.getItem('ironline.campaign') === previous.company
          && localStorage.getItem('ironline.training') === previous.training,
        noBattle: document.querySelector('[data-testid="viewport"]') === null,
      }), before);
      options.check(`${label}: keyboard Wiki roundtrip restores focus without changing progress`,
        entered && returned.focus && returned.unchanged && returned.noBattle, JSON.stringify(returned));
    }
    options.check(`${label}: responsive menu interactions report no page errors`, errors.length === 0, errors.join(' | '));
  } finally { await context.close(); }
}

async function checkLaunch(route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await page.goto(options.url, { waitUntil: 'load' });
    await page.locator(`[data-testid="home-${route}"]`).click();
    if (route === 'campaign') {
      await page.locator('[data-testid="campaign"]').waitFor();
      await completeInitialCampaignSetup(page);
      const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
      if (await guide.isVisible()) await guide.click();
      await page.locator('[data-testid="camp-accept"]').click();
      await returnFromAutoPreparation(page);
      await page.locator('[data-testid="camp-deploy"]').click();
    }
    await page.locator('[data-testid="briefing"]').waitFor();
    const training = await page.locator('[data-testid="training-skip"]').count() > 0;
    options.check(`${route}: menu route reaches the correct playable briefing`,
      training === (route === 'learn') && await page.locator('[data-testid="briefing-deploy"]').isEnabled());
    await page.screenshot({ path: `${shots}/launch-${route}-briefing.png` });
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.locator('[data-testid="briefing"]').waitFor({ state: 'hidden' });
    await page.locator('[data-testid="viewport"]').waitFor();
    if (route === 'learn') await page.locator('[data-testid="training-coach"]').waitFor();
    options.check(`${route}: deployment enters the battlefield without page errors`,
      await page.locator('[data-testid="viewport"] canvas').count() > 0 && errors.length === 0,
      errors.join(' | '));
    await page.screenshot({ path: `${shots}/launch-${route}-battle.png` });
  } finally { await context.close(); }
}

async function checkMechbayRoute() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('ironline.muted', '1');
  });
  try {
    await page.goto(options.url, { waitUntil: 'load' });
    await page.locator('[data-testid="home-mechbay"]').click();
    await page.locator('[data-testid="mechbay"]').waitFor();
    options.check('mechbay: Home route opens the workshop without starting a battle',
      await page.locator('[data-testid="design-picker"]').isVisible()
        && await page.locator('[data-testid="bay-save-as"]').isVisible()
        && await page.locator('[data-testid="viewport"]').count() === 0
        && await page.locator('[data-testid="bay-exit"]').innerText() === 'Back to command');
    await page.screenshot({ path: `${shots}/launch-mechbay.png` });

    await page.locator('[data-testid="bay-save-as"]').click();
    await page.locator('[data-testid="bay-save-dialog"]').waitFor();
    await page.locator('[data-testid="bay-save-name"]').fill('Menu Field Scout');
    await page.screenshot({ path: `${shots}/launch-mechbay-save-dialog.png` });
    await page.locator('[data-testid="bay-save-confirm"]').click();
    await page.locator('[data-testid="bay-save-dialog"]').waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('ironline.design.menu_field_scout');
      return raw === null ? null : JSON.parse(raw);
    });
    options.check('mechbay: Save as new creates a named reusable configuration',
      saved?.name === 'Menu Field Scout'
        && await page.locator('[data-testid="design-name"]').inputValue() === 'Menu Field Scout'
        && await page.locator('[data-testid="bay-stored"] option[value="menu_field_scout"]').count() === 1,
      JSON.stringify(saved));

    await page.locator('[data-testid="bay-exit"]').click();
    await page.locator('[data-testid="home-screen"]').waitFor();
    await page.locator('[data-testid="home-mechbay"]').click();
    await page.locator('[data-testid="mechbay"]').waitFor();
    options.check('mechbay: saved configuration remains available after a Home round trip',
      await page.locator('[data-testid="bay-stored"] option[value="menu_field_scout"]').count() === 1);
    options.check('mechbay: route and save interactions report no page errors',
      errors.length === 0, errors.join(' | '));
  } finally { await context.close(); }
}

try {
  await checkHomeTheatre(options);
  await checkResponsiveMenu({ width: 320, height: 568 }, 'small-portrait');
  await checkResponsiveMenu({ width: 844, height: 390 }, 'short-landscape');
  await checkMechbayRoute();
  for (const route of ['learn', 'skirmish', 'campaign']) await checkLaunch(route);
  if (results.some(result => !result.passed)) throw new Error(JSON.stringify(results.filter(result => !result.passed)));
  console.log(`${results.length}/${results.length} main-menu checks passed`);
} finally {
  await browser.close();
  await writeFile(`${shots}/checks.json`, `${JSON.stringify(results, null, 2)}\n`);
}
