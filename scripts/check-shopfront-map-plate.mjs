import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const before=process.argv.includes('--before'), out=`output/playwright/shopfront-map-plate/${before?'before':'after'}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}), errors=[], checks=[], shots=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,stats:window.__SHENCHENGJI_CITY__.stats}));
const check=(name,ok,details)=>{assert(ok,name);checks.push({name,details});console.log('PASS '+name);};
const shot=async name=>{await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('SHOT '+name);};
async function openMap(){await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await page.waitForFunction(()=>Number(document.querySelector('#city-map').dataset.worldWidth)>1);await page.waitForTimeout(120);}
async function clickWorld(point){
  const p=await page.locator('#city-map').evaluate((el,point)=>{const r=el.getBoundingClientRect(),s=r.width/Number(el.dataset.worldWidth);return {x:r.x+r.width/2+(point[0]-Number(el.dataset.viewX))*s,y:r.y+r.height/2-(point[1]-Number(el.dataset.viewZ))*s,left:r.left,right:r.right,top:r.top,bottom:r.bottom};},point);
  assert(p.x>p.left&&p.x<p.right&&p.y>p.top&&p.y<p.bottom,'Test point visible in map');await page.mouse.click(p.x,p.y);await page.waitForTimeout(100);
}
async function orbit(yaw,pitch,distance){
  const s=(await read()).stats.observer,delta=Math.atan2(Math.sin(s.yaw-yaw),Math.cos(s.yaw-yaw));
  await page.mouse.move(900,500);await page.mouse.down();await page.mouse.move(900+delta/.0045,500+(pitch-s.pitch)/.0035,{steps:12});await page.mouse.up();
  await page.mouse.move(900,500);await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);await page.waitForTimeout(700);
}
try{
  if(before)await page.route('**/city/buildings.glb',route=>route.fulfill({path:'artifacts/city/shopfront-repair/buildings-before.glb',contentType:'model/gltf-binary'}));
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
  let s=await read();check('enlarged plate fits the rear surface',s.stats.vehicleFinish.applied&&s.stats.vehicleFinish.width===1.44&&s.stats.vehicleFinish.height===.42,s.stats.vehicleFinish);
  await shot('01-driving');await page.keyboard.press('v');await orbit(s.state.yaw,.08,5.8);await shot('02-plate');await page.keyboard.press('g');
  await openMap();check('requested travel copy visible',(await page.locator('#quick-travel').innerText())==='移动到附近道路');
  const sea=[s.state.x+80,s.state.z-400];await clickWorld(sea);check('open-water point is selectable',await page.locator('#quick-travel').isEnabled()&&await page.locator('#photo-view').isEnabled());await shot('03-open-water-selection');
  await page.locator('#photo-view').click();await page.waitForTimeout(350);s=await read();
  check('observation keeps original off-road point',Math.hypot(s.stats.observer.focus.x-sea[0],s.stats.observer.focus.z-sea[1])<.01,s.stats.observer.focus);
  await openMap();await page.locator('#quick-travel').click();await page.waitForTimeout(350);s=await read();
  const distance=await page.evaluate(async()=>{const c=await(await fetch('/city/city.json')).json(),p=window.__SHENCHENGJI_CITY__.state;let best=Infinity;for(const r of c.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz));}return best;});
  check('car arrival from sea snaps to a road',distance<.05&&Math.hypot(s.state.x-sea[0],s.state.z-sea[1])>50,{distance,state:s.state});
  const city=JSON.parse(await fs.readFile('public/city/city.json','utf8')), b=city.buildings.find(b=>b.id==='way/357161914'),ring=b.rings[0];
  const area=ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0), edges=ring.slice(1).map((p,i)=>{const a=ring[i],dx=p[0]-a[0],dz=p[1]-a[1],length=Math.hypot(dx,dz);return {x:(a[0]+p[0])/2,z:(a[1]+p[1])/2,nx:dz/length*Math.sign(area),nz:-dx/length*Math.sign(area),length};}).filter(e=>e.length>8&&e.nz<-.2).sort((a,b)=>a.z-b.z);
  const e=edges[0];assert(e);const point=[e.x+e.nx*2,e.z+e.nz*2];await openMap();await page.locator('[data-map-category="road"]').click();await page.waitForTimeout(150);await clickWorld(point);await page.locator('#photo-view').click();await page.waitForTimeout(300);s=await read();
  check('ground-floor inspection target preserves click',Math.hypot(s.stats.observer.focus.x-point[0],s.stats.observer.focus.z-point[1])<.02,{building:b.id,point});
  const yaw=Math.atan2(-e.nx,-e.nz);await orbit(yaw,.03,25);await shot('04-shopfront-25m');await orbit(yaw,.03,12);await shot('05-shopfront-12m');
  // Rapid close lateral moves reproduce the user's depth-fighting trigger.
  await page.keyboard.down('d');await page.waitForTimeout(700);await page.keyboard.up('d');await shot('06-shopfront-lateral');
  await page.keyboard.press('l');await page.waitForTimeout(700);await shot('07-shopfront-night');await page.keyboard.press('l');await page.waitForTimeout(700);await shot('08-shopfront-day');
}catch(e){errors.push(String(e));await shot('failure').catch(()=>{});}finally{
  await fs.writeFile(`${out}/report.json`,JSON.stringify({before,checks,errors,shots,pass:!errors.length,scope:'Functional checks and close moving-camera captures; no FPS benchmark.'},null,2));
  await browser.close();
}
console.log(JSON.stringify({out,checks,errors}));if(errors.length)process.exitCode=1;
