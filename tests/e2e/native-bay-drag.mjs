/** Drag from a visible grip; a tall shelf card's centre may be clipped by its scrollport. */
export async function nativeBayDrag(page, source, target) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const from = await source.evaluate(element => {
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    if (right <= left || bottom <= top) throw new Error('Drag source has no visible grip');
    return { x: left + Math.min(60, (right - left) / 2), y: top + Math.min(20, (bottom - top) / 2) };
  });
  const before = await target.boundingBox();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 20, from.y, { steps: 6 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const held = await target.boundingBox();
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 3, to.y + to.height / 2, { steps: 8 });
  await page.mouse.move(to.x + to.width / 3 + 1, to.y + to.height / 2);
  await page.mouse.up();
  return { before, held, stable: before !== null && held !== null
    && ['x', 'y', 'width', 'height'].every(key => Math.abs(before[key] - held[key]) <= 1) };
}
