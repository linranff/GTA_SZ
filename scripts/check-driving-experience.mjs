import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.env.EXPERIENCE_OUT??'output/playwright/driving-experience');
const visualOnly=process.argv.includes('--visual-only');
await fs.mkdir(out,{recursive:true});
const errors=[],checks=[],screenshots=[];let phase='launch';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>errors.push({phase,type:'pageerror',message:String(e)}));
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push({phase,type:m.type(),message:m.text().slice(0,1000)});});
page.on('response',r=>{if(r.status()>=400)errors.push({phase,type:'http',url:r.url(),status:r.status()});});
const read=()=>page.evaluate(()=>{const api=window.__SHENCHENGJI_CITY__;return {state:api.state,cockpit:api.stats.cockpit,audio:api.stats.audio,tailLights:api.stats.tailLights,autopilot:api.stats.autopilot,performance:api.performance,landscape:api.stats.landscape,streetFurniture:api.stats.streetFurniture,vehicleMaterials:api.stats.vehicleMaterials,cinematic:api.stats.cinematic,observer:api.stats.observer};});
const snap=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});screenshots.push({name,file,state:await read()});};
const check=(name,passed,details)=>{checks.push({name,passed,details});if(!passed)throw Error(name+' failed');};
let final=null,raf=null;
try{
 phase='load';await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});await page.waitForTimeout(1800);
 await page.locator('#game').click({position:{x:900,y:580}});await page.waitForTimeout(600);await snap('01-opening');
 await page.keyboard.press('v');await page.waitForTimeout(1500);await snap('01a-vehicle-finish');await page.keyboard.press('v');
 await page.keyboard.press('l');await page.waitForTimeout(600);await snap('01b-opening-night');await page.keyboard.press('g');await page.waitForTimeout(3000);await page.keyboard.down('ArrowUp');await page.waitForTimeout(1600);await page.keyboard.up('ArrowUp');await page.waitForTimeout(400);await snap('01c-night-stars');await page.keyboard.press('g');await page.keyboard.press('l');await page.waitForTimeout(500);
 phase='cockpit';await page.keyboard.press('c');await page.waitForTimeout(300);
 check('C enters a real cockpit',(await read()).cockpit?.active===true,(await read()).cockpit);
 await snap('02-cockpit-stationary');await page.keyboard.press('l');await page.waitForTimeout(300);await snap('02b-cockpit-night');await page.keyboard.press('l');await page.keyboard.down('w');await page.waitForTimeout(2000);await page.keyboard.up('w');await page.waitForTimeout(160);await snap('03-cockpit-moving');
 const moving=await read();check('Driving generates audio',moving.audio?.state==='running'&&moving.audio?.rms>0.00001,moving.audio);
 await page.keyboard.down(' ');await page.waitForTimeout(1800);await page.keyboard.up(' ');
 await page.keyboard.press('c');await page.keyboard.press('c');await page.waitForTimeout(500);
 phase='taillights';await page.keyboard.press('l');await page.keyboard.down(' ');await page.waitForTimeout(180);const braking=await read();check('Rear lamps illuminate real receivers',braking.tailLights?.castsOnRoad&&braking.tailLights?.braking,braking.tailLights);await snap('04-tail-road-light-braking');await page.keyboard.up(' ');await page.keyboard.down(' ');await page.waitForTimeout(300);await page.keyboard.up(' ');await page.keyboard.press('l');
 phase='map';await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await page.waitForTimeout(500);await snap('05-map-overview');const beforeMap=(await read()).state;
 await page.locator('#map-search').fill('腾讯');await page.waitForTimeout(250);await page.locator('#places [data-id="tencent"]').click();await snap('06-map-selected');
 const afterMap=(await read()).state;check('Choosing destination does not teleport',Math.hypot(beforeMap.x-afterMap.x,beforeMap.z-afterMap.z)<.01,{beforeMap,afterMap});
 phase='autopilot-takeover';await page.locator('#auto-drive').click();await page.waitForTimeout(2500);check('Automatic driving engages',(await read()).autopilot?.active===true,(await read()).autopilot);
 await page.keyboard.press('a');await page.waitForTimeout(200);check('Manual steering takes control',(await read()).autopilot?.phase==='cancelled',(await read()).autopilot);
 if(!visualOnly){
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await page.locator('#auto-drive').click();
 phase='autopilot-route';
 // Only independent read-only observations during the route. The car controller
 // and collisions run in the product; this test never changes game coordinates.
 await page.evaluate(()=>{const data={last:performance.now(),frames:[],start:performance.now(),active:true};window.__experienceTiming=data;function tick(now){if(!data.active)return;data.frames.push(now-data.last);data.last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
 const start=(await read()).state;let elapsed=0;
 for(;elapsed<420;elapsed+=5){await page.waitForTimeout(5000);const s=await read();if(elapsed%30===0)console.log(JSON.stringify({elapsed,phase:s.autopilot?.phase,remaining:s.autopilot?.remainingDistance,speed:s.state.speed}));if(s.autopilot?.phase==='arrived')break;if(s.autopilot?.phase==='blocked')throw Error('Autopilot blocked: '+s.autopilot.reason);}
 final=await read();raf=await page.evaluate(()=>{const d=window.__experienceTiming;d.active=false;const a=d.frames.slice(120).sort((a,b)=>a-b);return {samples:a.length,meanFps:1000/(a.reduce((s,n)=>s+n,0)/a.length),p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],over50ms:a.filter(n=>n>50).length};});
 check('Road route ends parked at destination',final.autopilot?.phase==='arrived'&&Math.abs(final.state.speed)<.25&&final.state.distance-start.distance>100,{start,final:final.state,status:final.autopilot,raf});await snap('07-arrived');
 }else{final=await read();}
 phase='audio-controls';await page.keyboard.press('Escape');await page.locator('.city-audio-controls').waitFor({state:'visible'});await page.locator('.audio-toggle').click();await page.waitForTimeout(600);check('Mute stops audible output',(await read()).audio?.muted===true&&(await read()).audio?.rms<.0001,(await read()).audio);await page.locator('.audio-toggle').click();await snap('08-audio-settings');
}catch(error){errors.push({phase,type:'check',message:String(error)});try{await snap('failure-'+phase);}catch{}}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({at:new Date().toISOString(),mode:visualOnly?'visual-regression':'full-route',checks,errors,screenshots,final,raf,pass:errors.length===0&&checks.every(c=>c.passed)},null,2));await browser.close();}
console.log(JSON.stringify({out,checks:checks.map(c=>({name:c.name,passed:c.passed})),errors,raf}));if(errors.length||checks.some(c=>!c.passed))process.exitCode=1;
