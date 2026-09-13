import { saveBay } from './save-bay.mjs';
import { nativeBayDrag } from './native-bay-drag.mjs';
import { importLegacySentinel } from './mechbay-legacy-fixture.mjs';
import { openDesktopBattleMenu } from './input-safety.mjs';
import { clickFittingAction } from './fitting-actions.mjs';

async function openBay(page, url) {
  await page.goto(url);
  await page.getByTestId('home-skirmish').click();
  await page.getByTestId('briefing').waitFor();
  await openDesktopBattleMenu(page);
  await page.getByTestId('open-mechbay').click();
  await page.getByTestId('design-name').waitFor();
}

async function pointerDrop(page, source, target) {
  await nativeBayDrag(page, source, target);
}

const weaponsAt = (page, location) => page.getByTestId(`bay-location-${location}`).locator('[data-testid^="remove-weapon-"]').count();
const saved = (page, id) => page.evaluate(key => JSON.parse(localStorage.getItem(`ironline.design.${key}`)), id);

/** Real pointer actions, UI file import and private storage; no campaign state edits. */
export async function runFittingGridChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await openBay(page, url);
    await importLegacySentinel(page);
    const counts = await page.getByTestId('bay-grid').getByTestId('rack-capacity').evaluateAll(racks => racks.map(rack => ({
      capacity: Number(rack.getAttribute('data-capacity')), cells: rack.querySelectorAll('.rack-cell').length,
      rows: getComputedStyle(rack).gridTemplateRows.split(' ').length,
      width: rack.getBoundingClientRect().width,
      used: [...rack.querySelectorAll('.rack-capacity__used')].every(cell => getComputedStyle(cell).backgroundColor !== 'rgba(0, 0, 0, 0)'),
    })));
    check('every compartment shows its exact full capacity as a two dimensional box group', counts.length >= 6 && counts.every(rack => rack.cells === rack.capacity && rack.used) && counts.some(rack => rack.rows > 1), JSON.stringify(counts));
    check('shelf makes ammunition required and automatic first bin explicit', (await page.getByTestId('weapon-ammo-machine_gun').innerText()).includes('First bin fitted automatically'));
    await page.screenshot({ path: `${shots}/fitting-grid-desktop.png` });

    const oldLeft = await weaponsAt(page, 'left_arm');
    const oldRight = await weaponsAt(page, 'right_torso');
    const moving = page.getByTestId('bay-location-left_arm').locator('[data-testid^="inspect-weapon-"]').first();
    await pointerDrop(page, moving, page.getByTestId('free-slots-right_torso'));
    check('an installed weapon moves by real pointer drag without creating another copy', await weaponsAt(page, 'left_arm') === oldLeft - 1 && await weaponsAt(page, 'right_torso') === oldRight + 1);
    check('relocation does not open a replacement dialog', await page.getByTestId('bay-replacement-preview').count() === 0);
    await page.getByTestId('bay-undo').click();
    check('undo restores the source and destination of the moved weapon', await weaponsAt(page, 'left_arm') === oldLeft && await weaponsAt(page, 'right_torso') === oldRight);

    await pointerDrop(page, page.getByTestId('bay-location-left_arm').locator('[data-testid^="inspect-weapon-"]').first(), page.getByTestId('free-slots-head'));
    check('incompatible pointer drop preserves the installed weapon and explains refusal', await weaponsAt(page, 'left_arm') === oldLeft && await weaponsAt(page, 'head') === 0 && (await page.getByTestId('bay-status').innerText()).length > 10);

    await clickFittingAction(page.getByTestId('bay-location-left_arm').locator('[data-testid^="remove-weapon-"]').first());
    await page.getByRole('tab', { name: 'Weapons', exact: true }).click();
    if (await page.getByRole('button', { name: 'Clear filter', exact: true }).count()) await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
    await page.getByTestId('stock-weapon-medium_laser').scrollIntoViewIfNeeded();
    await pointerDrop(page, page.getByTestId('stock-weapon-medium_laser'), page.getByTestId('free-slots-left_arm'));
    check('a shelf weapon snaps into the matching compartment by real pointer drag', await weaponsAt(page, 'left_arm') === oldLeft);
    if (await page.getByRole('button', { name: 'Clear filter', exact: true }).count()) await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
    check('energy weapon shelf explicitly needs no ammunition', (await page.getByTestId('weapon-ammo-medium_laser').innerText()).includes('No ammo needed'));

    await clickFittingAction(page.getByTestId('bay-location-right_arm').locator('[data-testid^="remove-weapon-"]'));
    await page.getByRole('tab', { name: 'Weapons', exact: true }).click();
    if (await page.getByRole('button', { name: 'Clear filter', exact: true }).count()) await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
    await pointerDrop(page, page.getByTestId('stock-weapon-machine_gun'), page.getByTestId('free-slots-right_arm'));
    check('ammo weapon drag automatically fits a feed and reports where it is stowed', (await page.getByTestId('bay-status').innerText()).includes('ammunition stowed') && await page.locator('[data-testid^="inspect-ammo-"]').filter({ hasText: 'Machine Gun' }).count() === 1);
    await page.getByTestId('design-name').fill('Grid Fitting Review');
    await saveBay(page);
    const fitted = await saved(page, 'grid_fitting_review');
    check('legal moved and ammo-fed layout saves with a matching ammo bin', fitted?.mounts.some(mount => mount.weaponId === 'machine_gun' && mount.location === 'right_arm') && fitted.ammo.some(bin => bin.weaponId === 'machine_gun' && bin.tons === 1));
    await page.reload();
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing').waitFor();
    await openDesktopBattleMenu(page);
    await page.getByTestId('open-mechbay').click();
    await page.getByTestId('bay-stored').selectOption('grid_fitting_review');
    check('saved weapon and ammunition configuration survives a full page reload exactly', JSON.stringify(await saved(page, 'grid_fitting_review')) === JSON.stringify(fitted) && await page.getByTestId('design-name').inputValue() === 'Grid Fitting Review');
    await clickFittingAction(page.getByTestId('bay-location-left_arm').locator('[data-testid^="move-weapon-"]').first());
    await page.getByTestId('bay-location-right_torso').getByRole('button', { name: 'Fit held part in Right Torso' }).click();
    check('the Move button supports keyboard and tap placement without dragging', await weaponsAt(page, 'left_arm') === oldLeft - 1 && await weaponsAt(page, 'right_torso') === oldRight + 1);
    await page.getByTestId('bay-undo').click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('bay-location-right_arm').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/fitting-grid-phone.png` });
    const mobile = await page.locator('.slot-block__move, .slot-block__remove').evaluateAll(buttons => buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    check('fitted move and remove controls retain forty-four pixel touch targets', mobile.every(button => button.width >= 44 && button.height >= 44), JSON.stringify(mobile));
    check('mobile fitting has no sideways page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('grid fitting journey produces no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { console.log(String(error)); await page.mouse.up(); await page.screenshot({ path: `${shots}/fitting-grid-failure.png` }); console.log(await page.locator('[data-testid=mechbay]').innerText()); throw error; } finally { await context.close(); }
}
