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
const hideChrome=()=>page.evaluate(()=>{
 const ui=document.getElementById('ui');
 if(ui)ui.style.setProperty('display','none','important');
 for(const sel of ['.story-hud','.story-entry','.story-dialog','#observer-help','#flight-hud','#career-objective','#route-hud','#ue5-client-note']){
  document.querySelectorAll(sel).forEach(el=>{el.setAttribute('hidden','');el.style.display='none';});
 }
});

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
   if(shot.midRow)return p.z<-1140&&p.z>-1280&&Math.abs(s)<20;
   if(shot.alongRow)return a>18&&a<90&&s>8&&s<26;
   if(shot.parkRow)return a>36&&a<80&&s<-6&&s>-13;
   if(shot.curbRow||shot.pitRow)return a>24&&a<80&&s>-10&&s<1;
   return a>16;
  };
  const walks=api.world.bambooCorridor?.plan.walks??[];
  const parked=api.world.bambooCorridor?.plan.parked??[];
  const clear=p=>!pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.2)&&!walks.some(w=>Math.hypot(w.x-p.x,w.z-p.z)<1.6)&&!parked.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<3.4);
  const target=shot.kind==='plinths'||shot.kind==='doors'
   ?ranked.find(p=>ahead(p)&&clear(p))||ranked.find(p=>ahead(p)&&!pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.2))||ranked.find(ahead)||ranked[0]
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
  if((shot.alongRow||shot.closeWall||shot.curbRow||shot.pitRow)&&target){
   focusX=x+Math.sin(yaw)*3.2;focusZ=z+Math.cos(yaw)*3.2;
   const snap=api.world.collision.nearest(sx,sz);
   const eyeX=(snap&&snap.d<16?snap.x:sx)-Math.sin(yaw)*5.2;
   const eyeZ=(snap&&snap.d<16?snap.z:sz)-Math.cos(yaw)*5.2;
   angle=Math.atan2(eyeX-focusX,eyeZ-focusZ);
   distance=Math.max(7.2,Math.hypot(eyeX-focusX,eyeZ-focusZ));
   targetY=api.world.groundHeight(focusX,focusZ)+shot.photoTargetHeight;
  }
  const ui=document.getElementById('ui');if(ui)ui.style.setProperty('display','none','important');
  for(const sel of ['.story-hud','.story-entry','.story-dialog','#observer-help','#flight-hud','#career-objective','#route-hud','#ue5-client-note']){
   document.querySelectorAll(sel).forEach(el=>{el.setAttribute('hidden','');el.style.display='none';});
  }
  api.world.setLightMode('day');
  api.world.enterPhoto({
   id:'corridor-'+shot.id,name:shot.title,x:focusX,z:focusZ,height:8,area:place.area,excludeRadius:0,
   arrival:place.arrival,yaw:place.yaw,photoDistance:distance,photoElevation:shot.photoElevation,
   photoAngle:angle,photoTargetHeight:targetY,
  });
  api.world.bambooCorridor?.update(api.world.time,focusX,focusZ,false);
 },spec);
 await hideChrome();
 await page.waitForTimeout(1100);
};

const streetStill=async({kind='doors',minAcc=24,maxAcc=180,eye=1.56,back=8.2,includeCurb=false}={})=>{
 const route=await ensureRoute();
 await page.evaluate(({route,kind,minAcc,maxAcc,eye,back,includeCurb})=>{
  const api=window.__SHENCHENGJI_CITY__,plan=api.world.bambooCorridor.plan;
  const list=plan[kind]??[];
  const band=(p,x,z,look)=>{
   const along=(p.x-x)*Math.sin(look)+(p.z-z)*Math.cos(look);
   const side=(p.x-x)*Math.cos(look)-(p.z-z)*Math.sin(look);
   if(kind==='curbs'||kind==='pits')return {along,side,ok:along>4&&along<18&&Math.abs(side)>2.6&&Math.abs(side)<8.6};
   return {along,side,ok:along>6&&along<22&&Math.abs(side)>4.6&&Math.abs(side)<11};
  };
  let acc=0,pick=null;
  for(let i=1;i<route.length;i++){
   const dx=route[i][0]-route[i-1][0],dz=route[i][1]-route[i-1][1];
   acc+=Math.hypot(dx,dz);
   if(acc<minAcc||acc>maxAcc)continue;
   const x=route[i][0],z=route[i][1],look=Math.atan2(dx,dz);
   const hits=list.filter(p=>band(p,x,z,look).ok);
   const shops=plan.plinths.filter(p=>band(p,x,z,look).ok);
   const cars=plan.parked.filter(p=>band(p,x,z,look).ok);
   const shopD=p=>plan.plinths.reduce((m,s)=>Math.min(m,Math.hypot(s.x-p.x,s.z-p.z)),99);
   const openCars=cars.filter(p=>shopD(p)>4.4);
   const score=kind==='parked'?openCars.length*28+(openCars.length?50:0)+shops.length*4+hits.length
    :kind==='curbs'?hits.length*90+shops.length*8-cars.length*10-(hits.length?0:40)
    :kind==='pits'?hits.length*80+shops.length*2+cars.length-(hits.length?0:40)
    :hits.length*10+shops.length*8+cars.length*2;
   if((kind==='pits'||kind==='curbs')&&!hits.length)continue;
   if(!pick||score>pick.score)pick={x,z,look,hits,cars,shops,openCars,score};
  }
  if((kind==='pits'||kind==='curbs')&&(!pick||!pick.hits.length)){
   let acc=0;
   for(let i=1;i<route.length;i++){
    const dx=route[i][0]-route[i-1][0],dz=route[i][1]-route[i-1][1];
    acc+=Math.hypot(dx,dz);
    if(acc<16||acc>360)continue;
    const x=route[i][0],z=route[i][1],look=Math.atan2(dx,dz);
    const hits=list.filter(p=>{
     const a=(p.x-x)*Math.sin(look)+(p.z-z)*Math.cos(look);
     const s=Math.abs((p.x-x)*Math.cos(look)-(p.z-z)*Math.sin(look));
     return a>3&&a<22&&s>2.2&&s<10;
    });
    if(hits.length&&(!pick||hits.length>pick.hits.length))pick={x,z,look,hits,cars:[],shops:[],openCars:[],score:hits.length*80};
   }
  }
  if(!pick&&route.length>4){
   const i=Math.min(route.length-2,8);
   pick={x:route[i][0],z:route[i][1],look:Math.atan2(route[i+1][0]-route[i][0],route[i+1][1]-route[i][1]),hits:[],cars:[],shops:[],openCars:[],score:0};
  }
  if(!pick)return;
  const rank=p=>{
   const a=band(p,pick.x,pick.z,pick.look);
   return Math.abs(a.along-12)+Math.abs(Math.abs(a.side)-7.2);
  };
  const target=kind==='parked'
   ?((pick.openCars||pick.cars).slice().sort((a,b)=>rank(a)-rank(b))[0]||pick.hits[0]||pick.shops[0])
   :(pick.hits.slice().sort((a,b)=>rank(a)-rank(b))[0]||pick.shops[0]||pick.cars[0]);
  const y=api.world.groundHeight(pick.x,pick.z);
  api.world.bambooCorridor?.setStreetCarsEnabled(true);
  api.world.setLightMode('day');api.world.paused=true;api.world.view=0;
  api.world.state.x=pick.x;api.world.state.z=pick.z;api.world.state.yaw=pick.look;api.world.state.speed=0;api.world.state.steer=0;
  api.world.car.position.set(pick.x,y+.115,pick.z);api.world.car.rotation.y=pick.look;
  const hideCar=kind==='doors'||kind==='plinths'||kind==='parked'||kind==='curbs'||kind==='pits';
  api.world.car.setEnabled(!hideCar);
  const blockers=[...(plan.parked||[]),...(plan.rolling||[])];
  const poles=[...(plan.lamps||[]),...(plan.signals||[]),...(plan.pits||[])];
  const clearEye=(x,z,minCar=4.6,minShop=3.2,minPole=2.1)=>{
   let ex=x,ez=z;
   for(let n=0;n<7;n++){
    let near=null,d=99;
    for(const p of blockers){const q=Math.hypot(p.x-ex,p.z-ez);if(q<d){d=q;near=p;}}
    if(near&&d<minCar){
     const vx=ex-near.x,vz=ez-near.z,vd=Math.hypot(vx,vz)||1;
     ex+=vx/vd*(minCar-d+.4);ez+=vz/vd*(minCar-d+.4);
     continue;
    }
    let shop=null,sd=99;
    for(const p of plan.plinths||[]){const q=Math.hypot(p.x-ex,p.z-ez);if(q<sd){sd=q;shop=p;}}
    if(shop&&sd<minShop){
     const vx=ex-shop.x,vz=ez-shop.z,vd=Math.hypot(vx,vz)||1;
     ex+=vx/vd*(minShop-sd+.25);ez+=vz/vd*(minShop-sd+.25);
     continue;
    }
    let pole=null,pd=99;
    for(const p of poles){const q=Math.hypot(p.x-ex,p.z-ez);if(q<pd){pd=q;pole=p;}}
    if(pole&&pd<minPole){
     const vx=ex-pole.x,vz=ez-pole.z,vd=Math.hypot(vx,vz)||1;
     ex+=vx/vd*(minPole-pd+.35);ez+=vz/vd*(minPole-pd+.35);
     continue;
    }
    break;
   }
   return {x:ex,z:ez};
  };
  if(target&&(kind==='doors'||kind==='plinths'||kind==='parked'||kind==='curbs'||kind==='pits')){
   const side=(target.x-pick.x)*Math.cos(pick.look)-(target.z-pick.z)*Math.sin(pick.look);
   const rightX=Math.cos(pick.look),rightZ=-Math.sin(pick.look);
   const fwdX=Math.sin(pick.look),fwdZ=Math.cos(pick.look);
   let eyeX,eyeZ,focusX,focusZ,focusY,dist;
   if(kind==='parked'){
    const inward=side===0?1:-Math.sign(side);
    eyeX=pick.x-fwdX*11.4-rightX*inward*0.15;eyeZ=pick.z-fwdZ*11.4-rightZ*inward*0.15;
    for(let n=0;n<6;n++){
     const carD=blockers.reduce((m,p)=>Math.min(m,Math.hypot(p.x-eyeX,p.z-eyeZ)),99);
     if(carD>=5.6)break;
     eyeX-=fwdX*1.7;eyeZ-=fwdZ*1.7;
    }
    focusX=target.x+fwdX*.8+rightX*inward*.2;focusZ=target.z+fwdZ*.8+rightZ*inward*.2;
    focusY=api.world.groundHeight(focusX,focusZ)+.68;
    dist=Math.max(13.2,Math.hypot(eyeX-focusX,eyeZ-focusZ));
   }else if(kind==='doors'||kind==='plinths'){
    let shop=plan.plinths.slice().sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z))[0]||target;
    if(includeCurb){
     const scored=plan.plinths.filter(s=>Math.hypot(s.x-target.x,s.z-target.z)<22).map(s=>{
      const flip=s.sz||1;
      const faceX=-Math.sin(s.yaw)*flip,faceZ=-Math.cos(s.yaw)*flip;
      const wallX=Math.cos(s.yaw),wallZ=-Math.sin(s.yaw);
      const lamps=plan.lamps.filter(l=>{
       const along=(l.x-s.x)*wallX+(l.z-s.z)*wallZ;
       const face=(l.x-s.x)*faceX+(l.z-s.z)*faceZ;
       return along>2&&along<12&&face>0.4&&face<6.2;
      }).length;
      const cars=plan.parked.filter(c=>{
       const along=(c.x-s.x)*wallX+(c.z-s.z)*wallZ;
       const face=(c.x-s.x)*faceX+(c.z-s.z)*faceZ;
       return along>1.5&&along<10&&face>1.6&&face<5.4;
      }).length;
      return {s,lamps,cars};
     }).sort((a,b)=>a.cars-b.cars||b.lamps-a.lamps||Math.hypot(a.s.x-target.x,a.s.z-target.z)-Math.hypot(b.s.x-target.x,b.s.z-target.z));
     if(scored[0])shop=scored[0].s;
    }else{
     const scored=plan.plinths.filter(s=>Math.hypot(s.x-target.x,s.z-target.z)<28).map(s=>{
      const pits=plan.pits.filter(p=>Math.hypot(p.x-s.x,p.z-s.z)<3.6).length;
      return {s,pits};
     }).sort((a,b)=>a.pits-b.pits||Math.hypot(a.s.x-target.x,a.s.z-target.z)-Math.hypot(b.s.x-target.x,b.s.z-target.z));
     if(scored[0])shop=scored[0].s;
    }
    const flip=shop.sz||1;
    const faceX=-Math.sin(shop.yaw)*flip,faceZ=-Math.cos(shop.yaw)*flip;
    const wallX=Math.cos(shop.yaw),wallZ=-Math.sin(shop.yaw);
    if(includeCurb){
     eyeX=shop.x+faceX*2.75+wallX*5.8;eyeZ=shop.z+faceZ*2.75+wallZ*5.8;
     ({x:eyeX,z:eyeZ}=clearEye(eyeX,eyeZ,6.2,2.5,2.4));
     for(let n=0;n<5;n++){
      const carD=blockers.reduce((m,p)=>Math.min(m,Math.hypot(p.x-eyeX,p.z-eyeZ)),99);
      if(carD>=5.8)break;
      eyeX+=wallX*1.4;eyeZ+=wallZ*1.4;
     }
     const out=(eyeX-shop.x)*faceX+(eyeZ-shop.z)*faceZ;
     if(out<2.35){eyeX+=faceX*(2.35-out);eyeZ+=faceZ*(2.35-out);}
     if(out>3.15){eyeX-=faceX*(out-3.15);eyeZ-=faceZ*(out-3.15);}
     focusX=shop.x+faceX*2.15+wallX*6.4;focusZ=shop.z+faceZ*2.15+wallZ*6.4;
     focusY=api.world.groundHeight(focusX,focusZ)+.42;
     dist=Math.max(6.4,Math.hypot(eyeX-focusX,eyeZ-focusZ));
    }else{
     eyeX=shop.x+faceX*3.05+wallX*4.8;eyeZ=shop.z+faceZ*3.05+wallZ*4.8;
     ({x:eyeX,z:eyeZ}=clearEye(eyeX,eyeZ,5.2,2.35,2.4));
     const out=(eyeX-shop.x)*faceX+(eyeZ-shop.z)*faceZ;
     if(out<2.55){eyeX+=faceX*(2.55-out);eyeZ+=faceZ*(2.55-out);}
     if(out>3.55){eyeX-=faceX*(out-3.55);eyeZ-=faceZ*(out-3.55);}
     focusX=shop.x+faceX*1.85+wallX*6.6;focusZ=shop.z+faceZ*1.85+wallZ*6.6;
     focusY=api.world.groundHeight(focusX,focusZ)+1.12;
     dist=Math.max(6.4,Math.hypot(eyeX-focusX,eyeZ-focusZ));
    }
   }else if(kind==='pits'){
    const toward=side===0?1:Math.sign(side);
    eyeX=target.x+rightX*toward*2.1-fwdX*3.6;eyeZ=target.z+rightZ*toward*2.1-fwdZ*3.6;
    ({x:eyeX,z:eyeZ}=clearEye(eyeX,eyeZ,3.6,3.2,1.6));
    focusX=target.x+fwdX*.25;focusZ=target.z+fwdZ*.25;
    focusY=api.world.groundHeight(focusX,focusZ)+.18;
    dist=Math.max(4.8,Math.hypot(eyeX-focusX,eyeZ-focusZ));
   }else if(kind==='curbs'){
    const toward=side===0?1:Math.sign(side);
    eyeX=target.x+rightX*toward*1.42-fwdX*3.6;eyeZ=target.z+rightZ*toward*1.42-fwdZ*3.6;
    ({x:eyeX,z:eyeZ}=clearEye(eyeX,eyeZ,5.6,3.0,1.8));
    for(let n=0;n<6;n++){
     const carD=blockers.reduce((m,p)=>Math.min(m,Math.hypot(p.x-eyeX,p.z-eyeZ)),99);
     if(carD>=5.8)break;
     eyeX-=fwdX*1.5;eyeZ-=fwdZ*1.5;
    }
    focusX=target.x+fwdX*2.8+rightX*toward*.12;focusZ=target.z+fwdZ*2.8+rightZ*toward*.12;
    focusY=api.world.groundHeight(focusX,focusZ)+.18;
    dist=Math.max(5.2,Math.hypot(eyeX-focusX,eyeZ-focusZ));
   }else{
    eyeX=pick.x+fwdX*1.6;eyeZ=pick.z+fwdZ*1.6;
    focusX=pick.x+fwdX*8.4+rightX*Math.sign(side||1)*1.4;focusZ=pick.z+fwdZ*8.4+rightZ*Math.sign(side||1)*1.4;
    focusY=api.world.groundHeight(focusX,focusZ)+.36;
    dist=Math.max(7.6,Math.hypot(eyeX-focusX,eyeZ-focusZ));
   }
   const eyeY=api.world.groundHeight(eyeX,eyeZ)+eye;
   const place=api.world.data.landmarks.find(m=>m.id==='bamboo');
   api.world.enterPhoto({
    id:'corridor-still-'+kind,name:kind,x:focusX,z:focusZ,height:8,area:place.area,excludeRadius:0,
    arrival:place.arrival,yaw:pick.look,photoDistance:dist,
    photoElevation:Math.asin(Math.max(-.1,Math.min((includeCurb||kind==='pits')?.32:kind==='curbs'?.16:.14,(eyeY-focusY)/dist))),
    photoAngle:-Math.atan2(focusX-eyeX,focusZ-eyeZ),
    photoTargetHeight:focusY,
   });
  }else{
   api.world.exitPhoto();
   const side=target?(target.x-pick.x)*Math.cos(pick.look)-(target.z-pick.z)*Math.sin(pick.look):0;
   const glance=side===0?0:side<0?-0.26:0.26;
   api.world.cameraYaw=pick.look-glance;api.world.cameraPitch=.08;
   const lat=side<0?-1.1:1.1;
   api.world.camera.position.set(pick.x-Math.sin(pick.look-glance)*back+Math.cos(pick.look)*lat,y+eye,pick.z-Math.cos(pick.look-glance)*back-Math.sin(pick.look)*lat);
   const aim=api.world.camera.getTarget();
   if(target)aim.set(pick.x+Math.sin(pick.look)*7+(target.x-pick.x)*.35,y+eye*.7,pick.z+Math.cos(pick.look)*7+(target.z-pick.z)*.35);
   else aim.set(pick.x+Math.sin(pick.look)*9,y+1.2,pick.z+Math.cos(pick.look)*9);
   api.world.camera.setTarget(aim);
  }
  api.world.traffic?.place(pick.x,pick.z);
  api.world.bambooCorridor.update(api.world.time,pick.x,pick.z,false);
 },{route,kind,minAcc,maxAcc,eye,back,includeCurb});
 await hideChrome();
 await page.waitForTimeout(1200);
};
const parkView=()=>streetStill({kind:'parked',minAcc:36,maxAcc:220,eye:1.52,back:10.4});

let driveRoute=null;
const ensureRoute=async()=>{
 if(driveRoute?.length>24)return driveRoute;
 await page.evaluate(()=>{
  const api=window.__SHENCHENGJI_CITY__;
  const from=api.world.data.landmarks.find(m=>m.id==='bamboo');
  const to=api.world.data.landmarks.find(m=>m.id==='talent');
  api.world.exitPhoto();api.world.setLightMode('day');
  api.world.travel(from);api.world.startAutoDrive(to);api.world.paused=false;
 });
 await page.waitForFunction(()=>(window.__SHENCHENGJI_CITY__.world.autopilot?.status.route.length??0)>24,null,{timeout:10000}).catch(()=>{});
 driveRoute=await page.evaluate(()=>{
  const route=window.__SHENCHENGJI_CITY__.world.autopilot?.status.route??[];
  window.__SHENCHENGJI_CITY__.world.cancelAutoDrive('still');
  window.__SHENCHENGJI_CITY__.world.paused=true;
  return route;
 });
 return driveRoute;
};

const routeView=async({minAcc=20,maxAcc=90,preferSignal=false,preferFace=false}={})=>{
 const route=await ensureRoute();
 await page.evaluate(({route,minAcc,maxAcc,preferSignal,preferFace})=>{
  const api=window.__SHENCHENGJI_CITY__,plan=api.world.bambooCorridor.plan;
  let acc=0,pick=null,both=null;
  if(preferSignal){
   const marks=[...(plan.crossings||[]).map(p=>({...p,mark:'cross'})),...(plan.signals||[]).map(p=>({...p,mark:'sig'}))];
   for(const mark of marks){
    const spine=plan.corridor.spine,dxs=spine[1][0]-spine[0][0],dzs=spine[1][1]-spine[0][1],len2=dxs*dxs+dzs*dzs||1;
    const t=Math.max(0,Math.min(1,((mark.x-spine[0][0])*dxs+(mark.z-spine[0][1])*dzs)/len2));
    const px=spine[0][0]+dxs*t,pz=spine[0][1]+dzs*t,d=Math.hypot(mark.x-px,mark.z-pz);
    if(t<0.14||t>0.58||d>18)continue;
    let a=0;
    for(let i=1;i<route.length;i++){
     const dx=route[i][0]-route[i-1][0],dz=route[i][1]-route[i-1][1];
     a+=Math.hypot(dx,dz);
     const x=route[i][0],z=route[i][1],look=Math.atan2(dx,dz);
     const along=(mark.x-x)*Math.sin(look)+(mark.z-z)*Math.cos(look);
     const side=(mark.x-x)*Math.cos(look)-(mark.z-z)*Math.sin(look);
     if(along<8||along>28||Math.abs(side)>14)continue;
     const closeCars=[...plan.parked,...(plan.rolling||[])].filter(p=>{
      const a=(p.x-x)*Math.sin(look)+(p.z-z)*Math.cos(look);
      const s=Math.abs((p.x-x)*Math.cos(look)-(p.z-z)*Math.sin(look));
      return a>1&&a<22&&s<5.2;
     }).length;
     const nearSigs=plan.signals.filter(s=>Math.hypot(s.x-mark.x,s.z-mark.z)<16);
     const nearCross=plan.crossings.filter(s=>Math.hypot(s.x-mark.x,s.z-mark.z)<12);
     if(!nearCross.length&&mark.mark!=='cross')continue;
     const kit=(mark.mark==='cross'?280:240)+nearSigs.length*40+nearCross.length*8-Math.abs(along-14)-Math.abs(side)*3.2-closeCars*28-(t>0.2&&t<0.38?0:40);
     const hit={x,z,look,kit,shops:[],cars:[],nearShops:[],nearCars:[],pits:[],signals:nearSigs.length?nearSigs:mark.mark==='sig'?[mark]:[],crossings:nearCross.length?nearCross:mark.mark==='cross'?[mark]:[]};
     if(!pick||kit>pick.kit)pick=hit;
    }
   }
  }
  for(let i=1;i<route.length&&!(preferSignal&&pick);i++){
   const dx=route[i][0]-route[i-1][0],dz=route[i][1]-route[i-1][1];
   acc+=Math.hypot(dx,dz);
   if(acc<minAcc||acc>maxAcc)continue;
   const x=route[i][0],z=route[i][1],look=Math.atan2(dx,dz);
   if(preferFace&&Math.abs(Math.cos(look))<0.72)continue;
   const alongOf=p=>(p.x-x)*Math.sin(look)+(p.z-z)*Math.cos(look);
   const sideOf=p=>(p.x-x)*Math.cos(look)-(p.z-z)*Math.sin(look);
   const band=(p,a0,a1,s0,s1)=>{const a=alongOf(p),s=Math.abs(sideOf(p));return a>a0&&a<a1&&s>s0&&s<s1;};
   const shops=plan.plinths.filter(p=>band(p,6,18,4.4,10.5));
   const cars=plan.parked.filter(p=>band(p,5,20,4.2,10.8));
   const nearShops=shops.filter(p=>band(p,6,16,4.4,9.8));
   const nearCars=cars.filter(p=>band(p,5,16,4.2,9.8));
   const pits=plan.pits.filter(p=>band(p,5,18,3.8,9.2));
   const signals=plan.signals.filter(p=>band(p,8,70,.6,16));
   const crossings=plan.crossings.filter(p=>band(p,8,28,0,12));
   const shopLat=nearShops.reduce((m,p)=>Math.min(m,Math.abs(sideOf(p))),99);
   const visibleCars=nearCars.filter(p=>Math.abs(sideOf(p))+1.7<shopLat);
   const shopSpread=nearShops.length?Math.max(...nearShops.map(p=>Math.abs(sideOf(p))))-Math.min(...nearShops.map(p=>Math.abs(sideOf(p)))):8;
   const closeCars=[...plan.parked,...(plan.rolling||[])].filter(p=>{
    const a=alongOf(p),s=Math.abs(sideOf(p));
    return a>1&&a<22&&s<5.2;
   });
   const kit=preferSignal
    ?crossings.length*110+signals.length*100+pits.length*8+nearShops.length*4-closeCars.length*36-(closeCars.some(p=>alongOf(p)<10&&Math.abs(sideOf(p))<3.2)?90:0)
    :preferFace
    ?nearShops.length*48+visibleCars.length*22+pits.length*10-shopSpread*10
    :visibleCars.length*50+nearCars.length*20+nearShops.length*16+cars.length*6+shops.length*4+pits.length*14+(signals.length?36:0)+signals.length*8;
   const hit={x,z,look,kit,shops,cars,nearShops,nearCars:visibleCars.length?visibleCars:nearCars,pits,signals,crossings};
   if(!pick||kit>pick.kit)pick=hit;
   if(visibleCars.length&&nearShops.length&&(!both||kit>both.kit))both=hit;
  }
  if(both&&!(preferSignal&&(pick?.crossings?.length||pick?.signals?.length)))pick=both;
  if(!pick&&route.length>4){
   const i=Math.min(route.length-2,Math.max(1,Math.floor(route.length*(minAcc+maxAcc)/1100)));
   pick={x:route[i][0],z:route[i][1],look:Math.atan2(route[i+1][0]-route[i][0],route[i+1][1]-route[i][1]),kit:0,shops:[],cars:[],nearShops:[],nearCars:[],pits:[],signals:[],crossings:[]};
  }
  if(!pick)return;
  api.world.car.setEnabled(true);
  const {x,z,look}=pick;
  const sideOf=p=>(p.x-x)*Math.cos(look)-(p.z-z)*Math.sin(look);
  const right=pick.shops.filter(p=>sideOf(p)<0).length+pick.cars.filter(p=>sideOf(p)<0).length;
  const left=pick.shops.filter(p=>sideOf(p)>0).length+pick.cars.filter(p=>sideOf(p)>0).length;
  const lookLeft=right>=left;
  const lat=lookLeft?-1:1;
  const rightX=Math.cos(look),rightZ=-Math.sin(look);
  const y=api.world.groundHeight(x,z);
  api.world.setLightMode('day');api.world.paused=true;api.world.view=0;
  api.world.state.x=x;api.world.state.z=z;api.world.state.yaw=look;api.world.state.speed=0;api.world.state.steer=0;
  api.world.car.position.set(x,y+.115,z);api.world.car.rotation.y=look;
  const alongOf=p=>(p.x-x)*Math.sin(look)+(p.z-z)*Math.cos(look);
  const same=p=>lookLeft?sideOf(p)<0:sideOf(p)>0;
  const rank=p=>Math.abs(alongOf(p)-11)+Math.abs(Math.abs(sideOf(p))-5.6)+(same(p)?0:8);
  const glance=preferSignal&&(pick.crossings||[]).length
   ?(pick.crossings||[]).slice().sort((a,b)=>Math.abs(alongOf(a)-12)-Math.abs(alongOf(b)-12))[0]
   :preferSignal&&(pick.signals||[]).length
   ?(pick.signals||[]).slice().sort((a,b)=>Math.abs(alongOf(a)-14)-Math.abs(alongOf(b)-14))[0]
   :(pick.nearShops||pick.shops||[]).length
   ?(pick.nearShops||pick.shops||[]).slice().sort((a,b)=>rank(a)-rank(b))[0]
   :(pick.nearCars||pick.cars||[]).slice().sort((a,b)=>rank(a)-rank(b))[0]
   ||(pick.pits||[]).slice().sort((a,b)=>rank(a)-rank(b))[0];
  const back=preferSignal?12.4:preferFace?8.8:11.2;
  let eyeX=x-Math.sin(look)*back-rightX*lat*(preferSignal?.15:.22),eyeZ=z-Math.cos(look)*back-rightZ*lat*(preferSignal?.15:.22),eyeY=y+(preferSignal?1.72:preferFace?1.82:1.64);
  const parked=[...(plan.parked||[]),...(plan.rolling||[])];
  if(!preferSignal){
   const carD=parked.reduce((m,p)=>Math.min(m,Math.hypot(p.x-eyeX,p.z-eyeZ)),99);
   const near=parked.slice().sort((a,b)=>Math.hypot(a.x-eyeX,a.z-eyeZ)-Math.hypot(b.x-eyeX,b.z-eyeZ))[0];
   if(near&&carD<6.4){
    eyeX-=Math.sin(look)*Math.max(2.4,6.6-carD);
    eyeZ-=Math.cos(look)*Math.max(2.4,6.6-carD);
   }
  }
  const pull=preferSignal?0.55:preferFace?0.28:.34;
  const zebra=preferSignal&&(pick.crossings||[]).slice().sort((a,b)=>Math.abs(alongOf(a)-11)-Math.abs(alongOf(b)-11))[0];
  const focusX=x+Math.sin(look)*(preferSignal?10.4:preferFace?7.2:7.4)+(glance?(glance.x-x)*pull:0)+(zebra&&preferSignal?(zebra.x-x)*.28:0)+rightX*lat*(preferSignal?.08:preferFace?2.05:2.55);
  const focusZ=z+Math.cos(look)*(preferSignal?10.4:preferFace?7.2:7.4)+(glance?(glance.z-z)*pull:0)+(zebra&&preferSignal?(zebra.z-z)*.28:0)+rightZ*lat*(preferSignal?.08:preferFace?2.05:2.55);
  const focusY=y+(preferSignal?.72:preferFace?1.28:1.22);
  const dist=Math.hypot(eyeX-focusX,eyeZ-focusZ);
  const place=api.world.data.landmarks.find(m=>m.id==='bamboo');
  api.world.enterPhoto({
   id:'corridor-drive',name:'drive',x:focusX,z:focusZ,height:8,area:place.area,excludeRadius:0,
   arrival:place.arrival,yaw:look,photoDistance:dist,
   photoElevation:Math.asin(Math.max(-.08,Math.min(.14,(eyeY-focusY)/dist))),
   photoAngle:-Math.atan2(focusX-eyeX,focusZ-eyeZ),
   photoTargetHeight:focusY,
  });
  const ui=document.getElementById('ui');if(ui)ui.style.setProperty('display','none','important');
  for(const sel of ['.story-hud','.story-entry','.story-dialog','#observer-help','#flight-hud','#career-objective','#route-hud','#ue5-client-note']){
   document.querySelectorAll(sel).forEach(el=>{el.setAttribute('hidden','');el.style.display='none';});
  }
  if(preferSignal){
   api.world.car.setEnabled(false);
   api.world.bambooCorridor?.setStreetCarsEnabled(false);
   if(api.world.traffic){api.world.traffic.cars.length=0;api.world.traffic.update(0,x,z);}
  }else{
   api.world.car.setEnabled(true);
   api.world.bambooCorridor?.setStreetCarsEnabled(true);
   api.world.traffic?.place(x,z);
   const moving=api.world.traffic?.cars??[];
   const cone=c=>{
    const along=(c.x-x)*Math.sin(look)+(c.z-z)*Math.cos(look);
    const side=(c.x-x)*Math.cos(look)-(c.z-z)*Math.sin(look);
    return along>16&&along<30&&Math.abs(side)<1.8;
   };
   if(moving.length&&!moving.some(cone)){
    api.world.traffic.snap(0,x+Math.sin(look)*21,z+Math.cos(look)*21,look);
   }
  }
  api.world.bambooCorridor.update(api.world.time,x,z,false);
 },{route,minAcc,maxAcc,preferSignal,preferFace});
 await hideChrome();
 await page.waitForTimeout(1400);
};

const driveView=async(id='bamboo')=>id==='talent'?routeView({minAcc:320,maxAcc:560}):routeView({minAcc:16,maxAcc:150});
const midView=async()=>routeView({minAcc:160,maxAcc:320,preferFace:true});
const signalView=async()=>routeView({minAcc:40,maxAcc:520,preferSignal:true});

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

 await kit(false);await streetStill({kind:'doors',minAcc:28,maxAcc:160,eye:1.68,back:7.4,includeCurb:true});
 await shot('before-walk-eye');
 await kit(true);await streetStill({kind:'doors',minAcc:28,maxAcc:160,eye:1.68,back:7.4,includeCurb:true});
 await shot('after-walk-eye');

 await kit(false);await streetStill({kind:'curbs',minAcc:24,maxAcc:140,eye:1.32,back:6.8});
 await shot('before-curb');
 await kit(true);await streetStill({kind:'curbs',minAcc:24,maxAcc:140,eye:1.32,back:6.8});
 await shot('after-curb');

 await kit(false);await signalView();await shot('before-junction');
 await kit(true);await signalView();await shot('after-junction');

 await kit(false);await streetStill({kind:'doors',minAcc:40,maxAcc:200,eye:1.5,back:8.6});
 await shot('before-shop');
 await kit(true);await streetStill({kind:'doors',minAcc:40,maxAcc:200,eye:1.5,back:8.6});
 await shot('after-shop');

 await kit(false);await parkView();await shot('before-park');
 await kit(true);await parkView();await shot('after-park');

 await kit(false);await look({id:'low-air',title:'低空',place:'bamboo',kind:'lamps',photoDistance:42,photoElevation:.34,photoAngle:.2,photoTargetHeight:3});
 await shot('before-low-air');
 await kit(true);await look({id:'low-air',title:'低空',place:'bamboo',kind:'lamps',photoDistance:42,photoElevation:.34,photoAngle:.2,photoTargetHeight:3});
 await shot('after-low-air');

 await kit(false);await streetStill({kind:'pits',minAcc:24,maxAcc:150,eye:1.42,back:6.4});
 await shot('before-trees');
 await kit(true);await streetStill({kind:'pits',minAcc:24,maxAcc:150,eye:1.42,back:6.4});
 await shot('after-trees');

 await kit(false);await midView();await shot('before-mid');
 await kit(true);await midView();await shot('after-mid');

 await kit(false);await signalView();await shot('before-drive-signal');
 await kit(true);await signalView();await shot('after-drive-signal');

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
 notes.gpu=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');
  const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
  const ext=gl?.getExtension('WEBGL_debug_renderer_info');
  return ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'unknown';
 }).catch(()=>'unknown');
 notes.acceptance=/3060/i.test(notes.gpu||'')?'rtx-3060':'not-rtx-3060';
 notes.input='startAutoDrive(talent) for 120s after travel(bamboo); stills use day light and road-snapped chase cameras';
 notes.disclaimer=notes.acceptance==='rtx-3060'
  ?'p95 is an RTX 3060 1080p sample. This is not GTA V completeness or ChrisGPT flight-demo parity.'
  :'p95 is not an RTX 3060 pass (renderer: '+(notes.gpu||'unknown')+'). Acceptance remains RTX 3060 at 1080p. This is not GTA V completeness or ChrisGPT flight-demo parity.';
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
console.log(JSON.stringify({out,errors,pass:errors.length===0,corridor:notes.corridor,gpu:notes.gpu,acceptance:notes.acceptance,drive:notes.drive&&{...notes.drive,end:notes.end},disclaimer:notes.disclaimer},null,2));
if(errors.length)process.exitCode=1;
