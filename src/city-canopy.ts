import {ImportMeshAsync,Mesh,Matrix,PBRMaterial,Quaternion,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';
import {CITY_GRAPHICS_PROFILES,type CityGraphicsQuality} from './city-graphics-quality.ts';

/** [east,north,species,scale,yaw] in game units; height and crown scale with the instance. */
export type CanopyTree=[number,number,number,number,number];
export type CanopySpecies={id:string;name:string;height:number;crown:number};
export type CanopyModel={id:string;species:string;lod:0|1|2;file:string;triangles:number;meshes:number;bytes:number;height:number;crownRadius:number};
export type CanopyManifest={version:1;species:CanopySpecies[];models:CanopyModel[]};
export type CanopyPlanting={version:1;species:CanopySpecies[];trees:CanopyTree[]};
type Prototype={model:CanopyModel;meshes:Mesh[]};

const BASE='/city/landscape/';
/** LOD switch distances (metres from the focus). Aerial views never need the full tier: the
 * camera is ≥125 m up, so the mid tier's 350–1000 triangles already exceed a crown's pixel size. */
export const CANOPY_LOD={full:170,mid:650,aerialMid:520} as const;
/** Street-mode cull radius; aerial radius comes from the graphics profile so the tall canopy
 * reaches exactly as far as the existing 8 m trees do (1000–1200 m). */
export const CANOPY_RADIUS={street:1100,aerialExtra:900} as const;

/** Spatial cell and screening helpers are pure so tests can cover placement/LOD choices. */
export function canopyCell(x:number,z:number){return Math.floor(x/100)+','+Math.floor(z/100);}
export function canopyTier(distance:number,aerial:boolean):0|1|2{
 if(aerial)return distance<CANOPY_LOD.aerialMid?1:2;
 return distance<CANOPY_LOD.full?0:distance<CANOPY_LOD.mid?1:2;
}

/** Ten-storey canopy layer: six solid-crown species (10–30 m) as thin instances with three LODs.
 * The original 8 m streetscape stays as-is underneath; this is what makes lawns and parks read
 * from the air and from a moving car. Buffers rebuild with the same 22 m gate as the landscape. */
export class CityCanopy {
 private graphicsQuality:CityGraphicsQuality='high';
 private manifest:CanopyManifest|null=null;
 private trees:CanopyTree[]=[];
 private spatial=new Map<string,CanopyTree[]>();
 private prototypes=new Map<string,Prototype>();
 private materials=new Map<string,PBRMaterial>();
 private speciesIds:string[]=[];
 private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;
 private current={full:0,mid:0,far:0,triangles:0,drawCalls:0,skippedOccupied:0,bySpecies:[] as number[]};
 ready=false;
 constructor(private scene:Scene,private heightAt:(x:number,z:number)=>number=()=>0,private occupied:(x:number,z:number,radius:number)=>boolean=()=>false){}
 setGraphicsQuality(quality:CityGraphicsQuality){this.graphicsQuality=quality;this.lastX=Infinity;this.lastZ=Infinity;}
 setTerrainHeight(heightAt:(x:number,z:number)=>number){this.heightAt=heightAt;this.lastX=Infinity;this.lastZ=Infinity;}
 async init(){
  const [manifest,planting]=await Promise.all([
   fetch(BASE+'canopy/manifest.json').then(r=>{if(!r.ok)throw Error('Canopy manifest unavailable');return r.json() as Promise<CanopyManifest>;}),
   fetch(BASE+'canopy-trees.json').then(r=>{if(!r.ok)throw Error('Canopy planting unavailable');return r.json() as Promise<CanopyPlanting>;}),
  ]);
  this.manifest=manifest;this.trees=planting.trees;this.speciesIds=manifest.species.map(s=>s.id);
  for(const tree of this.trees){const key=canopyCell(tree[0],tree[1]);let cell=this.spatial.get(key);if(!cell){cell=[];this.spatial.set(key,cell);}cell.push(tree);}
  // Sequential import (18 small GLBs, ~700 KB total) avoids parallel decoder spikes during boot.
  for(const model of manifest.models){
   const result=await ImportMeshAsync(BASE+model.file,this.scene);const meshes:Mesh[]=[];const retired=new Set<PBRMaterial>();
   for(const mesh of result.meshes){
    if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
    // Same handling as the landscape prototypes: detach from the glTF root and bake its Z flip
    // (Blender north -> game +Z). bakeTransformIntoVertices flips winding for the mirror, so the
    // closed crowns keep back-face culling.
    mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
    mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
    if(mesh.material instanceof PBRMaterial){
     const original=mesh.material,key=original.name.replace(/\.\d+$/,'');let shared=this.materials.get(key);
     if(!shared){
      shared=new PBRMaterial('canopy-'+key,this.scene);shared.albedoColor=original.albedoColor.clone();shared.metallic=0;shared.roughness=Math.max(.86,original.roughness??.9);
      // Matte, slightly desaturated crowns: strong specular on big low-poly clumps reads as plastic.
      shared.specularIntensity=.28;shared.environmentIntensity=.82;shared.maxSimultaneousLights=3;shared.backFaceCulling=true;shared.enableSpecularAntiAliasing=true;
      this.materials.set(key,shared);
     }
     mesh.material=shared;retired.add(original);
    }
    meshes.push(mesh);
   }
   for(const material of retired)material.dispose(false,true);
   result.meshes[0]?.dispose(false,false);
   this.prototypes.set(model.id,{model,meshes});
  }
  this.ready=true;
 }
 private modelId(species:number,tier:0|1|2){return this.speciesIds[species]+(tier===0?'':tier===1?'-mid':'-far');}
 /** True when a canopy trunk sits within `radius` of the point; the roadside planner uses this so
  * its runtime supplemental verge trees never share a root with a boulevard tree. */
 trunkNear(x:number,z:number,radius=3.5){
  const cx=Math.floor(x/100),cz=Math.floor(z/100),r2=radius*radius;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const cell=this.spatial.get((cx+a)+','+(cz+b));if(!cell)continue;for(const t of cell)if((t[0]-x)**2+(t[1]-z)**2<r2)return true;}
  return false;
 }
 update(x:number,z:number,aerial=false,force=false){
  if(!this.ready||!this.manifest||(!force&&aerial===this.lastAerial&&Math.hypot(x-this.lastX,z-this.lastZ)<22))return;
  this.lastX=x;this.lastZ=z;this.lastAerial=aerial;
  const quality=CITY_GRAPHICS_PROFILES[this.graphicsQuality];
  const radius=aerial?quality.aerialTreeRadius+CANOPY_RADIUS.aerialExtra:CANOPY_RADIUS.street,extent=Math.ceil(radius/100),cx=Math.floor(x/100),cz=Math.floor(z/100);
  const nearby:{tree:CanopyTree;d:number}[]=[];
  for(let a=-extent;a<=extent;a++)for(let b=-extent;b<=extent;b++){const cell=this.spatial.get((cx+a)+','+(cz+b));if(!cell)continue;for(const tree of cell){const d=Math.hypot(tree[0]-x,tree[1]-z);if(d<radius)nearby.push({tree,d});}}
  nearby.sort((a,b)=>a.d-b.d);
  const budgets={full:quality.canopyFull,mid:aerial?quality.canopyAerialMid:quality.canopyMid,far:aerial?quality.canopyAerialFar:quality.canopyFar};
  const groups=new Map<string,CanopyTree[]>();const counts={full:0,mid:0,far:0};let skipped=0;const bySpecies=this.speciesIds.map(()=>0);
  for(const {tree,d} of nearby){
   const species=this.manifest.species[tree[2]];if(!species)continue;
   if(this.occupied(tree[0],tree[1],species.crown*tree[3]*.5)){skipped++;continue;}
   let tier=canopyTier(d,aerial);
   // Demote instead of dropping when a tier budget is spent; only the far budget truly culls.
   if(tier===0&&counts.full>=budgets.full)tier=1;
   if(tier===1&&counts.mid>=budgets.mid)tier=2;
   if(tier===2&&counts.far>=budgets.far)break;
   counts[tier===0?'full':tier===1?'mid':'far']++;bySpecies[tree[2]]++;
   const id=this.modelId(tree[2],tier);let group=groups.get(id);if(!group){group=[];groups.set(id,group);}group.push(tree);
  }
  this.current={...counts,triangles:0,drawCalls:0,skippedOccupied:skipped,bySpecies};
  for(const [id,prototype] of this.prototypes){
   const trees=groups.get(id)??[];
   if(!trees.length){for(const mesh of prototype.meshes)mesh.setEnabled(false);continue;}
   const matrices=new Float32Array(trees.length*16),colors=new Float32Array(trees.length*4);
   trees.forEach((t,i)=>{
    // Trunks sink to the lowest of three nearby ground samples so slopes never leave a root in the air.
    const r=1.5*t[3],y=Math.min(this.heightAt(t[0],t[1]),this.heightAt(t[0]+r,t[1]),this.heightAt(t[0]-r*.5,t[1]+r*.87),this.heightAt(t[0]-r*.5,t[1]-r*.87));
    Matrix.Compose(new Vector3(t[3],t[3],t[3]),Quaternion.RotationAxis(Vector3.Up(),t[4]),new Vector3(t[0],y,t[1])).copyToArray(matrices,i*16);
    // Per-tree tint: warmer/cooler greens within a species so a park is not one flat colour.
    const seed=Math.abs(Math.sin(t[0]*.611+t[1]*.437)),seed2=Math.abs(Math.cos(t[0]*.283-t[1]*.729));
    colors.set([.80+seed*.28,.86+seed2*.20,.78+seed*.22,1],i*4);
   });
   for(const mesh of prototype.meshes){mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceSetBuffer('color',colors,4,true);mesh.thinInstanceRefreshBoundingInfo();this.current.drawCalls++;}
   this.current.triangles+=trees.length*prototype.model.triangles;
  }
 }
 /** Street mode shadows the full and mid tiers; aerial mode hands the mid+far blobs to the wide,
  * throttled aerial shadow map, where a tree's shadow on a lawn is most of what you see. */
 get casters():AbstractMesh[]{
  const tiers=this.lastAerial?['-mid','-far']:['','-mid'];
  return this.speciesIds.flatMap(id=>tiers.flatMap(suffix=>this.prototypes.get(id+suffix)?.meshes.filter(m=>m.isEnabled())??[]));
 }
 get meshes():AbstractMesh[]{return [...this.prototypes.values()].flatMap(p=>p.meshes);}
 get stats(){
  const quality=CITY_GRAPHICS_PROFILES[this.graphicsQuality];
  return {...this.current,species:this.speciesIds,sourceTreeCount:this.trees.length,aerial:this.lastAerial,graphicsQuality:this.graphicsQuality,
   budgets:{full:quality.canopyFull,mid:this.lastAerial?quality.canopyAerialMid:quality.canopyMid,far:this.lastAerial?quality.canopyAerialFar:quality.canopyFar},ready:this.ready};
 }
 dispose(){for(const p of this.prototypes.values())for(const m of p.meshes)m.dispose(false,false);for(const m of this.materials.values())m.dispose(false,false);this.prototypes.clear();this.materials.clear();this.spatial.clear();this.trees=[];this.ready=false;}
}
