import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve(process.env.MAP_TRANSIT_OUT??'output/playwright/map-transit');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const checks=[],errors=[],screenshots=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>({car:window.__SHENCHENGJI_CITY__.state,observer:window.__SHENCHENGJI_CITY__.stats.observer}));
const mapView=()=>page.locator('#city-map').evaluate(el=>({x:Number(el.dataset.viewX),z:Number(el.dataset.viewZ),zoom:Number(el.dataset.zoom),worldWidth:Number(el.dataset.worldWidth)}));
const check=(name,passed,details)=>{checks.push({name,passed,details});if(!passed)throw Error(name);};
const snap=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});screenshots.push({name,file,state:await read()});};
const chooseTencent=async()=>{await page.locator('#map-search').fill('腾讯');await page.locator('#places [data-id="tencent"]').click();};
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
 // Deliberately no canvas click: exercises body -> map -> game focus recovery.
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});
 await page.waitForFunction(()=>Number(document.querySelector('#city-map')?.dataset.zoom)>3.5);
 const firstView=await mapView(),firstCar=(await read()).car;
 check('M opens around the current vehicle at a local scale',Math.hypot(firstView.x-firstCar.x,firstView.z-firstCar.z)<.1&&firstView.worldWidth<=2600.1,firstView);
 check('Transit and overview controls are always visible',await page.locator('#quick-travel').isVisible()&&await page.locator('#photo-view').isVisible(),{});
 check('No destination disables travel',await page.locator('#quick-travel').isDisabled()&&await page.locator('#photo-view').isDisabled(),{});
 await snap('01-map-empty');
 await page.locator('[data-map-command="in"]').click();
 await page.waitForFunction(z=>Number(document.querySelector('#city-map')?.dataset.zoom)>z,firstView.zoom);
 const rememberedView=await mapView();
 await page.locator('[data-map-command="all"]').click();
 await page.waitForFunction(()=>Number(document.querySelector('#city-map')?.dataset.zoom)<1.1);
 await page.keyboard.press('Escape');await page.locator('#map-panel').waitFor({state:'hidden'});
 await page.keyboard.press('Escape');await page.locator('#pause').waitFor({state:'visible'});
 await page.keyboard.press('Escape');await page.locator('#pause').waitFor({state:'hidden'});
 check('M then Escape then Escape reaches pause and resumes',true,{activeElement:await page.evaluate(()=>document.activeElement?.id)});
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});const before=(await read()).car;
 await page.waitForFunction(()=>Number(document.querySelector('#city-map')?.dataset.zoom)>3.5);
 const rememberedReopen=await mapView();check('Reopening restores local zoom after full-city inspection',Math.abs(rememberedReopen.worldWidth-rememberedView.worldWidth)<.1,rememberedReopen);
 await chooseTencent();const selected=(await read()).car;
 check('Selection alone preserves vehicle position',Math.hypot(selected.x-before.x,selected.z-before.z)<.01,{});
 await snap('02-map-actions');await page.locator('#quick-travel').click();await page.locator('#map-panel').waitFor({state:'hidden'});
 await page.waitForTimeout(1200);const jumped=(await read()).car;
 const roadDistance=await page.evaluate(async()=>{
  const state=window.__SHENCHENGJI_CITY__.state,city=await (await fetch('/city/city.json')).json();let nearest=Infinity;
  for(const road of city.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((state.x-a[0])*dx+(state.z-a[1])*dz)/(dx*dx+dz*dz||1)));nearest=Math.min(nearest,Math.hypot(state.x-a[0]-t*dx,state.z-a[1]-t*dz));}
  return nearest;
 });
 check('Normal URL travel lands stationary on a nearby road',Math.hypot(jumped.x-before.x,jumped.z-before.z)>500&&roadDistance<.05&&Math.abs(jumped.speed)<.15,{before,jumped,roadDistance});
 await snap('03-travelled');
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await chooseTencent();await page.locator('#photo-view').click();
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.observer.active);await page.waitForTimeout(800);
 const viewed=await read();check('Overview changes the camera while preserving the parked car',viewed.observer.active&&Math.hypot(viewed.car.x-jumped.x,viewed.car.z-jumped.z)<.01,viewed.observer);
 await snap('04-overview');await page.keyboard.press('g');await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.stats.observer.active);
 check('G returns from overview',true,{});
 await page.keyboard.press('g');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.observer.active);
 await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');
 const observerFocus=(await read()).observer.focus;
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});
 await page.waitForFunction(f=>{const d=document.querySelector('#city-map')?.dataset;return d&&Math.hypot(Number(d.viewX)-f.x,Number(d.viewZ)-f.z)<.1;},observerFocus);
 const droneView=await mapView();check('Opening M from a moved drone centers its captured focus',Math.hypot(droneView.x-observerFocus.x,droneView.z-observerFocus.z)<.1&&droneView.zoom>=2.4,droneView);
 await snap('05-map-drone-focus');
}catch(e){errors.push(String(e));}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({at:new Date().toISOString(),checks,errors,screenshots,pass:errors.length===0&&checks.every(c=>c.passed)},null,2));await browser.close();}
console.log(JSON.stringify({out,checks,errors}));if(errors.length)process.exitCode=1;
