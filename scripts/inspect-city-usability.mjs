/** Current-asset 1080p review. World access is injected only into this test
 * browser's development response; no test coordinates ship in the product. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/city-usability';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],checks=[],shots=[],performanceSamples=[];let phase='loading';
const check=(name,pass,details)=>{checks.push({name,pass,details});if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push({phase,message:String(e)}));
page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Error compiling|feedback loop/i.test(m.text()))errors.push({phase,message:m.text().slice(0,1800)});});
page.on('response',r=>{if(r.status()>=400)errors.push({phase,status:r.status(),url:r.url()});});
await page.route('**/src/main.ts*',async route=>{
 const response=await route.fetch(),body=(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__CITY_USABILITY__=world;');
 await route.fulfill({response,body});
});
let releaseBuildings;const buildingsGate=new Promise(resolve=>{releaseBuildings=resolve;});
await page.route('**/city/buildings.glb',async route=>{await buildingsGate;await route.continue();});
let releaseHubs;const hubsGate=new Promise(resolve=>{releaseHubs=resolve;});
await page.route('**/city/life-hub.glb',async route=>{await hubsGate;await route.continue();});
await page.addInitScript(()=>{
 window.__LOAD_PROGRESS__=[];
 new MutationObserver(()=>{const bar=document.querySelector('.city-loader-progress');if(!bar)return;const p=Number(bar.getAttribute('aria-valuenow'));const list=window.__LOAD_PROGRESS__;if(p!==list.at(-1)?.p)list.push({p,time:performance.now(),stage:document.querySelector('.city-loader-status')?.textContent});}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-valuenow']});
});
const snap=async name=>{await page.screenshot({path:`${out}/${name}.png`});shots.push(name);};
const pose=async shot=>page.evaluate(s=>{
 const w=window.__CITY_USABILITY__;w.enterPhoto(w.data.landmarks.find(m=>m.id===s.place));
 const [x,y,z]=s.target,[ex,ey,ez]=s.eye,d=Math.hypot(x-ex,y-ey,z-ez);
 w.observer.begin({x,y,z},d,-Math.atan2(x-ex,z-ez),Math.asin((ey-y)/d));w.keys.clear();w.cull();w.vegetation();
},shot);
const read=()=>page.evaluate(()=>{const w=window.__CITY_USABILITY__;return {performance:w.performance(),landscape:w.landscape.stats,autopilot:w.autopilot.status,state:{...w.state},road:w.locationRoadName()};});
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.city-loader-status')?.textContent==='正在载入南山、福田、罗湖建筑',null,{timeout:150000});
 await snap('01-loading');await page.keyboard.press('w');
 const loading=await page.evaluate(()=>({p:Number(document.querySelector('.city-loader-progress').getAttribute('aria-valuenow')),keys:[...window.__CITY_USABILITY__.keys]}));
 check('loading reports real unfinished stages and blocks driving input',loading.p>0&&loading.p<100&&!loading.keys.length,loading);
 releaseBuildings();await page.waitForFunction(()=>document.querySelector('.city-loader-status')?.textContent==='正在准备你的城市生活',null,{timeout:180000});
 await page.waitForTimeout(800);
 const pending=await page.evaluate(()=>({progress:Number(document.querySelector('.city-loader-progress')?.getAttribute('aria-valuenow')),ready:!!window.__SHENCHENGJI_CITY__?.ready,hubs:window.__CITY_USABILITY__.propObstacles.length}));
 check('loading waits for delayed life hub assets',pending.progress<100&&!pending.ready&&pending.hubs===0,pending);releaseHubs();
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 check('life hubs and collision exist before loading completes',await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.lifeHubs.length===window.__SHENCHENGJI_CITY__.stats.careerSites.length));
 await page.locator('#city-loading').waitFor({state:'detached'});await page.waitForTimeout(4000);
 const progress=await page.evaluate(()=>window.__LOAD_PROGRESS__);
 check('loading stages are monotonic and reach 100 after boot',progress.at(-1).p===100&&progress.every((p,i)=>!i||p.p>=progress[i-1].p),progress);
 phase='tips';await snap('02-driving-tips');
 check('bottom driving tips are visible',await page.locator('.city-quicktips').isVisible(),await page.locator('.city-quicktips-line').innerText());
 await page.keyboard.press('?');await page.locator('.city-quicktips-help').waitFor({state:'visible'});await snap('03-expanded-controls');
 await page.keyboard.press('Escape');
 check('Escape closes help without opening pause',!await page.locator('.city-quicktips-help').isVisible()&&!await page.locator('#pause').isVisible());
 await page.keyboard.press('f');await page.locator('.city-quicktips[data-mode=walking]').waitFor({state:'visible'});
 check('walking tips match walking controls',await page.locator('.city-quicktips').getAttribute('data-mode')==='walking');
 await page.keyboard.press('f');await page.locator('.city-quicktips[data-mode=driving]').waitFor({state:'visible'});await page.keyboard.press('g');await page.locator('.city-quicktips[data-mode=observer]').waitFor({state:'visible'});
 check('observer uses compact tips instead of large help',await page.locator('.city-quicktips').getAttribute('data-mode')==='observer'&&!await page.locator('#observer-help').isVisible());
 phase='road-labels';
 const names=await page.evaluate(()=>{const w=window.__CITY_USABILITY__,r=w.data.roads.filter(r=>r.name==='支路'&&r.displayName?.includes('附近')).sort((a,b)=>Math.hypot(a.points[0][0]-w.state.x,a.points[0][1]-w.state.z)-Math.hypot(b.points[0][0]-w.state.x,b.points[0][1]-w.state.z))[0];const p=r.points[Math.floor(r.points.length/2)];w.observer.begin({x:p[0],y:w.groundHeight(...p)+4,z:p[1]},150,0,.5);w.cull();w.vegetation();return {source:r.name,display:r.displayName,expected:w.locationRoadName()};});
 await page.waitForFunction(()=>document.querySelector('#road-name')?.textContent===window.__CITY_USABILITY__.locationRoadName(),null,{timeout:30000});
 check('overhead minimap follows viewed location with contextual road name',await page.locator('#road-name').innerText()===names.expected&&names.expected!=='支路',names);
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await page.locator('#map-search').fill('附近');await page.waitForTimeout(500);
 check('contextual roads are searchable in map',await page.locator('#places [data-id]').count()>0);await snap('04-map-contextual-roads');
 await page.keyboard.press('Escape');
 phase='grass';
 const grass=await page.evaluate(async()=>{
  const w=window.__CITY_USABILITY__,{inRing,stepCar}=await import('/src/driving.ts');
  w.exitPhoto();if(w.walk.active)w.walk.active=false;w.cancelAutoDrive('qa');w.paused=false;w.keys.clear();
  let start=null;
  for(const g of w.data.green){
   const ring=g.rings[0];if(ring.length<3)continue;const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
   const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
   for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    let safe=true;
    for(let d=0;d<=55;d+=2){const x=cx+Math.sin(yaw)*d,z=cz+Math.cos(yaw)*d,n=w.collision.nearest(x,z);
     if(!inRing(x,z,ring)||g.rings.slice(1).some(r=>inRing(x,z,r))||w.collision.blocked(x,z)||w.propBlocked(x,z)||(n&&n.d<n.road.width/2+3)||w.traffic.cars.some(c=>Math.hypot(c.x-x,c.z-z)<5)){safe=false;break;}}
    if(safe){start={x:cx,z:cz,yaw,speed:43,steer:0,distance:0};break;}
   }if(start)break;
  }
  if(!start)throw Error('No clear real grass corridor found');
  Object.assign(w.state,start);const expected={...start};w.keys.add('KeyW');
  for(let i=0;i<60;i++){stepCar(expected,{throttle:1,steer:0,handbrake:false},1/60);w.update(1/60);}
  w.keys.clear();w.paused=true;return {start,actual:{...w.state},expected,offroad:w.offroad};
 });
 check('real grass driving retains road acceleration and speed',grass.offroad&&Math.abs(grass.actual.speed-grass.expected.speed)<1e-8&&grass.actual.speed>43,grass);
 phase='roadside';
 const scenes=[{name:'baypark',place:'baypark',eye:[-2298,4.5,-835],target:[-2294,3,-793]},{name:'bamboo',place:'bamboo',eye:[-5067,5,-1333],target:[-5102,5,-1265]}];
 for(const s of scenes){
  await pose(s);await page.evaluate(()=>window.__CITY_USABILITY__.setLightMode('day'));await page.waitForTimeout(8000);
  for(const enabled of [false,true]){
   await page.evaluate(enabled=>{const w=window.__CITY_USABILITY__;w.landscape.configureRoadside(w.data,{collisionFootprints:w.detailManifest?.collisionFootprints,bridgeCrossings:w.coastal?.manifest.crossings,blocked:(x,z)=>w.collision.blocked(x,z)||w.propBlocked(x,z),maxTrees:enabled?2400:0});w.vegetation();w.cull();},enabled);
   await page.waitForTimeout(5000);await snap(`05-${s.name}-${enabled?'after':'before'}`);
   await page.evaluate(()=>{window.__CITY_USABILITY__.samples=[];});await page.waitForTimeout(6500);
   const sample={name:s.name,enabled,...await read()};performanceSamples.push(sample);console.log(JSON.stringify({phase:'roadside',name:s.name,enabled,fps:sample.performance.meanFps,p95:sample.performance.p95,gpu:sample.performance.gpuMs,planting:sample.landscape.roadside.visible}));
   check(`${s.name} tree counts stay within budget ${enabled}`,sample.landscape.roadside.visible.near<=12&&sample.landscape.roadside.visible.far<=80&&(!enabled||sample.landscape.roadside.generated>0),sample.landscape);
  }
 }
 phase='autopilot';
 await page.evaluate(()=>{const w=window.__CITY_USABILITY__;w.exitPhoto();w.walk.active=false;w.keys.clear();w.paused=false;Object.assign(w.state,{x:-4782.295,z:-483.345,yaw:3.1294456195559732,speed:0,steer:0,distance:0});w.car.position.set(w.state.x,w.groundHeight(w.state.x,w.state.z)+.115,w.state.z);w.cameraYaw=w.state.yaw;w.cull();w.startAutoDrive({id:'qa-return',name:'高新南环路 · 原路返回',arrival:[-4782.780869412773,-443.34795097243136]});});
 let reverseFrames=0,turnShot=false,result;
 for(let second=0;second<80;second++){
  await page.waitForTimeout(1000);result=await read();if(result.state.speed<-.1)reverseFrames++;
  if(result.autopilot.phase==='maneuvering'&&!turnShot){await snap('06-automatic-u-turn');turnShot=true;}
  if(second%10===0)console.log(JSON.stringify({phase:'autopilot',second,status:result.autopilot.phase,speed:result.state.speed,remaining:result.autopilot.remainingDistance}));
  if(['arrived','blocked'].includes(result.autopilot.phase))break;
 }
 check('real game executes a reverse U-turn and parks at destination',result.autopilot.phase==='arrived'&&result.autopilot.maneuvers>0&&reverseFrames>0&&Math.abs(result.state.speed)<.25,{result,reverseSamples:reverseFrames});
 phase='render-regression';await pose(scenes[0]);
 for(const mode of ['night','sunset','day']){await page.evaluate(m=>window.__CITY_USABILITY__.setLightMode(m),mode);await page.waitForTimeout(1600);}
 const device=await page.evaluate(()=>window.__CITY_USABILITY__.engine.getGlInfo());check('rendering has no WebGL errors',errors.length===0,{device,errors});
}catch(error){errors.push({phase,type:'check',message:String(error)});console.error(error);try{await snap('failure-'+phase);}catch{}}
finally{releaseBuildings();releaseHubs();await fs.writeFile(`${out}/report.json`,JSON.stringify({date:new Date().toISOString(),checks,errors,shots,performanceSamples,pass:!errors.length&&checks.every(c=>c.pass)},null,2));await browser.close();}
console.log(JSON.stringify({out,checks:checks.map(c=>({name:c.name,pass:c.pass})),errors}));
if(errors.length||checks.some(c=>!c.pass))process.exitCode=1;
