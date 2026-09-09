import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const phase=process.env.PHASE??'after',out=`output/playwright/red-vehicle/${phase}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],samples=[],checks=[];
const check=(name,pass,details)=>{checks.push({name,pass,details});if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Error compiling/i.test(m.text()))errors.push(m.text());});
await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__CAR_REVIEW__=world;')});});
try{
 await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.locator('#city-loading').waitFor({state:'detached'});
 await page.addStyleTag({content:'#ui,#career-invitation,.city-quicktips,#career-root{visibility:hidden!important}'});
 for(const mode of ['day','sunset','night']){
  await page.evaluate(mode=>{const w=window.__CAR_REVIEW__;w.setLightMode(mode);w.enterPhoto({id:'car',name:'车辆检查',x:w.state.x,z:w.state.z,height:1.45,area:'车辆',excludeRadius:0,arrival:[w.state.x,w.state.z],photoDistance:7.7,photoElevation:.20,photoAngle:w.state.yaw+Math.PI+.65,photoTargetHeight:w.groundHeight(w.state.x,w.state.z)+.75});},mode);
  await page.waitForTimeout(2500);
  await page.screenshot({path:`${out}/${mode}-front.png`});
  await page.evaluate(()=>window.__CAR_REVIEW__.samples=[]);await page.waitForTimeout(4500);
  samples.push(await page.evaluate(()=>{const w=window.__CAR_REVIEW__;return {mode:w.lightMode,view:'front',performance:w.performance(),materials:w.vehicleMaterials.stats,reflections:w.vehicleReflections?.stats(),car:w.carPaintDiagnostics(),fill:w.carFill?.intensity,counts:{vertices:w.carMeshes.reduce((s,m)=>s+m.getTotalVertices(),0),triangles:w.carMeshes.reduce((s,m)=>s+m.getTotalIndices()/3,0)},diagnostics:w.diagnostics()};}));
  await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.observer.begin({x:w.state.x,y:w.groundHeight(w.state.x,w.state.z)+.75,z:w.state.z},7.7,w.state.yaw+.65,.20);w.cull();});
  await page.waitForTimeout(1600);await page.screenshot({path:`${out}/${mode}-rear.png`});
 }
 if(phase==='after'){
  await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.setLightMode('day');w.vehicleReflections?.setEnabled(false);w.samples=[];});await page.waitForTimeout(4500);
  samples.push(await page.evaluate(()=>{const w=window.__CAR_REVIEW__;return {mode:'day',view:'rear-reflections-off',performance:w.performance(),reflections:w.vehicleReflections?.stats()};}));
  await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.vehicleReflections?.setEnabled(true);w.samples=[];});await page.waitForTimeout(4500);
  samples.push(await page.evaluate(()=>{const w=window.__CAR_REVIEW__;return {mode:'day',view:'rear-reflections-on',performance:w.performance(),reflections:w.vehicleReflections?.stats()};}));
  const parked=await page.evaluate(()=>window.__CAR_REVIEW__.vehicleReflections.stats());
  await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.observer.rotate(100,0);});await page.waitForTimeout(1600);
  const orbited=await page.evaluate(()=>window.__CAR_REVIEW__.vehicleReflections.stats());
  check('orbiting the camera does not move or recapture the street reflection',parked.captures===orbited.captures&&JSON.stringify(parked.position)===JSON.stringify(orbited.position),{parked,orbited});
  check('hero plate and sport fittings still attach to the current source',await page.evaluate(()=>{const w=window.__CAR_REVIEW__;return w.vehicleFinish.stats.applied&&w.sportDetails.stats.applied!==false;}));
  check('camera-following fill has been removed',await page.evaluate(()=>!window.__CAR_REVIEW__.carFill));
  const driveStart=await page.evaluate(()=>({...window.__CAR_REVIEW__.state}));
  for(const active of [false,true]){
   await page.evaluate(({active,driveStart})=>{const w=window.__CAR_REVIEW__;w.vehicleReflections.setEnabled(active);w.exitPhoto();w.paused=false;w.keys.clear();Object.assign(w.state,driveStart);w.resetRoad();w.keys.add('KeyW');w.samples=[];},{active,driveStart});
   const start=await page.evaluate(()=>({distance:window.__CAR_REVIEW__.state.distance,captures:window.__CAR_REVIEW__.vehicleReflections.stats().captures,time:window.__CAR_REVIEW__.time}));
   await page.waitForTimeout(10000);
   const driving=await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.keys.clear();return {mode:'day',view:'driving',performance:w.performance(),reflections:w.vehicleReflections.stats(),distance:w.state.distance,time:w.time};});
   samples.push({...driving,active});
   check(`real driving advances with reflection ${active}`,driving.distance-start.distance>20,{distance:driving.distance-start.distance});
   if(active)check('moving capture is bounded and geometry stays in budget',driving.reflections.captures-start.captures<=Math.ceil((driving.time-start.time)*2)+4&&driving.reflections.captures>start.captures&&driving.reflections.triangles<=90000&&driving.reflections.meshes<=29,{start,end:driving.reflections,elapsed:driving.time-start.time});
  }
  await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.paused=true;w.toggleAerial();});await page.waitForTimeout(1600);
  const distant=await page.evaluate(()=>window.__CAR_REVIEW__.vehicleReflections.stats());await page.waitForTimeout(1600);
  check('distant aerial view stops hero capture',!distant.visible&&distant.captures===await page.evaluate(()=>window.__CAR_REVIEW__.vehicleReflections.stats().captures),distant);

 }
}catch(e){errors.push(String(e));console.error(e);}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({phase,date:new Date().toISOString(),samples,checks,errors},null,2));await browser.close();}
console.log(JSON.stringify({phase,checks,samples:samples.map(s=>({mode:s.mode,view:s.view,performance:s.performance,reflections:s.reflections})),errors},null,2));
if(errors.length)process.exitCode=1;
