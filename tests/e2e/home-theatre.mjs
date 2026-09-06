import { completeInitialCampaignSetup } from './campaign-setup.mjs';

async function countGraphicsContexts(page) {
  await page.addInitScript(() => {
    globalThis.__homeGlRequests = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])) globalThis.__homeGlRequests++;
      return getContext.apply(this, args);
    };
    localStorage.setItem('ironline.muted', '1');
  });
}

export async function checkHomeTheatre({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let artworkUrl;
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await countGraphicsContexts(page);
    await page.goto(url);
    // Decoding can finish before React reveals the image and its entrance fade completes.
    await page.waitForFunction(() => {
      const home = document.querySelector('[data-testid="home-screen"][data-artwork="ready"]');
      const art = home?.querySelector('[data-testid="home-artwork"]');
      if (!(art instanceof HTMLImageElement)) return false;
      const style = getComputedStyle(art);
      const box = art.getBoundingClientRect();
      return art.complete && art.naturalWidth > 0 && art.naturalHeight > 0
        && box.width > 0 && box.height > 0 && style.visibility === 'visible'
        && Number.parseFloat(style.opacity) >= 0.99;
    });
    artworkUrl = await page.locator('[data-testid="home-artwork"]').evaluate(image => image.currentSrc);
    await page.evaluate(() => document.fonts.ready);
    if (shots) await page.screenshot({ path: `${shots}/00-home-desktop.png` });
    check('the home artwork loads without WebGL, battle startup, or campaign and training creation',
      await page.evaluate(() => globalThis.__homeGlRequests === 0 && globalThis.__wreckright === undefined
        && document.querySelector('[data-testid="viewport"]') === null
        && localStorage.getItem('ironline.campaign') === null && localStorage.getItem('ironline.training') === null));
    const wiki = page.locator('[data-testid="home-wiki"]');
    check('the main menu clearly names the Wiki and preserves its native archive link',
      await wiki.getAttribute('href') === '#wiki' && /Wiki\s*·\s*Story\s*&\s*mechs/i.test(await wiki.innerText()));
    await page.setViewportSize({ width: 390, height: 844 });
    if (shots) await page.screenshot({ path: `${shots}/00-home-mobile.png`, fullPage: true });
    const phone = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= innerWidth,
      routes: ['home-learn', 'home-campaign', 'home-skirmish', 'home-wiki'].map(id => {
        const element = document.querySelector(`[data-testid="${id}"]`);
        if (element === null) return { id, usable: false };
        const box = element.getBoundingClientRect();
        return { id, width: box.width, height: box.height, top: box.top, bottom: box.bottom,
          usable: box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= innerWidth
            && box.top >= 0 && box.bottom <= innerHeight
            && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      }),
    }));
    check('a phone shows all three game routes and Wiki as unobstructed touch-sized choices',
      phone.fits && phone.routes.every(route => route.usable), JSON.stringify(phone));
    check('the illustrated home reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
  const blocked = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await blocked.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await countGraphicsContexts(page);
    let rejected = false;
    // Intercept the actual imported asset so this exercises dev and hosted builds alike.
    await page.route(artworkUrl, (route) => {
      rejected = true;
      return route.abort('failed');
    });
    await page.goto(url);
    await page.waitForSelector('[data-testid="home-screen"][data-artwork="fallback"]');
    const before = await page.evaluate(() => ({
      company: localStorage.getItem('ironline.campaign'), training: localStorage.getItem('ironline.training'),
    }));
    await page.locator('[data-testid="home-wiki"]').click();
    await page.locator('[data-testid="wiki"]').waitFor();
    check('a failed artwork download still opens Wiki without starting a battle or changing progress', rejected
      && await page.evaluate(previous => globalThis.__homeGlRequests === 0 && globalThis.__wreckright === undefined
        && localStorage.getItem('ironline.campaign') === previous.company
        && localStorage.getItem('ironline.training') === previous.training, before));
    await page.locator('[data-testid="wiki-close"]').click();
    await page.locator('[data-testid="home-screen"]').waitFor();
    await page.locator('[data-testid="home-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    await completeInitialCampaignSetup(page);
    check('a failed artwork download still allows creating and entering the campaign', rejected
      && await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign') ?? 'null')?.state != null)
      && await page.locator('[data-testid="crash"]').count() === 0 && errors.length === 0, errors.join(' | '));
  } finally {
    await blocked.close();
  }
}
