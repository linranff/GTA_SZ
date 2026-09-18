import {ImportMeshAsync,Material,Mesh,Matrix,PBRMaterial,Quaternion,Vector3,Color3,type AbstractMesh,type Scene} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-daylight.ts';
import {ROOFTOP_KINDS} from './city-rooftop-plan.ts';

/** plan.json: props grouped by kind, each [x,z,y,sx,sy,sz,yaw] on the crown roof of an ordinary building. */
export type RooftopInstance=[number,number,number,number,number,number,number];
export type RooftopPlanFile={version:1;groups:{kind:string;count:number;instances:RooftopInstance[]}[];lookup:{file:string;cell:number;minX:number;minZ:number;width:number;height:number}};
type Prototype={kind:string;meshes:Mesh[];large:boolean};

const BASE='/city/rooftops/';
const CELL=200;
/** Small plant (split AC units, vent pipes) only matters near the camera; the rest carries the aerial read. */
export const ROOFTOP_RADIUS={large:{street:950,aerial:1750},small:{street:380,aerial:650}} as const;
export const ROOFTOP_BUDGET={large:{street:5000,aerial:9000},small:{street:2500,aerial:4000}} as const;
const SMALL_KINDS=new Set(['ac-unit','vent-pipe']);

export function rooftopCell(x:number,z:number){return Math.floor(x/CELL)+','+Math.floor(z/CELL);}
/** Ring-ordered cell offsets so budgets keep the nearest instances without sorting every prop. */
export function ringOffsets(extent:number){
 const out:[number,number][]=[];
 for(let r=0;r<=extent;r++)for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)if(Math.max(Math.abs(a),Math.abs(b))===r)out.push([a,b]);
 return out;
}
/** Per-instance tint: light plant rooms and tanks vary in warmth/brightness, glass and metal barely. */
export function rooftopTint(kind:string,x:number,z:number):[number,number,number]{
 const h=Math.abs(Math.sin(x*.317+z*.871)),h2=Math.abs(Math.cos(x*.541-z*.223));
 if(kind==='penthouse-glass'||kind==='skylight'||kind==='solar-array')return [.96+h*.08,.96+h2*.08,.98+h*.04];
 if(kind==='water-tank')return [.90+h*.22,.89+h2*.20,.86+h*.18];
 if(kind==='penthouse-render'||kind==='stair-bulkhead'||kind==='ac-unit')return [.72+h*.42,.72+h2*.40,.70+h*.36];
 return [.85+h*.25,.86+h2*.22,.86+h*.20];
}

/** Rooftop layer for ordinary buildings: helipads, plant rooms, cooling towers, tanks, antennas,
 * solar, skylights and vents as thin instances of thirteen Blender prototypes. The plan is offline
 * (scripts/prepare_city_rooftops.mjs); this class only picks instances inside a radius/budget and
 * rebuilds buffers with the same 22 m gate as the canopy. */
export class CityRooftops{
 private cells=new Map<string,Map<string,RooftopInstance[]>>();
 private prototypes=new Map<string,Prototype>();
 private materials=new Map<string,PBRMaterial>();
 private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;
 private current={large:0,small:0,drawCalls:0,triangles:0,perKind:{} as Record<string,number>};
 private triangles=new Map<string,number>();
 plan:RooftopPlanFile|null=null;ready=false;scene:Scene;
 constructor(scene:Scene){this.scene=scene;}
 async init(){
  const [plan,result]=await Promise.all([
   fetch(BASE+'plan.json').then(r=>{if(!r.ok)throw Error('Rooftop plan unavailable');return r.json() as Promise<RooftopPlanFile>;}),
   ImportMeshAsync(BASE+'props.glb',this.scene),
  ]);
  this.plan=plan;
  for(const group of plan.groups)for(const inst of group.instances){const key=rooftopCell(inst[0],inst[1]);let cell=this.cells.get(key);if(!cell){cell=new Map();this.cells.set(key,cell);}let list=cell.get(group.kind);if(!list){list=[];cell.set(group.kind,list);}list.push(inst);}
  const retired=new Set<PBRMaterial>();
  for(const mesh of result.meshes){
   if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
   const match=mesh.name.match(/^prop_([a-z-]+)_([a-z]+)$/);if(!match)continue;
   const kind=match[1];
   mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
   // The glTF loader marks meshes clockwise-front to pair with its mirrored root. Detached from that root and
   // baked through a second mirror (which re-flips the indices), the raw front faces are counter-clockwise; with
   // back-face culling on, the wrong hint culls the H deck marks and shows every box inside-out.
   mesh.sideOrientation=Material.CounterClockWiseSideOrientation;
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);mesh.doNotSyncBoundingInfo=false;
   if(mesh.material instanceof PBRMaterial){
    const original=mesh.material,key=original.name.replace(/\.\d+$/,'');let shared=this.materials.get(key);
    if(!shared){
     shared=new PBRMaterial('rooftop-'+key,this.scene);shared.albedoColor=original.albedoColor.clone();shared.metallic=original.metallic??0;shared.roughness=original.roughness??.7;
     shared.emissiveColor=original.emissiveColor.clone();shared.emissiveIntensity=original.emissiveIntensity;
     shared.specularIntensity=.8;shared.environmentIntensity=.9;shared.maxSimultaneousLights=4;shared.backFaceCulling=true;shared.enableSpecularAntiAliasing=true;
     // Glass plant rooms and skylights: dark backing, low roughness so the sky reads in them from the air.
     if(key==='darkglass'||key==='landmarkglass'){shared.albedoColor.scaleInPlace(.9);shared.roughness=.18;shared.metallic=0;}
     // Perimeter fixtures read as small grey housings by day; the warm emission only comes on at dusk/night.
     if(key==='lamp'){shared.albedoColor.set(.55,.56,.54);shared.emissiveIntensity=1;}
     if(key==='redled')shared.emissiveIntensity=1;
     // Stainless tanks: mostly diffuse white with a soft sheen, not a blue mirror of the sky.
     if(key==='tankwhite'){shared.metallic=0;shared.roughness=.46;shared.albedoColor.set(.74,.74,.71);}
     this.materials.set(key,shared);
    }
    mesh.material=shared;retired.add(original);
   }
   let proto=this.prototypes.get(kind);if(!proto){proto={kind,meshes:[],large:!SMALL_KINDS.has(kind)};this.prototypes.set(kind,proto);}
   proto.meshes.push(mesh);this.triangles.set(kind,(this.triangles.get(kind)??0)+mesh.getTotalIndices()/3);
  }
  for(const material of retired)material.dispose(false,true);
  result.meshes[0]?.dispose(false,false);
  for(const k of ROOFTOP_KINDS)if(!this.prototypes.has(k.id))console.warn('Rooftop prototype missing in props.glb:',k.id);
  this.ready=true;
 }
 setMode(mode:CinematicLightingMode){
  const on=mode==='day'?0:mode==='sunset'?.6:1;
  for(const [key,material] of this.materials){if(key==='lamp')material.emissiveIntensity=on*1.2;if(key==='redled')material.emissiveIntensity=on*1.6;}
 }
 update(x:number,z:number,aerial=false,force=false){
  if(!this.ready||(!force&&aerial===this.lastAerial&&Math.hypot(x-this.lastX,z-this.lastZ)<22))return;
  this.lastX=x;this.lastZ=z;this.lastAerial=aerial;
  const mode=aerial?'aerial':'street',cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);
  const picked=new Map<string,RooftopInstance[]>();const counts={large:0,small:0};
  for(const cls of ['large','small'] as const){
   const radius=ROOFTOP_RADIUS[cls][mode],budget=ROOFTOP_BUDGET[cls][mode],r2=radius*radius,extent=Math.ceil(radius/CELL);
   outer:for(const [a,b] of ringOffsets(extent)){
    const cell=this.cells.get((cx+a)+','+(cz+b));if(!cell)continue;
    for(const [kind,list] of cell){
     const proto=this.prototypes.get(kind);if(!proto||proto.large!==(cls==='large'))continue;
     let group=picked.get(kind);if(!group){group=[];picked.set(kind,group);}
     for(const inst of list){
      if((inst[0]-x)**2+(inst[1]-z)**2>r2)continue;
      group.push(inst);counts[cls]++;
      if(counts[cls]>=budget)break outer;
     }
    }
   }
  }
  this.current={...counts,drawCalls:0,triangles:0,perKind:{}};
  for(const [kind,proto] of this.prototypes){
   const list=picked.get(kind)??[];
   if(!list.length){for(const mesh of proto.meshes)mesh.setEnabled(false);continue;}
   const matrices=new Float32Array(list.length*16),colors=new Float32Array(list.length*4);
   list.forEach((inst,i)=>{
    Matrix.Compose(new Vector3(inst[3],inst[4],inst[5]),Quaternion.RotationAxis(Vector3.Up(),inst[6]),new Vector3(inst[0],inst[2],inst[1])).copyToArray(matrices,i*16);
    const tint=rooftopTint(kind,inst[0],inst[1]);colors[i*4]=tint[0];colors[i*4+1]=tint[1];colors[i*4+2]=tint[2];colors[i*4+3]=1;
   });
   for(const mesh of proto.meshes){mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceSetBuffer('color',colors,4,true);mesh.thinInstanceRefreshBoundingInfo();this.current.drawCalls++;}
   this.current.triangles+=list.length*(this.triangles.get(kind)??0);this.current.perKind[kind]=list.length;
  }
 }
 /** Only the large kinds cast: a helipad platform or plant room throws a readable shadow on the roof; a vent pipe does not. */
 get casters():AbstractMesh[]{return [...this.prototypes.values()].filter(p=>p.large).flatMap(p=>p.meshes.filter(m=>m.isEnabled()));}
 get meshes():AbstractMesh[]{return [...this.prototypes.values()].flatMap(p=>p.meshes);}
 get stats(){return {...this.current,ready:this.ready,aerial:this.lastAerial,kinds:this.prototypes.size,cells:this.cells.size,radius:ROOFTOP_RADIUS,budget:ROOFTOP_BUDGET,sourceInstances:this.plan?.groups.reduce((s,g)=>s+g.count,0)??0};}
 dispose(){for(const p of this.prototypes.values())for(const m of p.meshes)m.dispose(false,false);for(const m of this.materials.values())m.dispose(false,false);this.prototypes.clear();this.materials.clear();this.cells.clear();this.ready=false;}
}
