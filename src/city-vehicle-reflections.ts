import {BackgroundMaterial,Color3,Frustum,PBRMaterial,ReflectionProbe,RenderingGroup,Vector3,type AbstractMesh,type BaseTexture,type Camera,type Scene,type SubMesh,type TransformNode} from '@babylonjs/core';

/** One small, movement-triggered cube for the hero. The main camera never
 * triggers a capture: a parked car's reflections remain anchored in the street.
 * Distant views use the existing HDR. No pedestrians/instanced trees/hero enter
 * this bounded list, and a per-face frustum rejects invisible geometry. */
export function createVehicleReflections(scene:Scene,car:TransformNode,meshes:readonly AbstractMesh[],camera:Camera,candidates:()=>readonly AbstractMesh[]){
 const materials=[...new Set(meshes.map(m=>m.material))].filter((m):m is PBRMaterial=>m instanceof PBRMaterial&&/^(carpaint|car_glass)(?:\.\d+)?$/.test(m.name));
 const excluded=new Set(meshes),sky=scene.getMeshByName('atmosphere');
 const probe=new ReflectionProbe('hero-street-reflection',128,scene,true,true,true),texture=probe.cubeTexture;
 texture.refreshRate=0;texture.renderParticles=false;texture.renderSprites=false;texture.lodGenerationScale=.8;
 probe.renderList=[];
 const skyMaterial=new BackgroundMaterial('hero-reflection-radiance',scene);
 skyMaterial.backFaceCulling=false;skyMaterial.disableDepthWrite=true;skyMaterial.useRGBColor=false;skyMaterial.primaryColor=Color3.White();skyMaterial.maxSimultaneousLights=0;
 const skyFirst=(a:SubMesh,b:SubMesh)=>Number(b.getMesh()===sky)-Number(a.getMesh()===sky)||RenderingGroup.PainterSortCompare(a,b);
 texture.setRenderingOrder(0,skyFirst);
 texture.getCustomRenderList=(_face,list,length)=>{
  if(!list)return null;const planes=Frustum.GetPlanes(scene.getTransformMatrix());
  return list.slice(0,length).filter(m=>m===sky||m.isInFrustum(planes));
 };
 let renderedFaces=0;
 if(sky){skyMaterial.clipPlane=sky.material?.clipPlane??null;texture.setMaterialForRendering(sky,skyMaterial);}
 const savedSkyPosition=new Vector3();
 texture.onBeforeBindObservable.add(()=>{
  renderedFaces=0;
  if(sky){savedSkyPosition.copyFrom(sky.position);skyMaterial.reflectionTexture=scene.environmentTexture;}
 });
 texture.onBeforeRenderObservable.add(()=>{
  if(sky){sky.position.copyFrom(probe.position).subtractInPlace(camera.globalPosition);sky.computeWorldMatrix(true);}
 });
 // Babylon also emits bind/render notifications during shader readiness
 // checks. A clear occurs only for a real framebuffer draw, so readiness must
 // not count as a capture or expose an unrendered cube to the car.
 texture.onClearObservable.add(engine=>{renderedFaces++;engine.clear(scene.clearColor,true,true,true);});
 let enabled=true,disposed=false,visible=false,captures=0,queued=false,lastTime=-Infinity,environment:BaseTexture|null=null,triangles=0;
 const lastPosition=new Vector3(1e9,0,1e9);
 function bind(active:boolean){for(const m of materials){
  m.reflectionTexture=active?texture:null;
  // A captured cube has ordinary mipmaps, not prefiltered GGX radiance.
  // Filter only the two hero surfaces; the global HDR is already prefiltered.
  m.realTimeFiltering=active;m.realTimeFilteringQuality=8;
 }}
 texture.onAfterUnbindObservable.add(()=>{
  if(sky){sky.position.copyFrom(savedSkyPosition);sky.computeWorldMatrix(true);}
  if(renderedFaces!==6)return;
  // Keep diffuse irradiance identical to the shared sky; only specular gains
  // local street detail, avoiding sudden pigment/ambient brightness changes.
  texture.sphericalPolynomial=scene.environmentTexture?.sphericalPolynomial??null;
  captures++;queued=false;if(enabled&&visible&&!disposed)bind(true);
 });
 function update(time:number){
  if(disposed)return;
  const position=car.getAbsolutePosition();visible=Vector3.DistanceSquared(position,camera.globalPosition)<65*65;
  if(!enabled||!visible||document.hidden){bind(false);return;}
  const changedEnvironment=environment!==scene.environmentTexture;
  if(!changedEnvironment&&captures>0){bind(true);if(time-lastTime<.5||Vector3.DistanceSquared(position,lastPosition)<4)return;}
  if(queued)return;
  const ranked=[...new Set(candidates())].filter(m=>{
   if(m===sky||excluded.has(m)||!m.isEnabled()||!m.isVisible||!m.material||m.getTotalVertices()===0)return false;
   if(/water|puddle|rain|pedestrian|traffic|wheel_|car_|cinematic_vehicle|sport-/i.test(m.name))return false;
   if('thinInstanceCount' in m&&Number(m.thinInstanceCount)>0)return false;
   const b=m.getBoundingInfo().boundingBox;
   const dx=Math.max(b.minimumWorld.x-position.x,0,position.x-b.maximumWorld.x),dz=Math.max(b.minimumWorld.z-position.z,0,position.z-b.maximumWorld.z);
   return dx*dx+dz*dz<240*240;
  }).map(m=>({mesh:m,d:Vector3.DistanceSquared(m.getBoundingInfo().boundingSphere.centerWorld,position)})).sort((a,b)=>a.d-b.d);
  const list:AbstractMesh[]=sky?[sky]:[];triangles=0;
  for(const {mesh} of ranked){const n=mesh.getTotalIndices()/3;if(triangles+n>90000)continue;list.push(mesh);triangles+=n;if(list.length>=29)break;}
  probe.renderList=list;probe.position.copyFrom(position).addInPlaceFromFloats(0,1.1,0);
  environment=scene.environmentTexture;lastTime=time;lastPosition.copyFrom(position);queued=true;
  // Register once to prime the texture before assigning it to a material.
  if(!scene.customRenderTargets.includes(texture))scene.customRenderTargets.push(texture);
  texture.resetRefreshCounter();
 }
 function setEnabled(value:boolean){if(enabled===value)return;enabled=value;if(!value)bind(false);else{lastPosition.set(1e9,0,1e9);lastTime=-Infinity;}}
 function dispose(){if(disposed)return;disposed=true;bind(false);if(sky&&!sky.isDisposed())texture.setMaterialForRendering(sky);probe.dispose();skyMaterial.dispose();}
 return {update,setEnabled,dispose,stats:()=>({enabled,visible,captures,queued,resolution:128,targetCapturesPerSecond:2,meshes:probe.renderList?.length??0,triangles,meshBudget:29,triangleBudget:90000,position:probe.position.asArray(),cameraAnchored:false})};
}
