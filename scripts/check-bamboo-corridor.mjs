import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve(process.argv[2]??'output/playwright/bamboo-corridor');
const url=process.env.GAME_URL??'http://127.0.0.1:4188/';
const driveMs=Number(process.env.CORRIDOR_DRIVE_MS??120000);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],shots=[],notes={machine:'Apple M1 Max sample — not an RTX 3060 pass',photoscrape:false,gtaParity:false};
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,1800));});

const read=()=>page.evaluate(()=>{
 const api=window.__SHENCHENGJI_CITY__;
 return {corridor:api.stats.bambooCorridor,mode:api.stats.lightMode,performance:api.performance,state:api.state};
});
const shot=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});shots.push({name,file});};
const kit=enabled=>page.evaluate(enabled=>{
 const api=window.__SHENCHENGJI_CITY__;
 api.world.bambooCorridor?.setEnabled(enabled);
 api.world.bambooCorridor?.update(api.world.time,api.world.state.x,api.world.state.z,false);
},enabled);

const look=async spec=>{
 await page.evaluate(shot=>{
  const api=window.__SHENCHENGJI_CITY__,place=api.world.data.landmarks.find(m=>m.id===shot.place);
  if(!place)throw Error('landmark unavailable: '+shot.place);
  const origin=place.arrival,spine=api.world.bambooCorridor.plan.corridor.spine;
  const list=shot.kind?api.world.bambooCorridor?.plan[shot.kind]??[]:[];
  const pits=api.world.bambooCorridor?.plan.pits??[];
  const yaw=Math.atan2(spine[1][0]-origin[0],spine[1][1]-origin[1]);
  const ranked=list.slice().sort((a,b)=>Math.hypot(a.x-origin[0],a.z-origin[1])-Math.hypot(b.x-origin[0],b.z-origin[1]));
  const alongOf=p=>(p.x-origin[0])*Math.sin(yaw)+(p.z-origin[1])*Math.cos(yaw);
  const sideOf=p=>(p.x-origin[0])*Math.cos(yaw)-(p.z-origin[1])*Math.sin(yaw);
  const ahead=p=>{
   const a=alongOf(p),s=sideOf(p);
   if(shot.alongRow)return a>18&&a<90&&s>8&&s<22;
   if(shot.parkRow)return a>24&&a<70&&s<-6&&s>-13;
   return a>16;
  };
  const target=shot.kind==='plinths'||shot.kind==='doors'
   ?ranked.find(p=>ahead(p)&&!pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.2))||ranked.find(ahead)||ranked[0]
   :ranked[0];
  const x=target?target.x:origin[0],z=target?target.z:origin[1];
  const y=api.world.groundHeight(x,z);
  const a=spine[0],b=spine[1],dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz||1;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/len2));
  const sx=a[0]+dx*t,sz=a[1]+dz*t;
  const fromRoad=shot.fromRoad?Math.atan2(sx-x,sz-z):shot.photoAngle;
  const toRoad=Math.hypot(sx-x,sz-z);
  const gap=shot.fromRoad?Math.min(shot.photoDistance,Math.max(shot.parkRow?9.8:4.2,toRoad*.62)):shot.photoDistance;
  let focusX=x,focusZ=z,angle=fromRoad,distance=gap,targetY=y+shot.photoTargetHeight;
  if((shot.alongRow||shot.closeWall)&&target){
   focusX=x+Math.sin(yaw)*3.2;focusZ=z+Math.cos(yaw)*3.2;
   const snap=api.world.collision.nearest(sx,sz);
   const eyeX=(snap&&snap.d<16?snap.x:sx)-Math.sin(yaw)*5.2;
   const eyeZ=(snap&&snap.d<16?snap.z:sz)-Math.cos(yaw)*5.2;
   angle=Math.atan2(eyeX-focusX,eyeZ-focusZ);
   distance=Math.max(7.2,Math.hypot(eyeX-focusX,eyeZ-focusZ));
   targetY=api.world.groundHeight(focusX,focusZ)+shot.photoTargetHeight;
  }
  api.world.setLightMode('day');
  api.world.enterPhoto({
   id:'corridor-'+shot.id,name:shot.title,x:focusX,z:focusZ,height:8,area:place.area,excludeRadius:0,
   arrival:place.arrival,yaw:place.yaw,photoDistance:distance,photoElevation:shot.photoElevation,
   photoAngle:angle,photoTargetHeight:targetY,
  });
  api.world.bambooCorridor?.update(api.world.time,focusX,focusZ,false);
 },spec);
 await page.waitForTimeout(1100);
};

const driveView=async(id='bamboo')=>{
 await page.evaluate(id=>{
  const api=window.__SHENCHENGJI_CITY__,place=api.world.data.landmarks.find(m=>m.id===id);
  const spine=api.world.bambooCorridor.plan.corridor.spine;
  api.world.exitPhoto();api.world.travel(place);api.world.setLightMode('day');
  const look=Math.atan2(spine[1][0]-place.arrival[0],spine[1][1]-place.arrival[1]);
  const along=id==='bamboo'?26:12;
  let x=place.arrival[0]+Math.sin(look)*along,z=place.arrival[1]+Math.cos(look)*along;
  const snap=api.world.collision.nearest(x,z);
  if(snap&&snap.d<18&&String(snap.road.name||'').includes('科苑')){x=snap.x;z=snap.z;}
  const shop=api.world.bambooCorridor.plan.plinths.filter(p=>{
   const a=(p.x-x)*Math.sin(look)+(p.z-z)*Math.cos(look);
   const s=(p.x-x)*Math.cos(look)-(p.z-z)*Math.sin(look);
   return a>8&&a<80&&Math.abs(s)<22;
  }).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  const side=shop?((shop.x-x)*Math.cos(look)-(shop.z-z)*Math.sin(look)):0;
  const yaw=look+Math.sign(side||1)*.36;
  const y=api.world.groundHeight(x,z);
  api.world.state.x=x;api.world.state.z=z;api.world.state.yaw=look;api.world.state.speed=0;
  api.world.cameraYaw=yaw;
  api.world.car.position.set(x,y+.115,z);
  api.world.car.rotation.y=look;
  api.world.camera.position.set(x-Math.sin(yaw)*7.1,y+1.42,z-Math.cos(yaw)*7.1);
  const tx=x+Math.sin(look)*18+(shop?(shop.x-x)*.28:0);
  const tz=z+Math.cos(look)*18+(shop?(shop.z-z)*.28:0);
  const target=api.world.camera.getTarget();
  target.set(tx,y+1.22,tz);
  api.world.camera.setTarget(target);
  api.world.bambooCorridor.update(api.world.time,x,z,false);
 },id);
 await page.waitForTimeout(1400);
};

try{
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.waitForTimeout(1600);
 const boot=await read();
 if(!boot.corridor)throw Error('bamboo corridor stats missing');
 notes.corridor=boot.corridor;
 if(boot.corridor.photoscrape)errors.push('corridor claimed photoscrape');
 if(boot.corridor.curbs<40||boot.corridor.walks<40||boot.corridor.lamps<8||boot.corridor.shopfronts<4){
  errors.push('corridor kit is too thin: '+JSON.stringify(boot.corridor));
 }

 await kit(false);await driveView();await shot('before-drive-day');
 await kit(true);await driveView();await shot('after-drive-day');

 await kit(false);await look({id:'walk-eye',title:'步行眼高',place:'bamboo',kind:'doors',photoDistance:8.4,photoElevation:.1,photoTargetHeight:1.4,fromRoad:true,alongRow:true});
 await shot('before-walk-eye');
 await kit(true);await look({id:'walk-eye',title:'步行眼高',place:'bamboo',kind:'doors',photoDistance:8.4,photoElevation:.1,photoTargetHeight:1.4,fromRoad:true,alongRow:true});
 await shot('after-walk-eye');

 await kit(false);await look({id:'curb',title:'路缘',place:'bamboo',kind:'curbs',photoDistance:6.8,photoElevation:.16,photoTargetHeight:.55,fromRoad:true});
 await shot('before-curb');
 await kit(true);await look({id:'curb',title:'路缘',place:'bamboo',kind:'curbs',photoDistance:6.8,photoElevation:.16,photoTargetHeight:.55,fromRoad:true});
 await shot('after-curb');

 await kit(false);await look({id:'junction',title:'路口',place:'bamboo',kind:'signals',photoDistance:14,photoElevation:.18,photoAngle:.4,photoTargetHeight:2.8});
 await shot('before-junction');
 await kit(true);await look({id:'junction',title:'路口',place:'bamboo',kind:'signals',photoDistance:14,photoElevation:.18,photoAngle:.4,photoTargetHeight:2.8});
 await shot('after-junction');

 await kit(false);await look({id:'shop',title:'首层店面',place:'bamboo',kind:'doors',photoDistance:9.2,photoElevation:.12,photoTargetHeight:1.45,fromRoad:true});
 await shot('before-shop');
 await kit(true);await look({id:'shop',title:'首层店面',place:'bamboo',kind:'doors',photoDistance:9.2,photoElevation:.12,photoTargetHeight:1.45,fromRoad:true});
 await shot('after-shop');

 await kit(false);await look({id:'park',title:'路边停车',place:'bamboo',kind:'parked',photoDistance:14,photoElevation:.08,photoTargetHeight:.7,fromRoad:true,parkRow:true});
 await shot('before-park');
 await kit(true);await look({id:'park',title:'路边停车',place:'bamboo',kind:'parked',photoDistance:14,photoElevation:.08,photoTargetHeight:.7,fromRoad:true,parkRow:true});
 await shot('after-park');

 await kit(false);await look({id:'low-air',title:'低空',place:'bamboo',kind:'lamps',photoDistance:42,photoElevation:.34,photoAngle:.2,photoTargetHeight:3});
 await shot('before-low-air');
 await kit(true);await look({id:'low-air',title:'低空',place:'bamboo',kind:'lamps',photoDistance:42,photoElevation:.34,photoAngle:.2,photoTargetHeight:3});
 await shot('after-low-air');

 await kit(false);await look({id:'trees',title:'树池',place:'bamboo',kind:'pits',photoDistance:7.6,photoElevation:.16,photoTargetHeight:1.55,fromRoad:true});
 await shot('before-trees');
 await kit(true);await look({id:'trees',title:'树池',place:'bamboo',kind:'pits',photoDistance:7.6,photoElevation:.16,photoTargetHeight:1.55,fromRoad:true});
 await shot('after-trees');

 await kit(true);await driveView('bamboo');await shot('drive-start-after');
 await kit(true);await driveView('talent');await shot('after-drive-talent');
 if(driveMs>0){
  await page.locator('#game').click({position:{x:960,y:540}});
  await page.evaluate(()=>{
   const api=window.__SHENCHENGJI_CITY__,from=api.world.data.landmarks.find(m=>m.id==='bamboo'),to=api.world.data.landmarks.find(m=>m.id==='talent');
   api.world.exitPhoto();api.world.bambooCorridor.setEnabled(true);api.world.travel(from);api.world.setLightMode('day');
   api.world.paused=false;api.world.keys.clear();api.world.startAutoDrive(to);
   window.__SHENCHENGJI_CITY__.resetPerformance();
  });
  await page.waitForTimeout(driveMs);
  const drive=await read();
  notes.driveSeconds=driveMs/1000;
  notes.drive=drive.performance&&{meanFps:drive.performance.meanFps,p50:drive.performance.p50,p95:drive.performance.p95,p99:drive.performance.p99,samples:drive.performance.samples,over50ms:drive.performance.over50ms,resolution:drive.performance.resolution,drawCalls:drive.performance.drawCalls,gpuMs:drive.performance.gpuMs};
  notes.corridor=drive.corridor;
  notes.end={x:drive.state.x,z:drive.state.z,distance:drive.state.distance,speed:drive.state.speed};
  if(!drive.performance?.samples)errors.push('120s drive produced no performance samples');
  await page.evaluate(()=>{
   const api=window.__SHENCHENGJI_CITY__,from=api.world.data.landmarks.find(m=>m.id==='bamboo');
   const look=Math.atan2(from.arrival[0]-api.world.state.x,from.arrival[1]-api.world.state.z);
   api.world.state.yaw=look;api.world.cameraYaw=look;
  });
  await page.waitForTimeout(800);
  await shot('drive-end-after');
 }
 notes.input='startAutoDrive(talent) for 120s after travel(bamboo); stills use day light and road-snapped chase cameras';
 notes.disclaimer='p95 is a Mac M1 Max headless sample at 1080p. Acceptance remains RTX 3060. This is not GTA V completeness or ChrisGPT flight-demo parity.';
}catch(error){errors.push(String(error));try{await shot('failure');}catch{}}
finally{
 if(driveMs<=0){
  try{
   const prev=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
   if(prev.notes?.drive&&!notes.drive){
    notes.drive=prev.notes.drive;notes.driveSeconds=prev.notes.driveSeconds;notes.end=prev.notes.end;
    if(prev.shots?.some(s=>s.name==='drive-end-after')&&!shots.some(s=>s.name==='drive-end-after')){
     shots.push(prev.shots.find(s=>s.name==='drive-end-after'));
    }
   }
  }catch{}
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,errors,shots,notes,pass:errors.length===0},null,2));
 await browser.close();
}
console.log(JSON.stringify({out,errors,pass:errors.length===0,corridor:notes.corridor,drive:notes.drive&&{...notes.drive,end:notes.end},disclaimer:notes.disclaimer},null,2));
if(errors.length)process.exitCode=1;
