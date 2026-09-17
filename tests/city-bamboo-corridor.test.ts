import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {NullEngine,Scene} from '@babylonjs/core';
import {closest} from '../src/driving.ts';
import {BAMBOO_CORRIDOR,corridorProject,createBambooCorridor,inBambooCorridor,planBambooCorridor} from '../src/city-bamboo-corridor.ts';
import type {CityData,Road,V2} from '../src/city-types.ts';

const rectangle=(x1:number,z1:number,x2:number,z2:number):V2[]=>[[x1,z1],[x2,z1],[x2,z2],[x1,z2],[x1,z1]];
const road=(id:string,points:V2[],width=12,kind='primary'):Road=>({id,name:id,points,width,kind,oneway:false,grade:'0'});
function fixture():CityData{
 return {
  meta:{counts:{},extent:[-6000,-2200,-4500,-400],horizontalScale:.6},
  land:[[rectangle(-6000,-2200,-4500,-400)]],coast:[],
  roads:[
   road('keyuan',[[-5180,-680],[-5170,-1900]]),
   road('dengliang',[[-5600,-1300],[-4700,-1300]],10,'secondary'),
   road('haide',[[-5600,-1000],[-4700,-1000]],10,'tertiary'),
   road('outside',[[-2000,0],[-1800,0]]),
  ],
  green:[],water:[{name:'lake',rings:[rectangle(-5050,-1600,-4920,-1450)]}],
  buildings:[
   {rings:[rectangle(-5210,-1220,-5188,-1140)],height:28,style:'office'},
   {rings:[rectangle(-5162,-1200,-5136,-1130)],height:22,style:'retail'},
   {rings:[rectangle(-2000,10,-1980,40)],height:20,style:'office'},
  ],
  landmarks:[
   {id:'bamboo',name:'春笋',x:-5146,z:-1216.62,height:235,area:'南山',excludeRadius:42,arrival:[-5178,-928],yaw:3.14},
   {id:'cafe',name:'月白',x:-5140,z:-1100,height:6,area:'南山',excludeRadius:0,arrival:[-5178,-928],yaw:0},
  ],
  spawn:{x:-5178,z:-928,yaw:3.14,road:'keyuan'},
 };
}

test('corridor covers 春笋 and 人才公园, not 腾讯 or 湾公园',()=>{
 assert.equal(BAMBOO_CORRIDOR.length,1200);
 assert.ok(inBambooCorridor(-5146,-1216.62));
 assert.ok(inBambooCorridor(-5166.58,-1377.01),'人才公园到路点在科苑南路上');
 assert.ok(inBambooCorridor(-5178.65,-927.87));
 assert.equal(inBambooCorridor(-5795.8,-670.93),false);
 assert.equal(inBambooCorridor(-2283.27,-794.82),false);
});

test('street kit stays off the carriageway and inside budgets',()=>{
 const data=fixture();
 const open=planBambooCorridor(data);
 assert.ok(open.curbs.length>20);
 const hole=open.curbs[12];
 const reserved=(x:number,z:number,r:number)=>Math.hypot(x-hole.x,z-hole.z)<5+r;
 const plan=planBambooCorridor(data,{reserved});
 assert.deepEqual(planBambooCorridor(data,{reserved}),plan);
 assert.ok(plan.curbs.length>20&&plan.walks.length>20&&plan.edges.length>20);
 assert.ok(plan.pits.length>4&&plan.lamps.length>4&&plan.parked.length>2);
 assert.ok(plan.junctions.length>=1&&plan.signals.length>=1);
 assert.ok(plan.plinths.length>=1&&plan.awnings.length===plan.plinths.length&&plan.doors.length===plan.plinths.length);
 assert.ok(plan.curbs.length<=BAMBOO_CORRIDOR.budgets.curb);
 assert.ok(plan.parked.length<=BAMBOO_CORRIDOR.budgets.parked);
 const nearestRoad=(p:{x:number;z:number})=>{
  let best=Infinity,width=12;
  for(const r of data.roads)for(let i=1;i<r.points.length;i++){
   const d=closest(p.x,p.z,r.points[i-1],r.points[i]).d;if(d<best){best=d;width=r.width;}
  }
  return {best,width};
 };
 for(const p of [...plan.curbs,...plan.walks,...plan.pits,...plan.lamps]){
  const {best,width}=nearestRoad(p);assert.ok(best>width/2+.15);
 }
 for(const p of plan.parked){
  let best=Infinity,width=12;
  for(const r of data.roads)for(let i=1;i<r.points.length;i++){
   const d=closest(p.x,p.z,r.points[i-1],r.points[i]).d;if(d<best){best=d;width=r.width;}
  }
  assert.ok(best>width/2-1.7&&best<width/2+.4,'parked cars sit in the curb lane, not the sidewalk or the travel center');
 }
 for(const p of plan.crossings){
  const {best,width}=nearestRoad(p);
  assert.ok(Math.abs(p.sx)*7.2/2<=width/2+.35,'zebra stays on the carriageway, not the shop sidewalk');
  assert.ok(best<width/2+2.4,'zebra sits on a named junction axis');
 }
 assert.equal(plan.curbs.some(p=>Math.hypot(p.x-hole.x,p.z-hole.z)<4),false);
 assert.equal(plan.plinths.some(p=>p.x>-2500&&p.x<-1500),false);
});

test('pause/hide toggle is independent of corridor membership',()=>{
 const data=fixture(),plan=planBambooCorridor(data);
 assert.ok(plan.roadMetres>1100);
 assert.ok(plan.roads>=2);
 const engine=new NullEngine(),scene=new Scene(engine);
 const kit=createBambooCorridor(scene,data,()=>0);
 assert.equal(kit.stats.extraLights,0);
 assert.equal(kit.stats.photoscrape,false);
 assert.ok(kit.stats.curbs>20);
 assert.ok(kit.stats.pits>=4);
 assert.ok(scene.meshes.some(m=>m.name==='corridor-tree'),'tree pits must contain a street tree');
 assert.ok((scene.getMeshByName('corridor-tree')?.getTotalVertices()??0)>80,'street trees are a trunk-plus-canopy mass, not a single lollipop sphere');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-verge-box'),'curb and sidewalk are split by a planting verge');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-lip'),'walk side keeps a stone curb lip at the verge');
 assert.ok((scene.getMeshByName('corridor-walk-box')?.getTotalVertices()??0)>80,'sidewalk is raised pavers, not a flat slab');
 assert.ok(plan.lips.length>8,'stone lip runs along the walk/verge joint');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-pit'),'tree pits are raised planters, not a disk under the sidewalk');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-pit'&&(m.material?.getClassName()==='MultiMaterial'||(m.material?.name??'').includes('pit'))),'tree pits keep a concrete ring and soil well');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-car-0'),'parked cars are one merged sedan, not stacked boxes');
 assert.ok((scene.getMeshByName('corridor-car-0')?.getTotalVertices()??0)>40,'parked sedans keep a hood/cabin split and wheels');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-car-cabin'),'sedan cabins are a separate greenhouse so they still read after merge');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-facade-0'),'shopfronts are one street-wall bay, not stacked door/window/awning boxes');
 assert.ok((scene.getMeshByName('corridor-facade-0')?.getTotalVertices()??0)>120,'shopfronts keep a recessed door, framed window and fascia');
 assert.ok(scene.materials.some(m=>m.name.startsWith('corridor-sign-')),'shop fascia and blades carry fictional lettering, not a blank slab');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-park-bay'),'parked cars sit on a parking bay, not the grass verge');
 assert.ok(plan.decks.length>=8&&plan.dashes.length>=4,'driven 科苑 keeps a day-lit deck and lane dashes');
 assert.ok(Array.isArray(plan.rolling),'in-lane rolling cars are part of the corridor kit');
 assert.ok(scene.meshes.some(m=>m.name==='corridor-deck'),'carriageway uses a corridor deck, not only cinematic charcoal asphalt');
 const zebraA=plan.crossings[0];
 const zebraGap=plan.crossings.filter(p=>p!==zebraA).map(p=>Math.hypot(p.x-zebraA.x,p.z-zebraA.z)).sort((a,b)=>a-b)[0]??0;
 assert.ok(zebraGap>.7,'zebra stripes keep a visible gap, not a solid wash');
 kit.adoptStreetTrees([],[]);
 kit.adoptParkedCars([]);
 assert.ok(scene.getMeshByName('corridor-tree'),'empty adopt keeps the fallback street tree');
 kit.setEnabled(false);assert.equal(kit.root.isEnabled(),false);
 kit.setEnabled(true);kit.update(1,-5178,-1100,false);assert.equal(kit.root.isEnabled(),true);
 kit.update(1,-5178,-1100,true);assert.equal(kit.root.isEnabled(),true);
 kit.update(1,0,0,false);assert.equal(kit.root.isEnabled(),false);
 kit.dispose();engine.dispose();
});

test('live city.json still produces a complete 春笋 street',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/city/city.json',import.meta.url),'utf8')) as CityData;
 const plan=planBambooCorridor(data);
 assert.ok(plan.roadMetres>900,'corridor should collect more than one street block');
 assert.ok(plan.roads>=6);
 assert.ok(plan.curbs.length>=80&&plan.walks.length>=80);
 assert.ok(plan.pits.length>=20&&plan.lamps.length>=16);
 assert.ok(plan.signals.length>=2&&plan.parked.length>=20);
 assert.ok(plan.plinths.length>=8&&plan.awnings.length===plan.plinths.length&&plan.signs.length>=plan.plinths.length);
 assert.ok(plan.junctions.length>=2);
 const bamboo=data.landmarks.find(m=>m.id==='bamboo')!,talent=data.landmarks.find(m=>m.id==='talent')!;
 assert.ok(inBambooCorridor(bamboo.x,bamboo.z)&&inBambooCorridor(talent.arrival[0],talent.arrival[1]));
 assert.ok(plan.curbs.every(p=>inBambooCorridor(p.x,p.z,4)));
 const arrival=bamboo.arrival;
 assert.ok(plan.walks.filter(p=>p.z<-1280&&p.z>-1450).length>=8,'人才公园路段要有步道');
 assert.ok(plan.walks.filter(p=>p.z<-1100&&p.z>-1300).length>=8,'春笋南侧不能出现街道空洞');
 assert.ok(plan.plinths.filter(p=>p.z<-1140&&p.z>-1280).length>=8,'中段不能只剩树和路灯');
 assert.ok(plan.parked.filter(p=>p.z<-1140&&p.z>-1280).length>=4,'中段也要有路边停车');
 assert.ok(plan.walks.filter(p=>p.x<-5210&&p.z<-1100&&p.z>-1320).length>=4,'自动驾驶走的科苑中段要有步道');
 assert.ok(plan.plinths.filter(p=>p.x<-5210&&p.z<-1100&&p.z>-1320).length>=4,'科苑中段驾驶路径不能只剩办公楼墙');
 const keyuanMidCars=plan.parked.filter(p=>p.x<-5210&&p.z<-1100&&p.z>-1320);
 assert.ok(keyuanMidCars.length>=6,'科苑中段驾驶路径要有一串路边停车');
 const keyuanHit=(x:number,z:number)=>{
  let best=Infinity,width=6;
  for(const r of data.roads){
   if(!(r.name??'').includes('科苑')||!r.points||r.points.length<2)continue;
   for(let i=1;i<r.points.length;i++){
    const q=closest(x,z,r.points[i-1],r.points[i]);
    if(q.d<best){best=q.d;width=r.width;}
   }
  }
  return {d:best,width};
 };
 assert.ok(plan.curbs.filter(p=>{
  const k=keyuanHit(p.x,p.z);
  return k.d>k.width/2+.12&&k.d<k.width/2+1.15;
 }).length>=40,'路缘石要贴着当前科苑车行道，不能被双幅路甩到外侧');
 assert.ok(keyuanMidCars.filter(p=>{
  const k=keyuanHit(p.x,p.z);
  const shop=plan.plinths.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  return k.d>k.width/2-1.7&&k.d<k.width/2+.4&&shop&&Math.hypot(shop.x-p.x,shop.z-p.z)>3.6&&Math.hypot(shop.x-p.x,shop.z-p.z)<14&&k.d+1.1<keyuanHit(shop.x,shop.z).d;
 }).length>=4,'科苑停车要停在路缘停车带，不能上人行道或店背后');
 const keyuanMidPits=plan.pits.filter(p=>p.x<-5210&&p.z<-1100&&p.z>-1320);
 const keyuanMidWalks=plan.walks.filter(p=>p.x<-5210&&p.z<-1100&&p.z>-1320);
 const mean=(xs:number[])=>xs.reduce((n,v)=>n+v,0)/xs.length;
 assert.ok(plan.decks.filter(p=>keyuanHit(p.x,p.z).d<2.4).length>=20,'day-lit deck sits on the driven 科苑, not the geometric spine');
 assert.ok(plan.rolling.length>=4,'chase cone keeps in-lane cars, not only curb parking');
 assert.ok(keyuanMidPits.length>=4&&keyuanMidWalks.length>=4);
 assert.ok(mean(keyuanMidPits.map(p=>keyuanHit(p.x,p.z).d))+0.35<mean(keyuanMidWalks.map(p=>keyuanHit(p.x,p.z).d)),'tree pits sit in the verge, not under the sidewalk');
 assert.ok(plan.walks.filter(p=>p.z<-900&&p.z>-1100).length>=8,'春笋到路段要有步道');
 assert.ok(plan.parked.some(p=>Math.hypot(p.x-arrival[0],p.z-arrival[1])<80),'春笋到路附近要有路边停车');
 assert.ok(plan.plinths.length>=16,'长立面应拆成连续首层店面');
 const yaw=bamboo.yaw??3.14;
 const ahead=plan.plinths.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(yaw)+(p.z-arrival[1])*Math.cos(yaw);
  const side=(p.x-arrival[0])*Math.cos(yaw)-(p.z-arrival[1])*Math.sin(yaw);
  return along>12&&along<110&&Math.abs(side)<18;
 });
 assert.ok(ahead.length>=2,'驾驶镜头前方要有贴路首层店面');
 const look=Math.atan2(plan.corridor.spine[1][0]-arrival[0],plan.corridor.spine[1][1]-arrival[1]);
 const chase=plan.plinths.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(look)+(p.z-arrival[1])*Math.cos(look);
  const side=(p.x-arrival[0])*Math.cos(look)-(p.z-arrival[1])*Math.sin(look);
  return along>12&&along<90&&Math.abs(side)<22;
 });
 assert.ok(chase.length>=3,'春笋向南驾驶锥里要有连续首层店面');
 assert.ok(plan.plinths.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(look)+(p.z-arrival[1])*Math.cos(look);
  const k=keyuanHit(p.x,p.z);
  return along>120&&along<280&&k.d>5&&k.d<12;
 }).length>=4,'科苑中段要有贴路店面，不能只剩路口侧墙');
 assert.ok(plan.signs.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(look)+(p.z-arrival[1])*Math.cos(look);
  const side=(p.x-arrival[0])*Math.cos(look)-(p.z-arrival[1])*Math.sin(look);
  return along>12&&along<90&&Math.abs(side)<20;
 }).length>=4,'春笋向南驾驶锥里要有朝向车道的店招');
 assert.ok(plan.plinths.filter(p=>p.z<-900&&p.z>-1100).length>=6,'春笋南侧前两段不能只剩树和路灯');
 const wall=plan.plinths.filter(p=>p.z<-900&&p.z>-1480&&p.x<corridorProject(p.x,p.z).x).sort((a,b)=>a.z-b.z);
 assert.ok(wall.length>=28,'科苑南路西侧要有连续首层街墙');
 let gaps=0;
 for(let i=1;i<wall.length;i++)if(Math.abs(wall[i].z-wall[i-1].z)>16)gaps++;
 assert.ok(gaps<=10,'首层街墙不能只是孤立棚屋');
 assert.ok(plan.plinths.some(p=>p.z<-1360&&p.z>-1450&&Math.abs(p.x-talent.arrival[0])<22),'人才公园到路南侧不能只剩白墙');
 assert.ok(plan.parked.filter(p=>p.z<-1360&&p.z>-1450).length>=2,'人才公园路段也要有路边停车');
 assert.ok(plan.pits.filter(p=>p.z<-1360&&p.z>-1450).length>=2,'人才公园路段也要有树池');
 const shop=wall.find(p=>p.z<-960&&p.z>-1100);
 if(shop){
  const proj=corridorProject(shop.x,shop.z);
  const pit=plan.pits.filter(p=>Math.abs(p.z-shop.z)<22&&p.x<proj.x)
   .sort((a,b)=>Math.abs(a.z-shop.z)-Math.abs(b.z-shop.z))[0];
  if(pit){
   const shopD=Math.hypot(shop.x-proj.x,shop.z-proj.z),pitD=Math.hypot(pit.x-proj.x,pit.z-proj.z);
   assert.ok(pitD<shopD,'行道树要在店面和车道之间的步道上');
  }
  const walk=plan.walks.filter(p=>Math.abs(p.z-shop.z)<10&&p.x<proj.x)
   .sort((a,b)=>Math.hypot(a.x-shop.x,a.z-shop.z)-Math.hypot(b.x-shop.x,b.z-shop.z))[0];
  if(walk){
   const shopD=Math.hypot(shop.x-proj.x,shop.z-proj.z),walkD=Math.hypot(walk.x-proj.x,walk.z-proj.z);
   assert.ok(walkD<shopD,'步道要在店面和车道之间，店面不能压在路缘上');
  }
 }
 for(const p of plan.plinths){
  let best=Infinity,width=6;
  for(const r of data.roads){
   if(!r.points||r.points.length<2)continue;
   for(let i=1;i<r.points.length;i++){
    const d=closest(p.x,p.z,r.points[i-1],r.points[i]).d;
    if(d<best){best=d;width=r.width;}
   }
  }
  assert.ok(best>width/2+.85,'店面不能压在支路或主路车行道上');
 }
 for(const p of plan.plinths){
  assert.equal(plan.junctions.some(j=>Math.hypot(p.x-j.x,p.z-j.z)<14),false,'店面不能站在路口车行道上');
 }
 const ribbon=plan.walks.filter(p=>p.z<-930&&p.z>-1020&&p.x<corridorProject(p.x,p.z).x);
 assert.ok(ribbon.length>=3,'春笋南侧步道要连成带，不能只剩店前垫块');
 const doorAprons=plan.plinths.filter(shop=>{
  const flip=shop.sz||1;
  const faceX=-Math.sin(shop.yaw)*flip,faceZ=-Math.cos(shop.yaw)*flip;
  const wallX=Math.cos(shop.yaw),wallZ=-Math.sin(shop.yaw);
  return plan.walks.some(w=>{
   const dx=w.x-shop.x,dz=w.z-shop.z;
   const along=dx*faceX+dz*faceZ,lat=Math.abs(dx*wallX+dz*wallZ);
   return along>0.15&&along<2.3&&lat<3.4;
  });
 });
 assert.ok(doorAprons.length>=12,'店门要落在步道垫面上，不能隔着草坪');
 const eastCars=plan.parked.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(look)+(p.z-arrival[1])*Math.cos(look);
  const side=(p.x-arrival[0])*Math.cos(look)-(p.z-arrival[1])*Math.sin(look);
  return along>20&&along<80&&side>-1&&side<8;
 });
 assert.ok(eastCars.length>=4,'东墙路缘要排成一串路边停车，驾驶锥不能只剩一辆');
 assert.ok(plan.pits.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(look)+(p.z-arrival[1])*Math.cos(look);
  const side=(p.x-arrival[0])*Math.cos(look)-(p.z-arrival[1])*Math.sin(look);
  return along>24&&along<80&&side<-2&&side>-10;
 }).length>=2,'驾驶锥路缘要有树池，不能只剩树冠');
 assert.ok(plan.signals.filter(p=>{
  const q=corridorProject(p.x,p.z);
  return q.t>0.08&&q.t<0.9;
 }).length>=2,'红绿灯要落在科苑行驶段上，不能只堆在春笋北端');
 assert.ok(plan.crossings.length>=8&&plan.stops.length>=2,'科苑路口要有斑马线和停止线，不能只剩灯杆');
 assert.ok(plan.crossings.some(p=>{
  const q=corridorProject(p.x,p.z);
  return q.t>0.2&&q.t<0.36&&q.d<12;
 }),'科苑×海德路口的斑马线要落在驾驶脊上，不能只埋在21米外的科苑单路下');
 assert.ok(plan.crossings.every(p=>{
  let best=Infinity,width=9;
  for(const r of data.roads){
   if(!/科苑|海德|登良|keyuan/i.test(`${r.name??''} ${r.id}`))continue;
   for(let i=1;i<r.points.length;i++){
    const d=closest(p.x,p.z,r.points[i-1],r.points[i]).d;
    if(d<best){best=d;width=r.width;}
   }
  }
  return Math.abs(p.sx)*7.2/2<=width/2+.35;
 }),'斑马线停在车行道上，不能画到店前步道');
 assert.ok(eastCars.every(p=>{
  const shop=plan.plinths.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  return shop&&Math.hypot(shop.x-p.x,shop.z-p.z)>3.8;
 }),'路边停车不能贴在店脸上当长凳');
 assert.ok(plan.parked.filter(p=>{
  const along=(p.x-arrival[0])*Math.sin(look)+(p.z-arrival[1])*Math.cos(look);
  const side=(p.x-arrival[0])*Math.cos(look)-(p.z-arrival[1])*Math.sin(look);
  return along>18&&along<90&&side>4&&side<26;
 }).length>=1,'西墙步行带前也要有路边停车');
 assert.ok(plan.signs.some(p=>{
  const shop=plan.plinths.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  if(!shop)return false;
  return corridorProject(p.x,p.z).d+1.2<corridorProject(shop.x,shop.z).d;
 }),'店招要伸到科苑路缘，不能只贴在17米外的店墙上');
 assert.ok(plan.plinths.some(p=>p.sz<0)&&plan.plinths.some(p=>p.sz>0),'两侧店面都要朝向车道，不能只翻开一边');
});
