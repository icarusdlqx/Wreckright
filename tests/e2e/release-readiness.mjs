import { chromium, firefox } from 'playwright';
import { mkdir } from 'node:fs/promises';
const url=process.env.E2E_URL??'http://127.0.0.1:5223/';
const shots=process.env.SHOT_DIR??'reports/release-readiness';
await mkdir(shots,{recursive:true});
const browser=await (process.env.E2E_BROWSER==='firefox'?firefox:chromium).launch({headless:true});
let checks=0;
const check=(name,ok)=>{if(!ok)throw Error(name);console.log(`PASS ${++checks}: ${name}`);};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(url);await page.getByTestId('home-campaign').click();
 check('one campaign front door, without a second campaign picker',await page.getByTestId('campaign-chooser').getByRole('heading',{name:'The Great Recall',exact:true}).isVisible()&&await page.getByTestId('campaign-choice').count()===0);
 for(const id of ['aurelian_recall','border_dispute']){
  await page.getByTestId(`company-card-${id}`).click();
  check(`${id}: faction card directly selects the route`,await page.getByTestId(`company-card-${id}`).getAttribute('aria-pressed')==='true');
 }
 await page.screenshot({path:`${shots}/campaign-choice.png`});
 await page.getByTestId('campaign-choice-cancel').click();await page.getByTestId('home-mechbay').click();
 await page.getByTestId('design-picker').waitFor();
 const gadfly=await page.getByTestId('design-picker').locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('Gadfly'))?.value);
 await page.getByTestId('design-picker').selectOption(gadfly);
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:1000});
  await page.locator('.bay-unified-body').evaluate(e=>e.scrollTop=0);
  const geometry=await page.getByTestId('complete-hull-outline').evaluate(svg=>{
   const rect=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
   const points=[...svg.querySelectorAll('polygon')].flatMap(p=>[...p.points].map(p=>({x:p.x,y:p.y})));
   return {full:points.every(p=>p.x>=view.x&&p.x<=view.x+view.width&&p.y>=view.y&&p.y<=view.y+view.height),visible:rect.top>=0&&rect.bottom<innerHeight&&rect.width>80&&rect.height>=120};
  });
  check(`${width}: complete Gadfly outline fits its unobstructed overview`,geometry.full&&geometry.visible);
  check(`${width}: four capacity bars remain visible and no sideways scrolling`,await page.getByTestId('capacity-overview').getByRole('meter').count()===4&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${shots}/gadfly-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByTestId('bay-exit').click();
 // Exhaust the authored relief roster in an isolated save, without changing production content.
 await page.evaluate(async(url)=>{
  const {getCatalog}=await import(`${url}src/schema/load.ts`);
  const {startCampaign,acceptContract}=await import(`${url}src/campaign/campaign.ts`);
  const {availableHires,hirePilot}=await import(`${url}src/campaign/roster.ts`);
  const {serialiseCampaign}=await import(`${url}src/campaign/save.ts`);
  const catalog=getCatalog(),state=startCampaign(catalog,'border_dispute','readiness-wounded','regular');
  for(const pilot of availableHires(catalog,state)){const result=hirePilot(catalog,state,pilot.id);if(!result.ok)throw Error(result.reason);}
  for(const pilot of state.pilots){pilot.recoveryMissions=1;pilot.injuredUntilDay=state.day+1;}
  const result=acceptContract(catalog,state,'militia_raid','standard');if(!result.ok)throw Error(result.reason);
  localStorage.setItem('ironline.campaign',serialiseCampaign(state));
 },url);
 await page.reload();await page.getByTestId('home-campaign').click();
 await page.screenshot({path:`${shots}/crew-before.png`});
 await page.getByTestId('crew-stand-down-confirm').waitFor();
 check('entirely wounded company can reach recovery without a fit deployment',await page.getByTestId('crew-stand-down-confirm').isEnabled());
 await page.getByTestId('crew-stand-down-confirm').click();
 const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('ironline.campaign')).state);
 check('forfeiting a mission recovers wounded pilots without awarding victory or salvage',recovered.pilots.every(p=>p.recoveryMissions===0)&&recovered.history.at(-1).won===false&&recovered.history.at(-1).payout===0);
 await page.screenshot({path:`${shots}/crew-recovery.png`});
 console.log(`${checks} release readiness checks passed`);
} finally {await browser.close();}
