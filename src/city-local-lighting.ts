import {Color3,Light,PBRMaterial,ShadowGenerator,SpotLight,Vector3,type AbstractMesh,type Material,type Scene} from '@babylonjs/core';
import type {ParkLight} from './city-coastal-infrastructure.ts';

type Mode='day'|'sunset'|'night';
type Eye={x:number;y:number;z:number};
type Fixture={id:string;kind:'road'|'park';x:number;z:number;height:number};
type Options={scene:Scene;lamps:number[][];parkLights:ParkLight[];heightAt:(x:number,z:number)=>number;casters:()=>AbstractMesh[];stableReceivers?:readonly AbstractMesh[]};
type Budget={base:number;applied:number};
type Slot={light:SpotLight;fixture:Fixture|null;pending:Fixture|null;changing:boolean;receivers:AbstractMesh[]};

/** Shared by both sample districts. Intensities are intentionally independent
 * of the existing public irradiance field, which remains the broad lamp fill. */
export const LOCAL_LIGHTING={
 regions:[{id:'bamboo',x:-5146,z:-1216.62,inner:130,outer:220},{id:'baypark',x:-2283.27,z:-794.82,inner:420,outer:600}],
 distanceFull:30,distanceEnd:72,heightFull:70,heightEnd:120,scanSeconds:.4,
 range:46,angle:2.6,innerAngle:1.5,exponent:1.6,nightIntensity:600,sunsetIntensity:60,
 color:[1,.82,.61] as const,transitionSeconds:.35,offThreshold:.035,switchAdvantage:12,
 shadowSize:1024,shadowRefreshFrames:2,shadowBias:.00015,shadowNormalBias:.035,shadowNear:.3,
 casterMeshBudget:48,receiverLightBudget:9,vehicleLightBudget:10,
} as const;

function fade(value:number,full:number,end:number){const t=Math.max(0,Math.min(1,(value-full)/(end-full)));return 1-t*t*(3-2*t);}
function regionWeight(eye:Eye){return Math.max(...LOCAL_LIGHTING.regions.map(r=>fade(Math.hypot(eye.x-r.x,eye.z-r.z),r.inner,r.outer)));}
function activeMesh(mesh:AbstractMesh){return !mesh.isDisposed()&&mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0;}
function excludedReceiver(mesh:AbstractMesh){return mesh.name==='atmosphere'||/(?:sky|terrain_water|living-bay|bay-horizon|mountain|opposite[_-]shore|distant[_-]shore|horizon-water)/i.test(mesh.name+' '+(mesh.material?.name??''));}
function groundCaster(mesh:AbstractMesh){return /(?:^roads_|^terrain_|^ground_relief_|^city_meadow_|^rain[-_]|^shoreline|(?:^|[_:\s-])(?:grass|lawn|meadow|asphalt|paving|pavement|roadline|flower)(?:[_:\s.-]|$))/i.test(mesh.name+' '+(mesh.material?.name??''));}
function boundsDistance(mesh:AbstractMesh,p:Vector3){
 mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox,min=b.minimumWorld,max=b.maximumWorld;
 return Math.hypot(Math.max(min.x-p.x,0,p.x-max.x),Math.max(min.y-p.y,0,p.y-max.y),Math.max(min.z-p.z,0,p.z-max.z));
}
function receiverMaterials(mesh:AbstractMesh):PBRMaterial[]{
 const material=mesh.material;if(material instanceof PBRMaterial)return [material];
 return ((material as Material&{subMaterials?:(Material|null)[]}|null)?.subMaterials??[]).filter((m):m is PBRMaterial=>m instanceof PBRMaterial);
}
/** Imported objects split by material must enter/leave the shadow list together.
 * City tile/landmark names and actor roots identify the existing asset groups. */
function casterGroup(mesh:AbstractMesh){
 for(let p=mesh.parent;p;p=p.parent)if(/player-electric|pedestrian|traffic-/i.test(p.name))return 'root:'+p.uniqueId;
 if(/^person_/.test(mesh.name))return 'pedestrians';
 if(/island_tree|open_island/.test(mesh.material?.name??''))return 'open-island-tree';
 const landscape=mesh.name.match(/^(.+)_landscape_/);if(landscape)return landscape[1];
 const match=mesh.name.match(/^(traffic-\d+|pedestrian|(?:detail_)?block_-?\d+_-?\d+|landmark_[a-z\d-]+|tree_[a-z\d-]+|open_tree_[a-z\d-]+)/i);
 if(match)return match[1];
 const material=mesh.material?.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return material?mesh.name.replace(new RegExp('[_:-]'+material+'(?:\\.\\d+)?$','i'),''):mesh.name;
}

export function createLocalLighting({scene,lamps,parkLights,heightAt,casters,stableReceivers=[]}:Options){
 // The hero must keep drawing while it crosses lamp/region boundaries. Keep
 // its two physical light slots and the PCF slot compiled even at zero power.
 // Changing uniforms is safe; swapping shader light counts mid-drive is not.
 const stableMeshes=[...new Set(stableReceivers)],stableMaterials=new Map<PBRMaterial,number>();
 for(const mesh of stableMeshes)for(const material of receiverMaterials(mesh))if(!stableMaterials.has(material)){
  stableMaterials.set(material,material.maxSimultaneousLights);material.maxSimultaneousLights=LOCAL_LIGHTING.vehicleLightBudget;
 }
 // Babylon's glTF loader raises EVERY scene material's light cap when an
 // unrelated GLB finishes loading. Facade streaming otherwise recompiles the
 // hero again (including its guarded glass). Restore our fixed cap before
 // active-mesh evaluation, even when simulation is paused for a photo.
 const stableObserver=stableMaterials.size?scene.onBeforeRenderObservable.add(()=>{
  for(const material of stableMaterials.keys())if(material.maxSimultaneousLights!==LOCAL_LIGHTING.vehicleLightBudget)material.maxSimultaneousLights=LOCAL_LIGHTING.vehicleLightBudget;
 }):null;
 const fixtures:Fixture[]=[...lamps.map((l,i)=>({id:'road:'+i,kind:'road' as const,x:l[0]-l[2]*1.5,z:l[1]-l[3]*1.5,height:8.27})),...parkLights.map(p=>({id:p.id,kind:'park' as const,x:p.x,z:p.z,height:11.56}))]
  .filter(l=>LOCAL_LIGHTING.regions.some(r=>Math.hypot(l.x-r.x,l.z-r.z)<r.outer+LOCAL_LIGHTING.distanceEnd));
 const slots:Slot[]=Array.from({length:2},(_,i)=>{
  const light=new SpotLight('sample-local-lamp-'+i,Vector3.Zero(),new Vector3(0,-1,0),LOCAL_LIGHTING.angle,LOCAL_LIGHTING.exponent,scene);
  // A broad inner cone lights nearby foliage, rather than the physical mode's
  // narrow Gaussian core; glTF keeps inverse-square attenuation and a soft edge.
  light.falloffType=Light.FALLOFF_GLTF;light.innerAngle=LOCAL_LIGHTING.innerAngle;
  light.diffuse=Color3.FromArray([...LOCAL_LIGHTING.color]);light.specular=light.diffuse.clone();light.range=LOCAL_LIGHTING.range;light.intensity=0;light.includedOnlyMeshes=[...stableMeshes];light.setEnabled(stableMeshes.length>0);
  light.shadowMinZ=LOCAL_LIGHTING.shadowNear;light.shadowMaxZ=LOCAL_LIGHTING.range;light.shadowEnabled=i===0&&stableMeshes.length>0;
  return {light,fixture:null,pending:null,changing:false,receivers:[]};
 });
 // Only slot zero owns a map. Reassigning its fixture reuses this same texture.
 const shadow=new ShadowGenerator(LOCAL_LIGHTING.shadowSize,slots[0].light);
 shadow.usePercentageCloserFiltering=true;shadow.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
 shadow.bias=LOCAL_LIGHTING.shadowBias;shadow.normalBias=LOCAL_LIGHTING.shadowNormalBias;
 const map=shadow.getShadowMap()!;map.renderList=stableMeshes.slice(0,1);map.refreshRate=0;
 const budgets=new Map<PBRMaterial,Budget>(),hotSwapGuards=new Map<PBRMaterial,boolean>();let enabled=true,disposed=false,mode:Mode='sunset',nextScan=0,time=0;
 let eye:Eye={x:Infinity,y:0,z:Infinity},weight=0,candidateIds:string[]=[],selectedCasters:AbstractMesh[]=[],skippedCasterGroups=0,slotOverflows=0,shadowDrawActive=false;
 // Babylon also removes SHADOW defines for an empty resident renderList.
 // Retain one existing hero reference to keep its PCF variant stable, while
 // the actual draw list is empty whenever the lamp contributes no light.
 map.getCustomRenderList=()=>shadowDrawActive?selectedCasters:[];

 function setSlotEnabled(slot:Slot,value:boolean){slot.light.setEnabled(value||stableMeshes.length>0);}
 function bindReceivers(slot:Slot){
  const receivers=[...new Set([...slot.receivers,...stableMeshes])];
  // An empty Babylon include-list means all meshes. Only clear that list
  // when a permanently bound hero still makes it explicitly nonempty.
  if(receivers.length&&(receivers.length!==slot.light.includedOnlyMeshes.length||receivers.some((m,i)=>m!==slot.light.includedOnlyMeshes[i])))slot.light.includedOnlyMeshes=receivers;
 }

 function restoreBudgets(){
  for(const [material,budget] of budgets)if(scene.materials.includes(material)&&material.maxSimultaneousLights===budget.applied)material.maxSimultaneousLights=budget.base;
  budgets.clear();
 }
 function applyBudgets(){
  const wanted=new Map<PBRMaterial,{required:number;cap:number}>();slotOverflows=0;
  for(const slot of slots)for(const mesh of slot.receivers){
   const count=scene.lights.filter(l=>!slots.some(s=>s.light===l)&&l.isEnabled()&&l.canAffectMesh(mesh)).length+slots.filter(s=>s.receivers.includes(mesh)).length;
   const car=scene.lights.some(l=>l.name==='soft-vehicle-fill'&&l.canAffectMesh(mesh));
   const cap=car?LOCAL_LIGHTING.vehicleLightBudget:LOCAL_LIGHTING.receiverLightBudget;
   if(count>cap)slotOverflows++;
   for(const material of receiverMaterials(mesh)){
    if(stableMaterials.has(material))continue;
    const previous=wanted.get(material);
    wanted.set(material,{required:Math.max(previous?.required??0,Math.min(cap,count)),cap:Math.max(previous?.cap??0,cap)});
   }
  }
  for(const [material,budget] of budgets)if(!wanted.has(material)){
   if(scene.materials.includes(material)&&material.maxSimultaneousLights===budget.applied)material.maxSimultaneousLights=budget.base;
   budgets.delete(material);
  }
  for(const [material,{required,cap}] of wanted){
   // Light enable/disable and PCF slot changes must not bind the new lights to
   // an older effect while its replacement compiles. Keep this guard through
   // A/B-off and region exit: those transitions also change sampler defines.
   if(!hotSwapGuards.has(material))hotSwapGuards.set(material,material.allowShaderHotSwapping);
   material.allowShaderHotSwapping=false;
   let budget=budgets.get(material);
   if(!budget){budget={base:material.maxSimultaneousLights,applied:material.maxSimultaneousLights};budgets.set(material,budget);}
   // A mode owner may have restored its own baseline since the last scan.
   if(material.maxSimultaneousLights!==budget.applied)budget.base=material.maxSimultaneousLights;
   // Preserve the external baseline for restoration, but do not carry an old
   // oversized cap into this bounded pass. Shared car/body materials use the
   // largest cap required by any of their current local receivers.
   const value=Math.min(cap,Math.max(budget.base,required));if(material.maxSimultaneousLights!==value)material.maxSimultaneousLights=value;budget.applied=value;
  }
 }
 function selectCasters(){
  const slot=slots[0],groups=new Map<string,{meshes:AbstractMesh[];distance:number}>();skippedCasterGroups=0;
  if(!slot.fixture||!slot.receivers.length){selectedCasters=[];return;}
  for(const mesh of new Set(casters())){
   if(!activeMesh(mesh)||excludedReceiver(mesh)||groundCaster(mesh)||mesh.metadata?.castsShadows===false)continue;
   const distance=boundsDistance(mesh,slot.light.position);if(distance>LOCAL_LIGHTING.range)continue;
   const key=casterGroup(mesh),group=groups.get(key)??{meshes:[],distance};group.meshes.push(mesh);group.distance=Math.min(group.distance,distance);groups.set(key,group);
  }
  const selected:AbstractMesh[]=[];
  for(const group of [...groups.values()].sort((a,b)=>a.distance-b.distance)){
   if(selected.length+group.meshes.length>LOCAL_LIGHTING.casterMeshBudget){skippedCasterGroups++;continue;}
   selected.push(...group.meshes);
  }
  selectedCasters=selected;
 }
 function refreshReceivers(){
  const meshes=scene.meshes.filter(m=>activeMesh(m)&&!excludedReceiver(m));
  for(const slot of slots){
   const receivers=slot.fixture?meshes.filter(m=>boundsDistance(m,slot.light.position)<=LOCAL_LIGHTING.range):[];
   slot.receivers=receivers;
   if(!receivers.length){slot.light.intensity=0;setSlotEnabled(slot,false);}
   // Empty means "all meshes" in Babylon; keep a stale nonempty list while off.
   bindReceivers(slot);
  }
  applyBudgets();selectCasters();
 }
 function place(slot:Slot,fixture:Fixture|null){
  setSlotEnabled(slot,false);slot.light.intensity=0;slot.fixture=fixture;slot.pending=null;slot.changing=false;
  if(fixture)slot.light.position.set(fixture.x,heightAt(fixture.x,fixture.z)+fixture.height,fixture.z);
 }
 function scan(){
  const ranked=weight>0&&enabled&&mode!=='day'?fixtures.map(f=>({f,d:Math.hypot(eye.x-f.x,eye.z-f.z)})).filter(q=>q.d<LOCAL_LIGHTING.distanceEnd).sort((a,b)=>a.d-b.d):[];
  candidateIds=ranked.slice(0,8).map(q=>q.f.id);const reserved=new Set<string>();
  // Reserve each current fixture before choosing replacements, keeping the two
  // lamps distinct even while the other slot is fading toward a new position.
  for(const slot of slots){if(slot.fixture)reserved.add(slot.fixture.id);if(slot.pending)reserved.add(slot.pending.id);}
  for(const slot of slots){
   if(slot.changing){if(slot.pending)reserved.add(slot.pending.id);continue;}
   const current=slot.fixture?ranked.find(q=>q.f.id===slot.fixture!.id):null;
   const best=ranked.find(q=>!reserved.has(q.f.id));
   const next=current&&(!best||current.d<=best.d+LOCAL_LIGHTING.switchAdvantage)?current.f:best?.f??null;
   if(next?.id===slot.fixture?.id)continue;
   if(next)reserved.add(next.id);
   if(slot.light.intensity<=LOCAL_LIGHTING.offThreshold)place(slot,next);
   else{slot.pending=next;slot.changing=true;}
  }
  refreshReceivers();
 }
 function syncShadow(){
  const active=slots[0].light.isEnabled()&&slots[0].light.intensity>0&&selectedCasters.length>0;
  shadowDrawActive=active;
  const shadowSlot=active||stableMeshes.length>0;
  if(slots[0].light.shadowEnabled!==shadowSlot)slots[0].light.shadowEnabled=shadowSlot;
  // Fixtures are static. Reuse their depth map on alternate display frames;
  // reactivation/reassignment still resets the counter for an immediate draw.
  if(active){map.renderList=selectedCasters;if(map.refreshRate!==LOCAL_LIGHTING.shadowRefreshFrames){map.refreshRate=LOCAL_LIGHTING.shadowRefreshFrames;map.resetRefreshCounter();}}
  else{map.renderList=stableMeshes.slice(0,1);map.refreshRate=0;}
 }
 function disableNow(){
  for(const slot of slots){slot.light.intensity=0;setSlotEnabled(slot,false);slot.pending=null;slot.changing=false;slot.receivers=[];bindReceivers(slot);}
  selectedCasters=[];syncShadow();restoreBudgets();
 }
 function update(dt:number,nextEye:Eye,force=false){
  if(disposed)return;eye={x:nextEye.x,y:nextEye.y,z:nextEye.z};time+=Math.max(0,dt);
  weight=regionWeight(eye)*fade(Math.max(0,eye.y-heightAt(eye.x,eye.z)),LOCAL_LIGHTING.heightFull,LOCAL_LIGHTING.heightEnd);
  if(!enabled||mode==='day'){disableNow();return;}
  if(force||time>=nextScan){nextScan=time+LOCAL_LIGHTING.scanSeconds;scan();}
  let placed=false;const smoothing=1-Math.exp(-Math.max(0,dt)/LOCAL_LIGHTING.transitionSeconds);
  for(const slot of slots){
   const distance=slot.fixture?Math.hypot(eye.x-slot.fixture.x,eye.z-slot.fixture.z):Infinity;
   const target=slot.fixture&&!slot.changing&&slot.receivers.length?(mode==='night'?LOCAL_LIGHTING.nightIntensity:LOCAL_LIGHTING.sunsetIntensity)*weight*fade(distance,LOCAL_LIGHTING.distanceFull,LOCAL_LIGHTING.distanceEnd):0;
   if(target===0)slot.light.intensity=Math.max(0,slot.light.intensity-LOCAL_LIGHTING.nightIntensity*Math.max(0,dt)/LOCAL_LIGHTING.transitionSeconds);
   else slot.light.intensity+=(target-slot.light.intensity)*smoothing;
   if(slot.light.intensity<=LOCAL_LIGHTING.offThreshold){
    slot.light.intensity=0;setSlotEnabled(slot,false);
    if(slot.changing){place(slot,slot.pending);placed=true;}
   }else if(slot.receivers.length&&!slot.light.isEnabled())slot.light.setEnabled(true);
  }
  if(placed)refreshReceivers();syncShadow();
  if(weight===0&&slots.every(s=>s.light.intensity===0))restoreBudgets();
 }
 function setMode(next:Mode){if(disposed)return;mode=next;nextScan=0;if(mode==='day')disableNow();}
 function setEnabled(value:boolean){if(disposed)return;enabled=value;nextScan=0;if(!value)disableNow();}
 function dispose(){
  if(disposed)return;disableNow();disposed=true;scene.onDisposeObservable.remove(disposeObserver);shadow.dispose();for(const slot of slots)slot.light.dispose();
  for(const [material,original] of hotSwapGuards)if(scene.materials.includes(material)&&material.allowShaderHotSwapping===false)material.allowShaderHotSwapping=original;
  for(const [material,original] of stableMaterials)if(scene.materials.includes(material)&&material.maxSimultaneousLights===LOCAL_LIGHTING.vehicleLightBudget)material.maxSimultaneousLights=original;
  hotSwapGuards.clear();scene.onBeforeRenderObservable.remove(stableObserver);stableMaterials.clear();
 }
 const disposeObserver=scene.onDisposeObservable.addOnce(dispose);
 return {update,setMode,setEnabled,dispose,stats:()=>({enabled:enabled&&!disposed,mode,regionWeight:weight,fixtureCount:fixtures.length,candidateIds:[...candidateIds],newLights:disposed?0:2,newRenderTargets:disposed?0:1,stableReceivers:stableMeshes.length,activeLights:slots.filter(s=>s.light.isEnabled()&&s.light.intensity>0).length,activeShadowMaps:!disposed&&scene.shadowsEnabled&&slots[0].light.isEnabled()&&slots[0].light.intensity>0&&selectedCasters.length>0&&slots[0].light.shadowEnabled?1:0,shadowSize:LOCAL_LIGHTING.shadowSize,shadowRefreshRate:map.refreshRate,casters:selectedCasters.length,skippedCasterGroups,receiverMaterials:budgets.size,maxReceiverLightCapacity:Math.max(0,...[...budgets.keys()].map(m=>m.maxSimultaneousLights)),hotSwapGuardMaterials:hotSwapGuards.size,slotOverflows,slots:slots.map((s,i)=>({slot:i,fixtureId:s.fixture?.id??null,kind:s.fixture?.kind??null,pendingId:s.pending?.id??null,changing:s.changing,position:s.light.position.asArray(),intensity:s.light.intensity,enabled:s.light.isEnabled(),receivers:s.receivers.length,shadow:i===0&&scene.shadowsEnabled&&s.light.shadowEnabled}))})};
}
