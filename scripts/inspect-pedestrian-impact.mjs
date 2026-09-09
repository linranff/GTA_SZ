import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/pedestrian-impact';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
let phase='loading';const checks=[],errors=[],shots=[];
const check=(name,pass,details)=>{checks.push({name,pass,details});if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push({phase,message:String(e)}));page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Error compiling/i.test(m.text()))errors.push({phase,message:m.text().slice(0,1500)});});
await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__IMPACT_REVIEW__=world;')});});
const snap=async name=>{await page.screenshot({path:`${out}/${name}.png`});shots.push(name);};
const state=()=>page.evaluate(()=>{const w=window.__IMPACT_REVIEW__,p=window.__IMPACT_PERSON__;return {stats:w.pedestrians.stats,person:{x:p.x,z:p.z,body:p.body?{...p.body}:null,recovery:p.recovery,returning:p.returning},car:{...w.state},audio:w.audio.stats};});
const freeze=()=>page.evaluate(()=>{window.__IMPACT_REVIEW__.paused=true;});
const resume=()=>page.evaluate(()=>{const w=window.__IMPACT_REVIEW__;w.paused=false;w.keys.clear();w.keys.add('Space');});
try{
 await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});await page.locator('#city-loading').waitFor({state:'detached'});
 await page.locator('#game').click({position:{x:800,y:420}});
 const setup=await page.evaluate(()=>{
  const w=window.__IMPACT_REVIEW__;w.setLightMode('day');w.cancelAutoDrive('qa');w.keys.clear();w.paused=true;
  let selected=null;
  for(const p of [...w.pedestrians.people].sort((a,b)=>Math.hypot(a.x-w.state.x,a.z-w.state.z)-Math.hypot(b.x-w.state.x,b.z-w.state.z))){
   if(Math.hypot(p.x-w.state.x,p.z-w.state.z)>140)continue;
   for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    let clear=true;
    for(let d=-10;d<=24;d+=.65)for(const side of [-1.1,0,1.1]){const x=p.x+Math.sin(yaw)*d+Math.cos(yaw)*side,z=p.z+Math.cos(yaw)*d-Math.sin(yaw)*side;if(w.collision.blocked(x,z)||w.propBlocked(x,z)||Math.abs(w.groundHeight(x,z)-w.groundHeight(p.x,p.z))>.22||w.traffic.cars.some(c=>Math.hypot(c.x-x,c.z-z)<5)){clear=false;break;}}
    if(clear){selected={p,yaw};break;}
   }if(selected)break;
  }
  if(!selected)throw Error('No clear real sidewalk impact corridor');
  const {p,yaw}=selected;window.__IMPACT_PERSON__=p;window.__IMPACT_START__={x:p.x,z:p.z,yaw};
  const target={x:p.x+Math.sin(yaw)*6,y:w.groundHeight(p.x,p.z)+1.2,z:p.z+Math.cos(yaw)*6};
  w.enterPhoto({id:'impact-review',name:'路边观察',x:target.x,z:target.z,height:0,area:'深圳湾',arrival:[w.state.x,w.state.z],yaw:0,photoTargetHeight:target.y,photoDistance:21,photoElevation:.18,photoAngle:-(yaw-1.12)});
  w.observer.begin(target,21,-(yaw-1.12),.18);w.cull();w.vegetation();
  const originalUpdate=w.pedestrians.update.bind(w.pedestrians),originalCollision=w.pedestrians.collideVehicle.bind(w.pedestrians);window.__IMPACT_TIMES__=[];window.__IMPACT_TRACE__=[];window.__IMPACT_BENCH__='warmup';
  w.pedestrians.update=(...args)=>{const start=performance.now();const result=originalUpdate(...args);window.__IMPACT_TIMES__.push({phase:window.__IMPACT_BENCH__,ms:performance.now()-start,bodies:w.pedestrians.stats.activeBodies});return result;};
  w.pedestrians.collideVehicle=(...args)=>{const start=performance.now();const result=originalCollision(...args);window.__IMPACT_TIMES__.push({phase:window.__IMPACT_BENCH__,collision:true,ms:performance.now()-start});return result;};
  w.scene.onAfterRenderObservable.add(()=>{if(window.__IMPACT_BENCH__!=='impact')return;window.__IMPACT_TRACE__.push({x:p.x,z:p.z,y:p.body?.y??w.groundHeight(p.x,p.z)+.9,phase:p.body?.phase??(p.returning?'returning':'walking'),grounded:p.body?.grounded,speed:w.state.speed});});
  return {person:{x:p.x,z:p.z,path:p.path,slot:p.slot},yaw,templates:w.pedestrians.meshes.length,meshes:w.scene.meshes.length};
 });
 phase='baseline';await page.waitForTimeout(4000);await snap('01-before');
 await page.evaluate(()=>{const w=window.__IMPACT_REVIEW__;w.paused=false;w.keys.add('Space');window.__IMPACT_BENCH__='baseline';});await page.waitForTimeout(3000);
 phase='impact';
 await page.evaluate(()=>{
  const w=window.__IMPACT_REVIEW__,p=window.__IMPACT_PERSON__,yaw=window.__IMPACT_START__.yaw;
  const x=p.x-Math.sin(yaw)*8,z=p.z-Math.cos(yaw)*8;Object.assign(w.state,{x,z,yaw,speed:32,steer:0});w.car.position.set(x,w.groundHeight(x,z)+.115,z);w.keys.clear();w.paused=false;window.__IMPACT_BENCH__='impact';
 });
 await page.waitForFunction(()=>{const p=window.__IMPACT_PERSON__;return p.body&&!p.body.grounded&&p.body.y>window.__IMPACT_REVIEW__.groundHeight(p.x,p.z)+1.3;},null,{timeout:15000});
 await freeze();const airborne=await state();check('actual vehicle sweep launches a real pedestrian',airborne.stats.totalImpacts>0&&airborne.person.body?.phase==='airborne',airborne);
 await snap('02-airborne');
 await resume();await page.waitForFunction(()=>window.__IMPACT_PERSON__.body?.grounded===true,null,{timeout:15000});await freeze();const grounded=await state();await snap('03-ground-contact');
 check('body lands without restarting the impact',grounded.person.body?.grounded&&grounded.stats.totalImpacts===airborne.stats.totalImpacts,grounded);
 await resume();await page.waitForFunction(()=>window.__IMPACT_PERSON__.recovery>.5,null,{timeout:18000});await freeze();await snap('04-getting-up');
 const recovering=await state();check('pedestrian gets up gradually',recovering.person.body?.phase==='recovering'&&recovering.person.recovery<1.35,recovering);
 await resume();await page.waitForFunction(()=>!window.__IMPACT_PERSON__.body,null,{timeout:10000});await freeze();await snap('05-returning-to-sidewalk');
 const returned=await state();check('recovery restores a walking body and releases budget',returned.stats.activeBodies===0&&!returned.person.body&&returned.person.returning,returned);
 const render=await page.evaluate(()=>{const w=window.__IMPACT_REVIEW__,times=window.__IMPACT_TIMES__,summary=list=>{const a=list.map(t=>t.ms).sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((s,v)=>s+v,0)/Math.max(1,a.length),p95:a[Math.floor(a.length*.95)]??0};};return {templates:w.pedestrians.meshes.length,meshes:w.scene.meshes.length,stats:w.pedestrians.stats,baselineUpdate:summary(times.filter(t=>t.phase==='baseline'&&!t.collision)),activeUpdate:summary(times.filter(t=>t.phase==='impact'&&!t.collision&&t.bodies>0)),collision:summary(times.filter(t=>t.phase==='impact'&&t.collision)),trace:window.__IMPACT_TRACE__,device:w.engine.getGlInfo()};});
 check('impact reuses the same mesh templates and bounded CPU simulation',render.templates===setup.templates&&render.stats.peakActive<=8&&render.activeUpdate.n>10&&render.activeUpdate.p95<4,render);
 check('impact sound goes through active effects audio',airborne.audio.impactCount>0&&airborne.audio.state==='running',airborne.audio);
 check('no runtime or shader errors',errors.length===0,errors);
 console.log(JSON.stringify({setup,stats:render.stats,baseline:render.baselineUpdate,active:render.activeUpdate,collision:render.collision}));
}catch(error){errors.push({phase,type:'check',message:String(error)});console.error(error);try{await snap('failure-'+phase);}catch{}}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({date:new Date().toISOString(),checks,errors,shots,pass:!errors.length&&checks.every(c=>c.pass)},null,2));await browser.close();}
console.log(JSON.stringify({checks:checks.map(c=>({name:c.name,pass:c.pass})),errors,out}));if(errors.length)process.exitCode=1;
