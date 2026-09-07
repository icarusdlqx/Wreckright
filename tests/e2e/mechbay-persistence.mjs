import { openDesktopBattleMenu } from './input-safety.mjs';

async function openBay(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.getByTestId('home-skirmish').click();
  await page.getByTestId('briefing').waitFor();
  await openDesktopBattleMenu(page);
  await page.getByTestId('open-mechbay').click();
  await page.getByTestId('design-name').waitFor();
}

const saved = (page, id) => page.evaluate(key => JSON.parse(localStorage.getItem(`ironline.design.${key}`)), id);
const named = (page, name) => page.waitForFunction(expected => document.querySelector('[data-testid="design-name"]')?.value === expected, name);
const importedFile = (design, name) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(design)) });

/** Every context is private to the test; no real campaign or browser storage is touched. */
export async function runMechbayPersistenceChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.setDefaultTimeout(30_000);
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await openBay(page, url);
    const leftArm = page.getByTestId('bay-location-left_arm');
    await leftArm.locator('[data-testid^="remove-weapon-"]').first().click();
    await page.getByTestId('stock-weapon-small_laser').click();
    await leftArm.click();
    await page.getByTestId('design-name').fill('Audit Close Escort');
    await page.getByTestId('bay-save').click();
    const closeEscort = await saved(page, 'audit_close_escort');
    check('an actual mixed-gun refit saves its changed weapon footprint',
      closeEscort?.mounts.some(mount => mount.weaponId === 'small_laser' && mount.location === 'left_arm')
      && closeEscort.mounts.filter(mount => mount.weaponId === 'medium_laser').length === 2
      && closeEscort.mounts.some(mount => mount.weaponId === 'ac5'));

    await page.getByTestId('bay-location-right_arm').locator('[data-testid^="remove-weapon-"]').click();
    await page.getByTestId('stock-weapon-medium_laser').click();
    await page.getByTestId('bay-location-right_torso').click();
    await page.getByTestId('design-name').fill('Audit Energy Escort');
    await page.getByTestId('design-picker').selectOption('hornet_spotter');
    await page.getByTestId('bay-unsaved-dialog').waitFor();
    check('stock selection protects an unsaved weapon configuration',
      await page.getByTestId('design-name').inputValue() === 'Audit Energy Escort'
      && await page.getByTestId('bay-unsaved-save').innerText() === 'Save and switch');
    await page.getByTestId('bay-unsaved-keep').click();
    check('Keep editing retains the draft and undo history after a stock selection',
      await page.getByTestId('design-name').inputValue() === 'Audit Energy Escort'
      && !(await page.getByTestId('bay-undo').isDisabled()));
    await page.getByTestId('design-picker').selectOption('hornet_spotter');
    await page.getByTestId('bay-unsaved-save').click();
    await named(page, 'Gadfly');
    const energyEscort = await saved(page, 'audit_energy_escort');
    check('Save and switch stores the outgoing configuration, including automatic removal of orphan ammunition',
      energyEscort?.mounts.some(mount => mount.weaponId === 'medium_laser' && mount.location === 'right_torso')
      && !energyEscort.mounts.some(mount => mount.weaponId === 'ac5')
      && !energyEscort.ammo.some(bin => bin.weaponId === 'ac5')
      && JSON.stringify(await saved(page, 'audit_close_escort')) === JSON.stringify(closeEscort));

    await page.getByTestId('bay-stored').selectOption('audit_close_escort');
    await named(page, 'Audit Close Escort');
    await page.getByTestId('design-name').fill('Audit Pending Saved Choice');
    await page.getByTestId('bay-stored').selectOption('audit_energy_escort');
    await page.getByTestId('bay-unsaved-dialog').waitFor();
    await page.getByTestId('bay-unsaved-keep').click();
    check('cancelling a saved-loadout selection retains the current draft',
      await page.getByTestId('design-name').inputValue() === 'Audit Pending Saved Choice');
    await page.getByTestId('bay-stored').selectOption('audit_energy_escort');
    await page.getByTestId('bay-unsaved-discard').click();
    await named(page, 'Audit Energy Escort');
    check('discarding a draft loads only the chosen saved variant',
      await page.getByTestId('bay-location-right_arm').locator('[data-testid^="remove-weapon-"]').count() === 0
      && (await page.getByTestId('bay-status').innerText()).startsWith('Loaded'));

    await page.getByTestId('design-name').fill('Audit Pending Import');
    await page.getByTestId('bay-import').setInputFiles(importedFile(closeEscort, 'close-escort.json'));
    await page.getByTestId('bay-unsaved-dialog').waitFor();
    await page.getByTestId('bay-unsaved-keep').click();
    check('import asks before replacing an edited draft', await page.getByTestId('design-name').inputValue() === 'Audit Pending Import');
    check('cancelling an import clears the file picker so the same file can be chosen again',
      await page.getByTestId('bay-import').inputValue() === '');
    await page.getByTestId('bay-import').setInputFiles(importedFile(closeEscort, 'close-escort.json'));
    await page.getByTestId('bay-unsaved-discard').click();
    await named(page, 'Audit Close Escort');
    check('confirmed import restores the chosen weapon configuration',
      await page.getByTestId('bay-location-right_arm').locator('[data-testid^="remove-weapon-"]').count() === 1
      && (await page.getByTestId('bay-status').innerText()).startsWith('Imported'));

    await page.getByTestId('design-name').fill('Audit Invalid Import Draft');
    await page.getByTestId('bay-import').setInputFiles(importedFile({ ...closeEscort, chassisId: 'nonexistent_chassis' }, 'unknown-chassis.json'));
    await page.waitForFunction(() => document.querySelector('[data-testid="bay-status"]')?.textContent?.includes('Import failed'));
    check('an unknown imported chassis is rejected without losing the draft or the exit controls',
      await page.getByTestId('design-name').inputValue() === 'Audit Invalid Import Draft'
      && await page.getByTestId('bay-unsaved-dialog').count() === 0
      && await page.getByTestId('bay-exit').isVisible());
    await page.getByTestId('design-name').fill('Audit Close Escort');
    await page.getByTestId('bay-save').click();

    await openBay(page, url);
    await page.getByTestId('bay-stored').selectOption('audit_energy_escort');
    await named(page, 'Audit Energy Escort');
    check('saved configurations survive a page reload with separate weapons and ammunition',
      JSON.stringify(await saved(page, 'audit_close_escort')) === JSON.stringify(closeEscort)
      && JSON.stringify(await saved(page, 'audit_energy_escort')) === JSON.stringify(energyEscort)
      && await page.getByTestId('bay-location-right_arm').locator('[data-testid^="remove-weapon-"]').count() === 0);
    await page.screenshot({ path: `${shots}/mechbay-persistence-configurations.png` });

    const originalKey = 'ironline.design.audit_energy_escort';
    await page.getByTestId('design-name').fill('Audit Quota Draft');
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Test quota exhausted', 'QuotaExceededError'); }; });
    await page.getByTestId('design-picker').selectOption('hornet_spotter');
    await page.getByTestId('bay-unsaved-save').click();
    check('a storage quota failure keeps the unsaved draft instead of switching or claiming success',
      await page.getByTestId('design-name').inputValue() === 'Audit Quota Draft'
      && /storage.*full|storage.*unavailable/i.test(await page.getByTestId('bay-status').innerText())
      && await page.evaluate(key => localStorage.getItem(key) !== null && localStorage.getItem('ironline.design.audit_quota_draft') === null, originalKey));
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('bay-export').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const parts = [];
    for await (const part of stream) parts.push(part);
    const exported = JSON.parse(Buffer.concat(parts).toString('utf8'));
    check('failed browser saves still allow an intact JSON export', exported.name === 'Audit Quota Draft' && exported.mounts.length === energyEscort.mounts.length);
    await page.getByTestId('bay-exit').click();
    check('a failed save leaves the exit protection active', await page.getByTestId('bay-unsaved-dialog').isVisible());
    await page.screenshot({ path: `${shots}/mechbay-persistence-failed-save.png` });
    check('mechbay persistence paths produce no uncaught browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
  await checkBlockedStorage({ browser, url, shots, check });
  await checkPendingImports({ browser, url, shots, check });
}

async function checkBlockedStorage({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing').waitFor();
    await page.evaluate(() => Object.defineProperty(window, 'localStorage', { configurable: true,
      get: () => { throw new DOMException('Test browser storage blocked', 'SecurityError'); },
    }));
    await openDesktopBattleMenu(page);
    await page.getByTestId('open-mechbay').click();
    await page.getByTestId('design-name').waitFor();
    check('the mechbay opens with usable fitting controls when the browser blocks all storage',
      await page.getByTestId('bay-exit').isVisible()
      && await page.getByTestId('bay-stored').locator('option').count() === 1);
    await page.getByTestId('design-name').fill('Blocked Browser Draft');
    await page.getByTestId('bay-save').click();
    check('blocked storage reports a recoverable save refusal without an uncaught error',
      /storage.*full|storage.*unavailable/i.test(await page.getByTestId('bay-status').innerText())
      && await page.getByTestId('design-name').inputValue() === 'Blocked Browser Draft'
      && errors.length === 0, errors.join('\n'));
    await page.screenshot({ path: `${shots}/mechbay-persistence-blocked-storage.png` });
  } finally { await context.close(); }
}

async function checkPendingImports({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await openBay(page, url);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('bay-export').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const original = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const imported = { ...original, id: 'audit_delayed_import', name: 'Audit Delayed Import' };
    await page.evaluate(() => {
      const read = File.prototype.text;
      const pending = new Map();
      globalThis.__bayPendingReads = pending;
      File.prototype.text = function () {
        if (!this.name.startsWith('delayed-')) return read.call(this);
        return new Promise((resolve, reject) => pending.set(this.name, () => read.call(this).then(resolve, reject)));
      };
    });
    const stage = async (design, name) => {
      await page.getByTestId('bay-import').setInputFiles(importedFile(design, name));
      await page.waitForFunction(filename => globalThis.__bayPendingReads.has(filename), name);
    };
    const release = name => page.evaluate(async filename => {
      const read = globalThis.__bayPendingReads.get(filename);
      globalThis.__bayPendingReads.delete(filename);
      await read();
    }, name);

    await stage(imported, 'delayed-edited-draft.json');
    await page.getByTestId('design-name').fill('Edited During File Read');
    await page.getByTestId('bay-location-left_arm').locator('[data-testid^="remove-weapon-"]').first().click();
    await release('delayed-edited-draft.json');
    await page.getByTestId('bay-unsaved-dialog').waitFor();
    check('an import finishing after an edit protects the latest draft instead of using stale clean state',
      await page.getByTestId('design-name').inputValue() === 'Edited During File Read'
      && await page.getByTestId('bay-location-left_arm').locator('[data-testid^="remove-weapon-"]').count() === 1);
    await page.getByTestId('bay-unsaved-save').click();
    await named(page, imported.name);
    const protectedDraft = await saved(page, 'edited_during_file_read');
    check('Save and switch after a delayed import saves the latest weapon changes',
      protectedDraft?.mounts.length === original.mounts.length - 1 && protectedDraft.name === 'Edited During File Read');

    await stage({ ...original, id: 'outdated_import', name: 'Outdated Import' }, 'delayed-superseded.json');
    await page.getByTestId('bay-import').setInputFiles(importedFile({ ...original, id: 'latest_import', name: 'Latest Import' }, 'latest-import.json'));
    await named(page, 'Latest Import');
    await release('delayed-superseded.json');
    check('a slower earlier import cannot replace a newer completed import',
      await page.getByTestId('design-name').inputValue() === 'Latest Import'
      && await page.getByTestId('bay-unsaved-dialog').count() === 0);

    await stage(imported, 'delayed-after-exit.json');
    await page.getByTestId('bay-exit').click();
    await page.getByTestId('briefing').waitFor();
    await release('delayed-after-exit.json');
    await openDesktopBattleMenu(page);
    await page.getByTestId('open-mechbay').click();
    await named(page, original.name);
    check('a file read finishing after leaving the bay cannot affect the next workshop session',
      await page.getByTestId('design-name').inputValue() === original.name && errors.length === 0, errors.join('\n'));
    await page.screenshot({ path: `${shots}/mechbay-persistence-delayed-import.png` });
  } finally { await context.close(); }
}
