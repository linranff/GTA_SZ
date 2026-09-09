/** Fixed-camera GPU review of the actual development game. The temporary
 * browser response hook exposes its world only in this test page; no test
 * controls or camera changes are shipped to players. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const label=process.argv[2]??'review';
const out=`output/playwright/local-light-study/${label}`;
const scout=process.argv.includes('--scout');
const checksOnly=process.argv.includes('--checks-only');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],shots=[],checks=[];
let hooked=false,phase='loading';
page.on('pageerror',e=>errors.push(phase+': '+String(e)));
page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Error compiling|feedback loop/i.test(m.text()))errors.push(phase+': '+m.text().slice(0,5000));});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
page.on('crash',()=>errors.push('Test renderer crashed'));
await page.route('**/src/main.ts*',async route=>{
 const response=await route.fetch();const body=await response.text();
 const rewritten=body.replace(/world\s*=\s*new DrivingWorld\(canvas\);/,match=>{hooked=true;return match+' window.__LOCAL_LIGHT_REVIEW__ = world;';});
 await route.fulfill({response,body:rewritten});
});
const cases=[
 {id:'bamboo-base',place:'bamboo',eye:[-5110,3,-1265],target:[-5146,12,-1216.62]},
 {id:'bamboo-facade',place:'bamboo',eye:[-5072,24,-1280],target:[-5146,38,-1216.62]},
 {id:'baypark-plaza',place:'baypark',eye:[-2395,3,-867],target:[-2350,1,-849]},
 {id:'baypark-shore',place:'baypark',eye:[-2282,1.9,-854],target:[-2236,.2,-835]},
];
const select=process.env.STUDY_CASE;
const modes=(process.env.STUDY_MODES??(scout?'day,night':'day,sunset,night')).split(',');
const read=()=>page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__,p=w.performance(),a=window.__LOCAL_LIGHT_METRICS__??[],avg=k=>a.length?a.reduce((s,v)=>s+v[k],0)/a.length:null;return {mode:w.lightMode,pose:w.observer.status,camera:w.camera.position.asArray(),observerActive:w.observer.active,performance:{meanFps:p.meanFps,p50:p.p50,p95:p.p95,p99:p.p99,samples:p.samples,gpuMs:p.gpuMs,gpuSmoothedMeanMs:avg('gpu'),drawCalls:p.drawCalls,meanDrawCalls:avg('draw'),renderTargetsMs:p.renderTargetsMs,meanRenderTargetsMs:avg('rt'),resolution:p.resolution,triangles:p.triangles},bamboo:w.bambooLook?.stats(),baypark:w.bayparkLook?.stats(),lighting:w.localLighting?.stats()};});
const pose=shot=>page.evaluate(s=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.enterPhoto(w.data.landmarks.find(l=>l.id===s.place));const [x,y,z]=s.target,[ex,ey,ez]=s.eye,d=Math.hypot(x-ex,y-ey,z-ez);w.observer.begin({x,y,z},d,-Math.atan2(x-ex,z-ez),Math.asin((ey-y)/d));w.keys.clear();w.cull();w.vegetation();},shot);
function checkBudget(record){const l=record.lighting;if(!l||!Number.isFinite(l.regionWeight)||l.activeLights>2||l.activeShadowMaps>1||l.casters>48||l.slotOverflows||(l.maxReceiverLightCapacity??0)>10)throw Error('Local light budget/coordinate failure: '+record.name);}
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 if(!hooked||!await page.evaluate(()=>!!window.__LOCAL_LIGHT_REVIEW__))throw Error('Requires the development game source, not a stale bundled preview');
 console.log('READY '+label);
 checks.push({name:'render-device',...await page.evaluate(()=>({device:window.__LOCAL_LIGHT_REVIEW__.engine.getGlInfo()}))});
 if(process.env.STUDY_LOCAL_INTENSITY)await page.evaluate(async value=>{const {LOCAL_LIGHTING}=await import('/src/city-local-lighting.ts');LOCAL_LIGHTING.nightIntensity=value;},Number(process.env.STUDY_LOCAL_INTENSITY));
 await page.addStyleTag({content:'#ui,#ui *,#toast{visibility:hidden!important;opacity:0!important}'});
 await page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.scene.onAfterRenderObservable.add(()=>{if(!window.__LOCAL_LIGHT_METRICS__||w.samples.length<=120)return;window.__LOCAL_LIGHT_METRICS__.push({gpu:w.gpuInstrumentation.gpuFrameTimeCounter.lastSecAverage/1e6,draw:w.instrumentation.drawCallsCounter.current,rt:w.instrumentation.renderTargetsRenderTimeCounter.current});});});
 for(const shot of cases.filter(s=>!checksOnly&&(!select||s.id===select))){
  phase=shot.id+'-setup';
  await pose(shot);
  for(const mode of modes){
   phase=shot.id+'-'+mode+'-mode';
   await page.evaluate(mode=>window.__LOCAL_LIGHT_REVIEW__.setLightMode(mode),mode);
   for(const enabled of (scout?[true]:[false,true])){
    phase=shot.id+'-'+mode+'-'+(enabled?'after':'before');
    await page.evaluate(enabled=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.bambooLook?.setEnabled(enabled);w.bayparkLook?.setEnabled(enabled);w.localLighting?.setEnabled(enabled);w.cull();},enabled);
    await page.waitForTimeout(mode==='day'?3500:1800);
    const name=`${shot.id}-${mode}-${scout?'scout':enabled?'after':'before'}`;
    await page.screenshot({path:`${out}/${name}.png`});
    if(!scout){await page.evaluate(()=>{window.__LOCAL_LIGHT_REVIEW__.samples=[];window.__LOCAL_LIGHT_METRICS__=[];});await page.waitForTimeout(Number(process.env.STUDY_SAMPLE_MS)||6500);}
    const record={name,...await read()};shots.push(record);checkBudget(record);
    console.log(JSON.stringify({name,perf:record.performance,lights:record.lighting?.activeLights??null}));
   }
  }
 }
 if(!scout){
  // Keep night lighting active while testing real pointer/keyboard movement,
  // then verify that altitude and region exits actually release its budget.
  phase='night-local-active';await page.evaluate(()=>window.__LOCAL_LIGHT_REVIEW__.setLightMode('night'));
  await pose(cases[2]);await page.waitForTimeout(3500);
  const active={name:'night-local-active',...await read()};checks.push(active);checkBudget(active);
  active.receiverProbe=await page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__;return w.scene.lights.filter(l=>l.name.startsWith('sample-local-lamp')).map(l=>({light:l.name,treeReceivers:l.includedOnlyMeshes.filter(m=>/landscape|island|tree/i.test(m.name+' '+m.material?.name)).map(m=>({name:m.name,material:m.material?.name,type:m.material?.getClassName(),lightBudget:m.material?.maxSimultaneousLights,lights:m.lightSources?.map(q=>q.name),receiveShadows:m.receiveShadows}))}));});
  if(active.lighting.activeLights!==2||active.lighting.activeShadowMaps!==1)throw Error('Night fixture lighting did not activate');
  phase='moving-camera';await page.mouse.move(900,450);await page.mouse.down({button:'right'});await page.mouse.move(1180,480,{steps:24});await page.mouse.up({button:'right'});
  await page.keyboard.down('w');await page.waitForTimeout(1800);await page.keyboard.up('w');checks.push({name:'moving-camera',...await read()});
  for(const enabled of [false,true]){
   phase='night-moving-'+(enabled?'after':'before');await pose(cases[2]);
   await page.evaluate(v=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.bambooLook.setEnabled(v);w.bayparkLook.setEnabled(v);w.localLighting.setEnabled(v);w.cull();},enabled);
   await page.waitForTimeout(3000);await page.evaluate(()=>{window.__LOCAL_LIGHT_REVIEW__.samples=[];window.__LOCAL_LIGHT_METRICS__=[];});
   await page.keyboard.down('w');await page.waitForTimeout(6500);await page.keyboard.up('w');
   const record={name:phase,...await read()};checks.push(record);console.log(JSON.stringify({name:phase,perf:record.performance,lights:record.lighting.activeLights}));
  }
  phase='high-altitude-fade';await page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.observer.focus.y=250;});await page.waitForTimeout(2400);
  const high={name:'high-altitude-fade',...await read()};checks.push(high);
  if(high.lighting.activeLights||high.lighting.activeShadowMaps||high.lighting.receiverMaterials)throw Error('High-altitude light budget not released');
  phase='outside-region';await page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.travel(w.data.landmarks.find(l=>l.id==='civic'));});await page.waitForTimeout(2400);
  const outside={name:'outside-region',...await read()};checks.push(outside);
  if(outside.lighting.regionWeight!==0||outside.lighting.activeLights||outside.lighting.receiverMaterials)throw Error('Outside-region light budget not released');
  phase='night-driving-and-braking';await page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__;w.travel(w.data.landmarks.find(l=>l.id==='baypark'));});await page.waitForTimeout(2500);
  await page.keyboard.down('w');await page.waitForTimeout(2500);await page.keyboard.up('w');await page.keyboard.down('Space');await page.waitForTimeout(900);await page.keyboard.up('Space');
  checks.push({name:'night-driving-and-braking',...await read()});
  const excluded=await page.evaluate(()=>{const w=window.__LOCAL_LIGHT_REVIEW__;return w.scene.lights.filter(l=>l.name.startsWith('sample-local-lamp')).flatMap(l=>l.includedOnlyMeshes.filter(m=>/terrain_water|living-bay|bay-horizon|horizon-water|atmosphere/i.test(m.name)).map(m=>m.name));});
  if(excluded.length)throw Error('Local lights leaked onto sky/water: '+excluded.join(','));
  for(const mode of ['day','sunset','night']){phase='driving-mode-'+mode;await page.evaluate(m=>window.__LOCAL_LIGHT_REVIEW__.setLightMode(m),mode);await page.waitForTimeout(1400);checks.push({name:phase,...await read()});}
  for(const record of checks.filter(c=>c.lighting))checkBudget(record);
 }
}catch(e){errors.push(String(e));try{await page.screenshot({path:`${out}/failure.png`});}catch{}}
finally{
 const hashes={};for(const file of ['src/city-world.ts','src/city-local-lighting.ts','src/city-bamboo-look.ts','src/city-baypark-look.ts','public/city/landmarks.glb','public/city/terrain.glb','public/city/coastal-shoreline.glb'])try{hashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');}catch{}
 await fs.writeFile(`${out}/report.json`,JSON.stringify({date:new Date().toISOString(),browser:await browser.version(),scope:'1920x1080 Chrome Metal, current development game. Matched stationary cameras and short movement checks; not a city-wide sustained performance certification.',label,scout,checksOnly,localIntensityOverride:Number(process.env.STUDY_LOCAL_INTENSITY)||null,hashes,errors:[...new Set(errors)],shots,checks,visualReview:'pending'},null,2));
 await browser.close();console.log(JSON.stringify({out,errors:[...new Set(errors)],shots:shots.length}));
}
if(errors.length)process.exitCode=1;
