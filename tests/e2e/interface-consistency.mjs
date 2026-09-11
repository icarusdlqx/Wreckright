import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';

const url = process.env.BASE_URL ?? 'http://127.0.0.1:5221/';
const folder = process.env.SHOT_DIR ?? 'reports/release-polish/interface';
const failures = [];
let checks = 0;

function check(label, ok, detail = '') {
  checks += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function inspect(page, label, selector, screenshot = true) {
  const root = page.locator(selector);
  await root.waitFor();
  const result = await root.evaluate(element => {
    const visible = node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const controls = [...element.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]')]
      .filter(visible);
    const unnamed = controls.filter(control => {
      if (control instanceof HTMLInputElement && control.type === 'file') return false;
      return !(control.getAttribute('aria-label') || control.getAttribute('title')
        || control.textContent?.trim() || (control instanceof HTMLInputElement && control.labels?.[0]?.textContent?.trim()));
    }).map(control => control.outerHTML.slice(0, 120));
    const clippedControls = controls.filter(control => {
      if (control instanceof HTMLInputElement && control.type === 'file') return false;
      const style = getComputedStyle(control);
      return control.scrollWidth > control.clientWidth + 1
        && (style.overflowX === 'hidden' || style.textOverflow === 'ellipsis');
    }).map(control => control.textContent?.trim().slice(0, 80));
    const box = element.getBoundingClientRect();
    return {
      unnamed,
      clippedControls,
      rootOverflow: element.scrollWidth > element.clientWidth + 1,
      viewportOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      box: { left: box.left, right: box.right, width: box.width, viewport: innerWidth },
    };
  });
  check(`${label}: every visible control has a usable name`, result.unnamed.length === 0, JSON.stringify(result.unnamed));
  check(`${label}: controls do not clip their labels`, result.clippedControls.length === 0, JSON.stringify(result.clippedControls));
  check(`${label}: layout does not create horizontal page overflow`, !result.viewportOverflow,
    JSON.stringify(result.box));
  if (screenshot) await page.screenshot({ path: `${folder}/${label}.png`, fullPage: true });
}

await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(url);
  await inspect(page, '01-home', '[data-testid="home-screen"]');

  await page.getByTestId('audio-settings').click();
  await inspect(page, '02-settings', '[data-testid="audio-settings-panel"]');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();

  await page.getByTestId('home-wiki').click();
  await inspect(page, '03-wiki', '[data-testid="wiki"]');
  await page.getByTestId('wiki-machines').click();
  await inspect(page, '04-wiki-machines', '[data-testid="wiki"]');
  await page.getByTestId('wiki-close').click();

  await page.getByTestId('home-new-campaign').click();
  await inspect(page, '05-campaign-choice', '[data-testid="campaign-chooser"]');
  await page.getByTestId('campaign-choice-start').click();
  await page.getByTestId('campaign').waitFor();
  await completeInitialCampaignSetup(page);
  const guideDismiss = page.getByTestId('campaign-guide-dismiss');
  if (await guideDismiss.isVisible()) await guideDismiss.click();
  await inspect(page, '06-campaign-operations', '[data-testid="campaign"]');
  check('campaign shows save state in text', (await page.getByTestId('camp-save-state').innerText()).includes('Saved locally'));

  for (const [area, number] of [['workshop', '07'], ['crew', '08'], ['supplies', '09'], ['journal', '10']]) {
    await page.getByTestId(`camp-area-${area}`).click();
    await inspect(page, `${number}-campaign-${area}`, '[data-testid="campaign"]');
  }
  await page.getByTestId('camp-save').click();
  await inspect(page, '11-save-game', '[data-testid="campaign-save-dialog"]');
  await page.getByTestId('save-dialog-close').click();
  await page.getByTestId('camp-manual-toggle').click();
  await inspect(page, '12-field-manual', '[data-testid="camp-manual"]');
  await page.getByTestId('camp-manual-close').click();

  await page.getByTestId('camp-area-operations').click();
  await page.getByTestId('camp-accept').click();
  await page.getByTestId('camp-next-mission').click();
  await inspect(page, '13-preparation-machines', '[data-testid="lance-manifest"]');
  await page.getByTestId('hangar-continue').click();
  await inspect(page, '14-preparation-pilots', '[data-testid="lance-manifest"]');
  await page.getByTestId('prep-briefing').click();
  await inspect(page, '15-preparation-briefing', '[data-testid="lance-manifest"]');

  await page.setViewportSize({ width: 640, height: 720 });
  await inspect(page, '16-preparation-200-percent', '[data-testid="lance-manifest"]');
  await page.getByTestId('manifest-cancel').click();
  await inspect(page, '17-campaign-200-percent', '[data-testid="campaign"]');
  check('interface journey has no browser errors', errors.length === 0, errors.join('\n'));
} finally {
  await context.close();
  await browser.close();
}

if (failures.length > 0) throw new Error(failures.join('\n'));
console.log(`${checks}/${checks} interface consistency checks passed`);
