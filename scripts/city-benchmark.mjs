import {chromium} from 'playwright';import fs from 'node:fs/promises';
import {RoadGraph} from '../src/navigation.ts';
const city=JSON.parse(await fs.readFile('public/city/city.json','utf8')),graph=new RoadGraph(city.roads,JSON.parse(await fs.readFile('public/city/navigation.json','utf8')));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));let keys=new Set();
async function input(wanted){const set=new Set(wanted);for(const k of keys)if(!set.has(k))await page.keyboard.up(k);for(const k of set)if(!keys.has(k))await page.keyboard.down(k);keys=set;}
const closest=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz||1)));return {x:a[0]+dx*t,z:a[1]+dz*t,d:Math.hypot(p.x-a[0]-dx*t,p.z-a[1]-dz*t)};};
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});await page.waitForTimeout(5000);const runs=[];
 for(const [start,dest] of [['opening','bamboo'],['pingan','civic'],['kk100','pingan']]){
  if(start!=='opening'){await page.keyboard.press('m');await page.locator('[data-id="'+start+'"]').click();await page.getByRole('button',{name:'快速前往周边道路'}).click();await page.waitForTimeout(2000);}
  let state=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.state);const before={...state};const landmark=city.landmarks.find(m=>m.id===dest);const route=graph.route([state.x,state.z],landmark.arrival);if(!route.length)throw Error('No benchmark route');let index=0,stuck=0,recoveries=0;await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());const begun=Date.now();
  while(Date.now()-begun<(Number(process.env.SEGMENT_SECONDS)||100)*1000){
   state=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.state);let best=Infinity;for(let i=Math.max(0,index-2);i<Math.min(route.length-1,index+14);i++){const q=closest(state,route[i],route[i+1]);if(q.d<best){best=q.d;index=i;}}
   let ahead=Math.max(9,Math.abs(state.speed)*.9),target=route[index+1];for(let i=index+1;i<route.length-1;i++){const d=Math.hypot(target[0]-state.x,target[1]-state.z);if(d>=ahead)break;target=route[i+1];}
   let error=Math.atan2(target[0]-state.x,target[1]-state.z)-state.yaw;error=Math.atan2(Math.sin(error),Math.cos(error));const speedTarget=Math.abs(error)>.8?3.5:Math.abs(error)>.3?7:14;
   const wanted=[];if(state.speed<speedTarget-.4)wanted.push('w');else if(state.speed>speedTarget+1.2)wanted.push('s');const desired=Math.atan(3.2*2*Math.sin(error)/ahead),limit=.48/(1+Math.abs(state.speed)*.026);if(desired>.01&&state.steer<Math.min(limit,desired)+.015)wanted.push('d');if(desired<-.01&&state.steer>Math.max(-limit,desired)-.015)wanted.push('a');
   if(index>=route.length-3&&Math.hypot(state.x-landmark.arrival[0],state.z-landmark.arrival[1])<8){wanted.length=0;wanted.push('Space');}
   await input(wanted);if(Math.abs(state.speed)<.3)stuck+=.1;else stuck=0;if(stuck>8&&recoveries<2){await input([]);await page.keyboard.press('r');recoveries++;stuck=0;}
   await page.waitForTimeout(100);
  }
  await input([]);const result=await page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,performance:window.__SHENCHENGJI_CITY__.performance}));runs.push({start,destination:dest,wallSeconds:(Date.now()-begun)/1000,distanceTravelled:result.state.distance-before.distance,recoveries,...result});console.log(JSON.stringify(runs.at(-1)));await page.screenshot({path:'artifacts/city/benchmark-'+start+'.png'});
 }
 const report={date:new Date().toISOString(),browser:await browser.version(),platform:'M1 Max macOS / Chrome Metal WebGL2',scope:`3 sequential ${Number(process.env.SEGMENT_SECONDS)||100}-second windows at 1920x1080. Destinations initialized through UI fast travel between windows, 2-second transition warmups excluded. Driving uses ordinary keyboard controls only. Measured raw render frame intervals; first 120 frames of each window excluded.`,errors,runs};await fs.writeFile('artifacts/city/performance-v0.3.json',JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await input([]);await browser.close();}
