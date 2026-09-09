/** Functional / visual review of the current game. The world reference exists
 * only in this intercepted development response, never in the shipped app. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/city-flight';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors=[],checks=[],shots=[];
const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
const snap=async name=>{await page.screenshot({path:out+'/'+name+'.png'});shots.push(name);};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__FLIGHT_REVIEW__=world;')});});
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});console.log('Game ready');
 await page.keyboard.press('g');await page.locator('[data-flight-mode="plane"]').waitFor({state:'visible'});
 const car=await page.evaluate(()=>({...window.__FLIGHT_REVIEW__.state}));
 await page.keyboard.press('b');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.phase==='flying');
 const start=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.flight);
 await page.keyboard.down('w');await page.keyboard.down('d');await page.waitForTimeout(1400);await page.keyboard.up('w');await page.keyboard.up('d');
 const bank=await page.evaluate(()=>{const w=window.__FLIGHT_REVIEW__,f=w.flight,p=f.sim.pose,prop=w.scene.getTransformNodeByName('floatplane_propeller');prop.computeWorldMatrix(true);const nose=prop.getAbsolutePosition().subtract(f.root.position).normalize();const forward={x:Math.sin(p.yaw)*Math.cos(p.pitch),y:Math.sin(p.pitch),z:Math.cos(p.yaw)*Math.cos(p.pitch)};return {flight:f.stats,dot:nose.x*forward.x+nose.y*forward.y+nose.z*forward.z,car:{...w.state}};});
 check('W/D climb and bank; nose matches flight direction',bank.flight.pitch>.1&&bank.flight.roll>.2&&bank.flight.position.y>start.position.y&&bank.dot>.98,bank);
 check('flight never drives the parked car',JSON.stringify(car)===JSON.stringify(bank.car),{car,after:bank.car});await snap('01-bank-over-bay');
 await page.keyboard.down('Shift');await page.waitForTimeout(600);await page.keyboard.up('Shift');const thrust=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.flight.throttle);check('Shift increases throttle',thrust>start.throttle,{thrust,start:start.throttle});
 await page.keyboard.press('b');await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.stats.flight.active);check('B returns to ordinary drone',await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.observer.active));
 await page.locator('[data-flight-mode="plane"]').click();await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.phase==='flying');
 await page.evaluate(()=>window.__FLIGHT_REVIEW__.setLightMode('day'));await page.waitForTimeout(1200);await snap('02-daylight-flight');
 // Set up a reproducible approach to an actual city building. Controls, real
 // collision and explosion timers continue through the normal render loop.
 const approach=await page.evaluate(()=>{
  const world=window.__FLIGHT_REVIEW__,previousTick=world.onTick;window.__FLIGHT_TRANSITIONS__=[];let phase=world.flight.sim.phase;world.onTick=dt=>{previousTick?.(dt);const current=world.flight.sim.phase;if(current!==phase){window.__FLIGHT_TRANSITIONS__.push({phase:current,now:performance.now()});phase=current;}};
  const w=window.__FLIGHT_REVIEW__,p=w.flight.sim.pose,choices=w.data.buildings.filter(b=>b.style!=='landmark-detail'&&b.height>50&&b.height<170).map(b=>{const r=b.rings[0],xs=r.map(p=>p[0]),zs=r.map(p=>p[1]);return {b,x:(Math.min(...xs)+Math.max(...xs))/2,z0:Math.min(...zs),z1:Math.max(...zs),width:Math.max(...xs)-Math.min(...xs)};}).filter(q=>q.width>22&&q.z1-q.z0>20).sort((a,b)=>Math.hypot(a.x-p.x,a.z0-p.z)-Math.hypot(b.x-p.x,b.z0-p.z));
  const q=choices[0],start={x:q.x,y:q.b.height*.5,z:q.z0-65};w.keys.clear();w.flight.sim.start(start,0);w.flight.root.setEnabled(true);const shot=w.flight.chase();w.flight.eye.copyFrom(shot.eye);w.flight.target.copyFrom(shot.target);w.cull();return {start,height:q.b.height};
 });console.log('Collision approach',JSON.stringify(approach));
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.phase==='exploding',null,{timeout:20000});
 const impact=await page.evaluate(()=>({now:performance.now(),s:window.__SHENCHENGJI_CITY__.stats.flight}));check('building contact triggers explosion',impact.s.hit?.kind==='building'&&impact.s.crashes>0,impact.s);
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.explosionParticles>0,null,{timeout:2000});
 const burst=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.flight);check('fire smoke and sparks are rendered',burst.explosionParticles>0,burst);
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.phase==='idle',null,{timeout:7000});
 const recovered=await page.evaluate(()=>({now:window.__FLIGHT_TRANSITIONS__.find(p=>p.phase==='idle')?.now??performance.now(),stats:window.__SHENCHENGJI_CITY__.stats}));
 check('recovery occurs after 3 seconds into drone, with effects cleaned',recovered.now-impact.s.crashedAt>=3000&&recovered.now-impact.s.crashedAt<4000&&recovered.stats.observer.active&&recovered.stats.flight.explosionParticles===0,{elapsed:recovered.now-impact.s.crashedAt,flight:recovered.stats.flight,observer:recovered.stats.observer});await snap('04-recovered-drone');
 await page.keyboard.press('b');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.active);
 await page.evaluate(({start})=>{const w=window.__FLIGHT_REVIEW__;w.flight.sim.start(start,0);const shot=w.flight.chase();w.flight.eye.copyFrom(shot.eye);w.flight.target.copyFrom(shot.target);w.flight.root.setEnabled(true);const afterRender=w.scene.onAfterRenderObservable.add(()=>{if(w.flight.sim.phase==='exploding'&&w.flight.stats.explosionParticles>0&&performance.now()-w.flight.sim.crashedAt>=1450){w.debugSimulation=false;for(const p of w.flight.explosion.particles)p.updateSpeed=0;w.scene.onAfterRenderObservable.remove(afterRender);}});},approach);
 await page.waitForFunction(()=>!window.__FLIGHT_REVIEW__.debugSimulation,null,{timeout:15000});await snap('03-building-impact');const cascade=await page.evaluate(()=>window.__FLIGHT_REVIEW__.flight.stats.explosion);check('nine separate fire volumes plus tumbling fragments',cascade.fireballs===9&&cascade.fragments===24&&cascade.waves===4,cascade);
 await page.evaluate(()=>{const w=window.__FLIGHT_REVIEW__;w.returnFromFlight();for(const p of w.flight.explosion.particles)p.updateSpeed=.01;w.debugSimulation=true;});
 await page.keyboard.press('b');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.flight.active);await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});check('map cancels flight without a later camera reset',await page.evaluate(()=>!window.__SHENCHENGJI_CITY__.stats.flight.active));
 await page.waitForTimeout(3200);check('map remains open',await page.locator('#map-panel').isVisible());await page.keyboard.press('Escape');
 // Return the test session to the bay; no changes to the user's browser.
 check('no runtime errors',errors.length===0,errors);
}catch(error){errors.push(String(error));console.error(error);try{await snap('failure');}catch{}}
finally{await fs.writeFile(out+'/report.json',JSON.stringify({date:new Date().toISOString(),checks,shots,errors,pass:errors.length===0},null,2));await browser.close();}
console.log(JSON.stringify({out,checks:checks.map(({name,pass})=>({name,pass})),errors},null,2));if(errors.length)process.exitCode=1;
