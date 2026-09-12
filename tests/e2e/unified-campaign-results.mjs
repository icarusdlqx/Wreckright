import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fixture } from './campaign-command-flow.mjs';
const url = process.env.E2E_URL ?? 'http://127.0.0.1:5223/';
const shots = process.env.SHOT_DIR ?? 'reports/unified-bay';
await mkdir(shots, {recursive:true});
const browser = await chromium.launch({headless:true});
let checks = 0;
const check = (name, ok) => { if (!ok) throw new Error(name); console.log(`PASS ${++checks}: ${name}`); };
try {
 for (const faction of ['border_dispute','aurelian_recall']) {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(url);
  const result = await fixture(page,url,faction,true);
  await page.reload(); await page.getByTestId('home-campaign').click();
  await page.getByTestId('debrief').waitFor();
  check(`${faction}: results foreground earnings and available salvage`, (await page.getByTestId('debrief-ledger').innerText()).includes('Contract complete') && (await page.getByTestId('debrief-salvage-report').getAttribute('open')) !== null);
  await page.screenshot({path:`${shots}/${faction}-results.png`});
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
  const picks = page.locator('[data-testid^="salvage-pick-"]:enabled');
  if (await picks.count()) { await picks.first().click(); await picks.first().click(); }
  await page.getByTestId('debrief-next-mission').click();
  const settled = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
  check(`${faction}: confirming salvage does not charge credits or advance time`, before.cbills === settled.cbills && before.day === settled.day);
  check(`${faction}: final salvage is in campaign inventory`, settled.history.at(-1).salvageFinalized && settled.history.at(-1).salvagedItems.every(item => settled.store.some(owned => owned.kind === item.kind && owned.itemId === item.itemId && owned.count >= item.count)));
  await page.screenshot({path:`${shots}/${faction}-next-mission.png`});
  await page.getByTestId('camp-accept').click(); await page.getByTestId('lance-manifest').waitFor();
  const repair = page.getByTestId(`hangar-repair-${result.mechId}`);
  await page.getByTestId(`prep-machine-${result.mechId}`).click();
  await repair.click();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
  check(`${faction}: repairing a damaged machine charges its repair quote`, pending.cbills < settled.cbills && pending.mechs.find(mech=>mech.id===result.mechId).status === 'repairing');
  await page.getByTestId(`hangar-finish-repair-${result.mechId}`).click();
  const repaired = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
  check(`${faction}: repair time completes inside preparation`, repaired.day > pending.day && repaired.mechs.find(mech=>mech.id===result.mechId).status === 'ready' && await page.getByTestId('lance-manifest').isVisible());
  await page.getByTestId(`hangar-refit-${result.mechId}`).click();
  await page.getByTestId('refit-bay').getByTestId('bay-readiness').waitFor();
  check(`${faction}: repaired machine opens directly in the unified MechBay`, await page.getByTestId('refit-bay').getByTestId('bay-readiness').isVisible());
  await page.getByTestId('bay-exit').click(); await page.getByTestId('hangar-continue').click();
  check(`${faction}: the prepared team can proceed to field briefing`, await page.getByTestId('manifest-launch').isEnabled());
  await page.getByTestId('manifest-launch').click(); await page.getByTestId('briefing').waitFor();
  check(`${faction}: campaign preparation launches the selected mission briefing`, await page.getByTestId('briefing').isVisible());
  await page.close();
 }
 console.log(`${checks} campaign result checks passed`);
} finally { await browser.close(); }
