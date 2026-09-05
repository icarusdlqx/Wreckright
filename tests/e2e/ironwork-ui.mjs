/** Fresh-context campaign checks; callable by either the main or a standalone headless harness. */
async function installGraphicsProbe(page) {
  await page.addInitScript(() => {
    // Instrument actual contexts: a retained canvas alone cannot prove GPU cleanup.
    const original = HTMLCanvasElement.prototype.getContext;
    const seen = new WeakSet();
    const entries = [];
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const context = original.apply(this, args);
      if (context !== null && ['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])
        && !seen.has(context)) {
        seen.add(context);
        entries.push({ id: entries.length, context, canvas: this });
      }
      return context;
    };
    globalThis.__ironworkGl = {
      snapshot: () => entries.map(({ id, context, canvas }) => ({
        id, connected: canvas.isConnected, lost: context.isContextLost(),
        width: canvas.width, height: canvas.height,
      })),
      loseShowcase: () => {
        const canvas = document.querySelector('[data-testid="camp-selected-machine"] canvas');
        const entry = entries.find((candidate) => candidate.canvas === canvas);
        const extension = entry?.context.getExtension('WEBGL_lose_context');
        if (extension === null || extension === undefined) throw new Error('No showcase context to release');
        extension.loseContext();
      },
    };
    // Graphics checks never need to play the strategic score through the host.
    localStorage.setItem('ironline.muted', '1');
  });
}

const savedCampaign = (page) => page.evaluate(() => localStorage.getItem('ironline.campaign'));
const graphics = (page) => page.evaluate(() => globalThis.__ironworkGl.snapshot());

async function waitForLiveContexts(page, count) {
  await page.waitForFunction((wanted) =>
    globalThis.__ironworkGl.snapshot().filter((entry) => !entry.lost).length === wanted, count);
  return graphics(page);
}

async function openCompany(page) {
  await page.locator('[data-testid="home-campaign"]').click();
  await page.waitForSelector('[data-testid="campaign"]');
  const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
  if (await guide.isVisible()) await guide.click();
  await page.waitForSelector('[data-testid="camp-area-workshop"]');
}

async function surveyImage(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="camp-mission-survey"] img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth === 1200
      && image.naturalHeight === 650;
  });
  return page.locator('[data-testid="camp-mission-survey"]').evaluate((survey) => {
    const image = survey.querySelector('img');
    const sample = document.createElement('canvas');
    sample.width = 32; sample.height = 24;
    const pixels = sample.getContext('2d');
    pixels.drawImage(image, 0, 0, sample.width, sample.height);
    const colours = new Set();
    const data = pixels.getImageData(0, 0, sample.width, sample.height).data;
    for (let index = 0; index < data.length; index += 4) {
      colours.add(`${data[index] >> 3},${data[index + 1] >> 3},${data[index + 2] >> 3}`);
    }
    return { name: survey.querySelector('h3')?.textContent, alt: image.alt, src: image.src,
      width: image.naturalWidth, height: image.naturalHeight, text: survey.textContent,
      colourSamples: colours.size };
  });
}

export async function runIronworkUiChecks({ browser, url, check, shots }) {
  process.stdout.write('\nironwork campaign visuals and lifetimes\n');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await installGraphicsProbe(page);
  try {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelectorAll('.home-machine canvas').length === 2);
    await openCompany(page);
    const initialSave = await savedCampaign(page);
    const initial = JSON.parse(initialSave).state;
    const survey = await surveyImage(page);
    const surveyed = await waitForLiveContexts(page, 0);
    check('mission survey renders a real terrain image and releases its off-screen WebGL context',
      survey.src.startsWith('data:image/png;') && survey.colourSamples > 8 && survey.alt.includes('authored terrain')
        && survey.text.includes('Contacts and reinforcements must be discovered in the field.')
        && surveyed.length >= 3 && surveyed.every((entry) => entry.lost),
      JSON.stringify({ name: survey.name, width: survey.width, height: survey.height, colours: survey.colourSamples, contexts: surveyed }));
    if (shots) await page.screenshot({ path: `${shots}/ironwork-operations.png` });

    await page.locator('[data-testid="camp-area-workshop"]').click();
    const showcase = page.locator('[data-testid="camp-selected-machine"]');
    await showcase.locator('[data-testid="mech-preview-canvas"]').waitFor();
    const workshop = await waitForLiveContexts(page, 1);
    const cards = page.locator('.company-workshop-machines > [data-testid^="camp-mech-"]');
    check('Workshop owns one live preview and lists exactly the saved company machines',
      await cards.count() === initial.mechs.length && initial.mechs.length >= 2
        && workshop.filter((entry) => !entry.lost).every((entry) => entry.connected),
      JSON.stringify({ cards: await cards.count(), owned: initial.mechs.length, contexts: workshop }));
    if (shots) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${shots}/ironwork-workshop-viewport.png` });
      await page.screenshot({ path: `${shots}/ironwork-workshop-layout.png`, fullPage: true });
    }

    const secondId = initial.mechs[1].id;
    const secondCard = page.locator(`[data-testid="camp-mech-${secondId}"]`);
    // Compare identity text, independent of each surface's CSS text-transform.
    const expectedName = await secondCard.locator('.exp-machine-copy strong').textContent();
    const inspect = page.locator(`[data-testid="camp-inspect-${secondId}"]`);
    await inspect.focus();
    const inspectionScroll = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Enter');
    await page.waitForFunction((name) => document.querySelector('[data-testid="camp-selected-machine"] h3')?.textContent === name, expectedName);
    check('keyboard inspection selects the requested machine without changing the saved company',
      await inspect.getAttribute('aria-pressed') === 'true'
        && await page.locator('[data-testid^="camp-inspect-"][aria-pressed="true"]').count() === 1
        && await inspect.evaluate((button) => button === document.activeElement)
        && await page.evaluate(() => window.scrollY) === inspectionScroll
        && await page.locator('[data-testid="camp-inspection-status"]').textContent()
          === `Inspecting ${expectedName}. Current equipment and condition shown.`
        && await savedCampaign(page) === initialSave,
      JSON.stringify({ expectedName, selected: await showcase.locator('h3').textContent() }));
    if (shots) await showcase.screenshot({ path: `${shots}/ironwork-workshop.png` });

    await page.locator('[data-testid="camp-manual-toggle"]').click();
    await page.waitForSelector('[data-testid="camp-manual"]');
    const covered = await waitForLiveContexts(page, 0);
    check('covering Workshop with the manual releases its preview context',
      await showcase.locator('canvas').count() === 0 && covered.every((entry) => entry.lost),
      JSON.stringify(covered));
    await page.locator('[data-testid="camp-manual-close"]').click();
    await showcase.locator('[data-testid="mech-preview-canvas"]').waitFor();
    await waitForLiveContexts(page, 1);

    const refit = page.locator('[data-testid^="camp-refit-"]:enabled').first();
    await refit.click();
    await page.waitForSelector('[data-testid="refit-bay"] [data-testid="mech-preview-canvas"]');
    const refitting = await waitForLiveContexts(page, 1);
    check('detailed refit replaces the Workshop preview instead of retaining a second live context',
      await showcase.locator('canvas').count() === 0
        && await page.locator('[data-testid="mech-preview-canvas"]').count() === 1,
      JSON.stringify(refitting));
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="refit-bay"]', { state: 'detached' });
    await showcase.locator('[data-testid="mech-preview-canvas"]').waitFor();
    await waitForLiveContexts(page, 1);
    const cancelled = {
      focusRestored: await refit.evaluate((button) => button === document.activeElement),
      activeControl: await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      expectedName, selectedName: await showcase.locator('h3').textContent(),
      saveUnchanged: await savedCampaign(page) === initialSave,
    };
    check('cancelling refit restores focus and the selected preview without spending or refitting',
      cancelled.focusRestored && cancelled.selectedName === expectedName && cancelled.saveUnchanged,
      JSON.stringify(cancelled));

    for (let visit = 0; visit < 3; visit += 1) {
      await page.locator('[data-testid="camp-area-crew"]').click();
      await waitForLiveContexts(page, 0);
      await page.locator('[data-testid="camp-area-workshop"]').click();
      await showcase.locator('[data-testid="mech-preview-canvas"]').waitFor();
      await waitForLiveContexts(page, 1);
    }
    const cycled = await graphics(page);
    check('repeated work-area changes retain one preview and preserve selection and save bytes',
      cycled.filter((entry) => !entry.lost).length === 1
        && cycled.filter((entry) => entry.lost).length >= 6
        && await inspect.getAttribute('aria-pressed') === 'true'
        && await savedCampaign(page) === initialSave, JSON.stringify(cycled));

    await page.evaluate(() => globalThis.__ironworkGl.loseShowcase());
    await showcase.locator('.selected-machine-stage [data-testid="chassis-silhouette"]').waitFor();
    await waitForLiveContexts(page, 0);
    const lost = {
      expectedName, selectedName: await showcase.locator('h3').textContent(),
      refitEnabled: await refit.isEnabled(), saveUnchanged: await savedCampaign(page) === initialSave,
      contexts: await graphics(page),
    };
    check('preview context loss falls back to a silhouette and keeps machine orders available',
      lost.selectedName === expectedName && lost.refitEnabled && lost.saveUnchanged,
      JSON.stringify(lost));

    await page.reload();
    await page.waitForSelector('[data-testid="home-screen"]');
    await openCompany(page);
    const restoredSurvey = await surveyImage(page);
    await waitForLiveContexts(page, 0);
    check('reloading retains the exact company save and restores the same public mission survey',
      await savedCampaign(page) === initialSave && restoredSurvey.name === survey.name
        && restoredSurvey.alt === survey.alt);
    await page.locator('[data-testid="camp-accept"]').click();
    const signed = JSON.parse(await savedCampaign(page)).state;
    const signedSurvey = await page.locator('[data-testid="camp-mission-survey"]').evaluate((section) => ({
      name: section.querySelector('h3')?.textContent,
      header: section.querySelector('header p')?.textContent,
      privacy: section.querySelector('footer p')?.textContent,
      src: section.querySelector('img')?.getAttribute('src'),
    }));
    const signedCheck = {
      contractSigned: signed.contract !== null, expectedName: survey.name, name: signedSurvey.name,
      header: signedSurvey.header, privacy: signedSurvey.privacy,
      imageUnchanged: signedSurvey.src === restoredSurvey.src,
    };
    check('signing the displayed operation retains its terrain survey without exposing contacts',
      signedCheck.contractSigned && signedCheck.name === survey.name
        && signedCheck.header === 'Signed contract / terrain survey'
        && signedCheck.privacy === 'Terrain only. Contacts and reinforcements must be discovered in the field.'
        && signedCheck.imageUnchanged, JSON.stringify(signedCheck));
    check('campaign visual lifetime checks report no page or console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

export async function captureIronworkMobile({ browser, url, check, shots }) {
  process.stdout.write('\nironwork mobile campaign views\n');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await installGraphicsProbe(page);
  try {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await openCompany(page);
    const before = await savedCampaign(page);
    await surveyImage(page);
    await waitForLiveContexts(page, 0);
    const survey = page.locator('[data-testid="camp-mission-survey"]');
    await survey.scrollIntoViewIfNeeded();
    if (shots) await page.screenshot({ path: `${shots}/ironwork-mobile-operations.png` });
    const geometry = await page.locator('[data-testid="camp-map"]').evaluate((map) => {
      const bounds = map.getBoundingClientRect();
      const cards = [...map.querySelectorAll('[data-map-node]')].map((node) => {
        const { left, right, top, bottom } = node.getBoundingClientRect();
        return { id: node.getAttribute('data-map-node'), left, right, top, bottom };
      });
      const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      return { cards, contained: cards.every((card) => card.left >= bounds.left - 0.5
        && card.right <= bounds.right + 0.5 && card.top >= bounds.top - 0.5 && card.bottom <= bounds.bottom + 0.5),
      separated: cards.every((card, index) => cards.slice(index + 1).every((other) => !overlaps(card, other))) };
    });
    check('mobile campaign map keeps all authored sites contained and label cards separate',
      geometry.cards.length > 1 && geometry.contained && geometry.separated, JSON.stringify(geometry));
    if (shots) await page.locator('[data-testid="camp-map"]').screenshot({ path: `${shots}/ironwork-mobile-map.png` });
    await page.locator('[data-testid="camp-area-workshop"]').click();
    const showcase = page.locator('[data-testid="camp-selected-machine"]');
    await showcase.locator('canvas').waitFor();
    await waitForLiveContexts(page, 1);
    const second = page.locator('[data-testid^="camp-inspect-"]').nth(1);
    await second.tap();
    await page.waitForFunction(() => {
      const top = document.querySelector('[data-testid="camp-selected-machine"]').getBoundingClientRect().top;
      return top >= -1 && top < 32;
    });
    const widths = await page.locator('[data-testid="campaign"]').evaluate((campaign) => ({
      viewport: campaign.clientWidth, content: campaign.scrollWidth,
    }));
    const mobileName = await showcase.locator('h3').textContent();
    check('mobile Workshop inspection stays within the viewport without mutating its company',
      await second.getAttribute('aria-pressed') === 'true' && widths.content <= widths.viewport + 1
        && await page.locator('[data-testid="camp-inspection-status"]').textContent()
          === `Inspecting ${mobileName}. Current equipment and condition shown.`
        && await savedCampaign(page) === before, JSON.stringify(widths));
    if (shots) await showcase.screenshot({ path: `${shots}/ironwork-mobile-workshop.png` });
    await page.locator('[data-testid="camp-area-operations"]').click();
    await waitForLiveContexts(page, 0);
    check('mobile work-area navigation releases the inspection context without page errors',
      errors.length === 0 && await savedCampaign(page) === before, errors.join(' | '));
  } finally {
    await context.close();
  }
}
