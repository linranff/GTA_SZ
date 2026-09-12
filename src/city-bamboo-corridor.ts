import {Color3,Matrix,Mesh,MeshBuilder,PBRMaterial,Quaternion,TransformNode,Vector3,type Scene} from '@babylonjs/core';
import {closest,inRing} from './driving.ts';
import type {CityData,Road,V2} from './city-types.ts';

export type CorridorPose={x:number;z:number;yaw:number;sx:number;sy:number;sz:number};
export type CorridorJunction={x:number;z:number;roads:number};
export type BambooCorridorOptions={reserved?:(x:number,z:number,radius:number)=>boolean};
export type BambooCorridorPlan={
 corridor:typeof BAMBOO_CORRIDOR;
 roadMetres:number;
 roads:number;
 junctions:CorridorJunction[];
 curbs:CorridorPose[];
 walks:CorridorPose[];
 edges:CorridorPose[];
 pits:CorridorPose[];
 lamps:CorridorPose[];
 signals:CorridorPose[];
 parked:CorridorPose[];
 plinths:CorridorPose[];
 awnings:CorridorPose[];
 doors:CorridorPose[];
 panes:CorridorPose[];
 signs:CorridorPose[];
};

/** Locked 春笋–人才公园 street. Spine is 科苑南路, 1.2 km, one building row each side. */
export const BAMBOO_CORRIDOR={
 id:'bamboo-talent',
 name:'春笋–人才公园',
 origin:{x:-5146,z:-1216.62},
 talent:{x:-4988.02,z:-1492.13},
 spine:[[-5180,-700],[-5160,-1900]] as const,
 halfWidth:88,
 length:1200,
 kinds:['primary','trunk','secondary','tertiary'] as const,
 junctionRadius:11,
 junctionClearance:7,
 shopJunctionClearance:16,
 curbExtra:3.95,
 walkExtra:5.35,
 pitExtra:5.7,
 lampExtra:5.05,
 parkedInset:2.05,
 parkedVisualWidth:11,
 parkedExtra:4.25,
 edgeInset:.16,
 step:7.2,
 pitStep:15,
 lampStep:22,
 parkStep:18,
 shopfrontReach:42,
 shopfrontBay:5,
 streetWallExtra:1.15,
 apronStep:2.15,
 apronRows:1,
 spineAlign:0.72,
 budgets:{curb:420,walk:880,edge:420,pit:180,lamp:120,signal:16,parked:64,plinth:96,awning:96,door:96,pane:220,sign:220},
} as const;

/** Day-lit street kit: asphalt stays the cinematic road; these sit beside it. */
export const CORRIDOR_DAYLIGHT={
 curb:[.16,.14,.12] as const,
 curbTop:[.72,.66,.52] as const,
 walk:[.58,.54,.48] as const,
 edge:[.78,.74,.64] as const,
 pitRing:[.32,.30,.27] as const,
 soil:[.17,.13,.10] as const,
 bark:[.28,.18,.12] as const,
 canopy:[.16,.32,.16] as const,
 steel:[.32,.33,.34] as const,
 glass:[.42,.46,.48] as const,
 lampWarm:[1,.78,.52] as const,
 door:[.68,.32,.16] as const,
 kick:[.22,.19,.16] as const,
 awning:[[.14,.38,.36],[.46,.18,.14],[.70,.58,.32],[.14,.20,.38],[.38,.24,.16]] as const,
 shop:[[.46,.44,.40],[.36,.28,.24],[.32,.36,.38],[.48,.42,.34]] as const,
 paint:[[.78,.22,.16],[.18,.42,.78],[.92,.78,.22],[.86,.86,.84]] as const,
} as const;

export const BAMBOO_CORRIDOR_CAMERAS=[
 {id:'drive-day',title:'日间驾驶',place:'bamboo',height:1.38,back:7.2,look:22},
 {id:'walk-eye',title:'步行眼高',place:'talent',height:1.62,back:0.4,look:9,side:3.4},
 {id:'junction',title:'路口',place:'bamboo',height:1.55,back:14,look:18},
 {id:'low-air',title:'低空',place:'talent',height:38,back:46,look:8},
] as const;

const KINDS=new Set<string>(BAMBOO_CORRIDOR.kinds);
const hash=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const random=(value:string)=>hash(value)/4294967296;
const take=<T>(list:T[],limit:number)=>list.slice(0,limit);
const pose=(x:number,z:number,yaw:number,sx=1,sy=1,sz=1):CorridorPose=>({x,z,yaw,sx,sy,sz});

export function corridorProject(x:number,z:number){
 const [a,b]=BAMBOO_CORRIDOR.spine,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
 const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(len*len)));
 const px=a[0]+dx*t,pz=a[1]+dz*t;
 return {t,x:px,z:pz,d:Math.hypot(x-px,z-pz),length:len};
}
export function inBambooCorridor(x:number,z:number,pad=0){return corridorProject(x,z).d<=BAMBOO_CORRIDOR.halfWidth+pad;}

function onLand(data:CityData,x:number,z:number){
 return data.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(r=>inRing(x,z,r)));
}
function inWater(data:CityData,x:number,z:number){
 return data.water.some(p=>inRing(x,z,p.rings[0])&&!p.rings.slice(1).some(r=>inRing(x,z,r)));
}
function corridorBuildings(data:CityData){
 return data.buildings.filter(b=>b.rings[0]?.some(p=>inBambooCorridor(p[0],p[1],16)));
}
function inBuilding(buildings:CityData['buildings'],x:number,z:number,pad=0){
 for(const b of buildings){
  const ring=b.rings[0];if(!ring?.length)continue;
  if(inRing(x,z,ring))return true;
  if(pad>0){for(let i=1;i<ring.length;i++)if(closest(x,z,ring[i-1],ring[i]).d<pad)return true;}
 }
 return false;
}
type StreetSeg={a:V2;b:V2;yaw:number;len:number;width:number;road:Road;mid:V2};
function roadSegments(data:CityData,kinds?:Set<string>){
 const segs:StreetSeg[]=[];
 for(const road of data.roads){
  if((kinds&&!kinds.has(road.kind))||road.points.length<2)continue;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
   if(len<2.4)continue;
   const mid:[number,number]=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   if(!inBambooCorridor(mid[0],mid[1],12))continue;
   segs.push({a,b,yaw:Math.atan2(dx,dz),len,width:road.width,road,mid});
  }
 }
 segs.sort((p,q)=>corridorProject(p.mid[0],p.mid[1]).d-corridorProject(q.mid[0],q.mid[1]).d||p.mid[0]-q.mid[0]||p.mid[1]-q.mid[1]);
 return segs;
}
function corridorSegments(data:CityData){return roadSegments(data,KINDS);}

function spineAligned(yaw:number){return Math.abs(Math.cos(yaw))>BAMBOO_CORRIDOR.spineAlign;}
function isSpineSeg(seg:StreetSeg){
 const d=corridorProject(seg.mid[0],seg.mid[1]).d;
 if(d>32)return false;
 const name=seg.road.name??'';
 if(name.includes('科苑')||name.includes('登良')||name.includes('海德一道'))return true;
 return spineAligned(seg.yaw);
}
function nearestSeg(segs:StreetSeg[],x:number,z:number){
 let hit:{seg:StreetSeg;d:number}|null=null;
 for(const s of segs){const q=closest(x,z,s.a,s.b);if(!hit||q.d<hit.d)hit={seg:s,d:q.d};}
 return hit;
}
function spineRibbon(segs:StreetSeg[],fillHoles:boolean):StreetSeg[]{
 const [a,b]=BAMBOO_CORRIDOR.spine,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
 const road:Road={id:'corridor-spine',name:'科苑南路',points:[...BAMBOO_CORRIDOR.spine],width:6,kind:'primary',oneway:false,grade:'0'};
 const step=28,n=Math.max(1,Math.floor(len/step)),out:StreetSeg[]=[];
 for(let i=0;i<n;i++){
  const t0=i/n,t1=(i+1)/n,pa:V2=[a[0]+dx*t0,a[1]+dz*t0],pb:V2=[a[0]+dx*t1,a[1]+dz*t1],mid:V2=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2];
  const near=nearestSeg(segs,mid[0],mid[1]);
  if(fillHoles&&near&&near.d<8&&isSpineSeg(near.seg))continue;
  out.push({a:pa,b:pb,yaw,len:Math.hypot(pb[0]-pa[0],pb[1]-pa[1]),width:near&&near.d<18?near.seg.width:6,road,mid});
 }
 return out;
}
function syntheticSpine(segs:StreetSeg[]){return spineRibbon(segs,true);}
function parallel(a:StreetSeg,b:StreetSeg){
 return Math.abs(Math.sin(a.yaw)*Math.sin(b.yaw)+Math.cos(a.yaw)*Math.cos(b.yaw))>BAMBOO_CORRIDOR.spineAlign;
}
function findJunctions(segs:StreetSeg[]){
 const cells=new Map<string,{x:number;z:number;ids:Set<string>}>();
 const snap=(x:number,z:number,id:string)=>{
  const key=`${Math.round(x/12)},${Math.round(z/12)}`;
  const cell=cells.get(key)??{x,z,ids:new Set()};
  cell.x=(cell.x+x)/2;cell.z=(cell.z+z)/2;cell.ids.add(id);cells.set(key,cell);
 };
 for(const s of segs){
  const n=Math.max(2,Math.ceil(s.len/12));
  for(let i=0;i<=n;i++){
   const t=i/n,x=s.a[0]+(s.b[0]-s.a[0])*t,z=s.a[1]+(s.b[1]-s.a[1])*t;
   for(const o of segs){
    if(o.road.id===s.road.id||parallel(s,o))continue;
    const hit=closest(x,z,o.a,o.b);if(hit.d<9){snap(hit.x,hit.z,s.road.id);snap(hit.x,hit.z,o.road.id);}
   }
  }
 }
 return [...cells.values()].filter(c=>c.ids.size>=2&&inBambooCorridor(c.x,c.z)).map(c=>({x:c.x,z:c.z,roads:c.ids.size}))
  .sort((a,b)=>corridorProject(a.x,a.z).d-corridorProject(b.x,b.z).d||a.x-b.x||a.z-b.z);
}

function nearJunction(x:number,z:number,junctions:CorridorJunction[],clear=BAMBOO_CORRIDOR.junctionClearance){
 return junctions.some(j=>Math.hypot(x-j.x,z-j.z)<clear);
}
function onCarriageway(segs:StreetSeg[],x:number,z:number,pad=.2){
 return segs.some(s=>closest(x,z,s.a,s.b).d<s.width/2+pad);
}
function onCrossing(segs:StreetSeg[],x:number,z:number,yaw:number,pad=3.2){
 return segs.some(s=>{
  const align=Math.abs(Math.sin(s.yaw)*Math.sin(yaw)+Math.cos(s.yaw)*Math.cos(yaw));
  if(align>BAMBOO_CORRIDOR.spineAlign)return false;
  return closest(x,z,s.a,s.b).d<s.width/2+pad;
 });
}
function outerOffset(x:number,z:number,yaw:number,side:number,roads:StreetSeg[]){
 let last=0,seen=false,gap=0;
 for(let d=0;d<=22;d+=.5){
  const p=sidePoint(x,z,yaw,side,d);
  if(onCarriageway(roads,p.x,p.z,.25)){last=d;seen=true;gap=0;}
  else if(seen){gap+=.5;if(gap>=2.2)break;}
 }
 return last;
}
function namedOffset(x:number,z:number,yaw:number,side:number,roads:StreetSeg[],names:string[]){
 const subset=roads.filter(s=>names.some(n=>(s.road.name??'').includes(n))&&closest(x,z,s.a,s.b).d<18);
 return outerOffset(x,z,yaw,side,subset.length?subset:roads);
}
function stitchRibbon(list:CorridorPose[],maxSpan=22,gap=9){
 const groups=[list.filter(p=>p.x<corridorProject(p.x,p.z).x),list.filter(p=>p.x>=corridorProject(p.x,p.z).x)];
 const out:CorridorPose[]=[];
 for(const group of groups){
  const arr=group.slice().sort((a,b)=>a.z-b.z||a.x-b.x);
  let run:CorridorPose[]=[];
  const flush=()=>{
   if(!run.length)return;
   const a=run[0],b=run[run.length-1];
   const span=Math.hypot(b.x-a.x,b.z-a.z)+6.8;
   out.push(pose((a.x+b.x)/2,(a.z+b.z)/2,a.yaw,Math.max(1,span/7.2),1,1));
   run=[];
  };
  for(const p of arr){
   const last=run[run.length-1];
   if(last&&(Math.hypot(p.x-last.x,p.z-last.z)>gap||Math.hypot(p.x-run[0].x,p.z-run[0].z)>maxSpan))flush();
   run.push(p);
  }
  flush();
 }
 return out;
}

function sample(seg:StreetSeg,step:number,fn:(x:number,z:number,yaw:number,along:number)=>void){
 const n=Math.max(1,Math.floor(seg.len/step)),dx=seg.b[0]-seg.a[0],dz=seg.b[1]-seg.a[1];
 for(let i=0;i<n;i++){
  const t=(i+.5)/n;fn(seg.a[0]+dx*t,seg.a[1]+dz*t,seg.yaw,seg.len/n);
 }
}

function sidePoint(x:number,z:number,yaw:number,side:number,offset:number){
 return {x:x+side*offset*Math.cos(yaw),z:z+side*offset*-Math.sin(yaw)};
}

function rank(list:CorridorPose[]){
 return list.sort((a,b)=>corridorProject(a.x,a.z).d-corridorProject(b.x,b.z).d||a.x-b.x||a.z-b.z);
}
function spread(list:CorridorPose[],limit:number,bins=16){
 const buckets=Array.from({length:bins},()=>({e:[] as CorridorPose[],w:[] as CorridorPose[]}));
 for(const p of list){
  const proj=corridorProject(p.x,p.z);
  const i=Math.min(bins-1,Math.max(0,Math.floor(proj.t*bins)));
  (p.x>=proj.x?buckets[i].e:buckets[i].w).push(p);
 }
 const out:CorridorPose[]=[];
 const half=Math.max(1,Math.floor(limit/(bins*2)));
 for(const b of buckets)out.push(...b.e.slice(0,half),...b.w.slice(0,half));
 if(out.length<limit){
  const have=new Set(out.map(p=>`${p.x.toFixed(2)},${p.z.toFixed(2)}`));
  for(const p of rank(list.slice())){
   if(out.length>=limit)break;
   const key=`${p.x.toFixed(2)},${p.z.toFixed(2)}`;
   if(!have.has(key)){have.add(key);out.push(p);}
  }
 }
 return out.slice(0,limit);
}

export function planBambooCorridor(data:CityData,options:BambooCorridorOptions={}):BambooCorridorPlan{
 const reserved=options.reserved??(()=>false);
 const segs=corridorSegments(data);
 const roads=roadSegments(data);
 const verge=[...segs.filter(isSpineSeg),...syntheticSpine(segs)];
 const buildings=corridorBuildings(data);
 const junctions=findJunctions(segs);
 const roadMetres=segs.reduce((n,s)=>n+s.len,0);
 const curbs:CorridorPose[]=[],walks:CorridorPose[]=[],edges:CorridorPose[]=[],pits:CorridorPose[]=[],lamps:CorridorPose[]=[],parked:CorridorPose[]=[];
 const usable=(x:number,z:number,pad:number)=>{
  if(!inBambooCorridor(x,z)||!onLand(data,x,z)||inWater(data,x,z))return false;
  if(inBuilding(buildings,x,z,pad)||reserved(x,z,pad))return false;
  if(onCarriageway(roads,x,z,.35)||nearJunction(x,z,junctions))return false;
  return true;
 };
 const faceReach=(x:number,z:number,yaw:number,side:number,start:number)=>{
  for(let d=start;d<=start+42;d+=1.1){
   const p=sidePoint(x,z,yaw,side,d);
   if(inBuilding(buildings,p.x,p.z,.12))return d;
  }
  return 0;
 };
 const buildingSetback=(x:number,z:number,yaw:number,side:number)=>{
  const sx=Math.cos(yaw),sz=-Math.sin(yaw);
  for(const b of buildings){
   const ring=b.rings[0];if(!ring||ring.length<3||b.height<6)continue;
   const cx=ring.reduce((n,p)=>n+p[0],0)/ring.length,cz=ring.reduce((n,p)=>n+p[1],0)/ring.length;
   const dx=cx-x,dz=cz-z,along=dx*Math.sin(yaw)+dz*Math.cos(yaw),lat=dx*sx+dz*sz;
   if(Math.abs(along)<32&&lat*side>3&&Math.abs(lat)<48)return true;
  }
  return false;
 };
 const builtSide=(x:number,z:number,yaw:number)=>{
  const sx=Math.cos(yaw),sz=-Math.sin(yaw);
  let pos=0,neg=0;
  for(const b of buildings){
   const ring=b.rings[0];if(!ring||ring.length<3||b.height<6)continue;
   const cx=ring.reduce((n,p)=>n+p[0],0)/ring.length,cz=ring.reduce((n,p)=>n+p[1],0)/ring.length;
   const dx=cx-x,dz=cz-z,along=dx*Math.sin(yaw)+dz*Math.cos(yaw),lat=dx*sx+dz*sz;
   if(Math.abs(along)>40||Math.abs(lat)<3||Math.abs(lat)>55)continue;
   if(lat>0)pos++;else neg++;
  }
  if(pos===neg)return 0;
  return pos>neg?1:-1;
 };
 const wallBays:{x:number;z:number;yaw:number;side:number;offset:number;span:number;row:boolean}[]=[];
 for(const seg of verge){
  sample(seg,BAMBOO_CORRIDOR.step,(x,z,yaw,along)=>{
   for(const side of [-1,1] as const){
    const outer=outerOffset(x,z,yaw,side,roads);
    const curb=sidePoint(x,z,yaw,side,outer+.55);
    if(usable(curb.x,curb.z,.2))curbs.push(pose(curb.x,curb.z,yaw+Math.PI/2,along/7.2,1,1));
    const edge=sidePoint(x,z,yaw,side,Math.max(seg.width/2-BAMBOO_CORRIDOR.edgeInset,outer-.2));
    if(inBambooCorridor(edge.x,edge.z)&&onLand(data,edge.x,edge.z)&&!inWater(data,edge.x,edge.z)){
     edges.push(pose(edge.x,edge.z,yaw+Math.PI/2,along/7.2,1,1));
    }
    const face=faceReach(x,z,yaw,side,outer+1.2);
    const rows=face?BAMBOO_CORRIDOR.apronRows:1;
    for(let row=0;row<rows;row++){
     const extra=outer+1.85+row*BAMBOO_CORRIDOR.apronStep;
     if(face&&extra>face-.7)break;
     const p=sidePoint(x,z,yaw,side,extra);
     if(usable(p.x,p.z,.35))walks.push(pose(p.x,p.z,yaw+Math.PI/2,along/7.2,1,1));
    }
   }
  });
  sample(seg,BAMBOO_CORRIDOR.pitStep,(x,z,yaw)=>{
   for(const side of [-1,1] as const){
    const p=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+2.15);
    if(usable(p.x,p.z,.9)){
     const s=.82+random(`pit:${p.x.toFixed(1)}:${p.z.toFixed(1)}`)*.38;
     pits.push(pose(p.x,p.z,yaw,s,.9+s*.22,s));
    }
   }
  });
  sample(seg,BAMBOO_CORRIDOR.lampStep,(x,z,yaw)=>{
   for(const side of [-1,1] as const){
    const p=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+1.7);
    if(usable(p.x,p.z,.55))lamps.push(pose(p.x,p.z,yaw));
   }
  });
  sample(seg,BAMBOO_CORRIDOR.parkStep,(x,z,yaw)=>{
   for(const side of [-1,1] as const){
    let parkAt=namedOffset(x,z,yaw,side,roads,['科苑'])+1.9;
    let p=sidePoint(x,z,yaw,side,parkAt);
    if(onCarriageway(roads,p.x,p.z,2.2)){parkAt=outerOffset(x,z,yaw,side,roads)+2.5;p=sidePoint(x,z,yaw,side,parkAt);}
    if(!inBambooCorridor(p.x,p.z)||!onLand(data,p.x,p.z)||inWater(data,p.x,p.z))continue;
    if(inBuilding(buildings,p.x,p.z,1.6)||reserved(p.x,p.z,.8)||nearJunction(p.x,p.z,junctions))continue;
    if(onCarriageway(roads,p.x,p.z,2.2))continue;
    if(pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.4))continue;
    if(data.landmarks.some(m=>m.arrival&&Math.hypot(p.x-m.arrival[0],p.z-m.arrival[1])<10))continue;
    parked.push(pose(p.x,p.z,yaw));
   }
  });
 }

 for(const seg of spineRibbon(segs,false)){
  sample(seg,5,(x,z,yaw,along)=>{
   for(const side of [-1,1] as const){
    const walk=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+1.9);
    if(usable(walk.x,walk.z,.25))walks.push(pose(walk.x,walk.z,yaw+Math.PI/2,along/5,1,1));
   }
  });
  sample(seg,BAMBOO_CORRIDOR.shopfrontBay,(x,z,yaw,along)=>{
   const drive=z<-880&&z>-1480;
   const west=sidePoint(x,z,yaw,1,8).x<sidePoint(x,z,yaw,-1,8).x?1:-1;
   const prefer=drive?west:builtSide(x,z,yaw);
   for(const side of [-1,1] as const){
    const face=faceReach(x,z,yaw,side,seg.width/2+1.2);
    const outer=outerOffset(x,z,yaw,side,roads);
    const verge=outer+2.9;
    const sidewalk=Math.max(seg.width/2+BAMBOO_CORRIDOR.walkExtra+BAMBOO_CORRIDOR.streetWallExtra,verge);
    let offset=face?Math.min(face-.5,sidewalk):sidewalk;
    const row=drive&&prefer!==0&&(side===prefer||outer<8.2);
    if(!face&&!buildingSetback(x,z,yaw,side)&&!row)continue;
    if(offset<seg.width/2+.85)continue;
    let p=sidePoint(x,z,yaw,side,offset);
    const clear=1.45;
    for(let n=0;n<10&&onCarriageway(roads,p.x,p.z,clear);n++){offset+=1.1;p=sidePoint(x,z,yaw,side,offset);}
    if(reserved(p.x,p.z,1.2)||inWater(data,p.x,p.z)||onCarriageway(roads,p.x,p.z,clear)||inBuilding(buildings,p.x,p.z,.25))continue;
    if(corridorProject(p.x,p.z).d<4.6)continue;
    if(nearJunction(p.x,p.z,junctions,BAMBOO_CORRIDOR.shopJunctionClearance)||onCrossing(roads,p.x,p.z,yaw,4))continue;
    wallBays.push({x:p.x,z:p.z,yaw,side,offset,span:along,row});
    const walk=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+1.9);
    if(!onCarriageway(roads,walk.x,walk.z,.3)&&onLand(data,walk.x,walk.z)&&!inWater(data,walk.x,walk.z)&&!inBuilding(buildings,walk.x,walk.z,.2)){
     walks.push(pose(walk.x,walk.z,yaw+Math.PI/2,along/5,1,1));
    }
   }
  });
 }

 const signals:CorridorPose[]=[];
 const spineJunctions=junctions.filter(j=>corridorProject(j.x,j.z).d<40);
 for(const j of spineJunctions.slice(0,BAMBOO_CORRIDOR.budgets.signal)){
  const incoming=segs.filter(s=>closest(j.x,j.z,s.a,s.b).d<BAMBOO_CORRIDOR.junctionRadius).slice(0,4);
  for(const s of incoming){
   const p=sidePoint(j.x,j.z,s.yaw,1,s.width/2+1.15);
   if(inBambooCorridor(p.x,p.z)&&!inBuilding(buildings,p.x,p.z,.4)&&!reserved(p.x,p.z,.4))signals.push(pose(p.x,p.z,s.yaw));
  }
 }

 const plinths:CorridorPose[]=[],awnings:CorridorPose[]=[],doors:CorridorPose[]=[],panes:CorridorPose[]=[],signs:CorridorPose[]=[];
 const emitBay=(px:number,pz:number,roadYaw:number,outX:number,outZ:number,width:number,seed:string)=>{
  const along=roadYaw+Math.PI/2;
  const recede=.4,face=2.55/2-recede+.08;
  plinths.push(pose(px-outX*recede,pz-outZ*recede,along,width/6,4.35,1));
  awnings.push(pose(px+outX*(face+.7),pz+outZ*(face+.7),along,width/6,1,1));
  doors.push(pose(px+outX*face,pz+outZ*face,along));
  const span=width*.28;
  for(const k of [-1,1]){
   panes.push(pose(px+Math.sin(roadYaw)*k*span+outX*face,pz+Math.cos(roadYaw)*k*span+outZ*face,along));
  }
  signs.push(pose(px+outX*(face+.18),pz+outZ*(face+.18),roadYaw,1.7,1,1));
  signs.push(pose(px+Math.sin(roadYaw)*span+outX*(face+.18),pz+Math.cos(roadYaw)*span+outZ*(face+.18),roadYaw,1.7,1,1));
 };
 const rowWalls=wallBays.filter(b=>b.row).sort((a,b)=>a.z-b.z||a.x-b.x);
 const extraWalls=wallBays.filter(b=>!b.row).sort((a,b)=>a.z-b.z||a.x-b.x);
 const pickedWalls=[...rowWalls,...extraWalls].slice(0,BAMBOO_CORRIDOR.budgets.plinth);
 for(const [index,bay] of pickedWalls.entries()){
  const outX=-bay.side*Math.cos(bay.yaw),outZ=bay.side*Math.sin(bay.yaw);
  emitBay(bay.x,bay.z,bay.yaw,outX,outZ,Math.max(4.8,bay.span||5),`wall:${index}:${bay.z.toFixed(0)}`);
 }
 const fronts=buildings.map((b,index)=>{
  const ring=b.rings[0];if(!ring||ring.length<3||b.height<6)return null;
  const cx=ring.reduce((n,p)=>n+p[0],0)/ring.length,cz=ring.reduce((n,p)=>n+p[1],0)/ring.length;
  if(!inBambooCorridor(cx,cz,24))return null;
  let best:{a:V2;b:V2;mid:V2;yaw:number;len:number;out:[number,number];roadD:number}|null=null;
  for(let i=1;i<ring.length;i++){
   const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<3.4)continue;
   const mid:[number,number]=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   let nx=-dz/len,nz=dx/len;if(inRing(mid[0]+nx*.45,mid[1]+nz*.45,ring)){nx=-nx;nz=-nz;}
   let hit:{x:number;z:number;d:number}|null=null;
   for(const s of verge){const q=closest(mid[0],mid[1],s.a,s.b);if(!hit||q.d<hit.d)hit=q;}
   if(!hit||hit.d>BAMBOO_CORRIDOR.shopfrontReach)continue;
   const vx=hit.x-mid[0],vz=hit.z-mid[1],vd=Math.hypot(vx,vz)||1,facing=(nx*vx+nz*vz)/vd;
   if(facing<.18)continue;
   if(!best||facing*len/Math.max(4,hit.d)>best.len/Math.max(4,best.roadD))best={a,b,mid,yaw:Math.atan2(dx,dz),len,out:[nx,nz],roadD:hit.d};
  }
  return best?{b,index,cx,cz,edge:best}:null;
 }).filter((v):v is NonNullable<typeof v>=>!!v)
  .sort((a,b)=>corridorProject(a.cx,a.cz).t-corridorProject(b.cx,b.cz).t||a.edge.roadD-b.edge.roadD||a.cx-b.cx);

 for(const item of fronts){
  if(item.edge.roadD>14)continue;
  const {edge,b,index}=item;
  const bays=Math.max(1,Math.min(4,Math.floor(edge.len/BAMBOO_CORRIDOR.shopfrontBay)));
  const dx=edge.b[0]-edge.a[0],dz=edge.b[1]-edge.a[1];
  for(let i=0;i<bays;i++){
   const t=(i+.5)/bays,bx=edge.a[0]+dx*t,bz=edge.a[1]+dz*t;
   const px=bx+edge.out[0]*.18,pz=bz+edge.out[1]*.18;
   if(reserved(px,pz,1.2)||inWater(data,px,pz)||onCarriageway(roads,px,pz,1.45))continue;
   if(nearJunction(px,pz,junctions,BAMBOO_CORRIDOR.shopJunctionClearance)||onCrossing(roads,px,pz,edge.yaw,4))continue;
   if(wallBays.some(bay=>Math.hypot(bay.x-px,bay.z-pz)<4.2))continue;
   emitBay(px,pz,edge.yaw,edge.out[0],edge.out[1],Math.min(6.4,edge.len/bays*.86),`shop:${index}:${i}:${b.height.toFixed(1)}`);
  }
 }

 const B=BAMBOO_CORRIDOR.budgets;
 const driveBand=(p:{z:number})=>p.z<-880&&p.z>-1480?0:1;
 const shopIdx=plinths.map((p,i)=>({i,z:p.z})).sort((a,b)=>driveBand(a)-driveBand(b)||a.z-b.z).slice(0,B.plinth).map(o=>o.i);
 const keptSigns=shopIdx.flatMap(i=>[signs[i*2],signs[i*2+1]]).filter((p):p is CorridorPose=>!!p);
 const keptPlinths=shopIdx.map(i=>plinths[i]);
 for(const lamp of lamps){
  if(driveBand(lamp)||!keptPlinths.some(p=>Math.hypot(p.x-lamp.x,p.z-lamp.z)<16))continue;
  keptSigns.push(pose(lamp.x,lamp.z,lamp.yaw,1.55,1,1));
 }
 for(const p of keptPlinths){
  const proj=corridorProject(p.x,p.z),vx=proj.x-p.x,vz=proj.z-p.z,vd=Math.hypot(vx,vz)||1;
  for(let d=3;d<=15;d+=1.1){
   const x=p.x+vx/vd*d,z=p.z+vz/vd*d;
   if(onCarriageway(roads,x,z,.9)||nearJunction(x,z,junctions)||inBuilding(buildings,x,z,.4))continue;
   if(!onLand(data,x,z)||inWater(data,x,z)||corridorProject(x,z).d<3.6)continue;
   keptSigns.push(pose(x,z,p.yaw,1.9,1.2,1));
   break;
  }
 }
 const spineYaw=Math.atan2(BAMBOO_CORRIDOR.spine[1][0]-BAMBOO_CORRIDOR.spine[0][0],BAMBOO_CORRIDOR.spine[1][1]-BAMBOO_CORRIDOR.spine[0][1]);
 for(const p of keptPlinths){
  const proj=corridorProject(p.x,p.z);
  const east=p.x>=proj.x;
  const vx=proj.x-p.x,vz=proj.z-p.z,vd=Math.hypot(vx,vz)||1;
  const start=east?4.8:3.4,end=east?7.4:8,pad=2.2,minD=east?3.2:8;
  for(let d=start;d<=end;d+=.7){
   const x=p.x+vx/vd*d,z=p.z+vz/vd*d;
   if(onCarriageway(roads,x,z,pad)||nearJunction(x,z,junctions)||inBuilding(buildings,x,z,1.4))continue;
   if(!onLand(data,x,z)||inWater(data,x,z)||reserved(x,z,.8))continue;
   if(pits.some(t=>Math.hypot(t.x-x,t.z-z)<2.4))continue;
   const cd=corridorProject(x,z).d;
   if(cd<minD||cd>16)continue;
   if(parked.some(c=>Math.hypot(c.x-x,c.z-z)<8))break;
   parked.push(pose(x,z,spineYaw));
   break;
  }
 }
 return {
  corridor:BAMBOO_CORRIDOR,roadMetres,roads:new Set(segs.map(s=>s.road.id)).size,junctions,
  curbs:spread(curbs,B.curb),walks:spread(stitchRibbon(walks),B.walk),edges:spread(edges,B.edge),
  pits:spread(pits,B.pit),lamps:spread(lamps,B.lamp),signals:spread(signals,B.signal),
  parked:take(parked.slice().sort((a,b)=>{
   const rank=p=>{
    const proj=corridorProject(p.x,p.z),band=driveBand(p);
    const apron=p.x>=proj.x&&proj.d>=3.2&&proj.d<=10;
    return band*20+(apron?0:6)+proj.d*.02;
   };
   return rank(a)-rank(b)||a.z-b.z;
  }),B.parked),
  plinths:keptPlinths,awnings:shopIdx.map(i=>awnings[i]),
  doors:shopIdx.map(i=>doors[i]),panes:take(panes,B.pane),
  signs:take(keptSigns,B.sign),
 };
}

function paint(scene:Scene,name:string,color:readonly number[],metallic=0,roughness=.72,emissive?:readonly number[]){
 const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromArray(color);m.metallic=metallic;m.roughness=roughness;
 m.environmentIntensity=.38;m.maxSimultaneousLights=4;m.enableSpecularAntiAliasing=true;m.backFaceCulling=true;
 if(emissive){m.emissiveColor=Color3.FromArray(emissive);m.emissiveIntensity=.16;}
 return m;
}

function instantiate(mesh:Mesh,poses:CorridorPose[],heightAt:(x:number,z:number)=>number,lift:number){
 if(!poses.length){mesh.setEnabled(false);return;}
 const matrices=new Float32Array(poses.length*16);
 poses.forEach((p,i)=>Matrix.Compose(new Vector3(p.sx,p.sy,p.sz),Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,heightAt(p.x,p.z)+lift,p.z)).copyToArray(matrices,i*16));
 mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo();
}

function proto(scene:Scene,name:string,w:number,h:number,d:number,material:PBRMaterial){
 const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
 mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.isVisible=true;
 return mesh;
}

export function createBambooCorridor(scene:Scene,data:CityData,heightAt:(x:number,z:number)=>number,options:BambooCorridorOptions={}){
 const plan=planBambooCorridor(data,options);
 const root=new TransformNode('bamboo-corridor',scene);
 const mats={
  curb:paint(scene,'corridor-curb',CORRIDOR_DAYLIGHT.curb,0,.82),
  curbTop:paint(scene,'corridor-curb-top',CORRIDOR_DAYLIGHT.curbTop,0,.7),
  walk:paint(scene,'corridor-walk',CORRIDOR_DAYLIGHT.walk,0,.9),
  edge:paint(scene,'corridor-edge',CORRIDOR_DAYLIGHT.edge,0,.55),
  ring:paint(scene,'corridor-pit-ring',CORRIDOR_DAYLIGHT.pitRing,0,.8),
  soil:paint(scene,'corridor-soil',CORRIDOR_DAYLIGHT.soil,0,.94),
  bark:paint(scene,'corridor-bark',CORRIDOR_DAYLIGHT.bark,0,.92),
  canopy:paint(scene,'corridor-canopy',CORRIDOR_DAYLIGHT.canopy,0,.9),
  steel:paint(scene,'corridor-steel',CORRIDOR_DAYLIGHT.steel,.62,.42),
  glass:paint(scene,'corridor-glass',CORRIDOR_DAYLIGHT.glass,.08,.18),
  lamp:paint(scene,'corridor-lamp',CORRIDOR_DAYLIGHT.lampWarm,0,.28,CORRIDOR_DAYLIGHT.lampWarm),
  door:paint(scene,'corridor-door',CORRIDOR_DAYLIGHT.door,0,.7),
  kick:paint(scene,'corridor-kick',CORRIDOR_DAYLIGHT.kick,0,.88),
  shops:CORRIDOR_DAYLIGHT.shop.map((c,i)=>paint(scene,'corridor-shop-'+i,c,0,.78)),
  red:paint(scene,'corridor-signal-red',[.18,.04,.03],0,.32,[1,.12,.08]),
  amber:paint(scene,'corridor-signal-amber',[.18,.1,.03],0,.32,[1,.55,.08]),
  green:paint(scene,'corridor-signal-green',[.03,.16,.06],0,.32,[.12,1,.28]),
  awnings:CORRIDOR_DAYLIGHT.awning.map((c,i)=>paint(scene,'corridor-awning-'+i,c,0,.82)),
  paints:CORRIDOR_DAYLIGHT.paint.map((c,i)=>paint(scene,'corridor-car-'+i,c,.18,.38)),
 };
 const curbBody=MeshBuilder.CreateBox('corridor-curb-body',{width:7.2,height:.58,depth:.7},scene);curbBody.material=mats.curb;curbBody.position.y=.29;
 const curbCap=MeshBuilder.CreateBox('corridor-curb-cap',{width:7.2,height:.08,depth:.86},scene);curbCap.material=mats.curbTop;curbCap.position.y=.62;
 const curb=Mesh.MergeMeshes([curbBody,curbCap],true,true,undefined,false,true)!;curb.name='corridor-curb';
 const shops=mats.shops.map((mat,i)=>proto(scene,'corridor-plinth-box-'+i,6,1,2.55,mat));
 const meshes:Mesh[]=[
  curb,
  proto(scene,'corridor-walk-box',7.2,.28,3.6,mats.walk),
  proto(scene,'corridor-edge-box',7.2,.05,.18,mats.edge),
  proto(scene,'corridor-door-box',1.05,2.15,.12,mats.door),
  proto(scene,'corridor-pane-box',1.28,1.45,.05,mats.glass),
 ];
 const pitRing=MeshBuilder.CreateTorus('corridor-pit-ring',{diameter:1.42,thickness:.22,tessellation:10},scene);
 pitRing.material=mats.ring;const pitSoil=MeshBuilder.CreateCylinder('corridor-pit-soil',{height:.07,diameter:1.12,tessellation:8},scene);pitSoil.material=mats.soil;
 const trunk=MeshBuilder.CreateCylinder('corridor-tree-trunk',{height:2.35,diameter:.2,tessellation:6},scene);trunk.material=mats.bark;trunk.position.y=1.18;
 const canopy=MeshBuilder.CreateSphere('corridor-tree-canopy',{diameter:2.15,segments:6},scene);canopy.material=mats.canopy;canopy.position.y=2.85;canopy.scaling.set(1,.68,1);
 const tree=Mesh.MergeMeshes([trunk,canopy],true,true,undefined,false,true)!;tree.name='corridor-tree';
 const pole=MeshBuilder.CreateCylinder('corridor-lamp-pole',{height:6.8,diameter:.18,tessellation:6},scene);pole.material=mats.steel;pole.position.y=3.4;
 const arm=MeshBuilder.CreateBox('corridor-lamp-arm',{width:.08,height:.08,depth:1.35},scene);arm.material=mats.steel;arm.position.set(0,6.55,.55);
 const head=MeshBuilder.CreateBox('corridor-lamp-head',{width:.28,height:.12,depth:.42},scene);head.material=mats.lamp;head.position.set(0,6.42,1.15);
 const lamp=Mesh.MergeMeshes([pole,arm,head],true,true,undefined,false,true)!;lamp.name='corridor-lamp';
 const sigPole=MeshBuilder.CreateCylinder('corridor-sig-pole',{height:5.4,diameter:.14,tessellation:6},scene);sigPole.material=mats.steel;sigPole.position.y=2.7;
 const housing=MeshBuilder.CreateBox('corridor-sig-box',{width:.32,height:.9,depth:.24},scene);housing.material=mats.steel;housing.position.set(0,5.15,.2);
 const lensG=MeshBuilder.CreateBox('corridor-sig-lens',{width:.18,height:.18,depth:.06},scene);lensG.material=mats.green;lensG.position.set(0,5.12,.36);
 const signal=Mesh.MergeMeshes([sigPole,housing,lensG],true,true,undefined,false,true)!;signal.name='corridor-signal';
 const awnings=mats.awnings.slice(0,4).map((mat,i)=>proto(scene,'corridor-awning-'+i,6,.22,1.85,mat));
 const fascia=mats.awnings.slice(0,4).map((mat,i)=>proto(scene,'corridor-fascia-'+i,6,.72,.22,mat));
 const hanging=mats.awnings.slice(0,4).map((mat,i)=>proto(scene,'corridor-sign-color-'+i,2.8,1.25,.16,mat));
 const bodies=mats.paints.map((mat,i)=>proto(scene,'corridor-car-body-'+i,1.78,1.02,4.2,mat));
 const cabins=mats.paints.map((_,i)=>proto(scene,'corridor-car-cabin-'+i,1.62,.58,1.9,mats.glass));
 const kick=proto(scene,'corridor-kick-box',6,.88,2.62,mats.kick);
 const extras=[pitRing,pitSoil,tree,lamp,signal,kick,...shops,...awnings,...fascia,...hanging,...bodies,...cabins];
 for(const mesh of [...meshes,...extras]){mesh.parent=root;mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;}
 instantiate(meshes[0],plan.curbs,heightAt,.02);
 instantiate(meshes[1],plan.walks,heightAt,.12);
 instantiate(meshes[2],plan.edges,heightAt,.06);
 instantiate(meshes[3],plan.doors,heightAt,1.12);
 instantiate(meshes[4],plan.panes,heightAt,1.55);
 instantiate(kick,plan.plinths,heightAt,.44);
 shops.forEach((mesh,i)=>instantiate(mesh,plan.plinths.filter((_,n)=>n%shops.length===i),heightAt,2.18));
 instantiate(pitRing,plan.pits,heightAt,.1);instantiate(pitSoil,plan.pits,heightAt,.05);
 instantiate(tree,plan.pits,heightAt,0);
 instantiate(lamp,plan.lamps,heightAt,0);instantiate(signal,plan.signals,heightAt,0);
 awnings.forEach((mesh,i)=>instantiate(mesh,plan.awnings.filter((_,n)=>n%awnings.length===i),heightAt,2.72));
 fascia.forEach((mesh,i)=>instantiate(mesh,plan.plinths.filter((_,n)=>n%fascia.length===i),heightAt,4.62));
 hanging.forEach((mesh,i)=>instantiate(mesh,plan.signs.filter((_,n)=>n%hanging.length===i),heightAt,3.85));
 bodies.forEach((mesh,i)=>instantiate(mesh,plan.parked.filter((_,n)=>n%bodies.length===i),heightAt,.58));
 cabins.forEach((mesh,i)=>instantiate(mesh,plan.parked.filter((_,n)=>n%cabins.length===i),heightAt,1.22));

 let mode:'day'|'sunset'|'night'='day',wanted=true,visible=false,phase=2;
 function applyLamp(){
  mats.lamp.emissiveIntensity=mode==='night'?1.8:mode==='sunset'?.7:.42;
  mats.green.emissiveIntensity=mode==='day'?.55:1.2;
 }
 function show(){return wanted&&visible;}
 function applyVisible(){root.setEnabled(show());}
 function setEnabled(value:boolean){wanted=value;applyVisible();}
 function setMode(next:'day'|'sunset'|'night'){mode=next;applyLamp();}
 function update(_time:number,x:number,z:number,_aerial=false){
  visible=corridorProject(x,z).d<520;applyVisible();
 }
 function dispose(){
  for(const mesh of [...meshes,...extras])mesh.dispose(false,false);
  for(const m of [...Object.values(mats).filter((v):v is PBRMaterial=>v instanceof PBRMaterial),...mats.shops,...mats.awnings,...mats.paints])m.dispose();
  root.dispose();
 }
 applyLamp();applyVisible();
 const counts={curbs:plan.curbs.length,walks:plan.walks.length,edges:plan.edges.length,pits:plan.pits.length,lamps:plan.lamps.length,signals:plan.signals.length,parked:plan.parked.length,shopfronts:plan.plinths.length};
 return {
  plan,root,setMode,setEnabled,update,dispose,
  get stats(){return {id:BAMBOO_CORRIDOR.id,name:BAMBOO_CORRIDOR.name,length:BAMBOO_CORRIDOR.length,halfWidth:BAMBOO_CORRIDOR.halfWidth,roadMetres:+plan.roadMetres.toFixed(1),roads:plan.roads,junctions:plan.junctions.length,enabled:root.isEnabled(),mode,phase,drawCalls:root.isEnabled()?meshes.length+extras.filter(m=>m.isEnabled()).length:0,photoscrape:false,extraLights:0,...counts};},
 };
}
