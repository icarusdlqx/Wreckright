import { fixture } from './campaign-command-flow.mjs';

/** Settled-field fixture checks presentation and scrolling, not a simulated combat victory. */
export async function runMachineServiceRecordChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(url);
    const prepared = await fixture(page, url, 'border_dispute');
    await page.evaluate(async ({ url, mechId }) => {
      const { loadCampaign, saveCampaign } = await import(new URL('src/campaign/save.ts', url).href);
      const state = loadCampaign().state;
      const mech = state.mechs.find(entry => entry.id === mechId);
      // A saved custom design keeps the same hull ID and earlier deployed report.
      mech.design.id = 'custom_service_lamplighter';
      mech.design.name = 'Lamplighter';
      const mount = mech.design.mounts.find(entry => entry.weaponId === 'flamer');
      if (mount === undefined) throw new Error('missing opening emitter fixture');
      mount.weaponId = 'er_medium_laser';
      saveCampaign(state, { recover: true });
    }, { url, mechId: prepared.mechId });
    await page.reload();
    await page.getByTestId('home-campaign').click();
    await page.getByTestId('debrief-next-mission').click();
    await page.getByTestId('camp-accept').click();
    await page.getByTestId('hangar-stage').waitFor();
    await page.getByTestId(`prep-machine-${prepared.mechId}`).click();
    const record = page.getByTestId(`machine-service-${prepared.mechId}`);
    check('machine service history starts collapsed beside the saved named variant',
      await record.getAttribute('open') === null && (await record.innerText()).includes('1 recorded deployment')
      && (await page.getByTestId(`hangar-${prepared.mechId}`).innerText()).includes('Lamplighter'));
    await page.screenshot({ path: `${shots}/machine-service-collapsed.png` });
    await record.locator('summary').click();
    const text = await record.innerText();
    check('owned hull continuity shows its actual earlier deployment and changed layout',
      text.includes('Last deployment: First Notice') && text.includes('Deployed as Gadfly.')
      && text.includes('Weapons changed since that deployment.'));
    await page.screenshot({ path: `${shots}/machine-service-expanded.png` });
    await page.setViewportSize({ width: 640, height: 800 });
    const box = await record.boundingBox();
    await page.mouse.move(box.x + 40, Math.min(650, box.y + 20));
    await page.mouse.wheel(0, 240);
    await page.waitForFunction(() => document.querySelector('.prep-workspace').scrollTop > 0);
    check('narrow preparation wheel scroll reaches the full service record above the footer',
      await record.evaluate(element => {
        const footer = document.querySelector('.prep-actions').getBoundingClientRect();
        const record = element.getBoundingClientRect();
        return record.top >= 0 && record.bottom <= footer.top && element.scrollWidth <= element.clientWidth;
      }));
    await page.screenshot({ path: `${shots}/machine-service-narrow.png` });
  } finally { await context.close(); }
}
