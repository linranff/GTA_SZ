import test from 'node:test';
import assert from 'node:assert/strict';
import {BackgroundMaterial,FreeCamera,Matrix,MeshBuilder,MirrorTexture,NullEngine,Plane,Scene,ShaderMaterial,StandardMaterial,Vector3,type Effect} from '@babylonjs/core';
import {BindClipPlane} from '@babylonjs/core/Materials/clipPlaneMaterialHelper.js';
import {keepSkyInReflections} from '../src/city-sky-reflection.ts';

test('reflected sky survives beyond its finite sphere while underwater scene geometry stays clipped',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const camera=new FreeCamera('drone',new Vector3(0,1200,0),scene);camera.maxZ=18000;camera.setTarget(new Vector3(0,0,4000));
 scene.setTransformMatrix(camera.getViewMatrix(),camera.getProjectionMatrix());
 const sky=MeshBuilder.CreateSphere('atmosphere',{diameter:8000,segments:24},scene);
 sky.material=new BackgroundMaterial('sunset',scene);sky.infiniteDistance=true;
 const mirror=new MirrorTexture('existing-water-reflection',512,scene,true);mirror.mirrorPlane=new Plane(0,-1,0,-.25);mirror.refreshRate=3;mirror.blurKernel=1;
 const textures=scene.textures.length,passes=mirror.postProcesses.length,originalClip=scene.clipPlane;
 keepSkyInReflections(sky);
 const reflectedEye=Vector3.TransformCoordinates(camera.position,Matrix.Reflection(mirror.mirrorPlane));
 // Capture the uniform through Babylon's actual material/scene precedence,
 // the same binding used by BackgroundMaterial and standard scene materials.
 const bound=new Map<string,number[]>(),effect={setFloat4:(name:string,...values:number[])=>{bound.set(name,values);}} as unknown as Effect;
 const binding=(material:NonNullable<typeof sky.material>)=>{BindClipPlane(effect,material,scene);return bound.get('vClipPlane')!;};
 const clipped=(point:Vector3,plane:number[])=>point.x*plane[0]+point.y*plane[1]+point.z*plane[2]+plane[3]>0;
 try{
  const modes=[sky.material,new BackgroundMaterial('day',scene),new ShaderMaterial('night',scene,'night',{}),sky.material];
  for(const material of modes){
   sky.material=material;
   // Exercise the real MirrorTexture callbacks instead of replacing the scene
   // clip globally. This must leave both mirror and normal rendering intact.
   mirror.onBeforeRenderObservable.notifyObservers(0);
   assert.equal(scene.clipPlane,mirror.mirrorPlane);
   const skyPlane=binding(material);
   let reproducesOldBoundary=false;
   for(const distance of [500,3000,5000,12000,17000]){
    const water=new Vector3(0,-.25,distance),ray=water.subtract(reflectedEye).normalize();
    const spherePoint=reflectedEye.add(ray.scale(4000));
    if(mirror.mirrorPlane.dotCoordinate(spherePoint)>0)reproducesOldBoundary=true;
    assert(!clipped(spherePoint,skyPlane),`sky missing at ${distance} m with ${material.name}`);
   }
   assert(reproducesOldBoundary,'fixture must include far rays that the old water clip discards');
   const building=new StandardMaterial('reflected-building',scene),buildingPlane=binding(building);
   assert(!clipped(new Vector3(0,10,5000),buildingPlane),'keep buildings above water');
   assert(clipped(new Vector3(0,-10,5000),buildingPlane),'still reject underwater undersides');
   building.dispose();
   if(material instanceof BackgroundMaterial){
    // forceCompilation uses a temporary submesh; bind its cached shader to the
    // real submesh before inspecting the generated clip-plane integration.
    await material.forceCompilationAsync(sky);
    assert(material.isReadyForSubMesh(sky,sky.subMeshes[0]));
    const compiled=sky.subMeshes[0].effect;
    assert(compiled?.isReady(),'generate the actual clipped background shader');
    assert.match(compiled.vertexSourceCode,/fClipDistance=dot\(worldPos,vClipPlane\)/);
   }
   mirror.onAfterRenderObservable.notifyObservers(0);
   assert.equal(scene.clipPlane,originalClip,'normal scene must regain its previous clip plane');
  }
  assert.equal(scene.textures.length,textures);assert.equal(mirror.postProcesses.length,passes);
  assert.equal(mirror.getSize().width,512);assert.equal(mirror.refreshRate,3);
 }finally{scene.dispose();engine.dispose();}
});
