/** Actual-game input, projectile, FX and vehicle/pedestrian regression check. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/flight-missiles';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[];
const check=(name,pass,data)=>{checks.push({name,pass,data});console.log(JSON.stringify(checks.at(-1)));if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const stats=()=>page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.flight.stats);
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});console.log('Game ready');
 await page.keyboard.press('t');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.tank.active,null,{timeout:90000});
 const crossing=await page.evaluate(()=>{
  const w=window.__SHENCHENGJI_CITY__.world;w.traffic.cars=[];
  const s={...w.state},p=w.pedestrians.people[0];if(!p)throw Error('No live pedestrian fixture');
  const x=s.x+Math.sin(s.yaw)*4,z=s.z+Math.cos(s.yaw)*4;
  Object.assign(p,{x,z,path:[x-1,z,x+1,z],t:.5,speed:0,body:null,cooldown:0,returning:false});w.pedestrians.people=[p];
  w.state.speed=9;return {start:s,person:{x,z},hits:w.pedestrians.stats.totalImpacts};
 });
 await page.keyboard.down('w');await page.waitForTimeout(950);await page.keyboard.up('w');
 let state=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return {state:{...w.state},body:w.pedestrians.people[0].body,stats:w.pedestrians.stats};});
 check('tank passes across pedestrian without knocking them down',Math.hypot(state.state.x-crossing.start.x,state.state.z-crossing.start.z)>5&&!state.body,state);
 await page.keyboard.press('t');
 await page.evaluate(({start,person})=>{const w=window.__SHENCHENGJI_CITY__.world;Object.assign(w.state,start,{speed:12});const p=w.pedestrians.people[0];Object.assign(p,{x:person.x,z:person.z,path:[person.x-1,person.z,person.x+1,person.z],t:.5,speed:0,body:null,cooldown:0,returning:false});},crossing);
 await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
 state=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return {body:w.pedestrians.people[0].body,stats:w.pedestrians.stats};});
 check('sports car still launches the same pedestrian',!!state.body&&state.stats.totalImpacts>crossing.hits&&Math.hypot(state.body.x-crossing.person.x,state.body.z-crossing.person.z)>1,state);
 await page.evaluate(()=>{window.__SHENCHENGJI_CITY__.world.state.speed=0;});
 await page.keyboard.press('g');await page.keyboard.press('b');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.flight.sim.phase==='flying',null,{timeout:90000});
 await page.waitForTimeout(400);const ready=await stats();
 const resources=await page.evaluate(()=>{const s=window.__SHENCHENGJI_CITY__.world.scene;return {lights:s.lights.length,materials:s.materials.length};});
 await page.keyboard.press('Space');await page.waitForTimeout(150);let s=await stats();
 check('Space launches a visible missile without lowering throttle',s.missiles.shots===ready.missiles.shots+1&&s.missiles.active===1&&Math.abs(s.throttle-ready.throttle)<1e-8,s);
 await page.screenshot({path:out+'/01-launch.png'});
 await page.keyboard.down('Space');await page.waitForTimeout(1800);await page.keyboard.up('Space');s=await stats();
 check('held Space repeats with reload and a bounded pool',s.missiles.shots>=ready.missiles.shots+3&&s.missiles.active<=6,s.missiles);
 await page.keyboard.down('x');await page.waitForTimeout(650);await page.keyboard.up('x');const brake=await stats();
 check('X reduces throttle without firing',brake.throttle<s.throttle-.15&&brake.missiles.shots===s.missiles.shots,brake);
 const afterResources=await page.evaluate(()=>{const s=window.__SHENCHENGJI_CITY__.world.scene;return {lights:s.lights.length,materials:s.materials.length};});
 check('firing does not add city lights',afterResources.lights===resources.lights,{before:resources,after:afterResources});
 await page.keyboard.press('b');s=await stats();check('B clears airborne missiles and effects',!s.active&&s.missiles.active===0&&s.missiles.effects===0,s.missiles);
 await page.keyboard.press('b');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.flight.sim.phase==='flying');
 const approach=await page.evaluate(()=>{
  const w=window.__SHENCHENGJI_CITY__.world,f=w.flight,choices=w.data.buildings.filter(b=>b.style!=='landmark-detail'&&b.height>55&&b.height<180).map(b=>{const xs=b.rings[0].map(p=>p[0]),zs=b.rings[0].map(p=>p[1]);return {b,x:(Math.min(...xs)+Math.max(...xs))/2,z0:Math.min(...zs),width:Math.max(...xs)-Math.min(...xs)};}).filter(q=>q.width>26).sort((a,b)=>Math.hypot(a.x-f.sim.pose.x,a.z0-f.sim.pose.z)-Math.hypot(b.x-f.sim.pose.x,b.z0-f.sim.pose.z));
  for(const q of choices){
   const start={x:q.x,y:q.b.height*.65,z:q.z0-210};
   if(f.sweep(start,{...start,z:start.z+75})||f.sweep({...start,x:start.x-7},{...start,x:start.x+7}))continue;
   const hit=f.sweep({...start,x:start.x+3.4},{...start,x:start.x+3.4,z:q.z0+5});if(hit?.kind!=='building'||hit.point.z<q.z0-5)continue;
   f.clearEffects();f.sim.start(start,0);f.syncModel(0);const shot=f.chase();f.eye.copyFrom(shot.eye);f.target.copyFrom(shot.target);w.camera.position.copyFrom(shot.eye);w.camera.setTarget(shot.target);w.keys.clear();w.cull();w.vegetation();
   return {start,hit,shots:f.stats.missiles.shots,hits:f.stats.missiles.hits,crashes:f.stats.crashes};
  }
  throw Error('No clear approach to real building');
 });console.log('approach',JSON.stringify(approach));
 await page.keyboard.press('Space');await page.waitForFunction(hits=>window.__SHENCHENGJI_CITY__.world.flight.stats.missiles.hits>hits,approach.hits,{timeout:7000});
 await page.waitForTimeout(750);s=await stats();
 check('missile building hit renders multiple fireballs while plane remains controllable',s.phase==='flying'&&s.crashes===approach.crashes&&s.missiles.hits>approach.hits&&s.missiles.effects>0&&s.missiles.fireballs>=5,s);
 await page.screenshot({path:out+'/02-building-impact.png'});
 await page.keyboard.press('b');await page.waitForTimeout(200);s=await stats();
 check('leaving after a hit clears the explosion without a delayed crash recovery',!s.active&&s.missiles.active===0&&s.missiles.effects===0,s);
 await page.keyboard.press('b');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.flight.sim.phase==='flying');await page.keyboard.press('Space');await page.keyboard.press('m');
 await page.locator('#map-panel').waitFor({state:'visible'});s=await stats();check('opening map cancels flight and its missile effects',!s.active&&s.missiles.active===0&&s.missiles.effects===0,s.missiles);
 check('no browser errors',errors.length===0,errors);
}catch(error){errors.push(String(error));console.error(error);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}
finally{await fs.writeFile(out+'/report.json',JSON.stringify({date:new Date().toISOString(),checks,errors},null,2));await browser.close();}
if(errors.length)process.exitCode=1;
