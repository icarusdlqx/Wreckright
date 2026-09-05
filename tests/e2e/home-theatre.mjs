export async function checkHomeTheatre({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForSelector('.home-machine canvas');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${shots}/00-home-desktop.png` });
    check('the home hangar shows two authored machines without starting a battle',
      (await page.locator('.home-machine canvas').count()) === 2 &&
      (await page.locator('[data-testid="viewport"]').count()) === 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${shots}/00-home-mobile.png`, fullPage: true });
    check('the home screen fits a phone and keeps entry routes before decorative models', await page.evaluate(() => {
      const routes = document.querySelector('.home-routes').getBoundingClientRect();
      const models = document.querySelector('.home-theatre').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && routes.bottom <= models.top;
    }));
  } finally {
    await context.close();
  }
  const blocked = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await blocked.newPage();
    let rejected = false;
    await page.route(/\/src\/ui\/HomeMachines\.tsx(?:\?|$)/, (route) => {
      rejected = true;
      return route.abort('failed');
    });
    await page.goto(url);
    await page.waitForSelector('[data-testid="home-theatre-fallback"][data-preview-state="unavailable"]');
    await page.locator('[data-testid="home-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    check('a failed decorative model download still allows entering the campaign', rejected &&
      (await page.locator('[data-testid="crash"]').count()) === 0);
  } finally {
    await blocked.close();
  }
}
