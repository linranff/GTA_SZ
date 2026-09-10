import {Color3,Light,PBRMaterial,ShadowGenerator,SpotLight,Vector3,type AbstractMesh,type Material,type Scene} from '@babylonjs/core';
import type {ParkLight} from './city-coastal-infrastructure.ts';

type Mode='day'|'sunset'|'night';
type Eye={x:number;y:number;z:number};
type Fixture={id:string;kind:'road'|'park';x:number;z:number;height:number};
type Options={scene:Scene;lamps:number[][];parkLights:ParkLight[];heightAt:(x:number,z:number)=>number;casters:()=>AbstractMesh[];stableReceivers?:readonly AbstractMesh[]};
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
 /** Static meshes this far outside a fixture's range still join its receiver list, so a lamp
  * placed at any fixture never has to edit the list while the player drives past. */
 receiverMargin:8,
} as const;

function fade(value:number,full:number,end:number){const t=Math.max(0,Math.min(1,(value-full)/(end-full)));return 1-t*t*(3-2*t);}
function regionWeight(eye:Eye){return Math.max(...LOCAL_LIGHTING.regions.map(r=>fade(Math.hypot(eye.x-r.x,eye.z-r.z),r.inner,r.outer)));}
function activeMesh(mesh:AbstractMesh){return !mesh.isDisposed()&&mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0;}
function excludedReceiver(mesh:AbstractMesh){return mesh.name==='atmosphere'||/(?:sky|terrain_water|living-bay|bay-horizon|mountain|opposite[_-]shore|distant[_-]shore|horizon-water)/i.test(mesh.name+' '+(mesh.material?.name??''));}
function groundCaster(mesh:AbstractMesh){return /(?:^roads_|^terrain_|^ground_relief_|^city_meadow_|^rain[-_]|^shoreline|(?:^|[_:\s-])(?:grass|lawn|meadow|asphalt|paving|pavement|roadline|flower)(?:[_:\s.-]|$))/i.test(mesh.name+' '+(mesh.material?.name??''));}
/** Moving actors are classified by identity, never by where they happened to be. */
function movingActor(mesh:AbstractMesh){
 if(/^person_|^traffic-|^pedestrian|^wheel_|^brake_/i.test(mesh.name))return true;
 for(let p=mesh.parent;p;p=p.parent)if(/player-electric|player-tank|bay-flight|rider|pedestrian|traffic-/i.test(p.name))return true;
 return false;
}
function boundsDistance(mesh:AbstractMesh,p:Vector3){
 const b=mesh.getBoundingInfo().boundingBox,min=b.minimumWorld,max=b.maximumWorld;
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

/** Two reusable lamps that move between existing fixtures in the sample districts.
 *
 * Shader stability contract: a Babylon PBR program is keyed by the exact set of
 * lights affecting a mesh, so enabling/disabling a light, editing its
 * `includedOnlyMeshes`, toggling `shadowEnabled` or changing a material's
 * `maxSimultaneousLights` recompiles every affected material (tens of programs,
 * a 0.5–2 s stall with holes where meshes wait for the new effect). Everything
 * here therefore changes only light positions and intensities at run time:
 * both lamps stay enabled, receiver lists are decided once per mesh, the PCF
 * slot stays compiled, and light budgets are raised once and left alone. */
export function createLocalLighting({scene,lamps,parkLights,heightAt,casters,stableReceivers=[]}:Options){
 const stableMeshes=[...new Set(stableReceivers)],budgets=new Map<PBRMaterial,number>();
 const raiseBudget=(material:PBRMaterial,cap:number)=>{if(material.maxSimultaneousLights>=cap)return;if(!budgets.has(material))budgets.set(material,material.maxSimultaneousLights);material.maxSimultaneousLights=cap;};
 // The hero keeps one fixed cap: its two headlamps, the rear light and both
 // lamps must always fit, and an inherited oversized cap would not survive
 // the loader promotion below identically.
 const fixHeroBudget=()=>{for(const mesh of stableMeshes)for(const material of receiverMaterials(mesh))if(material.maxSimultaneousLights!==LOCAL_LIGHTING.vehicleLightBudget){if(!budgets.has(material))budgets.set(material,material.maxSimultaneousLights);material.maxSimultaneousLights=LOCAL_LIGHTING.vehicleLightBudget;}};
 fixHeroBudget();
 // Babylon's glTF loader raises EVERY scene material's light cap when an
 // unrelated GLB finishes loading. Restore our fixed caps before active-mesh
 // evaluation, even when simulation is paused for a photo.
 const budgetObserver=scene.onBeforeRenderObservable.add(fixHeroBudget);
 const fixtures:Fixture[]=[...lamps.map((l,i)=>({id:'road:'+i,kind:'road' as const,x:l[0]-l[2]*1.5,z:l[1]-l[3]*1.5,height:8.27})),...parkLights.map(p=>({id:p.id,kind:'park' as const,x:p.x,z:p.z,height:11.56}))]
  .filter(l=>LOCAL_LIGHTING.regions.some(r=>Math.hypot(l.x-r.x,l.z-r.z)<r.outer+LOCAL_LIGHTING.distanceEnd));
 const fixturePositions=fixtures.map(f=>new Vector3(f.x,heightAt(f.x,f.z)+f.height,f.z));
 const slots:Slot[]=Array.from({length:2},(_,i)=>{
  const light=new SpotLight('sample-local-lamp-'+i,Vector3.Zero(),new Vector3(0,-1,0),LOCAL_LIGHTING.angle,LOCAL_LIGHTING.exponent,scene);
  // A broad inner cone lights nearby foliage, rather than the physical mode's
  // narrow Gaussian core; glTF keeps inverse-square attenuation and a soft edge.
  light.falloffType=Light.FALLOFF_GLTF;light.innerAngle=LOCAL_LIGHTING.innerAngle;
  light.diffuse=Color3.FromArray([...LOCAL_LIGHTING.color]);light.specular=light.diffuse.clone();light.range=LOCAL_LIGHTING.range;light.intensity=0;
  light.shadowMinZ=LOCAL_LIGHTING.shadowNear;light.shadowMaxZ=LOCAL_LIGHTING.range;light.shadowEnabled=i===0;
  // Parked out of the way until a fixture is assigned; still enabled.
  light.position.set(0,-1e4,0);
  return {light,fixture:null,pending:null,changing:false,receivers:[]};
 });
 // Only slot zero owns a map. Reassigning its fixture reuses this same texture.
 const shadow=new ShadowGenerator(LOCAL_LIGHTING.shadowSize,slots[0].light);
 shadow.usePercentageCloserFiltering=true;shadow.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
 shadow.bias=LOCAL_LIGHTING.shadowBias;shadow.normalBias=LOCAL_LIGHTING.shadowNormalBias;
 const map=shadow.getShadowMap()!;map.refreshRate=0;
 let enabled=true,disposed=false,mode:Mode='sunset',nextScan=0,time=0;
 let eye:Eye={x:Infinity,y:0,z:Infinity},weight=0,candidateIds:string[]=[],selectedCasters:AbstractMesh[]=[],skippedCasterGroups=0,slotOverflows=0,shadowDrawActive=false;
 // Babylon removes the SHADOW defines for an empty resident renderList.
 // Retain one receiver reference to keep the PCF variant stable, while the
 // actual draw list is empty whenever the lamp contributes no light.
 map.getCustomRenderList=()=>shadowDrawActive?selectedCasters:[];

 // Receiver classification happens once per mesh. Static geometry qualifies by
 // resting within range (+margin) of any fixture of the two districts; moving
 // actors qualify by identity. The include list only ever grows; Babylon drops
 // disposed meshes from it on its own.
 const classified=new WeakSet<AbstractMesh>(),receivers:AbstractMesh[]=[];
 function nearFixture(mesh:AbstractMesh){const reach=LOCAL_LIGHTING.range+LOCAL_LIGHTING.receiverMargin;for(const p of fixturePositions)if(boundsDistance(mesh,p)<reach)return true;return false;}
 function classify(){
  let added=false;
  for(const mesh of scene.meshes){
   if(classified.has(mesh)||mesh.isDisposed())continue;
   // Streaming assets exist before their geometry/transform arrive; retry later.
   if(mesh.getTotalVertices()===0)continue;
   if(!mesh.isWorldMatrixFrozen)mesh.computeWorldMatrix(true);
   classified.add(mesh);
   if(excludedReceiver(mesh))continue;
   if(!(stableMeshes.includes(mesh)||movingActor(mesh)||nearFixture(mesh)))continue;
   receivers.push(mesh);added=true;
   if(!stableMeshes.includes(mesh))for(const material of receiverMaterials(mesh))raiseBudget(material,LOCAL_LIGHTING.receiverLightBudget);
  }
  if(added){for(const slot of slots)slot.light.includedOnlyMeshes=[...receivers];}
  const resident=receivers[0];if(resident&&map.renderList?.[0]!==resident)map.renderList=[resident];
 }
 classify();

 function selectCasters(){
  const slot=slots[0],groups=new Map<string,{meshes:AbstractMesh[];distance:number}>();skippedCasterGroups=0;
  if(!slot.fixture||!slot.receivers.length){selectedCasters=[];return;}
  for(const mesh of new Set(casters())){
   if(!activeMesh(mesh)||excludedReceiver(mesh)||groundCaster(mesh)||mesh.metadata?.castsShadows===false)continue;
   if(!mesh.isWorldMatrixFrozen)mesh.computeWorldMatrix(true);
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
  classify();slotOverflows=0;
  for(const slot of slots){
   slot.receivers=slot.fixture?receivers.filter(m=>{if(!activeMesh(m))return false;if(!m.isWorldMatrixFrozen)m.computeWorldMatrix(true);return boundsDistance(m,slot.light.position)<=LOCAL_LIGHTING.range;}):[];
   if(!slot.receivers.length)slot.light.intensity=0;
   for(const mesh of slot.receivers){
    const cap=stableMeshes.includes(mesh)?LOCAL_LIGHTING.vehicleLightBudget:LOCAL_LIGHTING.receiverLightBudget;
    if(scene.lights.filter(l=>l.isEnabled()&&l.canAffectMesh(mesh)).length>cap)slotOverflows++;
   }
  }
  selectCasters();
 }
 function place(slot:Slot,fixture:Fixture|null){
  slot.light.intensity=0;slot.fixture=fixture;slot.pending=null;slot.changing=false;
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
  shadowDrawActive=slots[0].light.intensity>0&&selectedCasters.length>0;
  // Fixtures are static. Reuse their depth map on alternate display frames;
  // reactivation/reassignment still resets the counter for an immediate draw.
  if(shadowDrawActive){if(map.refreshRate!==LOCAL_LIGHTING.shadowRefreshFrames){map.refreshRate=LOCAL_LIGHTING.shadowRefreshFrames;map.resetRefreshCounter();}}
  else map.refreshRate=0;
 }
 function disableNow(){
  for(const slot of slots){slot.light.intensity=0;slot.pending=null;slot.changing=false;slot.receivers=[];}
  selectedCasters=[];syncShadow();
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
    slot.light.intensity=0;
    if(slot.changing){place(slot,slot.pending);placed=true;}
   }
  }
  if(placed)refreshReceivers();syncShadow();
 }
 function setMode(next:Mode){if(disposed)return;mode=next;nextScan=0;if(mode==='day')disableNow();}
 function setEnabled(value:boolean){if(disposed)return;enabled=value;nextScan=0;if(!value)disableNow();}
 function dispose(){
  if(disposed)return;disableNow();disposed=true;scene.onDisposeObservable.remove(disposeObserver);scene.onBeforeRenderObservable.remove(budgetObserver);shadow.dispose();for(const slot of slots)slot.light.dispose();
  for(const [material,original] of budgets)if(scene.materials.includes(material))material.maxSimultaneousLights=original;
  budgets.clear();receivers.length=0;
 }
 const disposeObserver=scene.onDisposeObservable.addOnce(dispose);
 return {update,setMode,setEnabled,dispose,stats:()=>({enabled:enabled&&!disposed,mode,regionWeight:weight,fixtureCount:fixtures.length,candidateIds:[...candidateIds],newLights:disposed?0:2,newRenderTargets:disposed?0:1,stableReceivers:stableMeshes.length,receiverMeshes:receivers.length,activeLights:slots.filter(s=>s.light.intensity>0).length,activeShadowMaps:!disposed&&scene.shadowsEnabled&&slots[0].light.intensity>0&&selectedCasters.length>0&&slots[0].light.shadowEnabled?1:0,shadowSize:LOCAL_LIGHTING.shadowSize,shadowRefreshRate:map.refreshRate,casters:selectedCasters.length,skippedCasterGroups,receiverMaterials:budgets.size,maxReceiverLightCapacity:Math.max(0,...[...budgets.keys()].map(m=>m.maxSimultaneousLights)),hotSwapGuardMaterials:0,slotOverflows,shaderStable:true,slots:slots.map((s,i)=>({slot:i,fixtureId:s.fixture?.id??null,kind:s.fixture?.kind??null,pendingId:s.pending?.id??null,changing:s.changing,position:s.light.position.asArray(),intensity:s.light.intensity,enabled:s.light.isEnabled(),receivers:s.receivers.length,shadow:i===0&&scene.shadowsEnabled&&s.light.shadowEnabled}))})};
}
