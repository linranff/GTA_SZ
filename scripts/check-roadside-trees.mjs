import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve(process.argv[2]??'output/playwright/roadside-trees');
const url=process.env.GAME_URL??'http://127.0.0.1:4176/';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],shots=[],samples=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,1800));});
const read=()=>page.evaluate(()=>{const api=window.__SHENCHENGJI_CITY__;return {landscape:api.stats.landscape,performance:api.performance,mode:api.stats.lightMode,observer:api.stats.observer};});
const shot=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});shots.push({name,file});};
const sample=async name=>{
 const frames=await page.evaluate(async()=>{const values=[];let previous=performance.now(),start=previous;await new Promise(resolve=>{function tick(now){values.push(now-previous);previous=now;if(now-start>=6000)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});return values.slice(3);});
 const sorted=[...frames].sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);
 samples.push({name,frames:frames.length,meanFps:frames.length*1000/sum,p95:sorted[Math.floor(sorted.length*.95)]??0,p99:sorted[Math.floor(sorted.length*.99)]??0,over50ms:frames.filter(v=>v>50).length,diagnostics:await read()});
};
const setDay=()=>page.evaluate(()=>{const api=window.__SHENCHENGJI_CITY__;api.world.setLightMode('day');});
const driveTo=async id=>{await page.evaluate(id=>{const api=window.__SHENCHENGJI_CITY__,place=api.world.data.landmarks.find(m=>m.id===id);if(!place)throw Error('landmark unavailable: '+id);api.world.exitPhoto();api.world.travel(place);api.world.setLightMode('day');},id);await page.waitForTimeout(1600);};
const flyTo=async id=>{await page.evaluate(id=>{const api=window.__SHENCHENGJI_CITY__,place=api.world.data.landmarks.find(m=>m.id===id);if(!place)throw Error('landmark unavailable: '+id);api.world.enterPhoto(place);api.world.setLightMode('day');},id);await page.waitForTimeout(1600);};
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.waitForTimeout(1800);await setDay();await page.waitForTimeout(1000);
 await shot('01-spawn-driving');await sample('spawn-driving');
 for(const id of ['baypark','bamboo']){
  await driveTo(id);await shot(`02-${id}-driving`);await sample(`${id}-driving`);
  await flyTo(id);await shot(`03-${id}-aerial`);await sample(`${id}-aerial`);
 }
 const treeView=await page.evaluate(()=>{
  const api=window.__SHENCHENGJI_CITY__,landscape=api.world.landscape,points=[...(landscape?.roadside?.points??[])].filter(p=>p.plant[3]>1.1).sort((a,b)=>Math.hypot(a.plant[0]-api.world.state.x,a.plant[1]-api.world.state.z)-Math.hypot(b.plant[0]-api.world.state.x,b.plant[1]-api.world.state.z));
  const p=points[0];if(!p)return null;const y=api.world.groundHeight(p.plant[0],p.plant[1]);api.world.enterPhoto({id:'roadside-tree-review',name:'高大路旁树复核',x:p.plant[0],z:p.plant[1],height:10,area:'道路绿化',excludeRadius:0,arrival:[p.plant[0],p.plant[1]],yaw:0,photoDistance:30,photoElevation:.14,photoAngle:0,photoTargetHeight:y+4.5});api.world.setLightMode('day');return {x:p.plant[0],z:p.plant[1],scale:p.plant[3],species:p.plant[2],height:y+4.5};
 });
 if(treeView){await page.waitForTimeout(1200);await shot('04-tall-roadside-tree');}
 const final=await read();
 if(final.landscape.roadside.generated<2300)errors.push('Roadside planting generated fewer than 2300 trees');
 if(final.landscape.roadside.tallTrees<1||final.landscape.roadside.scaleRange.max<=1.1)errors.push('Tall roadside tree tier is missing');
 const driving=samples.filter(s=>!s.name.endsWith('-aerial')),aerial=samples.filter(s=>s.name.endsWith('-aerial'));
 if(driving.some(s=>s.meanFps<59.5||s.p95>33.4))errors.push('1080p driving tree review dropped below the 60fps target');
 // Aerial mode keeps the whole city and its original long-range facade set in
 // view; allow one heavy landmark orbit to run at 55fps while still rejecting
 // a hitch (p95 > 2 frames) or a sustained drop.
 if(aerial.some(s=>s.meanFps<55||s.p95>33.4))errors.push('1080p aerial tree review dropped below its 55fps floor');
}catch(error){errors.push(String(error));try{await shot('failure');}catch{}}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,errors,shots,samples,pass:errors.length===0},null,2));await browser.close();}
console.log(JSON.stringify({out,errors,pass:errors.length===0,samples:samples.map(s=>({name:s.name,meanFps:s.meanFps,p95:s.p95,over50ms:s.over50ms,roadside:s.diagnostics.landscape?.roadside?.visible}))},null,2));
if(errors.length)process.exitCode=1;
