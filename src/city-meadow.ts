import {
 Color3, MaterialPluginBase, Matrix, Mesh, PBRMaterial, Quaternion, ShaderLanguage, Vector3, VertexData,
 type AbstractEngine, type AbstractMesh, type Scene, type SubMesh, type UniformBuffer,
} from '@babylonjs/core';
import {applyLandscapeNightLight} from './city-landscape-lighting.ts';

type HeightAt = (x:number,z:number)=>number;
export type MeadowTile = {id:string;ix:number;iz:number;url:string;bytes:number;count:number};
export type MeadowManifest = {
 schemaVersion:1;tileSize:number;step:number;gridSize:number;stride:3;safeRadius:number;
 channels:['safe','soil','slopeDegreesX4'];sourceSHA:Record<string,string>;tiles:MeadowTile[];
};
export type MeadowPatch = {x:number;z:number;soil:number;slope:number;seed:number;safeRadius:number};
export type MeadowClump = {x:number;z:number;height:number;width:number;yaw:number;soil:number;seed:number;range:number};
export type MeadowOptions = {manifestURL?:string;maxClumps?:number;maxMeshes?:number;cacheTiles?:number;fetcher?:typeof fetch};
export const MEADOW_LIMITS = Object.freeze({clumps:2304,meshes:8,radius:28,rebuildDistance:3,blades:7,clumpsPerPatch:48,leafMargin:.20,highCamera:16});
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const hash=(n:number)=>{n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return ((n^(n>>>16))>>>0)/4294967296;};
const cellSeed=(x:number,z:number)=>(Math.imul(x,73856093)^Math.imul(z,19349663))>>>0;
const tileKey=(x:number,z:number)=>x+','+z;
const rangeFor=(i:number)=>i<6?28:i<12?21:i<24?14:7;

/** The binary mask certifies whole discs, not merely their centres. Expanding
 * outside safeRadius would invalidate the offline road/water/building proof. */
export function validateMeadowManifest(value:unknown):MeadowManifest {
 const m=value as MeadowManifest;
 if(!m||m.schemaVersion!==1||m.tileSize!==128||m.step!==4||m.gridSize!==32||m.stride!==3||
  !Number.isFinite(m.safeRadius)||m.safeRadius<.3||m.safeRadius>3.5||
  m.channels?.join(',')!=='safe,soil,slopeDegreesX4'||!Array.isArray(m.tiles)||m.tiles.length>20000||
  !m.sourceSHA||!Object.keys(m.sourceSHA).length||!Object.values(m.sourceSHA).every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s))) throw Error('草地采样清单格式或来源哈希无效');
 const ids=new Set<string>(),cells=new Set<string>();
 for(const t of m.tiles){
  if(typeof t.id!=='string'||ids.has(t.id)||!Number.isInteger(t.ix)||!Number.isInteger(t.iz)||cells.has(tileKey(t.ix,t.iz))||
   typeof t.url!=='string'||!t.url||t.url.includes('..')||/^(?:[a-z]+:|\/)/i.test(t.url)||
   t.bytes!==m.gridSize*m.gridSize*m.stride||!Number.isInteger(t.count)||t.count<0||t.count>m.gridSize*m.gridSize) throw Error('草地采样分块格式无效');
  ids.add(t.id);cells.add(tileKey(t.ix,t.iz));
 }
 return m;
}

/** Row-major north/z rows and east/x columns, all positions in game units. */
export function decodeMeadowTile(m:MeadowManifest,tile:MeadowTile,data:Uint8Array):MeadowPatch[] {
 if(data.byteLength!==tile.bytes)throw Error('草地采样分块长度不符：'+tile.id);
 const patches:MeadowPatch[]=[];let safeCount=0;
 for(let row=0;row<m.gridSize;row++)for(let col=0;col<m.gridSize;col++){
  const at=(row*m.gridSize+col)*m.stride;if(data[at]!==255)continue;safeCount++;
  const slope=data[at+2]/4,soil=data[at+1]/255;
  if(slope>12||soil>.78)continue;
  const gx=tile.ix*m.gridSize+col,gz=tile.iz*m.gridSize+row;
  patches.push({x:(gx+.5)*m.step,z:(gz+.5)*m.step,soil,slope,seed:cellSeed(gx,gz),safeRadius:m.safeRadius});
 }
 if(safeCount!==tile.count)throw Error('草地采样安全点数量不符：'+tile.id);
 return patches;
}

/** Interleaving, slightly lobed patches. The reserved margin contains each
 * curved leaf including wind, so complete geometry stays in its safe disc. */
export function createMeadowPatch(p:MeadowPatch):MeadowClump[] {
 const result:MeadowClump[]=[];const radius=Math.max(0,p.safeRadius-MEADOW_LIMITS.leafMargin),phase=hash(p.seed+3)*Math.PI*2;
 for(let i=0;i<MEADOW_LIMITS.clumpsPerPatch;i++){
  const seed=(p.seed+Math.imul(i+1,2654435761))>>>0;
  if(hash(seed+7)<p.soil*.72)continue;
  const theta=i*2.399963229728653+phase+(hash(seed+11)-.5)*.30;
  const r=Math.sqrt((i+.25+hash(seed+17)*.5)/MEADOW_LIMITS.clumpsPerPatch)*radius*(.83+.12*Math.sin(theta*3+phase)+.05*Math.cos(theta*5-phase));
  const wild=hash(seed+23)<.025,height=wild?.12+hash(seed+29)*.03:.05+hash(seed+29)*.06;
  result.push({x:p.x+Math.cos(theta)*r,z:p.z+Math.sin(theta)*r,height,width:height*(.85+hash(seed+31)*.30),yaw:hash(seed+37)*Math.PI*2,soil:p.soil,seed,range:rangeFor(i)});
 }
 return result;
}

/** Seven tapered, genuinely curved blades; three sections, five triangles per
 * blade. ComputeNormals uses Babylon's LH face convention by default. */
export function createMeadowGeometry(rightHanded=false):VertexData {
 const positions:number[]=[],indices:number[]=[],colors:number[]=[],uvs:number[]=[];
 for(let blade=0;blade<MEADOW_LIMITS.blades;blade++){
  const seed=blade*97+51,angle=blade*2.399963229728653,dx=Math.cos(angle),dz=Math.sin(angle),wx=-dz,wz=dx;
  const root=.12+hash(seed)*.08,bend=.15+hash(seed+1)*.13,top=.78+hash(seed+2)*.22,width=.055+hash(seed+3)*.022;
  const base=positions.length/3;
  const add=(t:number,side:number)=>{
   const spread=t===1?0:width*(1-.82*t)*side;
   positions.push(dx*(root+bend*t*t)+wx*spread,top*t,dz*(root+bend*t*t)+wz*spread);
   // Vertex albedo/AO gradient; no emissive term or baked lighting.
   const brightness=.60+.40*Math.pow(t,.70);colors.push(brightness,brightness,brightness*.94,1);uvs.push((side+1)/2,t);
  };
  for(const t of [0,.40,.76]){add(t,-1);add(t,1);}add(1,0);
  indices.push(base,base+2,base+1,base+1,base+2,base+3,base+2,base+4,base+3,base+3,base+4,base+5,base+4,base+6,base+5);
 }
 if(rightHanded)for(let i=0;i<indices.length;i+=3){const n=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=n;}
 const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:rightHanded});
 const geometry=new VertexData();geometry.positions=positions;geometry.indices=indices;geometry.normals=normals;geometry.colors=colors;geometry.uvs=uvs;return geometry;
}

/** CPU equivalent of the vertex LOD, useful for budget/continuity checks. */
export function meadowVisibility(distance:number,range:number,heightAboveRoot=0){
 const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
 return (1-smooth(range*.70,range,distance))*(1-smooth(9,MEADOW_LIMITS.highCamera,Math.abs(heightAboveRoot)));
}

class MeadowMotion extends MaterialPluginBase {
 private readonly eye=Vector3.Zero();
 private readonly start=performance.now();
 constructor(material:PBRMaterial){super(material,'CityMeadowMotion',210,{},true,false);this.registerForExtraEvents=true;this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override getAttributes(attributes:string[]){attributes.push('meadowParams');}
 override getUniforms(){return {ubo:[{name:'meadowEyeTime',size:4,type:'vec4'}],vertex:'uniform vec4 meadowEyeTime;'};}
 override hardBindForSubMesh(buffer:UniformBuffer,scene:Scene,_engine:AbstractEngine,_subMesh:SubMesh){
  this.eye.copyFrom(scene.activeCamera?.globalPosition??Vector3.ZeroReadOnly);
  buffer.updateFloat4('meadowEyeTime',this.eye.x,this.eye.y,this.eye.z,(performance.now()-this.start)/1000);
 }
 override getCustomCode(type:string):Record<string,string>|null {
  if(type!=='vertex')return null;
  return {CUSTOM_VERTEX_DEFINITIONS:'attribute vec2 meadowParams;',CUSTOM_VERTEX_UPDATE_POSITION:`
   #ifdef INSTANCES
   vec3 meadowRoot=(world*vec4(world3.xyz,1.0)).xyz;
   float meadowRange=max(meadowParams.x,1.0);
   float meadowFade=1.0-smoothstep(meadowRange*.70,meadowRange,distance(meadowEyeTime.xz,meadowRoot.xz));
   meadowFade*=1.0-smoothstep(9.0,16.0,abs(meadowEyeTime.y-meadowRoot.y));
   float meadowY=positionUpdated.y;
   float meadowPhase=meadowParams.y+meadowRoot.x*.23+meadowRoot.z*.19;
   vec2 meadowWind=vec2(sin(meadowEyeTime.w*1.38+meadowPhase),cos(meadowEyeTime.w*1.07+meadowPhase)*.45)*.10;
   positionUpdated.xz+=meadowWind*meadowY*meadowY;
   #ifdef NORMAL
   normalUpdated.y-=dot(normalUpdated.xz,meadowWind*(2.0*meadowY));
   normalUpdated=normalize(normalUpdated);
   #endif
   positionUpdated*=meadowFade;
   #endif
  `};
 }
}

type Sample={clump:MeadowClump;y?:number};
type LoadedTile={tile:MeadowTile;patches:MeadowPatch[];samples:Map<MeadowPatch,Sample[]>;used:number};
type Slot={mesh:Mesh;capacity:number;matrices:Float32Array;colors:Float32Array;params:Float32Array};
type Status='idle'|'loading'|'ready'|'missing-data'|'invalid-data'|'tile-error'|'disposed';

/** Opaque PBR grass: real sun/hemisphere/IBL lighting, metallic=0, roughness=.95,
 * emissive=black. Receives existing tree/building shadows. No alpha blending/
 * testing, textures, lights, collisions, shadow caster registration or reflection render targets. The world must keep
 * meshes out of its explicit shadow/reflection lists (as its current cull does).
 *
 * update is cheap between 3m movements; the shader reads the camera each bind.
 * Only nearby 3KB masks stream in, with a bounded 12-tile CPU cache. */
export class CityMeadow {
 private manifest:MeadowManifest|null=null;
 private readonly tileIndex=new Map<string,MeadowTile>();
 private readonly cache=new Map<string,LoadedTile>();
 private readonly pending=new Set<string>();
 private readonly failed=new Set<string>();
 private readonly slots:Slot[]=[];
 private material:PBRMaterial|null=null;
 private geometry:VertexData|null=null;
 private readonly abort=new AbortController();
 private readonly fetcher:typeof fetch;
 private readonly url:string;
 private readonly maxClumps:number;
 private readonly maxMeshes:number;
 private readonly cacheLimit:number;
 private status:Status='idle';
 private error:string|null=null;
 private requested:{x:number;z:number;aerial:boolean}|null=null;
 private lastX=Infinity;private lastZ=Infinity;private lastMode='';private lastCameraY=Infinity;private lastAerial=false;private lastRebuildTime=-Infinity;
 private dirty=true;private disposed=false;private revision=0;private initPromise:Promise<void>|null=null;
 private current={instances:0,drawCalls:0,triangles:0,patches:0,rejectedHeight:0,rebuilds:0,lastRebuildMs:0,mode:'driving',clamped:false};
 constructor(private scene:Scene,private heightAt:HeightAt=()=>0,options:MeadowOptions={}){
  this.url=options.manifestURL??'/city/grassland-v2/meadow.json';this.fetcher=options.fetcher??((input,init)=>fetch(input,init));
  this.maxClumps=Math.round(clamp(options.maxClumps??MEADOW_LIMITS.clumps,1,2500));
  this.maxMeshes=Math.round(clamp(options.maxMeshes??MEADOW_LIMITS.meshes,1,8));
  this.cacheLimit=Math.round(clamp(options.cacheTiles??12,this.maxMeshes,24));
  this.scene.onDisposeObservable.addOnce(()=>this.dispose());
 }
 get ready(){return !!this.manifest&&!this.disposed;}
 init():Promise<void>{
  if(this.initPromise)return this.initPromise;
  this.initPromise=this.loadManifest();return this.initPromise;
 }
 private async loadManifest(){
  if(this.disposed)return;this.status='loading';
  try{
   const response=await this.fetcher(this.url,{signal:this.abort.signal});
   if(!response.ok){this.status='missing-data';throw Error('草地采样清单加载失败：HTTP '+response.status);}
   const manifest=validateMeadowManifest(await response.json());if(this.disposed)return;
   this.manifest=manifest;for(const tile of manifest.tiles)this.tileIndex.set(tileKey(tile.ix,tile.iz),tile);
   const material=new PBRMaterial('city-meadow-pbr',this.scene);
   material.albedoColor=new Color3(.10,.15,.045);material.metallic=0;material.roughness=.95;
   material.emissiveColor=Color3.Black();material.environmentIntensity=.85;material.maxSimultaneousLights=3;
   material.backFaceCulling=false;material.twoSidedLighting=true;material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
   material.enableSpecularAntiAliasing=true;new MeadowMotion(material);this.material=material;
   applyLandscapeNightLight(this.scene,material,'grass');
   this.geometry=createMeadowGeometry(this.scene.useRightHandedSystem);this.status='ready';this.dirty=true;
   if(this.requested)this.update(this.requested.x,this.requested.z,this.requested.aerial);
  }catch(error){if(this.disposed)return;this.error=error instanceof Error?error.message:String(error);if(this.status!=='missing-data')this.status='invalid-data';}
 }
 private requestTile(tile:MeadowTile){
  if(this.pending.has(tile.id)||this.pending.size>=4||this.failed.has(tile.id)||!this.manifest)return;
  this.pending.add(tile.id);const manifest=this.manifest,base=this.url.slice(0,this.url.lastIndexOf('/')+1);
  void this.fetcher(base+tile.url,{signal:this.abort.signal}).then(async response=>{
   if(!response.ok)throw Error('草地采样分块加载失败：'+tile.id+' HTTP '+response.status);
   const patches=decodeMeadowTile(manifest,tile,new Uint8Array(await response.arrayBuffer()));if(this.disposed)return;
   this.cache.set(tile.id,{tile,patches,samples:new Map(),used:++this.revision});this.trimCache();this.dirty=true;
  }).catch(error=>{if(this.disposed)return;this.failed.add(tile.id);this.status='tile-error';this.error=error instanceof Error?error.message:String(error);}).finally(()=>{
   this.pending.delete(tile.id);this.dirty=true;if(!this.disposed&&this.requested)this.update(this.requested.x,this.requested.z,this.requested.aerial);
  });
 }
 private trimCache(){
  if(this.cache.size<=this.cacheLimit)return;
  const oldest=[...this.cache.values()].sort((a,b)=>a.used-b.used);
  for(const tile of oldest){if(this.cache.size<=this.cacheLimit)break;this.cache.delete(tile.tile.id);}
 }
 private makeSlot():Slot {
  const mesh=new Mesh('city_meadow_'+this.slots.length,this.scene);this.geometry!.applyToMesh(mesh,false);mesh.material=this.material;
  mesh.isPickable=false;mesh.checkCollisions=false;mesh.receiveShadows=true;mesh.useVertexColors=true;mesh.hasVertexAlpha=false;
  mesh.metadata={cityMeadow:true,excludeFromReflections:true,castsShadows:false};mesh.doNotSyncBoundingInfo=true;mesh.freezeWorldMatrix();mesh.setEnabled(false);
  const slot={mesh,capacity:0,matrices:new Float32Array(0),colors:new Float32Array(0),params:new Float32Array(0)};this.slots.push(slot);return slot;
 }
 update(x:number,z:number,aerial=false){
  if(this.disposed||!Number.isFinite(x)||!Number.isFinite(z))return;
  this.requested={x,z,aerial};if(!this.manifest)return;
  const camera=this.scene.activeCamera,cameraY=camera?.globalPosition.y??0,now=performance.now();
  if(!this.dirty&&aerial===this.lastAerial&&Math.abs(cameraY-this.lastCameraY)<.5&&Math.hypot(x-this.lastX,z-this.lastZ)<MEADOW_LIMITS.rebuildDistance)return;
  // Mask completions and camera travel share one upload window. Disabling for
  // aerial mode is immediate; ordinary movement never uploads every frame.
  if(!aerial&&this.lastMode==='driving'&&Math.abs(cameraY-this.lastCameraY)<2&&now-this.lastRebuildTime<70)return;
  const ground=this.heightAt(x,z),high=!!camera&&Number.isFinite(ground)&&cameraY-ground>MEADOW_LIMITS.highCamera;
  const mode=aerial?'aerial':high?'high-camera':'driving';this.current.mode=mode;
  this.lastX=x;this.lastZ=z;this.lastCameraY=cameraY;this.lastAerial=aerial;this.lastMode=mode;this.dirty=false;
  if(mode!=='driving'){
   for(const slot of this.slots)slot.mesh.setEnabled(false);
   this.current.instances=0;this.current.drawCalls=0;this.current.triangles=0;this.current.patches=0;return;
  }
  this.lastRebuildTime=now;const start=now;
  const radius=MEADOW_LIMITS.radius+MEADOW_LIMITS.rebuildDistance+this.manifest.safeRadius,tiles:LoadedTile[]=[];
  for(let ix=Math.floor((x-radius)/this.manifest.tileSize);ix<=Math.floor((x+radius)/this.manifest.tileSize);ix++)for(let iz=Math.floor((z-radius)/this.manifest.tileSize);iz<=Math.floor((z+radius)/this.manifest.tileSize);iz++){
   const tile=this.tileIndex.get(tileKey(ix,iz));if(!tile||!tile.count)continue;const loaded=this.cache.get(tile.id);
   if(loaded){loaded.used=++this.revision;tiles.push(loaded);}else this.requestTile(tile);
  }
  const selected:{tile:string;sample:Sample;priority:number}[]=[];let patchCount=0,rejectedHeight=0;
  for(const tile of tiles)for(const patch of tile.patches){
   if(Math.hypot(patch.x-x,patch.z-z)>radius)continue;patchCount++;
   let samples=tile.samples.get(patch);
   if(!samples){samples=createMeadowPatch(patch).map(clump=>({clump}));tile.samples.set(patch,samples);}
   for(const sample of samples){const d=Math.hypot(sample.clump.x-x,sample.clump.z-z);if(d<=sample.clump.range+MEADOW_LIMITS.rebuildDistance)selected.push({tile:tile.tile.id,sample,priority:d/sample.clump.range});}
  }
  // Keep all visible LODs ahead of the invisible 3m movement guard. In a very
  // dense mask the hard cap trims the furthest, already shrunken blades first.
  selected.sort((a,b)=>a.priority-b.priority||a.sample.clump.seed-b.sample.clump.seed);
  this.current.clamped=selected.length>this.maxClumps;selected.length=Math.min(selected.length,this.maxClumps);
  const groups=new Map<string,typeof selected>();for(const entry of selected){
   // Height sampling can traverse the relief triangles. Do it only after the
   // instance cap, then retain it while this small patch stays nearby.
   const sample=entry.sample;if(sample.y===undefined){sample.y=this.heightAt(sample.clump.x,sample.clump.z)-.004;if(!Number.isFinite(sample.y))rejectedHeight++;}if(!Number.isFinite(sample.y))continue;
   let group=groups.get(entry.tile);if(!group){if(groups.size>=this.maxMeshes)continue;group=[];groups.set(entry.tile,group);}group.push(entry);
  }
  const matrix=Matrix.Identity(),rotation=Quaternion.Identity(),scale=Vector3.One(),position=Vector3.Zero();let index=0,instances=0;
  for(const group of groups.values()){
   const slot=this.slots[index]??this.makeSlot();index++;const count=group.length;
   let allocated=false;if(count>slot.capacity){slot.capacity=Math.min(this.maxClumps,Math.ceil(count/128)*128);slot.matrices=new Float32Array(slot.capacity*16);slot.colors=new Float32Array(slot.capacity*4);slot.params=new Float32Array(slot.capacity*2);allocated=true;}
   for(let i=0;i<count;i++){
    const {clump:c,y}=group[i].sample;scale.set(c.width,c.height,c.width);Quaternion.RotationYawPitchRollToRef(c.yaw,0,0,rotation);position.set(c.x,y!,c.z);Matrix.ComposeToRef(scale,rotation,position,matrix);matrix.copyToArray(slot.matrices,i*16);
    const variation=.84+hash(c.seed+41)*.26,dry=c.soil*.22;slot.colors.set([Math.min(1.15,variation+dry),variation,variation*(.85+hash(c.seed+43)*.15),1],i*4);slot.params.set([c.range,hash(c.seed+47)*Math.PI*2],i*2);
   }
   if(allocated){slot.mesh.thinInstanceSetBuffer('matrix',slot.matrices,16,false);slot.mesh.thinInstanceSetBuffer('color',slot.colors,4,false);slot.mesh.thinInstanceSetBuffer('meadowParams',slot.params,2,false);}
   else{slot.mesh.thinInstanceBufferUpdated('matrix');slot.mesh.thinInstanceBufferUpdated('color');slot.mesh.thinInstanceBufferUpdated('meadowParams');}
   slot.mesh.thinInstanceCount=count;slot.mesh.thinInstanceRefreshBoundingInfo();
   const bounds=slot.mesh.getBoundingInfo();bounds.reConstruct(bounds.minimum.subtractFromFloats(.04,.004,.04),bounds.maximum.clone().addInPlaceFromFloats(.04,.004,.04));
   slot.mesh.setEnabled(true);instances+=count;
  }
  for(;index<this.slots.length;index++)this.slots[index].mesh.setEnabled(false);
  this.current.instances=instances;this.current.drawCalls=groups.size;this.current.triangles=instances*MEADOW_LIMITS.blades*5;this.current.patches=patchCount;
  // Binary masks may remain cached, but traversing a whole tile must not leave
  // 49K generated clumps per tile resident for the rest of a long city drive.
  for(const tile of this.cache.values())for(const patch of tile.samples.keys())if(Math.hypot(patch.x-x,patch.z-z)>radius+8)tile.samples.delete(patch);
  this.current.rejectedHeight+=rejectedHeight;this.current.rebuilds++;this.current.lastRebuildMs=performance.now()-start;this.trimCache();
 }
 setTerrainHeight(heightAt:HeightAt){this.heightAt=heightAt;for(const tile of this.cache.values())tile.samples.clear();this.dirty=true;this.lastX=Infinity;this.lastZ=Infinity;}
 get meshes():AbstractMesh[]{return this.slots.map(slot=>slot.mesh);}
 get stats(){return {...this.current,status:this.status,error:this.error,ready:this.ready,loadedTiles:this.cache.size,pendingTiles:this.pending.size,failedTiles:this.failed.size,sourceTiles:this.manifest?.tiles.length??0,sourceSHA:this.manifest?.sourceSHA??null,instanceBudget:this.maxClumps,drawCallBudget:this.maxMeshes,radius:MEADOW_LIMITS.radius,lighting:'PBR metallic-roughness; no emission',castsShadows:false,receivesShadows:true,reflections:false,collisions:false,alphaMode:'opaque',textures:0};}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.status='disposed';this.abort.abort();for(const slot of this.slots)slot.mesh.dispose(false,false);this.material?.dispose(false,false);
  this.slots.length=0;this.cache.clear();this.pending.clear();this.failed.clear();this.tileIndex.clear();this.manifest=null;this.current.instances=0;this.current.drawCalls=0;this.current.triangles=0;
 }
}
