import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const phase=process.env.REVIEW_PHASE??'after',out=`output/playwright/vehicle-visibility/${phase}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[],samples=[],checks=[];
const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__VIS_REVIEW__=world;')});});
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});
 console.log('Game ready');
 await page.evaluate(()=>{
  const w=window.__VIS_REVIEW__;w.view=0;w.paused=false;
  const audit=window.__VIS_AUDIT__={frames:[],notReady:[],drawn:[],passes:{}};
  for(const mesh of w.carMeshes){mesh.onAfterRenderObservable.add(()=>{const pass=w.engine.currentRenderPassId;audit.passes[pass]=(audit.passes[pass]??0)+1;if(pass===w.camera.renderPassId)audit.drawn.push(mesh.name);});}
  for(const material of new Set(w.carMeshes.map(m=>m.material).filter(Boolean))){
   const original=material.isReadyForSubMesh;
   material.isReadyForSubMesh=function(mesh,subMesh,...args){const ready=original.call(this,mesh,subMesh,...args);if(!ready&&w.engine.currentRenderPassId===w.camera.renderPassId&&audit.notReady.length<100)audit.notReady.push({frame:w.renderFrames,name:mesh.name,material:material.name,maxLights:material.maxSimultaneousLights,lights:mesh.lightSources.map(l=>({name:l.name,enabled:l.isEnabled(),shadow:l.shadowEnabled})),effectReady:subMesh.effect?.isReady(),error:subMesh.effect?.getCompilationError(),defines:subMesh.materialDefines?.toString()});return ready;};
  }
  w.scene.onBeforeRenderObservable.add(()=>{audit.drawn=[];});
  w.scene.onAfterRenderObservable.add(()=>{
   const paint=w.carMeshes.find(m=>/^carpaint(?:\.\d+)?$/.test(m.material?.name));
   if(!paint)return;
   audit.frames.push({frame:w.renderFrames,distance:w.state.distance,speed:w.state.speed,view:w.view,observer:w.observer.active,mainPass:w.camera.renderPassId,drawn:[...audit.drawn],paint:paint.name,enabled:paint.isEnabled(),visible:paint.isVisible,active:w.scene.getActiveMeshes().data.includes(paint),center:paint.getBoundingInfo().boundingSphere.centerWorld.asArray(),position:w.car.position.asArray(),camera:w.camera.position.asArray(),reflections:w.vehicleReflections.stats()});
  });
 });
 for(const mode of (process.env.MODES??'sunset,night,day').split(',')){
  await page.evaluate(mode=>{const w=window.__VIS_REVIEW__;w.setLightMode(mode);w.keys.clear();w.state.speed=0;w.view=0;w.paused=false;window.__VIS_AUDIT__.frames=[];window.__VIS_AUDIT__.notReady=[];},mode);
  await page.waitForTimeout(1800);
  await page.evaluate(()=>{window.__VIS_AUDIT__.frames=[];window.__VIS_AUDIT__.notReady=[];});
  await page.keyboard.down('w');await page.waitForTimeout(9000);await page.keyboard.up('w');
  await page.screenshot({path:`${out}/${mode}-driving.png`});
  const sample=await page.evaluate(mode=>{const w=window.__VIS_REVIEW__,a=window.__VIS_AUDIT__;return {mode,passes:a.passes,notReady:a.notReady,frames:a.frames,materials:w.carMeshes.map(m=>({name:m.name,material:m.material?.name,enabled:m.isEnabled(),visibility:m.visibility,alpha:m.material?.alpha,maxLights:m.material?.maxSimultaneousLights,materialId:m.material?.uniqueId,frozen:m.isWorldMatrixFrozen})),state:{...w.state},localLighting:w.localLighting.stats()};},mode);
  samples.push(sample);console.log(JSON.stringify({mode,frames:sample.frames.length,missing:sample.frames.filter(f=>!f.drawn.includes(f.paint)).length,notReady:sample.notReady.length,passes:sample.passes}));
  if(phase==='after')check(`${mode}: car body draws on every driving frame`,sample.frames.length>30&&sample.frames.every(f=>f.drawn.includes(f.paint)),{frames:sample.frames.length,missing:sample.frames.filter(f=>!f.drawn.includes(f.paint)).map(f=>f.frame)});
  if(phase==='after')check(`${mode}: glass draws while facade assets stream`,sample.frames.every(f=>f.drawn.includes('car_glass')),{missing:sample.frames.filter(f=>!f.drawn.includes('car_glass')).map(f=>f.frame)});
 }
 if(phase==='after'){
  await page.keyboard.press('g');const plane=page.locator('.city-quicktips [data-flight-mode="plane"]');await plane.waitFor({state:'visible'});
  const layout=await plane.boundingBox(),quick=await page.locator('.city-quicktips-line').boundingBox();
  check('plane action is in the bottom WASD bar; top switch removed',await page.locator('.flight-mode-switch').count()===0&&layout.y>800&&layout.y>=quick.y&&layout.y<quick.y+quick.height,{layout,quick});
  await page.screenshot({path:`${out}/drone-bottom-controls.png`});
  await plane.click();await page.waitForFunction(()=>window.__VIS_REVIEW__.flight?.sim.phase==='flying',null,{timeout:90000});
  check('bottom button starts flight',await page.evaluate(()=>window.__VIS_REVIEW__.flight.active));
  await page.keyboard.press('b');await plane.waitFor({state:'visible'});check('B returns to drone',await page.evaluate(()=>window.__VIS_REVIEW__.observer.active&&!window.__VIS_REVIEW__.flight.active));
  await page.setViewportSize({width:700,height:900});await plane.waitFor({state:'visible'});
  const small=await plane.boundingBox();check('compact viewport keeps B action on screen',small.x>=0&&small.x+small.width<=700&&small.y>700,small);
  await page.screenshot({path:`${out}/drone-bottom-compact.png`});
  await page.setViewportSize({width:1600,height:1000});await page.keyboard.press('g');
  await page.waitForTimeout(1200);await page.keyboard.press('c');await page.waitForTimeout(1000);await page.keyboard.press('c');await page.waitForTimeout(1000);await page.keyboard.press('c');await page.waitForTimeout(1000);
  const restored=await page.evaluate(()=>{const w=window.__VIS_REVIEW__,f=window.__VIS_AUDIT__.frames.at(-1);return {view:w.view,visible:f.drawn.includes(f.paint)};});check('drone and cockpit return preserve car body',restored.view===0&&restored.visible,restored);
 }
}catch(e){errors.push(String(e));console.error(e);}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({phase,samples,checks,errors},null,2));await browser.close();}
console.log(JSON.stringify({out,errors}));if(errors.length)process.exitCode=1;
