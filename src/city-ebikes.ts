import {ImportMeshAsync,Matrix,Mesh,PBRMaterial,Quaternion,Vector3,type Scene} from '@babylonjs/core';
import type {RoadGraph} from './navigation.ts';
/** Shenzhen e-mopeds and e-bicycles (public/city/ebikes): kerbside parking rows as thin instances,
 * plus a small pool of riders moving along the road graph near the player. Body paint, rider
 * clothing and helmets are tinted per instance from the manifest palettes. */
export type ParkedBike=[number,number,number,number,number,number]; // x, z, yaw, type, palette, lean
export type EbikeType='scooter'|'bicycle'|'delivery';
type Rider={from:number;to:number;t:number;speed:number;x:number;z:number;yaw:number;type:number;paint:number;cloth:number;helmet:number};
const BASE='/city/ebikes/';
const TYPES:EbikeType[]=['scooter','bicycle','delivery'];
export const ebikeCell=(x:number,z:number)=>Math.floor(x/80)+','+Math.floor(z/80);
/** Kerb offset for riders: right of the centreline, inside a 6 m carriageway. */
export const RIDER_KERB_OFFSET=2.15;
export class CityEbikes{
 parked:ParkedBike[]=[];riders:Rider[]=[];palette:number[][]=[];riderPalette:number[][]=[];helmetPalette:number[][]=[];
 private cells=new Map<string,ParkedBike[]>();private proto=new Map<string,Mesh[]>();private tint=new Map<Mesh,'paint'|'cloth'|'helmet'|null>();
 private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;private visibleParked:ParkedBike[]=[];private origin=[1e9,1e9];
 private seed=4242;private triangles:Record<string,number>={};
 visibleCount=0;drawCalls=0;
 /** Distance to a red stop line ahead of (x,z,yaw), or null; riders hold within 5 m of it. */
 signalHold:(x:number,z:number,yaw:number)=>number|null=()=>null;
 private graph:RoadGraph|null=null;private directionAllowed:(a:number,b:number)=>boolean=()=>true;
 constructor(private scene:Scene,private heightAt:(x:number,z:number)=>number,private riderCount=18){}
 /** Riders need the road graph, which the world builds after the assets load. */
 attachGraph(graph:RoadGraph,directionAllowed:(a:number,b:number)=>boolean){this.graph=graph;this.directionAllowed=directionAllowed;}
 private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 async init(){
  const [manifest,data]=await Promise.all([fetch(BASE+'manifest.json').then(r=>{if(!r.ok)throw Error('E-bike manifest unavailable');return r.json();}),fetch(BASE+'parked.json').then(r=>{if(!r.ok)throw Error('E-bike parking unavailable');return r.json();})]);
  this.palette=manifest.palette;this.riderPalette=manifest.riderPalette;this.helmetPalette=manifest.helmetPalette;this.triangles=manifest.triangles;this.parked=data.bikes;
  for(const bike of this.parked){const key=ebikeCell(bike[0],bike[1]);let cell=this.cells.get(key);if(!cell){cell=[];this.cells.set(key,cell);}cell.push(bike);}
  const asset=await ImportMeshAsync(BASE+manifest.file,this.scene);
  for(const mesh of asset.meshes){
   if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
   mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
   const role=mesh.name.split('_')[0].replace(/^ebike-/,'');
   if(mesh.material instanceof PBRMaterial){mesh.material.maxSimultaneousLights=3;mesh.material.enableSpecularAntiAliasing=true;mesh.material.environmentIntensity=.75;
    if(mesh.material.name.startsWith('ebike_paint'))mesh.material.roughness=.3;}
   const material=mesh.material?.name??'';
   this.tint.set(mesh,material.startsWith('ebike_paint')?'paint':material.startsWith('rider_cloth')?'cloth':material.startsWith('rider_helmet')?'helmet':null);
   let list=this.proto.get(role);if(!list){list=[];this.proto.set(role,list);}list.push(mesh);
  }
  asset.meshes[0]?.dispose(false,false);
 }
 get meshes(){return [...this.proto.values()].flat();}
 get casters(){return this.meshes;}
 /** Seed riders on graph nodes 30–500 m from the player, as CityTraffic does for cars. */
 place(x:number,z:number){
  this.riders=[];this.origin=[x,z];const graph=this.graph;if(!graph)return;
  const candidates:number[]=[];for(let i=0;i<graph.nodes.length;i++){const p=graph.nodes[i],d=Math.hypot(p[0]-x,p[1]-z);if(d>30&&d<500&&graph.edges[i].size>1)candidates.push(i);}
  candidates.sort((a,b)=>Math.hypot(graph.nodes[a][0]-x,graph.nodes[a][1]-z)-Math.hypot(graph.nodes[b][0]-x,graph.nodes[b][1]-z));
  for(let i=0;i<this.riderCount*3&&this.riders.length<this.riderCount&&candidates.length;i++){
   const from=candidates[Math.floor(this.random()*Math.min(candidates.length,i<8?40:candidates.length))],next=[...graph.edges[from].keys()].filter(to=>this.directionAllowed(from,to));if(!next.length)continue;
   const to=next[Math.floor(this.random()*next.length)],type=this.random()<.5?0:this.random()<.7?1:2;
   const paint=type===2?[9,10][Math.floor(this.random()*2)]:Math.floor(this.random()*9);
   this.riders.push({from,to,t:this.random(),speed:5.5+this.random()*3.5,x:0,z:0,yaw:0,type,paint,cloth:type===2?(paint===9?5:6):Math.floor(this.random()*5),helmet:type===2?(paint===9?2:3):Math.floor(this.random()*this.helmetPalette.length)});
  }
 }
 private step(dt:number){
  const graph=this.graph;if(!graph)return;
  for(const r of this.riders){
   let a=graph.nodes[r.from],b=graph.nodes[r.to],len=Math.hypot(a[0]-b[0],a[1]-b[1]);
   const hold=this.signalHold(r.x,r.z,r.yaw),queued=this.riders.some(o=>o!==r&&Math.hypot(o.x-r.x,o.z-r.z)<3.2&&(o.x-r.x)*Math.sin(r.yaw)+(o.z-r.z)*Math.cos(r.yaw)>0);
   r.t+=dt*((hold!==null&&hold<5)||queued?0:r.speed)/Math.max(.1,len);let limit=0;
   while(r.t>=1&&limit++<12){
    r.t=(r.t-1)*len;const old=r.from;r.from=r.to;a=graph.nodes[r.from];
    const options=[...graph.edges[r.from].keys()].filter(i=>i!==old&&this.directionAllowed(r.from,i));const dx=a[0]-graph.nodes[old][0],dz=a[1]-graph.nodes[old][1];
    let best=-Infinity,next=old;for(const i of options){const p=graph.nodes[i],l=Math.hypot(p[0]-a[0],p[1]-a[1]);const score=(dx*(p[0]-a[0])+dz*(p[1]-a[1]))/Math.max(.1,len*l)+this.random()*.9;if(score>best){best=score;next=i;}}
    r.to=next;b=graph.nodes[next];len=Math.hypot(a[0]-b[0],a[1]-b[1]);r.t/=Math.max(.1,len);
   }
   const yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);r.x=a[0]+(b[0]-a[0])*r.t+Math.cos(yaw)*RIDER_KERB_OFFSET;r.z=a[1]+(b[1]-a[1])*r.t-Math.sin(yaw)*RIDER_KERB_OFFSET;r.yaw=yaw;
  }
 }
 update(dt:number,x:number,z:number,aerial=false,paused=false){
  if(this.graph&&Math.hypot(x-this.origin[0],z-this.origin[1])>450)this.place(x,z);
  if(!paused)this.step(dt);
  if(aerial!==this.lastAerial||Math.hypot(x-this.lastX,z-this.lastZ)>20){
   this.lastX=x;this.lastZ=z;this.lastAerial=aerial;const radius=aerial?260:220,cap=aerial?500:700;
   const cx=Math.floor(x/80),cz=Math.floor(z/80),near:ParkedBike[]=[];
   for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++)for(const bike of this.cells.get((cx+i)+','+(cz+j))??[])if(Math.hypot(bike[0]-x,bike[1]-z)<radius)near.push(bike);
   this.visibleParked=near.length>cap?near.sort((a,b)=>Math.hypot(a[0]-x,a[1]-z)-Math.hypot(b[0]-x,b[1]-z)).slice(0,cap):near;
  }
  const scratch=new Matrix();const buffers=TYPES.map(()=>({matrices:[] as number[],paint:[] as number[]}));const rider={matrices:[] as number[],cloth:[] as number[],helmet:[] as number[]};
  for(const bike of this.visibleParked){
   const [bx,bz,yaw,type,colour,lean]=bike;
   Matrix.ComposeToRef(Vector3.One(),Quaternion.RotationYawPitchRoll(yaw,0,lean),new Vector3(bx,this.heightAt(bx,bz)+.01,bz),scratch);
   buffers[type].matrices.push(...scratch.asArray());buffers[type].paint.push(...this.palette[colour],1);
  }
  for(const r of this.riders){
   if(Math.hypot(r.x-x,r.z-z)>420)continue;
   Matrix.ComposeToRef(Vector3.One(),Quaternion.RotationAxis(Vector3.Up(),r.yaw),new Vector3(r.x,this.heightAt(r.x,r.z)+.01,r.z),scratch);const array=scratch.asArray();
   buffers[r.type].matrices.push(...array);buffers[r.type].paint.push(...this.palette[r.paint],1);
   rider.matrices.push(...array);rider.cloth.push(...this.riderPalette[r.cloth],1);rider.helmet.push(...this.helmetPalette[r.helmet],1);
  }
  this.visibleCount=0;this.drawCalls=0;
  TYPES.forEach((type,i)=>{this.apply(type,buffers[i].matrices,{paint:buffers[i].paint});this.visibleCount+=buffers[i].matrices.length/16;});
  this.apply('rider',rider.matrices,{cloth:rider.cloth,helmet:rider.helmet});
 }
 private apply(role:string,matrices:number[],colours:Partial<Record<'paint'|'cloth'|'helmet',number[]>>){
  const count=matrices.length/16;
  for(const mesh of this.proto.get(role)??[]){
   if(!count){mesh.setEnabled(false);continue;}
   mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);
   const tint=this.tint.get(mesh);const colour=tint?colours[tint]:undefined;if(colour)mesh.thinInstanceSetBuffer('color',new Float32Array(colour),4,true);
   mesh.thinInstanceRefreshBoundingInfo();this.drawCalls++;
  }
 }
 get stats(){return {parked:this.parked.length,visible:this.visibleCount,riders:this.riders.length,drawCalls:this.drawCalls,triangles:Math.round(this.visibleCount*((this.triangles['ebike-scooter']??1000)))};}
 dispose(){for(const mesh of this.meshes)mesh.dispose(false,true);this.proto.clear();}
}
