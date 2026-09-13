import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const url = process.env.E2E_URL ?? 'http://127.0.0.1:5223/';
const shots = process.env.SHOT_DIR ?? 'reports/variants';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (name, ok) => { if (!ok) throw Error(name); console.log(`PASS ${++checks}: ${name}`); };
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
 await page.goto(url); await page.getByTestId('home-mechbay').click();
 await page.getByTestId('bay-readiness').waitFor();
 for (const width of [1600, 1280, 1024, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  const geometry = await page.locator('.bay-location').evaluateAll(elements => Object.fromEntries(elements.map(element => {
   const box = element.getBoundingClientRect();
   return [element.getAttribute('data-testid').replace('bay-location-', ''), {x:box.x, y:box.y, cx:box.x+box.width/2}];
  })));
  check(`${width}: arms, torso and legs keep their named screen sides`, ['arm','torso','leg'].every(part=> geometry[`left_${part}`].x < geometry[`right_${part}`].x));
  check(`${width}: head is centred over the torso and legs are below it`, Math.abs(geometry.head.cx-geometry.centre_torso.cx)<2 && geometry.head.y<geometry.centre_torso.y && geometry.left_leg.y>geometry.centre_torso.y && geometry.right_leg.y>geometry.centre_torso.y);
  check(`${width}: no sideways page overflow`, await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.setViewportSize({ width:1600, height:1000 });
 await page.locator('.bay-unified-body').evaluate(element=>element.scrollTop=0);
 const meters = await page.locator('.weapon-card').first().locator('[role="meter"]').evaluateAll(elements=>elements.map(element=>{
  const rect=element.getBoundingClientRect(); const parent=element.parentElement.getBoundingClientRect();
  return {valid:Number(element.getAttribute('aria-valuenow'))<=Number(element.getAttribute('aria-valuemax')), oneRow:parent.height<25, width:rect.width};
 }));
 check('weapon cards show three readable graphical meters directly beside their values', meters.length===3 && meters.every(m=>m.valid&&m.oneRow&&m.width>50));
 check('weapon cards retain artwork and descriptions without a separate inspector', await page.locator('.weapon-card').first().locator('.weapon-glyph').count()===1 && (await page.locator('.weapon-card__description').first().innerText()).length>15 && await page.locator('#bay-shelf-inspector').count()===0);
 await page.screenshot({path:`${shots}/after.png`});
 await page.getByTestId('bay-location-left_leg').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${shots}/after-legs.png`});
 await page.getByTestId('bay-save').click();
 await page.getByTestId('bay-save-name').fill('Protected Variant');
 await page.evaluate(()=>{
  globalThis.__variantSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key,value) {
   if(key.startsWith('ironline.design.')) throw new DOMException('Full','QuotaExceededError');
   return globalThis.__variantSetItem.call(this,key,value);
  };
 });
 await page.getByTestId('bay-save-confirm').click();
 check('failed variant save shows its reason inside the open dialog', await page.getByTestId('bay-save-dialog').getByRole('alert').isVisible());
 check('failed variant save does not create a partial blueprint', await page.evaluate(()=>localStorage.getItem('ironline.design.protected_variant')===null));
 await page.evaluate(()=>{Storage.prototype.setItem=globalThis.__variantSetItem;});
 await page.getByTestId('bay-save-confirm').click();
 await page.getByTestId('bay-save-dialog').waitFor({state:'hidden'});
 check('retry saves the same named blueprint without losing its weapons', await page.evaluate(()=>JSON.parse(localStorage.getItem('ironline.design.protected_variant')).mounts.length>0));
 await page.getByTestId('design-picker').selectOption('sentinel_brawler');
 await page.getByTestId('remove-weapon-0').click();
 await page.getByTestId('bay-exit').click();
 await page.getByTestId('bay-unsaved-save').click();
 await page.getByTestId('home-mechbay').waitFor();
 check('Save and leave gives an unnamed Prime edit its own variant designation', await page.evaluate(()=>{
  const variant=JSON.parse(localStorage.getItem('ironline.design.sentinel_field_fit'));
  return variant?.name==='Sentinel Field Fit' && localStorage.getItem('ironline.design.sentinel_brawler')===null;
 }));
 console.log(`${checks} layout and save checks passed`);
} finally { await browser.close(); }
