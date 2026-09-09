import {ImportMeshAsync,Mesh,Matrix,Quaternion,Vector3,Texture,PBRMaterial,Color3,type Scene,type AbstractMesh,type Observer} from '@babylonjs/core';
import {CityMeadow} from './city-meadow.ts';
import {grassBaseline} from './city-grass-material.ts';
import {applyLandscapeNightLight} from './city-landscape-lighting.ts';
import {planRoadsidePlanting,ROADSIDE_PLANTING_BUDGET,ROADSIDE_TREE_RADII,type RoadsidePlantingOptions,type RoadsidePlantingPlan} from './city-roadside-planting.ts';
import type {CityData} from './city-types.ts';

type Plant=[number,number,number,number,number];
type Planting={trees:Plant[];details:Plant[];roadDetails?:Plant[]};
type Model={id:string;file:string;triangles:number;meshes:number;bytes:number;openAsset?:boolean};
type Prototype={model:Model;meshes:Mesh[]};
const BASE='/city/landscape/';
const TREE_NAMES=['banyan','palm','orchid-tree'];
const OPEN_TREE_NAMES=['open-island-tree','open-palm'];
const DETAIL_NAMES=['lawn-tuft','flower-shrub','fountain-grass'];
const ROAD_NAMES=['drain-grate','manhole'];

/** Subtropical planting uses an offline full-network clearance proof. Static
 * buffers rebuild only after 22m of camera travel, never on every frame. CC0 coastal trees supplement
 * the original Blender planting; replacement positions have offline clearance proofs. */
export class CityLandscape {
 private planting:Planting={trees:[],details:[]};
 private prototypes=new Map<string,Prototype>();
 private spatial=new Map<string,{trees:Plant[];details:Plant[]}>();
 private materials=new Map<string,PBRMaterial>();
 private atlas:Texture|null=null;private openKinds=new WeakMap<Plant,string>();private openEligible=0;private openVisible=0;private openNear=0;private qualificationMatched=false;
 private meadow:CityMeadow|null=null;private meadowObserver:Observer<Scene>|null=null;
 private roadside:RoadsidePlantingPlan|null=null;private roadsidePlants=new WeakSet<Plant>();
 private roadsideRequest:{data:CityData;options:Omit<RoadsidePlantingOptions,'heightAt'>}|null=null;
 private roadsideVisible={near:0,far:0};
 private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;
 private current={nearTrees:0,farTrees:0,lawnTufts:0,shrubs:0,ornamentalGrass:0,roadDetails:0,detailTriangles:0,treeTriangles:0,drawCalls:0};
 ready=false;
 constructor(private scene:Scene,private heightAt:(x:number,z:number)=>number=()=>0,private occupied:(x:number,z:number,radius:number)=>boolean=()=>false){}
 async init(){
  const [manifest,plantingText,openManifest]=await Promise.all([fetch(BASE+'manifest.json').then(r=>{if(!r.ok)throw Error('Landscape manifest unavailable');return r.json();}),fetch(BASE+'planting.json').then(r=>{if(!r.ok)throw Error('Landscape planting unavailable');return r.text();}),fetch('/city/open-vegetation/manifest.json').then(r=>{if(!r.ok)throw Error('Open vegetation manifest unavailable');return r.json();})]);
  this.planting=JSON.parse(plantingText);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(plantingText)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  this.qualificationMatched=hash===openManifest.plantingSHA256;
  if(this.qualificationMatched){for(const index of openManifest.eligibleIndices.islandTree as number[]){const p=this.planting.trees[index];if(p){this.openKinds.set(p,'open-island-tree');this.openEligible++;}}for(const index of openManifest.eligibleIndices.palm as number[]){const p=this.planting.trees[index];if(p){this.openKinds.set(p,'open-palm');this.openEligible++;}}}
  const models:Model[]=[...manifest.models,...(this.qualificationMatched?openManifest.models.map((m:Model)=>({...m,id:'open-'+m.id,file:'/city/open-vegetation/'+m.file,openAsset:true})):[])];
  for(const key of ['trees','details'] as const)for(const plant of this.planting[key]){const cell=Math.floor(plant[0]/100)+','+Math.floor(plant[1]/100);let group=this.spatial.get(cell);if(!group){group={trees:[],details:[]};this.spatial.set(cell,group);}group[key].push(plant);}
  this.atlas=new Texture(BASE+'foliage-atlas-padded.png',this.scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);this.atlas.hasAlpha=true;this.atlas.anisotropicFilteringLevel=4;
  // Sequential import avoids simultaneous decoder/allocation spikes; all eleven
  // prototypes together are under 20K source triangles. Shared material cache
  // releases duplicate GLB-embedded textures immediately after reassignment.
  for(const model of models){
   const result=await ImportMeshAsync(model.openAsset?model.file:BASE+model.file,this.scene);const meshes:Mesh[]=[];const retired=new Set<PBRMaterial>();
   for(const mesh of result.meshes){
    if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
    mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
    if(model.openAsset&&mesh.material instanceof PBRMaterial){
     const original=mesh.material,key=original.name;let shared=this.materials.get(key);
     if(!shared){shared=original;shared.maxSimultaneousLights=3;shared.environmentIntensity=.9;shared.twoSidedLighting=true;shared.enableSpecularAntiAliasing=true;
      if(key.endsWith('_distance')){const near=this.materials.get(key.replace(/_distance$/,''));if(near){const old=new Set(shared.getActiveTextures());shared.bumpTexture=near.bumpTexture;shared.metallicTexture=near.metallicTexture;shared.ambientTexture=near.ambientTexture;for(const texture of old)if(!shared.getActiveTextures().includes(texture))texture.dispose();}}
      for(const texture of shared.getActiveTextures())texture.anisotropicFilteringLevel=4;this.materials.set(key,shared);
     }mesh.material=shared;if(original!==shared)retired.add(original);
    }else if(mesh.material instanceof PBRMaterial){const original=mesh.material,isFoliage=original.name.startsWith('landscape_foliage'),distantFoliage=isFoliage&&model.id.endsWith('-lod');const key=original.name+(distantFoliage?'-distance':'');let shared=this.materials.get(key);if(!shared){
      shared=new PBRMaterial('shared-'+key,this.scene);shared.albedoColor=original.albedoColor.clone();shared.metallic=0;shared.roughness=.90;shared.environmentIntensity=.85;shared.maxSimultaneousLights=3;shared.backFaceCulling=false;shared.twoSidedLighting=true;
      // The sparse botanical alpha averages 0.218. At aerial mip levels a
      // 0.47 cutoff discarded the entire crown. Keep native mipmaps, but use
      // a separate LOD cutoff below that coverage; near leaves stay crisp.
      if(isFoliage){shared.albedoColor=Color3.White();shared.albedoTexture=this.atlas;shared.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;shared.alphaCutOff=distantFoliage?.17:.47;shared.useAlphaFromAlbedoTexture=true;shared.roughness=.82;}
      this.materials.set(key,shared);
     }mesh.material=shared;retired.add(original);
    }
    if(mesh.material instanceof PBRMaterial&&/(?:grass|lawn)/i.test(mesh.material.name))applyLandscapeNightLight(this.scene,mesh.material,'grass');
    meshes.push(mesh);
   }
   for(const material of retired)material.dispose(false,true);
   result.meshes[0]?.dispose(false,false);this.prototypes.set(model.id,{model,meshes});
  }
  if(!grassBaseline()){
   this.meadow=new CityMeadow(this.scene,this.heightAt,{excluded:(x,z)=>this.occupied(x,z,.2)});await this.meadow.init();
   // Trees rebuild after 22m. Ground-level grass has its own cheap 3m gate,
   // follows the actual camera, and disables itself at aerial heights.
   this.meadowObserver=this.scene.onBeforeRenderObservable.add(()=>{const camera=this.scene.activeCamera;if(camera)this.meadow?.update(camera.globalPosition.x,camera.globalPosition.z);});
  }
  this.ready=true;
 }
 /** Supplements the fixed planting without changing its array/hash or the
  * manifest's open-asset indices. Existing tree prototypes/LOD buffers carry
  * these instances, inside the same total tree and shadow budgets. */
 configureRoadside(data:CityData,options:Omit<RoadsidePlantingOptions,'heightAt'>={}){
  if(!this.ready)throw new Error('Roadside planting requires landscape.init() first');
  this.roadsideRequest={data,options};
  const radii=ROADSIDE_TREE_RADII;
  const existing=this.planting.trees.map(p=>{
   const open=this.openKinds.get(p);
   // Aerial views beyond 550 units return open palms to their wider original
   // LOD. Reserve the larger envelope across that runtime model switch too.
   const radius=open==='open-island-tree'?radii.openBroadleaf:[radii.banyan,radii.palm,radii.orchid][p[2]];
   return {x:p[0],z:p[1],radius:radius*p[3]};
  });
  if(this.roadside)for(const point of this.roadside.points)this.openKinds.delete(point.plant);
  this.roadside=planRoadsidePlanting(data,existing,{...options,heightAt:this.heightAt});
  this.roadsidePlants=new WeakSet(this.roadside.points.map(point=>point.plant));
  for(const cell of this.spatial.values())cell.trees=[];
  for(const plant of [...this.planting.trees,...this.roadside.points.map(point=>point.plant)]){
   const key=Math.floor(plant[0]/100)+','+Math.floor(plant[1]/100),cell=this.spatial.get(key)??{trees:[],details:[]};
   cell.trees.push(plant);this.spatial.set(key,cell);
  }
  // The loaded open palm costs fewer near triangles and fits inside the
  // already proven fallback palm circle. New broadleaf trees use the smaller
  // original models; no large island-tree crown is silently substituted.
  if(this.prototypes.has('open-palm'))for(const {plant} of this.roadside.points)if(plant[2]===1)this.openKinds.set(plant,'open-palm');
  this.lastX=Infinity;this.lastZ=Infinity;
  return this.roadside.stats;
 }
 update(x:number,z:number,aerial=false,force=false){
  if(!this.ready||(!force&&aerial===this.lastAerial&&Math.hypot(x-this.lastX,z-this.lastZ)<22))return;
  this.lastX=x;this.lastZ=z;this.lastAerial=aerial;
  const radius=aerial?1200:440,extent=Math.ceil(radius/100),cx=Math.floor(x/100),cz=Math.floor(z/100);const nearby:{trees:Plant[];details:Plant[]}={trees:[],details:[]};
  for(let a=-extent;a<=extent;a++)for(let b=-extent;b<=extent;b++){const cell=this.spatial.get((cx+a)+','+(cz+b));if(!cell)continue;nearby.trees.push(...cell.trees);if(!aerial&&Math.abs(a)<2&&Math.abs(b)<2)nearby.details.push(...cell.details);}
  const dist=(p:Plant)=>(p[0]-x)**2+(p[1]-z)**2;nearby.trees=nearby.trees.filter(p=>dist(p)<radius*radius).sort((a,b)=>dist(a)-dist(b));nearby.details=nearby.details.filter(p=>dist(p)<95*95).sort((a,b)=>dist(a)-dist(b));
  const groups=new Map<string,Plant[]>();const add=(name:string,p:Plant)=>{let group=groups.get(name);if(!group){group=[];groups.set(name,group);}group.push(p);};
  this.current={nearTrees:0,farTrees:0,lawnTufts:0,shrubs:0,ornamentalGrass:0,roadDetails:0,detailTriangles:0,treeTriangles:0,drawCalls:0};
  this.openVisible=0;this.openNear=0;this.roadsideVisible={near:0,far:0};
  for(const p of nearby.trees){if(this.occupied(p[0],p[1],5*p[3]))continue;let near=!aerial&&dist(p)<150*150&&this.current.nearTrees<48;const qualified=this.openKinds.get(p);const open=qualified&&(!aerial||dist(p)<550*550);
   const supplemental=this.roadsidePlants.has(p);
   if(supplemental&&near&&this.roadsideVisible.near>=ROADSIDE_PLANTING_BUDGET.near)near=false;
   if(open&&near&&qualified==='open-island-tree'&&this.openNear>=24)near=false;
   if(!near&&this.current.farTrees>=(aerial?1200:220))continue;
   if(supplemental&&!near&&this.roadsideVisible.far>=(aerial?ROADSIDE_PLANTING_BUDGET.aerial:ROADSIDE_PLANTING_BUDGET.far))continue;
   const name=(open?qualified:TREE_NAMES[p[2]])+(near?'':'-lod');add(name,p);if(near)this.current.nearTrees++;else this.current.farTrees++;if(open){this.openVisible++;if(near&&qualified==='open-island-tree')this.openNear++;}
   if(supplemental)this.roadsideVisible[near?'near':'far']++;
  }
  const counts=[0,0,0],caps=[520,110,120];
  if(!aerial)for(const p of nearby.details){if(this.occupied(p[0],p[1],.6)||p[2]===0&&this.meadow?.ready)continue;const name=DETAIL_NAMES[p[2]],tris=this.prototypes.get(name)?.model.triangles??0;if(counts[p[2]]>=caps[p[2]]||this.current.detailTriangles+tris>150000)continue;add(name,p);counts[p[2]]++;this.current.detailTriangles+=tris;}
  [this.current.lawnTufts,this.current.shrubs,this.current.ornamentalGrass]=counts;
  if(!aerial)for(const p of (this.planting.roadDetails??[]).filter(p=>dist(p)<70*70).sort((a,b)=>dist(a)-dist(b)).slice(0,28)){add(ROAD_NAMES[p[2]],p);this.current.roadDetails++;}
  for(const [name,prototype] of this.prototypes){const plants=groups.get(name)??[];if(!plants.length){for(const mesh of prototype.meshes)mesh.setEnabled(false);continue;}
   const matrices=new Float32Array(plants.length*16),colors=new Float32Array(plants.length*4);
   plants.forEach((p,i)=>{Matrix.Compose(new Vector3(p[3],p[3],p[3]),Quaternion.RotationAxis(Vector3.Up(),p[4]),new Vector3(p[0],this.heightAt(p[0],p[1])+(ROAD_NAMES.includes(name)?.12:.05),p[1])).copyToArray(matrices,i*16);const seed=Math.abs(Math.sin(p[0]*.713+p[1]*.519));colors.set([.83+seed*.22,.91+seed*.15,.80+seed*.23,1],i*4);});
   for(const mesh of prototype.meshes){mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceSetBuffer('color',colors,4,true);mesh.thinInstanceRefreshBoundingInfo();this.current.drawCalls++;}
   if([...TREE_NAMES,...OPEN_TREE_NAMES].some(tree=>name===tree||name===tree+'-lod'))this.current.treeTriangles+=plants.length*prototype.model.triangles;
  }
 }
 /** Driving casts near-tree shadows only. Aerial mode exposes the coarse tree
  * group for the integrator's larger, throttled shadow map; grass never casts. */
 get casters():AbstractMesh[]{return [...TREE_NAMES,...OPEN_TREE_NAMES].flatMap(name=>this.prototypes.get(name+(this.lastAerial?'-lod':''))?.meshes.filter(m=>m.isEnabled())??[]);}
 get meshes():AbstractMesh[]{return [...this.prototypes.values()].flatMap(p=>p.meshes).concat(this.meadow?.meshes as Mesh[]??[]);}
 get stats(){return {...this.current,roadside:this.roadside?{...this.roadside.stats,visible:{...this.roadsideVisible}}:{generated:0,visible:{near:0,far:0}},meadow:this.meadow?.stats??{mode:'baseline'},openAssets:{qualified:this.openEligible,visible:this.openVisible,nearBroadleaf:this.openNear,nearBroadleafLimit:24,qualificationMatched:this.qualificationMatched,license:'CC0-1.0'},sourceTreeCount:this.planting.trees.length,sourceDetailCount:this.planting.details.length,aerial:this.lastAerial,treeRadius:this.lastAerial?1200:440,treeBudget:this.lastAerial?1200:268,ready:this.ready};}
 setTerrainHeight(heightAt:(x:number,z:number)=>number){this.heightAt=heightAt;this.meadow?.setTerrainHeight(heightAt);if(this.ready&&this.roadsideRequest)this.configureRoadside(this.roadsideRequest.data,this.roadsideRequest.options);this.lastX=Infinity;this.lastZ=Infinity;}
 dispose(){if(this.meadowObserver)this.scene.onBeforeRenderObservable.remove(this.meadowObserver);this.meadow?.dispose();for(const p of this.prototypes.values())for(const m of p.meshes)m.dispose(false,false);for(const m of this.materials.values())m.dispose(false,false);this.atlas?.dispose();this.prototypes.clear();this.materials.clear();this.spatial.clear();this.roadside=null;this.roadsideRequest=null;this.ready=false;}
}

/** Independent surface calibration, retaining the existing road mirror and UVs.
 * Terrain UVs are currently world coordinates /8: lawn repeats every ~8m, and
 * tarmac every ~4m. Two 512px textures, no new lights or post-processing passes. */
export function applyLandscapeSurfaces(scene:Scene){
 const lawn=new Texture(BASE+'lawn-detail-v2.jpg',scene,false,false,Texture.TRILINEAR_SAMPLINGMODE),asphalt=new Texture(BASE+'asphalt.jpg',scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
 lawn.anisotropicFilteringLevel=8;asphalt.anisotropicFilteringLevel=8;asphalt.uScale=2;asphalt.vScale=2;
 const changed:string[]=[];
 for(const mesh of scene.meshes){const material=mesh.material;if(!(material instanceof PBRMaterial))continue;
  if(/^terrain_(?:land|park)/.test(mesh.name)||/^(land|park)$/.test(material.name)){material.albedoTexture=lawn;material.albedoColor=new Color3(.92,.99,.88);material.metallic=0;material.roughness=.95;material.maxSimultaneousLights=3;changed.push(mesh.name);}
  if(material.name==='asphalt'){material.albedoTexture=asphalt;material.albedoColor=new Color3(.52,.55,.58);material.metallic=0;material.roughness=.87;material.maxSimultaneousLights=4;changed.push(mesh.name);}
  if(material.name==='roadline'){material.albedoColor=new Color3(.59,.61,.57);material.metallic=0;material.roughness=.85;material.emissiveColor=Color3.Black();}
 }
 return {changed,textures:[lawn,asphalt]};
}
