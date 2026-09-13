import { chromium, firefox } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fixture } from './campaign-command-flow.mjs';
const url=process.env.BASE_URL??'http://127.0.0.1:5223/';
const shots=process.env.SHOT_DIR??'reports/ironmuster-identity';
const browser=await (process.env.E2E_BROWSER==='firefox'?firefox:chromium).launch({headless:true});
await mkdir(shots,{recursive:true});
let count=0;
const check=(label,ok)=>{if(!ok)throw Error(label);console.log(`PASS ${++count}: ${label}`);};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(url);await page.locator('[data-artwork="ready"]').waitFor();
 check('Ironmuster document and home title',await page.title()==='IRONMUSTER'&&await page.getByRole('heading',{name:'IRONMUSTER',exact:true}).isVisible());
 await page.screenshot({path:`${shots}/home.png`});
 await page.getByTestId('home-wiki').click();
 check('wiki carries the new identity',!(await page.locator('body').innerText()).includes('WRECKRIGHT')&&(await page.locator('body').innerText()).includes('IRONMUSTER'));
 await page.screenshot({path:`${shots}/wiki.png`});
 await page.goto(url);await page.getByTestId('home-skirmish').click();
 await page.getByTestId('briefing-deploy').click();await page.getByTestId('briefing').waitFor({state:'hidden'});
 // Stage optical contact for deterministic presentation checks; orders use the actual paper doll.
 await page.evaluate(async url=>{
  const {world,engine,useGame}=globalThis.__ironmuster;
  const {snapshotUnits}=await import(`${url}src/ui/snapshot.ts`);
  const friendly=world.entities.find(unit=>unit.team===world.playerTeam);
  const enemy=world.entities.find(unit=>unit.team!==world.playerTeam&&world.catalog.chassis.get(unit.chassisId).frame==='mech');
  friendly.pos={x:410,y:500};enemy.pos={x:490,y:500};
  world.vision.visible.add(enemy.id);world.vision.identified.add(enemy.id);world.vision.tiles.fill(1);
  engine.renderer.snapshot(world);engine.renderer.snapshot(world);engine.renderer.camera.skipDropIn();engine.renderer.camera.centreOn({x:450,y:500});engine.renderer.camera.distance=230;
  useGame.getState().patch({...snapshotUnits(world,world.playerTeam),selection:[friendly.id],paused:true,orderMode:'called_shot'});
 },url);
 if(!await page.getByTestId('called-shot-target').isVisible())await page.getByTestId('unit-details-toggle').click();
 const called=page.getByTestId('called-shot-target');await called.waitFor();
 await called.getByTestId('doll-left_leg').click();
 check('a real called shot explains conditional leg salvage', (await called.innerText()).includes('One lost leg alone is not a capture')&&await called.getByRole('meter').count()===2);
 const order=await page.evaluate(()=>globalThis.__ironmuster.world.entities.find(unit=>unit.team===globalThis.__ironmuster.world.playerTeam).orders.attack);
 check('called-shot UI actually issues a leg order',order?.calledShot==='left_leg'||order?.location==='left_leg');
 await page.screenshot({path:`${shots}/salvage-intent.png`});
 await called.getByTestId('doll-centre_torso').click();
 check('core targeting changes the consequence shown', (await called.innerText()).includes('Coring ends the threat'));
 await page.evaluate(()=>{const {useGame}=globalThis.__ironmuster;useGame.getState().patch({enemies:[]});});
 check('fog removes tactical salvage advice',await called.getByTestId('salvage-intent').count()===0);
 await page.goto(url);await fixture(page,url,'border_dispute',true);
 await page.evaluate(()=>{
  const raw=JSON.parse(localStorage.getItem('ironline.campaign'));const report=raw.state.history.at(-1);
  report.salvageCandidates=[{designId:'sentinel_brawler',name:'Sentinel',outcome:'centre_torso',chassisChance:.1,recovered:false}];
  localStorage.setItem('ironline.campaign',JSON.stringify(raw));
 });
 await page.reload();await page.getByTestId('home-campaign').click();await page.getByTestId('debrief-recovery').waitFor();
 check('legacy storage loads and failed recovery is explained', (await page.getByTestId('debrief-recovery').innerText()).includes('The recovery roll failed; no hull was added'));
 check('earned opening weapon remains separate from uncertain field salvage', (await page.getByTestId('debrief-contract-rewards').innerText()).includes('Focused Medium Laser'));
 await page.screenshot({path:`${shots}/recovery-receipt.png`});
 check('no browser exceptions',errors.length===0);
 console.log(`${count} Ironmuster identity checks passed`);
}finally{await browser.close();}
