import {chromium} from 'playwright';import fs from 'node:fs/promises';
const out='output/playwright/local-characters';const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[];
const check=(name,pass,data)=>{checks.push({name,pass,data});console.log(JSON.stringify(checks.at(-1)));if(!pass)throw Error(name);};
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});
 await page.evaluate(async()=>{const w=window.__SHENCHENGJI_CITY__.world;await w.ensureRider();w.setLightMode('sunset');await w.toggleWalking();});
 await page.waitForTimeout(300);await page.screenshot({path:out+'/06-follow-camera.png'});
 const dimensions=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world,p=w.rider.meshes.flatMap(m=>m.getBoundingInfo().boundingBox.vectorsWorld),v=w.camera.getTransformationMatrix(),view=w.engine.getRenderHeight();return {camera:w.camera.position.asArray(),distance:w.walk.cameraDistance,actor:w.actor};});
 check('third-person follows player with requested default distance',dimensions.distance===3.7,dimensions);
 const bridge=await page.evaluate(()=>{
  const w=window.__SHENCHENGJI_CITY__.world,b=w.coastal.manifest.crossings.find(b=>b.name.includes('后海'))??w.coastal.manifest.crossings[0],a=b.points[0],c=b.points[1];
  w.state.x=a[0]+80;w.state.z=a[1]+80;Object.assign(w.walk,{active:true,x:(a[0]+c[0])/2,z:(a[1]+c[1])/2,yaw:Math.atan2(c[0]-a[0],c[1]-a[1]),speed:0});
  const initial={x:w.walk.x,z:w.walk.z};let min=Infinity,max=0;
  for(let i=0;i<80;i++){w.walk.step(new Set(['KeyW']),.05);const h=w.walkingSurfaceHeight(w.walk.x,w.walk.z);min=Math.min(min,h);max=Math.max(max,h);}
  w.cull();return {name:b.name,moved:Math.hypot(w.walk.x-initial.x,w.walk.z-initial.z),min,max,water:w.coastal.manifest.waterHeight};
 });
 check('walking stays on the authored bridge deck above water',bridge.moved>4&&bridge.min>bridge.water+1,bridge);
 await page.waitForTimeout(300);await page.screenshot({path:out+'/07-bridge-walk.png'});
 const camera=await page.evaluate(()=>{
  const w=window.__SHENCHENGJI_CITY__.world,l=w.bambooCafe.layout;
  const p=l.world(7.65,0);Object.assign(w.walk,{active:true,x:p.x,z:p.z,yaw:Math.atan2(l.world(-1,0).x-l.world(0,0).x,l.world(-1,0).z-l.world(0,0).z),pitch:0,cameraDistance:5});
  w.paused=false;w.walkFirstPerson=false;w.update(.016);
  const a=w.camera.position;return {blocked:w.propBlocked(a.x,a.z),distance:Math.hypot(a.x-w.walk.x,a.z-w.walk.z)};
 });
 check('camera retracts before cafe exterior wall',!camera.blocked&&camera.distance<2,camera);
 await page.screenshot({path:out+'/08-wall-camera.png'});
 const steps=await page.evaluate(()=>{
  const w=window.__SHENCHENGJI_CITY__.world,l=w.bambooCafe.layout,p=l.world(0,-21);Object.assign(w.walk,{active:true,x:p.x,z:p.z,yaw:w.bambooCafe.stats.site.heading});
  const levels=[];for(let i=0;i<182;i++){w.walk.step(new Set(['KeyW']),.05);levels.push(w.walkingSurfaceHeight(w.walk.x,w.walk.z));}
  return {inside:l.inside(w.walk.x,w.walk.z),min:Math.min(...levels),max:Math.max(...levels)};
 });
 check('walk crosses entrance step through actual shared colliders',steps.inside&&steps.max>steps.min,steps);
 await page.evaluate(async()=>{const w=window.__SHENCHENGJI_CITY__.world;await w.bambooCafe.ensureInterior();w.setLightMode('night');});
 await page.waitForTimeout(1500);
 await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;window.__front=w.scene.onBeforeRenderObservable.add(()=>{const m=w.scene.getTransformNodeByName('staff_zhixia'),source=w.scene.getTransformNodeByName('staff_user_zhixia'),p=m.getAbsolutePosition(),v=source.getDirection(w.camera.position.clone().set(0,0,1)).normalize();w.camera.position.set(p.x+v.x*2.5,p.y+1.05,p.z+v.z*2.5);w.camera.setTarget(p.add(v.set(0,.95,0)));});});
 await page.waitForTimeout(500);await page.screenshot({path:out+'/09-yelan-front-night.png'});
}catch(e){console.error(e);process.exitCode=1;}
finally{await browser.close();await fs.writeFile(out+'/surfaces-report.json',JSON.stringify(checks,null,2));}
