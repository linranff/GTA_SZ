import {Color3,DynamicTexture,Matrix,Mesh,MeshBuilder,PBRMaterial,Quaternion,TransformNode,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';
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
 lips:CorridorPose[];
 verges:CorridorPose[];
 pits:CorridorPose[];
 lamps:CorridorPose[];
 signals:CorridorPose[];
 crossings:CorridorPose[];
 stops:CorridorPose[];
 parked:CorridorPose[];
 plinths:CorridorPose[];
 awnings:CorridorPose[];
 doors:CorridorPose[];
 panes:CorridorPose[];
 interiors:CorridorPose[];
 signs:CorridorPose[];
 decks:CorridorPose[];
 dashes:CorridorPose[];
 rolling:CorridorPose[];
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
 parkStep:6.8,
 shopfrontReach:42,
 shopfrontBay:5,
 streetWallExtra:1.15,
 apronStep:1.2,
 apronRows:4,
 spineAlign:0.72,
 budgets:{curb:420,walk:1200,edge:420,pit:180,lamp:120,signal:16,cross:80,stop:24,parked:130,plinth:140,awning:140,door:140,pane:280,sign:280,deck:220,dash:160,roll:36},
} as const;

/** Day-lit street kit. The driven 科苑 carriageway uses a corridor deck so day stills are not cinematic charcoal. */
export const CORRIDOR_DAYLIGHT={
 curb:[.16,.14,.12] as const,
  curbTop:[.78,.62,.42] as const,
  walk:[.76,.74,.70] as const,
 edge:[.78,.74,.64] as const,
 pitRing:[.46,.38,.28] as const,
 soil:[.17,.13,.10] as const,
 bark:[.28,.18,.12] as const,
 canopy:[.22,.40,.16] as const,
 steel:[.32,.33,.34] as const,
 glass:[.16,.20,.24] as const,
 interior:[.92,.62,.26] as const,
  cabin:[.12,.15,.18] as const,
 lampWarm:[1,.78,.52] as const,
  door:[.12,.12,.13] as const,
  recess:[.08,.07,.06] as const,
  kick:[.22,.19,.16] as const,
  tire:[.08,.08,.08] as const,
  awning:[[.14,.38,.36],[.46,.18,.14],[.70,.58,.32],[.14,.20,.38],[.38,.24,.16]] as const,
  shop:[[.69,.66,.60],[.52,.56,.58],[.48,.42,.35],[.34,.25,.21]] as const,
 paint:[[.82,.18,.14],[.14,.38,.78],[.94,.76,.16],[.10,.46,.28]] as const,
} as const;

/** Ground-floor lettering is game art, not surveyed shop signs. */
export const CORRIDOR_SHOPS=[
 {title:'科苑便利',blade:'便利'},
 {title:'南风面馆',blade:'面馆'},
 {title:'青叶茶',blade:'茶'},
 {title:'海风洗衣',blade:'洗衣'},
] as const;

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
function isKeyuanSeg(seg:StreetSeg){
 return /科苑|keyuan/i.test(seg.road.name??'')&&inBambooCorridor(seg.mid[0],seg.mid[1]);
}
function isSpineSeg(seg:StreetSeg){
 if(isKeyuanSeg(seg))return true;
 const d=corridorProject(seg.mid[0],seg.mid[1]).d;
 if(d>32)return false;
 const name=seg.road.name??'';
 if(name.includes('登良')||name.includes('海德一道'))return true;
 return spineAligned(seg.yaw);
}
function nearestSeg(segs:StreetSeg[],x:number,z:number){
 let hit:{seg:StreetSeg;d:number}|null=null;
 for(const s of segs){const q=closest(x,z,s.a,s.b);if(!hit||q.d<hit.d)hit={seg:s,d:q.d};}
 return hit;
}
function isDriveName(name:string){
 return /科苑|登良|海德|keyuan/.test(name);
}
function nearestKeyuanHit(roads:StreetSeg[],x:number,z:number){
 return nearestNamedHit(roads,x,z,isKeyuanSeg);
}
function nearestNamedHit(roads:StreetSeg[],x:number,z:number,test:(s:StreetSeg)=>boolean){
 let hit:{seg:StreetSeg;x:number;z:number;d:number}|null=null;
 for(const s of roads){
  if(!test(s))continue;
  const q=closest(x,z,s.a,s.b);
  if(!hit||q.d<hit.d)hit={seg:s,x:q.x,z:q.z,d:q.d};
 }
 return hit;
}
function parallelSpan(x:number,z:number,yaw:number,roads:StreetSeg[],fallback:number){
 const onPara=(px:number,pz:number)=>roads.some(s=>{
  const align=Math.abs(Math.sin(s.yaw)*Math.sin(yaw)+Math.cos(s.yaw)*Math.cos(yaw));
  if(align<BAMBOO_CORRIDOR.spineAlign)return false;
  return closest(px,pz,s.a,s.b).d<s.width/2+.45;
 });
 let left=0,right=0;
 for(let d=0;d<=22;d+=.4){
  const p=sidePoint(x,z,yaw,-1,d);if(onPara(p.x,p.z))left=d;
 }
 for(let d=0;d<=22;d+=.4){
  const p=sidePoint(x,z,yaw,1,d);if(onPara(p.x,p.z))right=d;
 }
 const span=Math.max(6.4,fallback*.95,left+right);
 const c=sidePoint(x,z,yaw,1,(right-left)/2);
 return {span,x:c.x,z:c.z};
}
function spineRibbon(segs:StreetSeg[],fillHoles:boolean):StreetSeg[]{
 const [a,b]=BAMBOO_CORRIDOR.spine,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
 const road:Road={id:'corridor-spine',name:'科苑南路',points:BAMBOO_CORRIDOR.spine.map(q=>[q[0],q[1]] as V2),width:6,kind:'primary',oneway:false,grade:'0'};
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

function nearJunction(x:number,z:number,junctions:CorridorJunction[],clear:number=BAMBOO_CORRIDOR.junctionClearance){
 return junctions.some(j=>Math.hypot(x-j.x,z-j.z)<clear);
}
function onCarriageway(segs:StreetSeg[],x:number,z:number,pad=.2){
 return segs.some(s=>closest(x,z,s.a,s.b).d<s.width/2+pad);
}
function onTravelLane(segs:StreetSeg[],x:number,z:number,clear=1.65){
 return segs.some(s=>closest(x,z,s.a,s.b).d<s.width/2-clear);
}
function curbParkPoint(x:number,z:number,yaw:number,side:number,roads:StreetSeg[]){
 const outer=namedOffset(x,z,yaw,side,roads,['科苑']);
 return sidePoint(x,z,yaw,side,Math.max(2.4,outer-1.28));
}
function inCurbLane(hit:{seg:StreetSeg;d:number}|null){
 if(!hit)return false;
 const edge=hit.seg.width/2;
 return hit.d>edge-1.7&&hit.d<edge+.35;
}
function onCrossing(segs:StreetSeg[],x:number,z:number,yaw:number,pad=3.2){
 return segs.some(s=>{
  const align=Math.abs(Math.sin(s.yaw)*Math.sin(yaw)+Math.cos(s.yaw)*Math.cos(yaw));
  if(align>BAMBOO_CORRIDOR.spineAlign)return false;
  return closest(x,z,s.a,s.b).d<s.width/2+pad;
 });
}
function outerOffset(x:number,z:number,yaw:number,side:number,roads:StreetSeg[],maxGap=.5){
 let last=0,seen=false,gap=0;
 for(let d=0;d<=22;d+=.5){
  const p=sidePoint(x,z,yaw,side,d);
  if(onCarriageway(roads,p.x,p.z,.25)){last=d;seen=true;gap=0;}
  else if(seen){gap+=.5;if(gap>=maxGap)break;}
 }
 return last;
}
function namedOffset(x:number,z:number,yaw:number,side:number,roads:StreetSeg[],names:string[]){
 const subset=roads.filter(s=>names.some(n=>(s.road.name??'').includes(n))&&closest(x,z,s.a,s.b).d<18);
 return outerOffset(x,z,yaw,side,subset.length?subset:roads,2.2);
}
function stitchWalks(list:CorridorPose[],maxSpan=11,gap=8){
 const bands=new Map<string,CorridorPose[]>();
 for(const p of list){
  const proj=corridorProject(p.x,p.z);
  const key=`${p.x>=proj.x?'e':'w'}:${(Math.round(proj.d*2)/2).toFixed(1)}`;
  const arr=bands.get(key);if(arr)arr.push(p);else bands.set(key,[p]);
 }
 const out:CorridorPose[]=[];
 for(const group of bands.values()){
  const arr=group.slice().sort((a,b)=>a.z-b.z||a.x-b.x);
  let run:CorridorPose[]=[];
  const flush=()=>{
   if(!run.length)return;
   const a=run[0],b=run[run.length-1];
   const span=Math.hypot(b.x-a.x,b.z-a.z)+6.8;
   out.push(pose(run.reduce((n,p)=>n+p.x,0)/run.length,run.reduce((n,p)=>n+p.z,0)/run.length,a.yaw,Math.max(1,span/7.2),1,1));
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
 const curbs:CorridorPose[]=[],walks:CorridorPose[]=[],edges:CorridorPose[]=[],lips:CorridorPose[]=[],verges:CorridorPose[]=[],pits:CorridorPose[]=[],lamps:CorridorPose[]=[],parked:CorridorPose[]=[];
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
    const kerb=outerOffset(x,z,yaw,side,roads,.5);
    const outer=outerOffset(x,z,yaw,side,roads,2.2);
    const curb=sidePoint(x,z,yaw,side,kerb+.48);
    if(usable(curb.x,curb.z,.2))curbs.push(pose(curb.x,curb.z,yaw+Math.PI/2,along/7.2,1,1));
    const verge=sidePoint(x,z,yaw,side,kerb+1.58);
    if(usable(verge.x,verge.z,.25))verges.push(pose(verge.x,verge.z,yaw+Math.PI/2,along/7.2,1,1));
    const lip=sidePoint(x,z,yaw,side,kerb+2.08);
    if(usable(lip.x,lip.z,.18))lips.push(pose(lip.x,lip.z,yaw+Math.PI/2,along/7.2,1,1));
    const edge=sidePoint(x,z,yaw,side,Math.max(seg.width/2-BAMBOO_CORRIDOR.edgeInset,kerb-.2));
    if(inBambooCorridor(edge.x,edge.z)&&onLand(data,edge.x,edge.z)&&!inWater(data,edge.x,edge.z)){
     edges.push(pose(edge.x,edge.z,yaw+Math.PI/2,along/7.2,1,1));
    }
    const face=faceReach(x,z,yaw,side,outer+1.2);
    const rows=face?Math.min(7,Math.max(3,Math.ceil((face-outer-1.2)/BAMBOO_CORRIDOR.apronStep))):3;
    for(let row=0;row<rows;row++){
     const extra=outer+2.35+row*BAMBOO_CORRIDOR.apronStep;
     if(face&&extra>face-.35)break;
     const p=sidePoint(x,z,yaw,side,extra);
     if(usable(p.x,p.z,.22))walks.push(pose(p.x,p.z,yaw+Math.PI/2,along/7.2,1,1));
    }
   }
  });
  sample(seg,BAMBOO_CORRIDOR.pitStep,(x,z,yaw)=>{
   for(const side of [-1,1] as const){
    const p=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+1.58);
    if(usable(p.x,p.z,.9)){
     const s=.86+random(`pit:${p.x.toFixed(1)}:${p.z.toFixed(1)}`)*.28;
     pits.push(pose(p.x,p.z,yaw,s,1,s));
    }
   }
  });
  sample(seg,BAMBOO_CORRIDOR.lampStep,(x,z,yaw)=>{
   for(const side of [-1,1] as const){
    const p=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+1.7);
    if(usable(p.x,p.z,.55))lamps.push(pose(p.x,p.z,Math.atan2(-side*Math.cos(yaw),side*Math.sin(yaw))));
   }
  });
  sample(seg,BAMBOO_CORRIDOR.parkStep,(x,z,yaw)=>{
   if(!isKeyuanSeg(seg)&&z<-1100&&z>-1280){
    const k=nearestKeyuanHit(roads,x,z);
    if(!k||k.d>16)return;
   }
   for(const side of [-1,1] as const){
    const p=curbParkPoint(x,z,yaw,side,roads);
    if(!inBambooCorridor(p.x,p.z)||!onLand(data,p.x,p.z)||inWater(data,p.x,p.z))continue;
    if(inBuilding(buildings,p.x,p.z,1.6)||reserved(p.x,p.z,.8)||nearJunction(p.x,p.z,junctions))continue;
    if(onTravelLane(roads,p.x,p.z)||!inCurbLane(nearestKeyuanHit(roads,p.x,p.z)))continue;
    if(pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.8))continue;
    if(data.landmarks.some(m=>m.arrival&&Math.hypot(p.x-m.arrival[0],p.z-m.arrival[1])<10))continue;
    parked.push(pose(p.x,p.z,yaw));
   }
  });
 }

 const shopSegs=[...spineRibbon(segs,false)];
 for(const seg of segs){
  if(!isKeyuanSeg(seg))continue;
  if(shopSegs.some(s=>Math.hypot(s.mid[0]-seg.mid[0],s.mid[1]-seg.mid[1])<10))continue;
  shopSegs.push(seg);
 }
 for(const seg of shopSegs){
  sample(seg,5,(x,z,yaw,along)=>{
   for(const side of [-1,1] as const){
    const walk=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+2.95);
    if(usable(walk.x,walk.z,.25))walks.push(pose(walk.x,walk.z,yaw+Math.PI/2,along/5,1,1));
   }
  });
  sample(seg,BAMBOO_CORRIDOR.shopfrontBay,(x,z,yaw,along)=>{
   if(!spineAligned(yaw))return;
   const drive=z<-880&&z>-1480;
   const west=sidePoint(x,z,yaw,1,8).x<sidePoint(x,z,yaw,-1,8).x?1:-1;
   const prefer=drive?west:builtSide(x,z,yaw);
   for(const side of [-1,1] as const){
    const face=faceReach(x,z,yaw,side,seg.width/2+1.2);
    const outer=outerOffset(x,z,yaw,side,roads,2.2);
    const verge=outer+2.9;
    const sidewalk=Math.max(seg.width/2+BAMBOO_CORRIDOR.walkExtra+BAMBOO_CORRIDOR.streetWallExtra,verge);
    let offset=face?Math.min(face-.5,sidewalk):sidewalk;
    const row=drive&&prefer!==0&&(side===prefer||outer<8.2);
    if(!face&&!buildingSetback(x,z,yaw,side)&&!row)continue;
    if(row){
     let want=Math.max(offset,outer+4.6,seg.width/2+5.8);
     for(let n=0;n<8&&want>offset+0.2;n++){
      const q=sidePoint(x,z,yaw,side,want);
      if(onCarriageway(roads,q.x,q.z,1.6)||inBuilding(buildings,q.x,q.z,.3)||reserved(q.x,q.z,1.2)||inWater(data,q.x,q.z)){
       want-=.35;continue;
      }
      offset=want;break;
     }
    }
    if(offset<seg.width/2+.85)continue;
    let p=sidePoint(x,z,yaw,side,offset);
    const clear=1.45;
    for(let n=0;n<10&&onCarriageway(roads,p.x,p.z,clear);n++){offset+=1.1;p=sidePoint(x,z,yaw,side,offset);}
    if(reserved(p.x,p.z,1.2)||inWater(data,p.x,p.z)||onCarriageway(roads,p.x,p.z,clear)||inBuilding(buildings,p.x,p.z,.25))continue;
    if(corridorProject(p.x,p.z).d<4.6)continue;
    if(nearJunction(p.x,p.z,junctions,BAMBOO_CORRIDOR.shopJunctionClearance)||onCrossing(roads,p.x,p.z,yaw,4))continue;
    wallBays.push({x:p.x,z:p.z,yaw,side,offset,span:along,row});
    const walk=sidePoint(x,z,yaw,side,outerOffset(x,z,yaw,side,roads)+2.95);
    if(!onCarriageway(roads,walk.x,walk.z,.3)&&onLand(data,walk.x,walk.z)&&!inWater(data,walk.x,walk.z)&&!inBuilding(buildings,walk.x,walk.z,.2)){
     walks.push(pose(walk.x,walk.z,yaw+Math.PI/2,along/5,1,1));
    }
   }
  });
 }

 for(const p of pits){
  if(!walks.some(w=>Math.hypot(w.x-p.x,w.z-p.z)<1.7))continue;
  const hit=nearestSeg(roads,p.x,p.z);if(!hit)continue;
  const q=closest(p.x,p.z,hit.seg.a,hit.seg.b);
  const dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz)||1;
  const nx=p.x+dx/d*.55,nz=p.z+dz/d*.55;
  if(onCarriageway(roads,nx,nz,.22))continue;
  p.x=nx;p.z=nz;
 }
 const signals:CorridorPose[]=[],crossings:CorridorPose[]=[],stops:CorridorPose[]=[];
 const axes:{x:number;z:number;yaw:number;width:number}[]=[];
 const addAxis=(hit:{seg:StreetSeg;x:number;z:number;d:number}|null,maxD:number)=>{
  if(!hit||hit.d>maxD)return;
  const t=corridorProject(hit.x,hit.z);
  if(t.t<0.08||t.t>0.92||t.d>40)return;
  if(axes.some(a=>Math.hypot(a.x-hit.x,a.z-hit.z)<7&&Math.abs(Math.sin(a.yaw-hit.seg.yaw))<.38))return;
  axes.push({x:hit.x,z:hit.z,yaw:hit.seg.yaw,width:hit.seg.width});
 };
 for(const j of junctions){
  const proj=corridorProject(j.x,j.z);
  if(proj.t<0.08||proj.t>0.92)continue;
  addAxis(nearestKeyuanHit(segs,j.x,j.z),34);
  addAxis(nearestNamedHit(segs,j.x,j.z,s=>/海德|登良/.test(s.road.name??'')),18);
  addAxis(nearestNamedHit(segs,proj.x,proj.z,s=>isDriveName(s.road.name??'')||isSpineSeg(s)),10);
  const fallback=nearestSeg(segs.filter(s=>isSpineSeg(s)),j.x,j.z);
  if(fallback){
   const q=closest(j.x,j.z,fallback.seg.a,fallback.seg.b);
   addAxis({seg:fallback.seg,x:q.x,z:q.z,d:fallback.d},16);
  }
 }
 for(const axis of axes){
  const ribbon=parallelSpan(axis.x,axis.z,axis.yaw,roads,axis.width);
  if(spineAligned(axis.yaw)){
   for(const side of [-1,1] as const){
    const p=sidePoint(ribbon.x,ribbon.z,axis.yaw,side,ribbon.span/2+1.15);
    if(inBambooCorridor(p.x,p.z)&&!inBuilding(buildings,p.x,p.z,.4)&&!reserved(p.x,p.z,.4)){
     signals.push(pose(p.x,p.z,axis.yaw+Math.PI,side,1,1));
    }
   }
   const stripe=Math.max(4.2,axis.width-1.5);
   for(let i=0;i<9;i++){
    const along=(i-4)*1.85;
    crossings.push(pose(axis.x+Math.sin(axis.yaw)*along,axis.z+Math.cos(axis.yaw)*along,axis.yaw,stripe/7.2,1,1));
   }
   for(const dir of [-1,1] as const){
    stops.push(pose(axis.x+Math.sin(axis.yaw)*dir*5.4,axis.z+Math.cos(axis.yaw)*dir*5.4,axis.yaw,stripe/6.4,1,1));
   }
  }
 }
 const spineYaw=Math.atan2(BAMBOO_CORRIDOR.spine[1][0]-BAMBOO_CORRIDOR.spine[0][0],BAMBOO_CORRIDOR.spine[1][1]-BAMBOO_CORRIDOR.spine[0][1]);
 for(const j of junctions){
  const proj=corridorProject(j.x,j.z);
  if(proj.t<0.08||proj.t>0.92)continue;
  if(crossings.some(p=>corridorProject(p.x,p.z).d<12&&Math.abs(corridorProject(p.x,p.z).t-proj.t)<0.05))continue;
  const stripe=Math.max(4.2,(nearestKeyuanHit(segs,proj.x,proj.z)?.seg.width??6.4)-1.5);
  for(let i=0;i<9;i++){
   const along=(i-4)*1.85;
   crossings.push(pose(proj.x+Math.sin(spineYaw)*along,proj.z+Math.cos(spineYaw)*along,spineYaw,stripe/7.2,1,1));
  }
 }

 const plinths:CorridorPose[]=[],awnings:CorridorPose[]=[],doors:CorridorPose[]=[],panes:CorridorPose[]=[],interiors:CorridorPose[]=[],signs:CorridorPose[]=[];
 const emitBay=(px:number,pz:number,roadYaw:number,outX:number,outZ:number,width:number,_seed:string)=>{
  const along=roadYaw+Math.PI/2,recede=.18,face=.52;
  const doorLat=width*.26,winLat=-width*.18;
  const faceX=-Math.cos(roadYaw),faceZ=Math.sin(roadYaw);
  const flip=(outX*faceX+outZ*faceZ)>=0?1:-1;
  plinths.push(pose(px-outX*recede,pz-outZ*recede,along,1,1,flip));
  awnings.push(pose(px+outX*(face+.72),pz+outZ*(face+.72),along,1,1,1));
  doors.push(pose(px+Math.sin(roadYaw)*doorLat+outX*(face+.1),pz+Math.cos(roadYaw)*doorLat+outZ*(face+.1),along));
  interiors.push(pose(px+Math.sin(roadYaw)*winLat+outX*(face-.1),pz+Math.cos(roadYaw)*winLat+outZ*(face-.1),along));
  panes.push(pose(px+Math.sin(roadYaw)*winLat+outX*(face+.04),pz+Math.cos(roadYaw)*winLat+outZ*(face+.04),along));
  signs.push(pose(px+Math.sin(roadYaw)*doorLat+outX*(face+.7),pz+Math.cos(roadYaw)*doorLat+outZ*(face+.7),roadYaw,1,1,1));
 };
 const bandOf=(p:{z:number})=>p.z<-900&&p.z>-1100?0:p.z<-1140&&p.z>-1320?1:p.z<-1320&&p.z>-1480?2:3;
 const takeBands=<T extends {z:number}>(list:T[],limit:number)=>{
  const bins:T[][]=[[],[],[],[]];
  for(const p of list)bins[bandOf(p)].push(p);
  const out:T[]=[],share=Math.max(8,Math.floor(limit/3));
  for(const b of bins.slice(0,3))out.push(...b.slice(0,share));
  for(const b of bins)for(const p of b){if(out.length>=limit)return out;if(!out.includes(p))out.push(p);}
  return out.slice(0,limit);
 };
 const rowWalls=wallBays.filter(b=>b.row).sort((a,b)=>a.z-b.z||a.x-b.x);
 const extraWalls=wallBays.filter(b=>!b.row).sort((a,b)=>a.z-b.z||a.x-b.x);
 const pickedWalls=takeBands([...rowWalls,...extraWalls],BAMBOO_CORRIDOR.budgets.plinth);
 for(const [index,bay] of pickedWalls.entries()){
  const outX=-bay.side*Math.cos(bay.yaw),outZ=bay.side*Math.sin(bay.yaw);
  emitBay(bay.x,bay.z,bay.yaw,outX,outZ,Math.min(3.45,Math.max(2.85,(bay.span||5)*.56)),`wall:${index}:${bay.z.toFixed(0)}`);
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
   if(wallBays.some(bay=>Math.hypot(bay.x-px,bay.z-pz)<9.2))continue;
   const road=nearestSeg(verge,px,pz);
   if(road){
    const align=Math.abs(Math.sin(edge.yaw)*Math.sin(road.seg.yaw)+Math.cos(edge.yaw)*Math.cos(road.seg.yaw));
    if(align<BAMBOO_CORRIDOR.spineAlign)continue;
   }
   emitBay(px,pz,edge.yaw,edge.out[0],edge.out[1],Math.min(6.4,edge.len/bays*.86),`shop:${index}:${i}:${b.height.toFixed(1)}`);
  }
 }

 const B=BAMBOO_CORRIDOR.budgets;
 const driveBand=(p:{z:number})=>p.z<-880&&p.z>-1480?0:1;
 const shopIdx=takeBands(plinths.map((p,i)=>({i,z:p.z})),B.plinth).map(o=>o.i);
 const keptPlinths=shopIdx.map(i=>plinths[i]);
 const keptPanes=shopIdx.map(i=>panes[i]).filter((p):p is CorridorPose=>!!p);
 const keptInteriors=shopIdx.map(i=>interiors[i]).filter((p):p is CorridorPose=>!!p);
 const keptSigns=shopIdx.map(i=>signs[i]).filter((p):p is CorridorPose=>!!p);
 const [sa,sb]=BAMBOO_CORRIDOR.spine,sdx=sb[0]-sa[0],sdz=sb[1]-sa[1],slen=Math.hypot(sdx,sdz)||1;
 for(let t=0;t<1;t+=5.4/slen){
  const sx=sa[0]+sdx*t,sz=sa[1]+sdz*t;
  if(sz>-965||sz<-1012)continue;
  const east=sidePoint(sx,sz,spineYaw,1,8).x>=sidePoint(sx,sz,spineYaw,-1,8).x?1:-1;
  const p=curbParkPoint(sx,sz,spineYaw,east,roads);
  if(onTravelLane(roads,p.x,p.z)||nearJunction(p.x,p.z,junctions)||inBuilding(buildings,p.x,p.z,1.4))continue;
  if(!onLand(data,p.x,p.z)||inWater(data,p.x,p.z)||reserved(p.x,p.z,.8))continue;
  if(pits.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<2.8))continue;
  if(parked.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<4.2))continue;
  if(keptPlinths.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<3.9))continue;
  const cd=corridorProject(p.x,p.z).d;
  if(cd<3.6||cd>12)continue;
  if(onTravelLane(roads,p.x,p.z)||!inCurbLane(nearestKeyuanHit(roads,p.x,p.z)))continue;
  parked.push(pose(p.x,p.z,spineYaw));
 }
 for(const p of keptPlinths){
  const drive=nearestKeyuanHit(roads,p.x,p.z);
  if(!drive||drive.d>14)continue;
  const vx=drive.x-p.x,vz=drive.z-p.z,vd=Math.hypot(vx,vz)||1;
  const start=Math.max(2.6,vd-drive.seg.width/2-1.28);
  for(let d=start;d<=start+1.2;d+=.35){
   const x=p.x+vx/vd*d,z=p.z+vz/vd*d;
   if(onTravelLane(roads,x,z)||nearJunction(x,z,junctions)||inBuilding(buildings,x,z,1.4))continue;
   if(!onLand(data,x,z)||inWater(data,x,z)||reserved(x,z,.8))continue;
   if(pits.some(t=>Math.hypot(t.x-x,t.z-z)<2.8))continue;
   if(parked.some(c=>Math.hypot(c.x-x,c.z-z)<4))continue;
   if(Math.hypot(p.x-x,p.z-z)<3.6)continue;
   if(!inCurbLane({seg:drive.seg,d:closest(x,z,drive.seg.a,drive.seg.b).d}))continue;
   parked.push(pose(x,z,drive.seg.yaw));
   break;
  }
 }
 for(const seg of shopSegs){
  if(!isKeyuanSeg(seg))continue;
  sample(seg,5.4,(x,z,yaw)=>{
   for(const side of [-1,1] as const){
    const p=curbParkPoint(x,z,yaw,side,roads);
    if(!inBambooCorridor(p.x,p.z)||!onLand(data,p.x,p.z)||inWater(data,p.x,p.z))continue;
    if(inBuilding(buildings,p.x,p.z,1.6)||reserved(p.x,p.z,.8)||nearJunction(p.x,p.z,junctions))continue;
    if(onTravelLane(roads,p.x,p.z)||!inCurbLane(nearestKeyuanHit(roads,p.x,p.z)))continue;
    if(pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.8))continue;
    if(parked.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<4.2))continue;
    const shop=keptPlinths.some(s=>{
     const dx=s.x-p.x,dz=s.z-p.z,lat=dx*Math.cos(yaw)-dz*Math.sin(yaw),d=Math.hypot(dx,dz);
     return d>3.6&&d<14&&lat*side>1.2;
    });
    if(!shop)continue;
    parked.push(pose(p.x,p.z,yaw));
   }
  });
 }
 for(const seg of spineRibbon(segs,false)){
  if(seg.mid[1]<-1100&&seg.mid[1]>-1280){
   const k=nearestKeyuanHit(roads,seg.mid[0],seg.mid[1]);
   if(!k||k.d>16)continue;
  }
  sample(seg,6.4,(x,z,yaw)=>{
   const east=sidePoint(x,z,yaw,1,4).x>=sidePoint(x,z,yaw,-1,4).x?1:-1;
   for(const side of [east,-east] as const){
    const p=curbParkPoint(x,z,yaw,side,roads);
    if(!inBambooCorridor(p.x,p.z)||!onLand(data,p.x,p.z)||inWater(data,p.x,p.z))continue;
    if(inBuilding(buildings,p.x,p.z,1.6)||reserved(p.x,p.z,.8)||nearJunction(p.x,p.z,junctions))continue;
    if(onTravelLane(roads,p.x,p.z)||!inCurbLane(nearestKeyuanHit(roads,p.x,p.z)))continue;
    if(pits.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.8))continue;
    if(parked.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<5.4))continue;
    if(data.landmarks.some(m=>m.arrival&&Math.hypot(p.x-m.arrival[0],p.z-m.arrival[1])<10))continue;
    parked.push(pose(p.x,p.z,yaw));
   }
  });
 }
 const shopNear=(p:{x:number;z:number})=>{
  let best=99;for(const s of keptPlinths){const d=Math.hypot(s.x-p.x,s.z-p.z);if(d<best)best=d;}return best;
 };
 const pickedParked=(()=>{
  const rank=(p:{x:number;z:number})=>{
   const k=nearestKeyuanHit(roads,p.x,p.z),shop=shopNear(p),proj=corridorProject(p.x,p.z),band=driveBand(p);
   const curb=inCurbLane(k);
   const front=curb&&shop>3.6&&shop<14;
   const east=p.x>=proj.x&&proj.d>=3.2&&proj.d<=10;
   const bambooEast=east&&p.z<-900&&p.z>-1100;
   return (front?0:curb?1:5)+(bambooEast?0:1)+band*4+(k?k.d:40)*.04;
  };
  const ranked=parked.slice().sort((a,b)=>rank(a)-rank(b)||a.z-b.z);
  const bambooEast=ranked.filter(p=>{
   const proj=corridorProject(p.x,p.z);
   return p.x>=proj.x&&proj.d>=3.2&&proj.d<=10&&p.z<-900&&p.z>-1100;
  });
  const keyuanFront=ranked.filter(p=>{
   const k=nearestKeyuanHit(roads,p.x,p.z),shop=shopNear(p);
   return inCurbLane(k)&&shop>3.6&&shop<14;
  });
  const out:CorridorPose[]=[],seen=new Set<string>();
  const add=(list:CorridorPose[],limit=list.length)=>{
   let n=0;
   for(const p of list){
    if(out.length>=B.parked||n>=limit)return;
    const key=`${p.x.toFixed(2)},${p.z.toFixed(2)}`;
    if(seen.has(key))continue;
    seen.add(key);out.push(p);n++;
   }
  };
  add(takeBands(keyuanFront,78));
  add(bambooEast,12);
  add(ranked);
  return out.slice(0,B.parked);
 })();
 const decks:CorridorPose[]=[];
 const dashes:CorridorPose[]=[];
 const rolling:CorridorPose[]=[];
 for(const seg of segs.filter(isKeyuanSeg)){
  sample(seg,6.2,(x,z,yaw)=>{
   if(!inBambooCorridor(x,z,2))return;
   const k=nearestKeyuanHit(roads,x,z);
   if(!k||k.d>3.2)return;
   decks.push(pose(k.x,k.z,k.seg.yaw,Math.max(.72,k.seg.width/8.2),1,1));
  });
  sample(seg,7.6,(x,z,yaw)=>{
   if(!inBambooCorridor(x,z,2)||nearJunction(x,z,junctions,10))return;
   const k=nearestKeyuanHit(roads,x,z);
   if(!k||k.d>2.4)return;
   dashes.push(pose(k.x,k.z,k.seg.yaw));
  });
  sample(seg,22,(x,z,yaw)=>{
   if(!inBambooCorridor(x,z,2)||nearJunction(x,z,junctions,22))return;
   const k=nearestKeyuanHit(roads,x,z);
   if(!k||k.d>3)return;
   const lane=sidePoint(k.x,k.z,k.seg.yaw,-1,Math.min(1.7,k.seg.width/5));
   if(parked.some(c=>Math.hypot(c.x-lane.x,c.z-lane.z)<2.8))return;
   rolling.push(pose(lane.x,lane.z,k.seg.yaw));
  });
 }
 const shopAprons:CorridorPose[]=[];
 for(const shop of keptPlinths){
  const flip=shop.sz||1;
  const faceX=-Math.sin(shop.yaw)*flip,faceZ=-Math.cos(shop.yaw)*flip;
  for(let d=.38;d<=6.6;d+=.88){
   const x=shop.x+faceX*d,z=shop.z+faceZ*d;
   if(!inBambooCorridor(x,z)||!onLand(data,x,z)||inWater(data,x,z))break;
   if(onCarriageway(roads,x,z,.42)||inBuilding(buildings,x,z,.16))break;
   if(nearJunction(x,z,junctions,8))continue;
   shopAprons.push(pose(x,z,shop.yaw,1.02,1,1));
  }
 }
 return {
  corridor:BAMBOO_CORRIDOR,roadMetres,roads:new Set(segs.map(s=>s.road.id)).size,junctions,
  curbs:spread(curbs,B.curb),walks:spread([...shopAprons,...stitchWalks(walks)],B.walk),edges:spread(edges,B.edge),
  lips:spread(stitchWalks(lips),B.edge),
  verges:spread(verges,B.curb),pits:spread(pits,B.pit),lamps:spread(lamps,B.lamp),signals:spread(signals,B.signal),
  crossings:spread(crossings,B.cross),stops:spread(stops,B.stop),
  parked:pickedParked,
  plinths:keptPlinths,awnings:shopIdx.map(i=>awnings[i]),
  doors:shopIdx.map(i=>doors[i]),panes:take(keptPanes,B.pane),interiors:take(keptInteriors,B.pane),
  signs:take(keptSigns,B.sign),
  decks:spread(decks,B.deck),dashes:spread(dashes,B.dash),rolling:spread(rolling,B.roll),
 };
}

function paint(scene:Scene,name:string,color:readonly number[],metallic=0,roughness=.72,emissive?:readonly number[]){
 const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromArray(color);m.metallic=metallic;m.roughness=roughness;
 m.environmentIntensity=.72;m.maxSimultaneousLights=4;m.enableSpecularAntiAliasing=true;m.backFaceCulling=true;
 if(emissive){m.emissiveColor=Color3.FromArray(emissive);m.emissiveIntensity=.16;}
 return m;
}

function canLetter(){return typeof OffscreenCanvas!=='undefined'||typeof document!=='undefined';}

function lettering(scene:Scene,name:string,text:string,w:number,h:number,vertical=false){
 const mat=paint(scene,'corridor-sign-'+name,[.12,.10,.08],0,.62,[.86,.72,.42]);
 mat.backFaceCulling=false;
 if(!canLetter())return {mat,tex:null};
 const tex=new DynamicTexture('corridor-sign-tex-'+name,{width:w,height:h},scene,false);
 tex.hasAlpha=false;tex.anisotropicFilteringLevel=4;
 const ctx=tex.getContext() as unknown as CanvasRenderingContext2D;
 ctx.fillStyle='#161310';ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#f0d48a';ctx.textAlign='center';ctx.textBaseline='middle';
 if(vertical){
  const chars=[...text],size=Math.min(72,(h-24)/Math.max(1,chars.length));
  ctx.font='700 '+size+'px "PingFang SC","Heiti SC","Microsoft YaHei",sans-serif';
  chars.forEach((ch,i)=>ctx.fillText(ch,w/2,(i+.5)*h/chars.length));
 }else{
  ctx.font='700 '+Math.min(64,w/Math.max(2,[...text].length)*1.15)+'px "PingFang SC","Heiti SC","Microsoft YaHei",sans-serif';
  ctx.fillText(text,w/2,h/2-6);
  ctx.fillStyle='#8a7a4a';ctx.font='12px "PingFang SC","Heiti SC",sans-serif';
  ctx.fillText('深城纪·虚构品牌',w/2,h-12);
 }
 tex.update();
 if(!vertical){tex.uScale=-1;tex.uOffset=1;}
 mat.albedoTexture=tex;mat.emissiveTexture=tex;mat.emissiveIntensity=.28;
 return {mat,tex};
}

function wallTile(scene:Scene,name:string,color:readonly number[]){
 const mat=paint(scene,'corridor-shop-'+name,[1,1,1],0,.82);
 if(!canLetter()){mat.albedoColor.copyFromFloats(color[0],color[1],color[2]);return {mat,tex:null};}
 const tex=new DynamicTexture('corridor-shop-tile-'+name,{width:256,height:256},scene,false);
 tex.hasAlpha=false;tex.anisotropicFilteringLevel=2;tex.uScale=3;tex.vScale=2;
 const ctx=tex.getContext();
 const grout=color.map(c=>Math.round(c*180));
 const tile=color.map(c=>Math.round(c*255));
 ctx.fillStyle=`rgb(${grout[0]},${grout[1]},${grout[2]})`;ctx.fillRect(0,0,256,256);
 ctx.fillStyle=`rgb(${tile[0]},${tile[1]},${tile[2]})`;
 for(let y=0;y<256;y+=32)for(let x=0;x<256;x+=32)ctx.fillRect(x+2,y+2,28,28);
 tex.update();
 mat.albedoTexture=tex;
 return {mat,tex};
}

function shopInterior(scene:Scene,name:string,warm:boolean){
 const mat=paint(scene,'corridor-shop-in-'+name,CORRIDOR_DAYLIGHT.interior,0,.88,CORRIDOR_DAYLIGHT.interior);
 if(!canLetter())return {mat,tex:null};
 const tex=new DynamicTexture('corridor-shop-in-tex-'+name,{width:256,height:256},scene,false);
 tex.hasAlpha=false;tex.anisotropicFilteringLevel=2;
 const ctx=tex.getContext();
 ctx.fillStyle=warm?'#7a3c1c':'#4a3228';ctx.fillRect(0,0,256,256);
 ctx.fillStyle=warm?'#2a1810':'#1c1410';ctx.fillRect(0,200,256,56);
 ctx.fillStyle=warm?'#5a2e18':'#3a281c';ctx.fillRect(18,208,220,28);
 ctx.fillStyle=warm?'#ffc878':'#e0b070';
 ctx.fillRect(22,28,212,72);
 ctx.fillRect(22,112,100,64);
 ctx.fillRect(134,112,100,64);
 ctx.fillStyle=warm?'#ffe6b0':'#f0d0a0';
 ctx.fillRect(36,40,80,44);
 ctx.fillRect(140,40,80,44);
 tex.update();
 mat.albedoTexture=tex;mat.emissiveTexture=tex;mat.emissiveIntensity=.55;
 return {mat,tex};
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
function walkPaver(scene:Scene,tile:PBRMaterial,grout:PBRMaterial){
 const parts:Mesh[]=[];
 const base=MeshBuilder.CreateBox('corridor-walk-grout',{width:7.2,height:.04,depth:2.35},scene);
 base.material=grout;base.position.y=.02;parts.push(base);
 const cols=6,rows=2,tw=7.2/cols,td=2.35/rows,gap=.12;
 for(let i=0;i<cols;i++){
  for(let j=0;j<rows;j++){
   const slab=MeshBuilder.CreateBox('corridor-walk-tile',{width:tw-gap,height:.06,depth:td-gap},scene);
   slab.material=tile;slab.position.set((i+.5)*tw-3.6,.07,(j+.5)*td-1.175);parts.push(slab);
  }
 }
 const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;
 mesh.name='corridor-walk-box';
 return mesh;
}

export function createBambooCorridor(scene:Scene,data:CityData,heightAt:(x:number,z:number)=>number,options:BambooCorridorOptions={}){
 const plan=planBambooCorridor(data,options);
 const root=new TransformNode('bamboo-corridor',scene);
 const mats={
  curb:paint(scene,'corridor-curb',CORRIDOR_DAYLIGHT.curb,0,.82),
  curbTop:paint(scene,'corridor-curb-top',CORRIDOR_DAYLIGHT.curbTop,0,.7),
  lip:paint(scene,'corridor-lip-stone',[.72,.58,.38],0,.68),
  walk:paint(scene,'corridor-walk',CORRIDOR_DAYLIGHT.walk,0,.9),
  walkGrout:paint(scene,'corridor-walk-grout',[.38,.35,.30],0,.94),
  verge:paint(scene,'corridor-verge',[.14,.2,.1],0,.94),
  edge:paint(scene,'corridor-edge',CORRIDOR_DAYLIGHT.edge,0,.55),
  ring:paint(scene,'corridor-pit-ring',CORRIDOR_DAYLIGHT.pitRing,0,.8),
  soil:paint(scene,'corridor-soil',CORRIDOR_DAYLIGHT.soil,0,.94),
  bark:paint(scene,'corridor-bark',CORRIDOR_DAYLIGHT.bark,0,.92),
  canopy:paint(scene,'corridor-canopy',CORRIDOR_DAYLIGHT.canopy,0,.9),
  steel:paint(scene,'corridor-steel',CORRIDOR_DAYLIGHT.steel,.62,.42),
  glass:paint(scene,'corridor-glass',CORRIDOR_DAYLIGHT.glass,.02,.28,CORRIDOR_DAYLIGHT.interior),
  pane:(()=>{const m=paint(scene,'corridor-pane',[.42,.48,.42],.02,.12,[1,.78,.42]);m.alpha=.38;m.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;return m;})(),
  interior:paint(scene,'corridor-interior',CORRIDOR_DAYLIGHT.interior,0,.9,CORRIDOR_DAYLIGHT.interior),
  cabin:paint(scene,'corridor-cabin',CORRIDOR_DAYLIGHT.cabin,0,.55),
  lamp:paint(scene,'corridor-lamp',CORRIDOR_DAYLIGHT.lampWarm,0,.28,CORRIDOR_DAYLIGHT.lampWarm),
  door:paint(scene,'corridor-door',CORRIDOR_DAYLIGHT.door,0,.7,CORRIDOR_DAYLIGHT.door),
  recess:paint(scene,'corridor-recess',CORRIDOR_DAYLIGHT.recess,0,.92),
  kick:paint(scene,'corridor-kick',CORRIDOR_DAYLIGHT.kick,0,.88),
  tire:paint(scene,'corridor-tire',CORRIDOR_DAYLIGHT.tire,0,.95),
  shops:[] as PBRMaterial[],
  red:paint(scene,'corridor-signal-red',[.18,.04,.03],0,.32,[1,.12,.08]),
  amber:paint(scene,'corridor-signal-amber',[.18,.1,.03],0,.32,[1,.55,.08]),
  green:paint(scene,'corridor-signal-green',[.03,.16,.06],0,.32,[.12,1,.28]),
  awnings:CORRIDOR_DAYLIGHT.awning.map((c,i)=>paint(scene,'corridor-awning-'+i,c,0,.82)),
  paints:CORRIDOR_DAYLIGHT.paint.map((c,i)=>paint(scene,'corridor-car-'+i,c,.18,.38)),
  mark:paint(scene,'corridor-mark',[.96,.96,.9],0,.62,[.78,.78,.7]),
  bay:paint(scene,'corridor-park-bay',[.16,.16,.15],0,.92),
  deck:paint(scene,'corridor-deck',[1,1,1],0,.92,[.24,.23,.21]),
 };
  const deckMap=(()=>{
  if(!canLetter()){mats.deck.albedoColor.copyFromFloats(.40,.39,.36);return null;}
  const tex=new DynamicTexture('corridor-deck-tex',{width:256,height:256},scene,false);
  tex.hasAlpha=false;tex.anisotropicFilteringLevel=4;tex.uScale=6;tex.vScale=6;
  const ctx=tex.getContext();
  ctx.fillStyle='#8f8c84';ctx.fillRect(0,0,256,256);
  for(let i=0;i<1800;i++){
   const n=118+((i*53)%52);
   ctx.fillStyle=`rgb(${n},${n-3},${n-8})`;
   ctx.fillRect((i*17)%256,(i*29)%256,2,2);
  }
  tex.update();
  mats.deck.albedoTexture=tex;
  return tex;
 })();
 const walkMap=(()=>{
  if(!canLetter())return null;
  const tex=new DynamicTexture('corridor-walk-tex',{width:256,height:256},scene,false);
  tex.hasAlpha=false;tex.anisotropicFilteringLevel=4;tex.uScale=8;tex.vScale=3;
  const ctx=tex.getContext();
  ctx.fillStyle='#8f887c';ctx.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=128){
   for(let x=0;x<256;x+=128){
    ctx.fillStyle=((x+y)&128)?'#dcd4c6':'#c8bdaa';
    ctx.fillRect(x+6,y+6,116,116);
   }
  }
  tex.update();
  mats.walk.albedoTexture=tex;
  mats.walk.albedoColor.copyFromFloats(.97,.95,.91);
  return tex;
 })();
 const curbBody=MeshBuilder.CreateBox('corridor-curb-body',{width:7.2,height:.42,depth:.4},scene);curbBody.material=mats.curb;curbBody.position.y=.21;
 const curbCap=MeshBuilder.CreateBox('corridor-curb-cap',{width:7.2,height:.14,depth:1.12},scene);curbCap.material=mats.curbTop;curbCap.position.y=.5;
 const curb=Mesh.MergeMeshes([curbBody,curbCap],true,true,undefined,false,true)!;curb.name='corridor-curb';
 const shopWalls=CORRIDOR_DAYLIGHT.shop.map((c,i)=>wallTile(scene,''+i,c));
 mats.shops.push(...shopWalls.map(s=>s.mat));
 const signBoards=CORRIDOR_SHOPS.map((shop,i)=>lettering(scene,'fascia-'+i,shop.title,512,128,false));
 const signBlades=CORRIDOR_SHOPS.map((shop,i)=>lettering(scene,'blade-'+i,shop.blade,128,256,true));
 const shopIns=CORRIDOR_SHOPS.map((_,i)=>shopInterior(scene,''+i,i%2===0));
 const facades=mats.shops.map((mat,i)=>{
  const awn=mats.awnings[i%mats.awnings.length],inside=shopIns[i%shopIns.length],board=signBoards[i%signBoards.length],blade=signBlades[i%signBlades.length];
  const wall=MeshBuilder.CreateBox('corridor-facade-wall-'+i,{width:4.96,height:3.58,depth:.22},scene);wall.material=mat;wall.position.set(0,1.79,.06);
  const colL=MeshBuilder.CreateBox('corridor-facade-col-l-'+i,{width:.22,height:3.58,depth:.38},scene);colL.material=mats.steel;colL.position.set(2.38,1.79,-.04);
  const colR=MeshBuilder.CreateBox('corridor-facade-col-r-'+i,{width:.22,height:3.58,depth:.38},scene);colR.material=mats.steel;colR.position.set(-2.38,1.79,-.04);
  const colM=MeshBuilder.CreateBox('corridor-facade-col-m-'+i,{width:.16,height:2.55,depth:.3},scene);colM.material=mats.steel;colM.position.set(.18,1.42,-.08);
  const kick=MeshBuilder.CreateBox('corridor-facade-kick-'+i,{width:4.96,height:.28,depth:.36},scene);kick.material=mats.kick;kick.position.set(0,.14,-.04);
  const band=MeshBuilder.CreateBox('corridor-facade-band-'+i,{width:4.96,height:.38,depth:.36},scene);band.material=awn;band.position.set(0,3.38,-.04);
  const vestibule=MeshBuilder.CreateBox('corridor-facade-vestibule-'+i,{width:1.58,height:2.62,depth:.2},scene);vestibule.material=mats.recess;vestibule.position.set(1.18,1.42,-.1);
  const doorFrame=MeshBuilder.CreateBox('corridor-facade-door-frame-'+i,{width:1.42,height:2.48,depth:.08},scene);doorFrame.material=mats.steel;doorFrame.position.set(1.18,1.38,-.26);
  const door=MeshBuilder.CreateBox('corridor-facade-door-'+i,{width:1.22,height:2.28,depth:.04},scene);door.material=inside.mat;door.position.set(1.18,1.32,-.32);
  const doorGlass=MeshBuilder.CreateBox('corridor-facade-door-glass-'+i,{width:1.08,height:2.02,depth:.03},scene);doorGlass.material=mats.pane;doorGlass.position.set(1.18,1.38,-.36);
  const handle=MeshBuilder.CreateBox('corridor-facade-handle-'+i,{width:.04,height:.28,depth:.07},scene);handle.material=mats.steel;handle.position.set(.62,1.28,-.42);
  const transom=MeshBuilder.CreateBox('corridor-facade-transom-'+i,{width:1.22,height:.22,depth:.04},scene);transom.material=mats.pane;transom.position.set(1.18,2.58,-.32);
  const step=MeshBuilder.CreateBox('corridor-facade-step-'+i,{width:1.42,height:.1,depth:.46},scene);step.material=mats.kick;step.position.set(1.18,.05,-.38);
  const winRecess=MeshBuilder.CreateBox('corridor-facade-win-recess-'+i,{width:2.42,height:2.22,depth:.12},scene);winRecess.material=mats.recess;winRecess.position.set(-1.02,1.52,-.12);
  const winFrame=MeshBuilder.CreateBox('corridor-facade-win-frame-'+i,{width:2.28,height:2.08,depth:.08},scene);winFrame.material=mats.steel;winFrame.position.set(-1.02,1.52,-.2);
  const win=MeshBuilder.CreateBox('corridor-facade-win-'+i,{width:2.08,height:1.88,depth:.06},scene);win.material=inside.mat;win.position.set(-1.02,1.52,-.24);
  const winBarV=MeshBuilder.CreateBox('corridor-facade-win-bar-v-'+i,{width:.07,height:1.82,depth:.05},scene);winBarV.material=mats.steel;winBarV.position.set(-1.02,1.52,-.28);
  const winBarH=MeshBuilder.CreateBox('corridor-facade-win-bar-h-'+i,{width:1.92,height:.07,depth:.05},scene);winBarH.material=mats.steel;winBarH.position.set(-1.02,1.52,-.28);
  const winGlass=MeshBuilder.CreateBox('corridor-facade-win-glass-'+i,{width:1.98,height:1.78,depth:.03},scene);winGlass.material=mats.pane;winGlass.position.set(-1.02,1.52,-.31);
  const awning=MeshBuilder.CreateBox('corridor-facade-awning-'+i,{width:3.7,height:.08,depth:1.22},scene);awning.material=awn;awning.position.set(0,2.88,-.74);
  const fascia=MeshBuilder.CreateBox('corridor-facade-fascia-'+i,{width:2.72,height:.5,depth:.08},scene);fascia.material=awn;fascia.position.set(0,2.98,-1.32);
  const fasciaFace=MeshBuilder.CreatePlane('corridor-facade-fascia-face-'+i,{width:2.52,height:.36},scene);fasciaFace.material=board.mat;fasciaFace.rotation.y=Math.PI;fasciaFace.bakeCurrentTransformIntoVertices();fasciaFace.position.set(0,2.98,-1.44);
  const armL=MeshBuilder.CreateBox('corridor-facade-sign-arm-l-'+i,{width:.08,height:.08,depth:.7},scene);armL.material=mats.steel;armL.position.set(2.36,3.04,-.52);
  const bladeL=MeshBuilder.CreateBox('corridor-facade-sign-l-'+i,{width:.16,height:2.05,depth:.98},scene);bladeL.material=awn;bladeL.position.set(2.36,2.12,-1.12);
  const bladeLFace=MeshBuilder.CreatePlane('corridor-facade-sign-l-face-'+i,{width:.8,height:1.78},scene);bladeLFace.material=blade.mat;bladeLFace.rotation.y=Math.PI/2;bladeLFace.bakeCurrentTransformIntoVertices();bladeLFace.position.set(2.2,2.12,-1.12);
  const armR=MeshBuilder.CreateBox('corridor-facade-sign-arm-r-'+i,{width:.08,height:.08,depth:.7},scene);armR.material=mats.steel;armR.position.set(-2.36,3.04,-.52);
  const bladeR=MeshBuilder.CreateBox('corridor-facade-sign-r-'+i,{width:.16,height:2.05,depth:.98},scene);bladeR.material=awn;bladeR.position.set(-2.36,2.12,-1.12);
  const bladeRFace=MeshBuilder.CreatePlane('corridor-facade-sign-r-face-'+i,{width:.8,height:1.78},scene);bladeRFace.material=blade.mat;bladeRFace.rotation.y=-Math.PI/2;bladeRFace.bakeCurrentTransformIntoVertices();bladeRFace.position.set(-2.2,2.12,-1.12);
  const mesh=Mesh.MergeMeshes([wall,colL,colR,colM,kick,band,vestibule,doorFrame,door,doorGlass,handle,transom,step,winRecess,winFrame,win,winBarV,winBarH,winGlass,awning,fascia,fasciaFace,armL,bladeL,bladeLFace,armR,bladeR,bladeRFace],true,true,undefined,false,true)!;
  mesh.name='corridor-facade-'+i;
  return mesh;
 });
 const meshes:Mesh[]=[
  curb,
  walkPaver(scene,mats.walk,mats.walkGrout),
  proto(scene,'corridor-edge-box',7.2,.05,.18,mats.edge),
 ];
 const pitH=.3,pitT=.22,pitO=1.96,pitI=pitO-2*pitT;
 const pitWall=(name:string,w:number,d:number,x:number,z:number)=>{
  const mesh=MeshBuilder.CreateBox(name,{width:w,height:pitH,depth:d},scene);mesh.material=mats.ring;mesh.position.set(x,pitH/2,z);return mesh;
 };
 const pitSoil=MeshBuilder.CreateBox('corridor-pit-soil',{width:pitI,height:.1,depth:pitI},scene);pitSoil.material=mats.soil;pitSoil.position.y=.05;
 const planter=Mesh.MergeMeshes([
  pitWall('corridor-pit-n',pitO,pitT,0,(pitO-pitT)/2),
  pitWall('corridor-pit-s',pitO,pitT,0,-(pitO-pitT)/2),
  pitWall('corridor-pit-e',pitT,pitI,(pitO-pitT)/2,0),
  pitWall('corridor-pit-w',pitT,pitI,-(pitO-pitT)/2,0),
  pitSoil,
 ],true,true,undefined,false,true)!;planter.name='corridor-pit';
 const trunk=MeshBuilder.CreateCylinder('corridor-tree-trunk',{height:2.55,diameterTop:.16,diameterBottom:.38,tessellation:7},scene);trunk.material=mats.bark;trunk.position.y=1.28;
 const flare=MeshBuilder.CreateCylinder('corridor-tree-flare',{height:.3,diameterTop:.4,diameterBottom:.58,tessellation:7},scene);flare.material=mats.bark;flare.position.y=.15;
 const limb=MeshBuilder.CreateCylinder('corridor-tree-limb',{height:1.05,diameter:.1,tessellation:5},scene);limb.material=mats.bark;limb.rotation.z=-.78;limb.bakeCurrentTransformIntoVertices();limb.position.set(.32,2.15,.04);
 const canopy=MeshBuilder.CreateSphere('corridor-tree-canopy',{diameter:2.42,segments:6},scene);canopy.material=mats.canopy;canopy.scaling.set(1.22,.6,1.16);canopy.bakeCurrentTransformIntoVertices();canopy.position.y=2.72;
 const canopyL=MeshBuilder.CreateSphere('corridor-tree-canopy-l',{diameter:1.48,segments:6},scene);canopyL.material=mats.canopy;canopyL.scaling.set(1.02,.58,1);canopyL.bakeCurrentTransformIntoVertices();canopyL.position.set(.58,2.82,.18);
 const canopyR=MeshBuilder.CreateSphere('corridor-tree-canopy-r',{diameter:1.36,segments:6},scene);canopyR.material=mats.canopy;canopyR.scaling.set(1,.56,1);canopyR.bakeCurrentTransformIntoVertices();canopyR.position.set(-.52,2.58,-.14);
 const tree=Mesh.MergeMeshes([trunk,flare,limb,canopy,canopyL,canopyR],true,true,undefined,false,true)!;tree.name='corridor-tree';
 const pole=MeshBuilder.CreateCylinder('corridor-lamp-pole',{height:7.1,diameter:.2,tessellation:6},scene);pole.material=mats.steel;pole.position.y=3.55;
 const base=MeshBuilder.CreateCylinder('corridor-lamp-base',{height:.32,diameter:.42,tessellation:6},scene);base.material=mats.steel;base.position.y=.16;
 const arm=MeshBuilder.CreateBox('corridor-lamp-arm',{width:.12,height:.12,depth:2.15},scene);arm.material=mats.steel;arm.position.set(0,6.95,1.05);
 const cap=MeshBuilder.CreateBox('corridor-lamp-cap',{width:.86,height:.1,depth:1.02},scene);cap.material=mats.steel;cap.position.set(0,6.88,2.05);
 const head=MeshBuilder.CreateBox('corridor-lamp-head',{width:.74,height:.36,depth:.88},scene);head.material=mats.lamp;head.position.set(0,6.64,2.05);
 const glow=MeshBuilder.CreateBox('corridor-lamp-glow',{width:.7,height:.06,depth:.82},scene);glow.material=mats.lamp;glow.position.set(0,6.44,2.05);
 const lamp=Mesh.MergeMeshes([pole,base,arm,cap,head,glow],true,true,undefined,false,true)!;lamp.name='corridor-lamp';
 const sigPole=MeshBuilder.CreateCylinder('corridor-sig-pole',{height:5.6,diameter:.18,tessellation:6},scene);sigPole.material=mats.steel;sigPole.position.y=2.8;
 const sigArm=MeshBuilder.CreateBox('corridor-sig-arm',{width:3.4,height:.14,depth:.14},scene);sigArm.material=mats.steel;sigArm.position.set(1.7,5.35,0);
 const backboard=MeshBuilder.CreateBox('corridor-sig-board',{width:.72,height:1.62,depth:.18},scene);backboard.material=mats.steel;backboard.position.set(3.15,4.72,.32);
 const visor=MeshBuilder.CreateBox('corridor-sig-visor',{width:.78,height:.12,depth:.4},scene);visor.material=mats.steel;visor.position.set(3.15,5.5,.48);
 const lensR=MeshBuilder.CreateBox('corridor-sig-red',{width:.4,height:.4,depth:.12},scene);lensR.material=mats.red;lensR.position.set(3.15,5.18,.5);
 const lensA=MeshBuilder.CreateBox('corridor-sig-amber',{width:.4,height:.4,depth:.12},scene);lensA.material=mats.amber;lensA.position.set(3.15,4.72,.5);
 const lensG=MeshBuilder.CreateBox('corridor-sig-lens',{width:.4,height:.4,depth:.12},scene);lensG.material=mats.green;lensG.position.set(3.15,4.26,.5);
 const signal=Mesh.MergeMeshes([sigPole,sigArm,backboard,visor,lensR,lensA,lensG],true,true,undefined,false,true)!;signal.name='corridor-signal';
 const lampGlass=paint(scene,'corridor-car-lamp',[1,.92,.72],0,.28,[1,.9,.62]);
 const tailGlass=paint(scene,'corridor-car-tail',[.7,.08,.06],0,.32,[1,.12,.08]);
 const carGlass=paint(scene,'corridor-car-glass',[.07,.09,.11],0,.22,[.16,.2,.24]);
 const carCabin=paint(scene,'corridor-car-cabin',[.1,.12,.14],0,.7);
 const piece=(name:string,w:number,h:number,d:number,mat:PBRMaterial,x:number,y:number,z:number)=>{
  const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);mesh.material=mat;mesh.position.set(x,y,z);return mesh;
 };
 const sedans=mats.paints.map((mat,i)=>{
  const parts=[
   piece('sedan-body-'+i,1.76,.34,3.55,mat,0,.39,-.08),
   piece('sedan-hood-'+i,1.66,.14,1.22,mat,0,.62,1.08),
   piece('sedan-nose-'+i,1.76,.3,.4,mat,0,.36,1.86),
   piece('sedan-grille-'+i,.7,.16,.05,mats.steel,0,.4,2.08),
   piece('sedan-trunk-'+i,1.62,.16,.7,mat,0,.62,-1.52),
   piece('sedan-cabin-'+i,1.5,.64,1.52,carCabin,0,1.02,-.38),
   piece('sedan-glass-'+i,1.34,.4,1.22,carGlass,0,1.14,-.34),
   piece('sedan-wind-'+i,1.38,.46,.08,carGlass,0,1.04,.4),
   piece('sedan-side-l-'+i,.06,.32,1.18,carGlass,.78,.98,-.32),
   piece('sedan-side-r-'+i,.06,.32,1.18,carGlass,-.78,.98,-.32),
   piece('sedan-hl-l-'+i,.3,.14,.07,lampGlass,.58,.46,2.06),
   piece('sedan-hl-r-'+i,.3,.14,.07,lampGlass,-.58,.46,2.06),
   piece('sedan-tl-l-'+i,.3,.12,.07,tailGlass,.58,.5,-1.88),
   piece('sedan-tl-r-'+i,.3,.12,.07,tailGlass,-.58,.5,-1.88),
  ];
  for(const [lon,lat] of [[1.28,.84],[1.28,-.84],[-1.32,.84],[-1.32,-.84]] as const){
   const wheel=MeshBuilder.CreateCylinder('sedan-wh-'+i,{height:.22,diameter:.56,tessellation:8},scene);
   wheel.material=mats.tire;wheel.rotation.z=Math.PI/2;wheel.bakeCurrentTransformIntoVertices();wheel.position.set(lat,.28,lon);
   const hub=MeshBuilder.CreateCylinder('sedan-hub-'+i,{height:.08,diameter:.26,tessellation:8},scene);
   hub.material=mats.steel;hub.rotation.z=Math.PI/2;hub.bakeCurrentTransformIntoVertices();hub.position.set(lat,.28,lon);
   parts.push(wheel,hub);
  }
  const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;mesh.name='corridor-car-'+i;return mesh;
 });
 const carTop=proto(scene,'corridor-car-cabin',1.38,.7,1.72,carCabin);
 const parkBay=proto(scene,'corridor-park-bay',2.35,.14,5.15,mats.bay);
 const verge=proto(scene,'corridor-verge-box',7.2,.26,.72,mats.verge);
 const zebra=proto(scene,'corridor-zebra',7.2,.07,.4,mats.mark);
 const stopline=proto(scene,'corridor-stopline',6.4,.09,.28,mats.mark);
 const deck=proto(scene,'corridor-deck',8.2,.1,6.6,mats.deck);
 const dash=proto(scene,'corridor-dash',.22,.05,2.55,mats.mark);
 const lip=proto(scene,'corridor-lip',7.2,.2,.38,mats.lip);
 const extras=[planter,tree,lamp,signal,verge,parkBay,carTop,zebra,stopline,deck,dash,lip,...facades,...sedans];
 for(const mesh of [...meshes,...extras]){mesh.parent=root;mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;}
 instantiate(meshes[0],plan.curbs,heightAt,.02);
 instantiate(meshes[1],plan.walks,heightAt,.12);
 instantiate(meshes[2],plan.edges,heightAt,.06);
 instantiate(lip,plan.lips,heightAt,.2);
 facades.forEach((mesh,i)=>instantiate(mesh,plan.plinths.filter((_,n)=>n%facades.length===i),heightAt,0));
 instantiate(verge,plan.verges,heightAt,.14);
 instantiate(planter,plan.pits,heightAt,.31);
 instantiate(tree,plan.pits,heightAt,.38);
 const streetTrees:Mesh[]=[];
 function plantStreetTrees(source:Mesh[],poses:CorridorPose[],scale:number){
  if(!source.length||!poses.length)return;
  const matrices=new Float32Array(poses.length*16);
  const colors=new Float32Array(poses.length*4);
  poses.forEach((p,i)=>{
   const s=scale*(.92+((p.sx||1)-1)*.35);
   Matrix.Compose(new Vector3(s,s,s),Quaternion.RotationAxis(Vector3.Up(),p.yaw+(i%3)*.4),new Vector3(p.x,heightAt(p.x,p.z)+.06,p.z)).copyToArray(matrices,i*16);
   const seed=Math.abs(Math.sin(p.x*.713+p.z*.519));
   colors.set([.83+seed*.22,.91+seed*.15,.80+seed*.23,1],i*4);
  });
  for(const mesh of source){
   mesh.parent=root;mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
   mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceSetBuffer('color',colors,4,true);mesh.thinInstanceRefreshBoundingInfo();
   streetTrees.push(mesh);
  }
 }
 function adoptStreetTrees(near:Mesh[],far:Mesh[]){
  if(!near.length&&!far.length)return;
  tree.setEnabled(false);
  plantStreetTrees(near.length?near:far,plan.pits,.78);
 }
 const streetCars:Mesh[]=[];
 const streetCarMats:PBRMaterial[]=[];
 function adoptParkedCars(source:AbstractMesh[]){
  const usable=source.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
  if(!usable.length)return;
  for(const sedan of sedans)sedan.setEnabled(false);
  const paints:[[number,number,number],[number,number,number],[number,number,number]]=[[.52,.56,.53],[.28,.06,.038],[.12,.22,.48]];
  paints.forEach((paint,i)=>{
   const poses=[...plan.parked,...plan.rolling].filter((_,n)=>n%paints.length===i);
   if(!poses.length)return;
   const matrices=new Float32Array(poses.length*16);
   poses.forEach((p,n)=>Matrix.Compose(Vector3.One(),Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,heightAt(p.x,p.z)-.16+.1,p.z)).copyToArray(matrices,n*16));
   for(const src of usable){
    const mesh=src.clone('corridor-parked-'+i+'-'+src.name,null,true);
    if(!(mesh instanceof Mesh))continue;
    mesh.parent=root;mesh.unfreezeWorldMatrix();mesh.makeGeometryUnique();
    mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));
    mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
    mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
    if(src.material instanceof PBRMaterial&&src.material.name==='carpaint'){
     const mat=src.material.clone('corridor-park-paint-'+i);
     if(mat){mat.albedoColor=new Color3(...paint);mesh.material=mat;streetCarMats.push(mat);}
    }
    mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo();
    streetCars.push(mesh);
   }
  });
 }
 instantiate(lamp,plan.lamps,heightAt,0);instantiate(signal,plan.signals,heightAt,0);
 const roadAt=(x:number,z:number)=>heightAt(x,z)-.16;
 instantiate(deck,plan.decks,roadAt,.02);
 instantiate(dash,plan.dashes,roadAt,.08);
 instantiate(zebra,plan.crossings,roadAt,.07);
 instantiate(stopline,plan.stops,roadAt,.075);
 instantiate(parkBay,plan.parked,roadAt,.04);
 sedans.forEach((mesh,i)=>instantiate(mesh,[...plan.parked,...plan.rolling].filter((_,n)=>n%sedans.length===i),roadAt,.1));
 carTop.setEnabled(false);

 let mode:'day'|'sunset'|'night'='day',wanted=true,visible=false,phase=2;
 function applyLamp(){
  mats.lamp.emissiveIntensity=mode==='night'?1.8:mode==='sunset'?.85:.95;
  mats.red.emissiveIntensity=mode==='day'?.85:1.2;
  mats.amber.emissiveIntensity=mode==='day'?.7:1.15;
  mats.green.emissiveIntensity=mode==='day'?.35:1.2;
  mats.door.emissiveIntensity=mode==='day'?.7:mode==='sunset'?.3:.1;
  mats.mark.emissiveIntensity=mode==='day'?.72:mode==='sunset'?.32:.14;
  mats.glass.emissiveIntensity=mode==='day'?.58:mode==='sunset'?.28:.14;
  mats.pane.emissiveColor.copyFromFloats(1,.82,.48);
  mats.pane.emissiveIntensity=mode==='day'?.42:mode==='sunset'?.2:.08;
  mats.interior.emissiveIntensity=mode==='day'?.85:mode==='sunset'?.4:.18;
  mats.walk.emissiveColor.copyFromFloats(.78,.76,.72);
  mats.curbTop.emissiveColor.copyFromFloats(.72,.58,.38);
  mats.lip.emissiveColor.copyFromFloats(.62,.5,.32);
  mats.curb.emissiveColor.copyFromFloats(.22,.2,.18);
  mats.walk.emissiveIntensity=mode==='day'?.09:mode==='sunset'?.04:0;
  mats.curbTop.emissiveIntensity=mode==='day'?.14:mode==='sunset'?.06:0;
  mats.lip.emissiveIntensity=mode==='day'?.16:mode==='sunset'?.06:0;
  mats.curb.emissiveIntensity=mode==='day'?0.08:0;
  lampGlass.emissiveIntensity=mode==='day'?.55:mode==='sunset'?.7:1.1;
  tailGlass.emissiveIntensity=mode==='day'?.42:mode==='sunset'?.7:1.2;
  for(const s of [...signBoards,...signBlades])s.mat.emissiveIntensity=mode==='day'?.58:mode==='sunset'?.22:.12;
  for(const s of shopIns)s.mat.emissiveIntensity=mode==='day'?1.15:mode==='sunset'?.32:.12;
  for(const s of mats.shops){
   s.emissiveColor.copyFromFloats(.92,.88,.82);
   s.emissiveIntensity=mode==='day'?.2:mode==='sunset'?.08:.02;
  }
  mats.deck.albedoColor.copyFromFloats(1,1,1);
  mats.deck.emissiveIntensity=mode==='day'?.12:mode==='sunset'?.05:0;
 }
 function show(){return wanted&&visible;}
 function applyVisible(){root.setEnabled(show());}
 function setEnabled(value:boolean){wanted=value;applyVisible();}
 function setStreetCarsEnabled(on:boolean){
  if(streetCars.length){for(const mesh of streetCars)mesh.setEnabled(on);return;}
  for(const mesh of sedans)mesh.setEnabled(on);
 }
 function setMode(next:'day'|'sunset'|'night'){mode=next;applyLamp();}
 function update(_time:number,x:number,z:number,_aerial=false){
  visible=corridorProject(x,z).d<520;applyVisible();
 }
 function dispose(){
  for(const mesh of [...meshes,...extras,...streetTrees,...streetCars])mesh.dispose(false,false);
  for(const m of [...Object.values(mats).filter((v):v is PBRMaterial=>v instanceof PBRMaterial),...mats.shops,...mats.awnings,...mats.paints,lampGlass,tailGlass,carGlass,carCabin,...streetCarMats,...signBoards.map(s=>s.mat),...signBlades.map(s=>s.mat),...shopIns.map(s=>s.mat)])m.dispose();
  for(const t of [...signBoards,...signBlades,...shopIns,...shopWalls].map(s=>s.tex))t?.dispose();
  deckMap?.dispose();walkMap?.dispose();
  root.dispose();
 }
 applyLamp();applyVisible();
 const counts={curbs:plan.curbs.length,walks:plan.walks.length,edges:plan.edges.length,pits:plan.pits.length,lamps:plan.lamps.length,signals:plan.signals.length,crossings:plan.crossings.length,stops:plan.stops.length,parked:plan.parked.length,shopfronts:plan.plinths.length,decks:plan.decks.length,dashes:plan.dashes.length,rolling:plan.rolling.length};
 return {
  plan,root,setMode,setEnabled,setStreetCarsEnabled,update,dispose,adoptStreetTrees,adoptParkedCars,
  get stats(){return {id:BAMBOO_CORRIDOR.id,name:BAMBOO_CORRIDOR.name,length:BAMBOO_CORRIDOR.length,halfWidth:BAMBOO_CORRIDOR.halfWidth,roadMetres:+plan.roadMetres.toFixed(1),roads:plan.roads,junctions:plan.junctions.length,enabled:root.isEnabled(),mode,phase,drawCalls:root.isEnabled()?meshes.length+extras.filter(m=>m.isEnabled()).length+streetTrees.length+streetCars.length:0,photoscrape:false,extraLights:0,...counts,streetTrees:streetTrees.length,streetCars:streetCars.length,shopLettering:CORRIDOR_SHOPS.map(s=>s.title),fictionalDisclosure:'深城纪·虚构品牌'};},
 };
}
