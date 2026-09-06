/** Native HTML drag, aimed after held-part previews update the scrollable bay. */
export async function nativeBayDrag(page, source, target) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 15, from.y + from.height / 2, { steps: 6 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 3, to.y + to.height / 2, { steps: 8 });
  await page.mouse.move(to.x + to.width / 3 + 1, to.y + to.height / 2);
  await page.mouse.up();
}
