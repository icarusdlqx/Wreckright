import { chromium, firefox } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.E2E_URL ?? 'http://127.0.0.1:5223/';
const shots = process.env.SHOT_DIR ?? 'reports/variant-identity';
await mkdir(shots, { recursive: true });
const browser = await (process.env.E2E_BROWSER === 'firefox' ? firefox : chromium).launch({ headless: true });
let checks = 0;
const check = (name, valid) => { if (!valid) throw Error(name); console.log(`PASS ${++checks}: ${name}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByTestId('home-mechbay').click();
  await page.getByTestId('design-picker').selectOption('bulwark_assault');
  await page.getByTestId('remove-weapon-0').click();
  await page.getByTestId('bay-save-as').click();
  await page.getByTestId('bay-save-name').fill('Amber Covenant');
  await page.getByTestId('bay-save-confirm').click();
  await page.getByTestId('bay-save-dialog').waitFor({ state: 'hidden' });
  await page.getByTestId('bay-stored').selectOption('amber_covenant');
  const storedBefore = await page.evaluate(() => localStorage.getItem('ironline.design.amber_covenant'));
  check('saves a named custom build with its actual weapon layout', JSON.parse(storedBefore).mounts.length === 5);
  await page.getByTestId('open-machine-focus').click();
  await page.getByTestId('machine-focus').waitFor();
  check('inspection identifies the named variant', await page.locator('#machine-focus-title').innerText() === 'Amber Covenant');
  check('shows the real removal from Prime', (await page.getByTestId('inspect-changes').innerText()).includes('1 removed'));
  check('explains captured hardware at the machine', (await page.locator('.machine-focus__readout').innerText()).includes('Aurelian'));
  await page.getByTestId('machine-focus').getByTestId('mech-preview-canvas').waitFor();
  await page.screenshot({ path: `${shots}/current-variant.png` });
  const canvas = await page.getByTestId('machine-focus').getByTestId('mech-preview-canvas').elementHandle();
  await page.getByTestId('inspect-prime').click();
  check('Prime is clearly labelled as a reference', await page.locator('#machine-focus-title').innerText() === 'Bulwark · Prime');
  check('comparison reuses one WebGL canvas', await page.getByTestId('machine-focus').getByTestId('mech-preview-canvas').evaluate((current, before) => current === before, canvas));
  check('Prime has the original six-weapon body', (await page.locator('.machine-focus__readout').innerText()).includes('3 Aurelian weapons'));
  await page.screenshot({ path: `${shots}/prime-reference.png` });
  await page.getByTestId('inspect-current').click();
  check('switching back restores the five-weapon variant', (await page.locator('.machine-focus__readout').innerText()).includes('2 Aurelian weapons'));
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.getByTestId('machine-focus').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const stage = element.querySelector('.machine-focus__stage').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 && stage.height >= 300;
    });
    check(`${width}: comparison and complete preview stay within the screen`, layout);
    await page.screenshot({ path: `${shots}/variant-${width}.png` });
  }
  await page.getByRole('button', { name: 'Return to fitting', exact: true }).click();
  check('inspection never changes the saved variant', await page.evaluate(() => localStorage.getItem('ironline.design.amber_covenant')) === storedBefore);
  check('preview flow has no runtime errors', errors.length === 0);
  console.log(`${checks} variant identity checks passed`);
} finally { await browser.close(); }
