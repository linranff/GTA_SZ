import {characterProgress,LOCAL_CHARACTERS} from './city-local-characters.ts';
import {Color3,ImportMeshAsync,PBRMaterial,PointLight,Quaternion,ShadowGenerator,SpotLight,TransformNode,Vector3,type AbstractMesh,type AnimationGroup,type Scene} from '@babylonjs/core';
import {cafeLayout,type CafeSpec,type CafeCollider} from './city-cafe-layout.ts';
import {replaceCafeCharacters,type CafeCharacterStatus} from './city-cafe-characters.ts';
import {createCafeStaffMotion} from './city-cafe-staff-motion.ts';
import type {DrivingWorld} from './city-world.ts';
import './city-bamboo-cafe.css';
type Mode='day'|'sunset'|'night';
type Manifest={spec:CafeSpec;colliders:CafeCollider[];models:{id:string;file:string;bytes:number;triangles:number;meshes:number}[];lighting:{interiorPoints:number[][]}};

/** Exterior is cheap and immediately visible. The furnished room and adult
 * staff stream once on approach; their meshes/lights/animation sleep far away.
 * No existing city asset or shared architecture material is rewritten. */
export async function createBambooCafe(scene:Scene,heightAt:(x:number,z:number)=>number,onMeshes:(meshes:AbstractMesh[])=>void){
 const response=await fetch('/city/bamboo-cafe/manifest.json');
 if(!response.ok)throw Error('月白咖啡馆清单加载失败');
 const manifest=await response.json() as Manifest,spec=manifest.spec;
 if(spec.staff.some(s=>s.age<20))throw Error('Cafe staff must be adult characters');
 const floorBase=heightAt(spec.site.x,spec.site.z);
 if(!Number.isFinite(floorBase))throw Error('Cafe ground height is unavailable');
 const layout=cafeLayout(spec,manifest.colliders,floorBase);
 const root=new TransformNode('bamboo-cafe',scene);root.position.set(spec.site.x,floorBase,spec.site.z);root.rotation.y=spec.site.heading;
 const exterior:AbstractMesh[]=[],interior:AbstractMesh[]=[],materials=new Set<PBRMaterial>(),animations:AnimationGroup[]=[];
 const lampMaterials=new Map<PBRMaterial,Color3>();
 const lights:(PointLight|SpotLight)[]=[];
 let characterStatus:CafeCharacterStatus={loaded:false,error:null,assignments:{},triangles:0,source:'user-provided Tripo GLBs'};
 const staffMotion=createCafeStaffMotion(spec,manifest.colliders);
 let staffRig:Awaited<ReturnType<typeof replaceCafeCharacters>>|null=null;
 let shadow:ShadowGenerator|null=null,mode:Mode='sunset',pending:Promise<void>|null=null,loaded=false,disposed=false,active=false,error:string|null=null;
 const loadPart=async(id:'exterior'|'interior')=>{
  const result=await ImportMeshAsync('/city/bamboo-cafe/'+id+'.glb',scene);
  if(disposed){for(const m of result.meshes)m.dispose();for(const a of result.animationGroups)a.dispose();return;}
  const assetRoot=result.meshes[0];assetRoot.rotationQuaternion=Quaternion.Identity();assetRoot.parent=root;
  const part=id==='exterior'?exterior:interior;
  for(const mesh of result.meshes){
   if(!mesh.getTotalVertices())continue;
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.computeWorldMatrix(true);part.push(mesh);
   const mat=mesh.material;
   if(mat instanceof PBRMaterial){
    materials.add(mat);mat.maxSimultaneousLights=6;mat.environmentIntensity=.62;mat.forceIrradianceInFragment=true;mat.enableSpecularAntiAliasing=true;
    for(const t of mat.getActiveTextures())t.anisotropicFilteringLevel=8;
    if(mat.name.includes('cafe_glass')){mat.alpha=.13;mat.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;mat.needDepthPrePass=true;mat.backFaceCulling=false;mat.roughness=.14;}
    if(mat.name.includes('warm_fixture'))lampMaterials.set(mat,mat.emissiveColor.clone());
   }
   // The four room fixtures have their own slots. Vehicle and street lights
   // must not displace them merely because those lights were created first.
   if(id==='interior')for(const light of scene.lights)if(!lights.includes(light as PointLight)&&!/^(sunset|sky-bounce)$/.test(light.name))light.excludedMeshes.push(mesh);
  }
  for(const animation of result.animationGroups){animations.push(animation);animation.stop();}
  onMeshes(id==='interior'?part.filter(m=>!m.name.startsWith('staff_')):part);
  for(const mesh of part)if(!mesh.name.includes('staff_'))mesh.freezeWorldMatrix();
 };
 await loadPart('exterior');
 function setMode(next:Mode){
  mode=next;
  for(const [mat,color]of lampMaterials){mat.emissiveColor.copyFrom(color);mat.emissiveIntensity=next==='day'?.8:next==='sunset'?1.6:2.4;}
  applyLightPower();
 }
 // Room lights stay enabled and go dark by intensity when the player is far:
 // enabling/disabling a light recompiles every cafe material it touches.
 function applyLightPower(){for(const light of lights)light.intensity=active?(mode==='day'?12:mode==='sunset'?19:25)*(light instanceof SpotLight?1.25:1):0;}
 let characterPending:Promise<void>|null=null;
 async function retryCharacters(){
  if(disposed||staffRig||!interior.length)return;
  if(characterPending)return characterPending;
  characterPending=(async()=>{
   try{
    const replacement=await replaceCafeCharacters(scene,spec,interior,()=>disposed);
    if(disposed){replacement.dispose();return;}
    staffRig=replacement;
    // The imported service clips own the bones now. The original cafe GLB's
    // whole-root sway would overwrite the heading of moving employees.
    for(const animation of animations)animation.dispose();animations.length=0;
    characterStatus=replacement.status;
    for(let i=interior.length-1;i>=0;i--)if(interior[i].isDisposed())interior.splice(i,1);
    for(const mesh of replacement.meshes){
     interior.push(mesh);
     if(mesh.material instanceof PBRMaterial)materials.add(mesh.material);
     for(const light of scene.lights)if(!lights.includes(light as PointLight)&&!/^(sunset|sky-bounce)$/.test(light.name))light.excludedMeshes.push(mesh);
    }
    onMeshes(replacement.meshes);
   }catch(e){characterStatus.error=String(e);if(LOCAL_CHARACTERS)characterProgress('cafe','error',0,'夜兰加载失败 · 可重试');onMeshes(interior.filter(m=>m.name.startsWith('staff_')));console.error('Cafe character replacement:',e);}

   for(const light of lights)light.includedOnlyMeshes=[...interior,...exterior];
   if(shadow)shadow.getShadowMap()!.renderList=interior.filter(m=>!m.material?.name.includes('glass'));
  })().finally(()=>{characterPending=null;});
  return characterPending;
 }
 async function ensureInterior(){
  if(loaded||disposed)return;
  if(pending)return pending;
  pending=(async()=>{
   await loadPart('interior');if(disposed)return;
   await retryCharacters();
   for(const [i,p]of manifest.lighting.interiorPoints.entries()){
    const light=i===2?new SpotLight('cafe-key-light',Vector3.Zero(),new Vector3(0,-1,0),2.5,.9,scene):new PointLight('cafe-room-light-'+i,Vector3.Zero(),scene);
    light.parent=root;light.position.set(p[0],p[2],p[1]);light.diffuse=new Color3(1,.90,.77);light.range=15;light.radius=.62;light.includedOnlyMeshes=[...interior,...exterior];lights.push(light);
    if(light instanceof SpotLight){shadow=new ShadowGenerator(1024,light);shadow.useBlurExponentialShadowMap=true;shadow.blurKernel=16;shadow.bias=.0003;shadow.normalBias=.012;shadow.getShadowMap()!.renderList=interior.filter(m=>!m.material?.name.includes('glass'));}
   }
   loaded=true;setMode(mode);
   for(const m of interior)m.setEnabled(active);
   if(active)for(const animation of animations)animation.start(true,.65);
  })().catch(e=>{error=String(e);console.error('Cafe interior:',e);pending=null;throw e;});
  return pending;
 }
 function update(x:number,z:number,playerPosition:{x:number;z:number}|null=null){
  if(disposed)return;
  const camera=scene.activeCamera;
  document.body.classList.toggle('inside-bamboo-cafe',!!camera&&layout.inside(x,z)&&camera.position.y>floorBase&&camera.position.y<floorBase+3.8);
  const d=Math.hypot(x-spec.site.x,z-spec.site.z);
  if(d<260&&!loaded&&!pending&&!error)void ensureInterior().catch(()=>{});
  const near=d<120;
  if(active!==near){active=near;for(const m of interior)m.setEnabled(near);applyLightPower();for(const a of animations){if(near)a.start(true,.65);else a.pause();}}
  // Newly loaded parts also need the current visibility state applied.
  for(const m of exterior)if(m.isEnabled()!==(d<1400))m.setEnabled(d<1400);
  const animate=near&&d<65&&!!camera&&Math.abs(camera.position.y-floorBase)<16;
  const player=animate&&playerPosition&&layout.inside(playerPosition.x,playerPosition.z)?layout.local(playerPosition.x,playerPosition.z):null;
  const poses=staffMotion.update(scene.getEngine().getDeltaTime()/1000,player,animate&&!!staffRig);
  if(staffRig){
   for(const pose of poses){const employee=spec.staff.find(s=>s.id===pose.id)!;employee.position[0]=pose.x;employee.position[1]=pose.z;}
   staffRig.update(poses,animate);
  }
 }
 function prompt(world:DrivingWorld){
  if(world.paused||world.observer.active)return null;
  const p=world.actor;
  if(layout.inside(p.x,p.z)&&world.walk?.active){
   const staff=spec.staff.find(s=>{const at=layout.world(s.position[0],s.position[1]);return Math.hypot(p.x-at.x,p.z-at.z)<2.1;});
   if(staff)return `按 E · 与${staff.name}交谈 · ${staff.role}`;
   const at=layout.world(2.3,2.2);if(Math.hypot(p.x-at.x,p.z-at.z)<3.1)return '按 E · 看看月白今日菜单';
   return null;
  }
  const d=Math.min(Math.hypot(p.x-layout.door.x,p.z-layout.door.z),Math.hypot(p.x-spec.site.arrival[0],p.z-spec.site.arrival[1]));
  return d<(world.walk?.active?4:8)?'按 E · 进入月白女仆咖啡馆':null;
 }
 async function enter(world:DrivingWorld){
  if(!world.walk||disposed)return;
  world.onMessage?.(loaded?'欢迎来到月白':'正在打开月白的门……');
  try{await ensureInterior();}catch{world.onMessage?.('咖啡馆加载失败，请刷新后再试');return;}
  if(!await world.ensureRider())return;
  if(Math.hypot(world.actor.x-spec.site.x,world.actor.z-spec.site.z)>80)world.travel(layout.landmark);
  if(world.observer.active)world.exitPhoto();world.cancelAutoDrive('visit-cafe');
  world.state.speed=0;world.state.steer=0;world.paused=false;world.keys.clear();
  world.walkFirstPerson=true;
  Object.assign(world.walk,{active:true,x:layout.entry.x,z:layout.entry.z,yaw:spec.site.heading,pitch:0,moving:false,speed:0});
  update(layout.entry.x,layout.entry.z);world.cull();world.vegetation();
  world.onMessage?.('月白 · 欢迎光临。WASD 自由走动，拖动看四周，靠近店员按 E 交谈。');
 }
 function interact(world:DrivingWorld){
  if(!prompt(world))return false;
  const p=world.actor;
  if(layout.inside(p.x,p.z)&&world.walk?.active){
   const staff=spec.staff.find(s=>{const at=layout.world(s.position[0],s.position[1]);return Math.hypot(p.x-at.x,p.z-at.z)<2.1;});
   world.onMessage?.(staff?`${staff.name}：“${staff.line}”`:'月白今日精选 · 海盐拿铁 ¥32 · 手冲 ¥38 · 草莓千层 ¥46 · 可露丽 ¥24');
  }else if(Math.abs(p.speed)>1)world.onMessage?.('先停稳，再进店坐坐。');else void enter(world);
  return true;
 }
 function dispose(){if(disposed)return;disposed=true;document.body.classList.remove('inside-bamboo-cafe');shadow?.dispose();for(const l of lights)l.dispose();for(const a of animations)a.dispose();staffRig?.dispose();root.dispose(false);for(const m of materials)m.dispose(false,true);}
 scene.onDisposeObservable.addOnce(dispose);
 return {retryCharacters,layout,exterior,interior,enter,interact,prompt,update,setMode,dispose,ensureInterior,get stats(){return {name:spec.name,fictional:true,loaded,loading:!!pending&&!loaded,active,error,site:spec.site,entry:layout.entry,floorBase,models:manifest.models,characters:{...characterStatus,activity:staffMotion.agents.map(({id,x,z,speed,greeting,wave,walk})=>({id,x,z,speed,greeting,wave,walk})),meshes:interior.filter(m=>m.name.startsWith('staff_user_')).map(m=>({name:m.name,enabled:m.isEnabled(),bounds:[m.getBoundingInfo().boundingBox.minimumWorld.asArray(),m.getBoundingInfo().boundingBox.maximumWorld.asArray()]}))},visibleInteriorMeshes:interior.filter(m=>m.isEnabled()).length,localLights:lights.filter(l=>l.isEnabled()).length,staff:spec.staff.map(({id,name,age,role,outfit,position})=>({id,name,age,role,outfit,position:layout.world(position[0],position[1])})),mode};}};
}
