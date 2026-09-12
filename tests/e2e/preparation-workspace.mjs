import { returnFromAutoPreparation } from './unified-navigation.mjs';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { clickFittingAction } from './fitting-actions.mjs';
import { isDeepStrictEqual } from 'node:util';

const company = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);

export async function runPreparationWorkspaceChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const shot = name => page.screenshot({ path: `${shots}/preparation-${name}.png` });
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await page.goto(url);
    await page.getByTestId('home-campaign').click();
    await completeInitialCampaignSetup(page);
    const dismiss = page.getByTestId('campaign-guide-dismiss');
    if (await dismiss.isVisible()) await dismiss.click();
    await page.getByTestId('camp-accept').click();
    await returnFromAutoPreparation(page);
    await page.getByTestId('camp-review-machines').click();
    const workspace = page.getByTestId('lance-manifest');
    await workspace.waitFor();
    check('preparation opens one workspace with five visible paired seats', await workspace.locator('.prep-seat').count() === 5);
    const initial = await company(page);
    check('opening preparation records the exact previewed assignments', initial.deploymentSeats.every(seat => seat.pilotId === null || initial.pilots.find(pilot => pilot.id === seat.pilotId)?.mechId === seat.mechId));
    await shot('machines');
    await page.getByTestId('hangar-continue').click();
    const first = initial.deploymentSeats[0];
    await page.getByTestId(`manifest-bench-${first.pilotId}`).click();
    const cleared = await company(page);
    check('returning a pilot leaves the same uncrewed machine and tonnage aboard', cleared.deploymentSeats[0].mechId === first.mechId && cleared.deploymentSeats[0].pilotId === null
      && (await page.getByTestId('prep-seat-0').innerText()).includes('Needs pilot'));
    check('an uncrewed machine blocks deployment instead of silently autofilling', await page.getByTestId('manifest-launch').isDisabled());
    await page.getByTestId(`prep-pilot-${first.pilotId}`).click();
    await shot('pilot-assignment');
    await page.getByTestId(`prep-pilot-${first.pilotId}`).dragTo(page.getByTestId('prep-seat-0'));
    check('dragging a reserve portrait into the cockpit saves the same pilot and machine pairing',
      isDeepStrictEqual((await company(page)).deploymentSeats[0], first)
      && await page.getByTestId('manifest-launch').isEnabled());
    await page.getByTestId(`manifest-bench-${first.pilotId}`).click();
    await page.getByTestId('prep-assign-pilot').click();
    check('explicit pilot assignment restores a launchable team', await page.getByTestId('manifest-launch').isEnabled());
    await page.getByTestId('prep-seat-1').click();
    await page.getByTestId('prep-machines').click();
    const second = (await company(page)).deploymentSeats[1];
    await page.getByTestId(`hangar-refit-${second.mechId}`).click();
    const refit = page.getByTestId('refit-bay');
    await refit.getByTestId('bay-save').waitFor();
    check('refitting retains the mission and same deployment team', await refit.locator('.prep-refit-context .prep-seat').count() === 5
      && await refit.getByTestId('prep-seat-1').getAttribute('aria-pressed') === 'true');
    await shot('refit');
    const beforeRefit = await company(page);
    const oldDesign = beforeRefit.mechs.find(mech => mech.id === second.mechId).design;
    await clickFittingAction(refit.locator('[data-testid^="remove-weapon-"]').first());
    check('an uncommitted refit does not change the campaign machine', JSON.stringify((await company(page)).mechs.find(mech => mech.id === second.mechId).design) === JSON.stringify(oldDesign));
    await page.getByTestId('bay-save').click();
    await refit.waitFor({ state: 'hidden' });
    check('committing a refit returns to the same selected cockpit', await page.getByTestId('prep-seat-1').getAttribute('aria-pressed') === 'true');
    const committed = await company(page);
    check('the chosen machine receives the saved loadout and retains its pilot', committed.mechs.find(mech => mech.id === second.mechId).design.mounts.length === oldDesign.mounts.length - 1
      && committed.deploymentSeats[1].pilotId === second.pilotId);
    await page.getByTestId('prep-briefing').click();
    check('mission planning remains inside the same preparation workspace', await workspace.getByTestId('planning-map').isVisible() && await workspace.locator('.prep-seat').count() === 5);
    await shot('mission-map');
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.getByTestId('prep-machines').click();
      check(`preparation fits ${viewport.width}px without horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shot(`${viewport.width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('manifest-cancel').click();
    await page.reload();
    await page.getByTestId('home-campaign').click();
    await page.getByTestId('camp-review-machines').click();
    const reopened = await company(page);
    check('reopening the company restores ordered pairs and the committed loadout', isDeepStrictEqual(reopened.deploymentSeats, committed.deploymentSeats)
      && isDeepStrictEqual(reopened.mechs.find(mech => mech.id === second.mechId).design, committed.mechs.find(mech => mech.id === second.mechId).design),
      JSON.stringify({ expectedSeats: committed.deploymentSeats, actualSeats: reopened.deploymentSeats }));
    await page.getByTestId('manifest-launch').click();
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('lance-bar').waitFor();
    const names = committed.deploymentSeats.filter(seat => seat.pilotId !== null && seat.mechId !== null).map(seat => committed.pilots.find(pilot => pilot.id === seat.pilotId).name);
    const text = await page.getByTestId('lance-bar').innerText();
    check('the prepared pilots arrive in the combat dock', names.every(name => text.includes(name)));
    check('preparation journey has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { await shot('error').catch(() => {}); throw error; }
  finally { await context.close(); }
}
