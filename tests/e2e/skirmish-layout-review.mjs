import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const shots = process.env.SHOT_DIR ?? 'reports/faction-campaign-playtest/skirmish';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:5233/');
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('enemy-force-setup').waitFor();
    await page.getByTestId('briefing').evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: `${shots}/skirmish-${name}-setup.png` });
    await page.getByTestId('enemy-force-setup').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/skirmish-${name}-enemy.png` });
    const fits = await page.getByTestId('briefing').evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    const deploy = page.getByTestId('briefing-deploy');
    await deploy.scrollIntoViewIfNeeded();
    const actionable = await deploy.isVisible() && await deploy.isEnabled();
    results.push({ name, noHorizontalOverflow: fits, deployReachable: actionable });
    if (!fits || !actionable) throw new Error(`${name} setup layout failed`);
    console.log(`${name}: setup fits, deployment reachable`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${shots}/layout-checks.json`, `${JSON.stringify(results, null, 2)}\n`);
}
