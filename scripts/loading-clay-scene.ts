/** Offline loading-film set. Never imported by the playable game. */
import {Color3,Color4,Vector3,PBRMaterial,Scene,ShadowGenerator,MeshBuilder,StandardMaterial,Matrix} from '@babylonjs/core';
import {DrivingWorld} from '../src/city-world.ts';
export async function createLoadingClayScene(canvas:HTMLCanvasElement){
 const w=new DrivingWorld(canvas);await w.init(()=>{});w.engine.stopRenderLoop();w.audio.dispose();w.scene.stopAllAnimations();
 w.setLightMode('day');w.paused=true;w.car.setEnabled(false);w.vehicleReflections?.setEnabled(false);
 const center=new Vector3(-5146,0,-1216.62),fps=30,duration=24,total=fps*duration;
 w.observer.active=true;w.observer.focus={x:center.x,y:80,z:center.z};w.aerial=true;w.aerialEffects(true);w.cull();
 await new Promise(r=>setTimeout(r,2500));if(w.facadeStream)w.facadeStream.update=()=>{};
 w.scene.onBeforeRenderObservable.add(()=>{w.scene.metadata={...w.scene.metadata,captureTimeSeconds:0};});
 w.cinematic?.finish({msaa:4,fxaa:true,grain:false,chromaticAberration:false,vignette:false,sharpen:false,colorCurves:false});
 w.pipeline.bloomEnabled=false;w.scene.environmentIntensity=.42;
 w.scene.imageProcessingConfiguration.exposure=1.12;w.scene.imageProcessingConfiguration.contrast=1.18;
 w.scene.clearColor=new Color4(.56,.68,.76,1);w.scene.fogMode=Scene.FOGMODE_LINEAR;w.scene.fogStart=850;w.scene.fogEnd=1900;w.scene.fogColor=new Color3(.56,.68,.76);
 w.hemi.diffuse=new Color3(.85,.91,1);w.hemi.groundColor=new Color3(.35,.34,.31);w.hemi.intensity=.52;
 w.sun.direction=new Vector3(.65,-.65,.38).normalize();w.sun.diffuse=new Color3(1,.84,.65);w.sun.intensity=3.0;w.sun.position.copyFrom(center.subtract(w.sun.direction.scale(850)));
 w.sun.orthoLeft=w.sun.orthoBottom=-650;w.sun.orthoRight=w.sun.orthoTop=650;w.sun.shadowMinZ=1;w.sun.shadowMaxZ=1700;
 w.shadows.mapSize=4096;w.shadows.filteringQuality=ShadowGenerator.QUALITY_HIGH;w.shadows.normalBias=.05;w.shadows.bias=.00005;
 const clay=new PBRMaterial('loading-clay',w.scene);clay.albedoColor=new Color3(.82,.75,.63);clay.metallic=0;clay.roughness=.67;clay.environmentIntensity=.40;clay.backFaceCulling=false;clay.twoSidedLighting=true;clay.alpha=1;clay.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;clay.forceDepthWrite=true;clay.disableDepthWrite=false;
 const ribs=clay.clone('loading-ivory-structure');ribs.albedoColor=new Color3(.89,.84,.71);ribs.roughness=.45;
 const glass=clay.clone('loading-pearl-glass');glass.albedoColor=new Color3(.42,.58,.61);glass.metallic=.22;glass.roughness=.29;
 const ground=clay.clone('loading-ground');ground.albedoColor=new Color3(.49,.48,.42);ground.roughness=.92;
 const water=clay.clone('loading-water');water.albedoColor=new Color3(.17,.37,.42);water.roughness=.15;water.metallic=.30;water.reflectionTexture=w.waterMirror;
 const park=clay.clone('loading-sage-landscape');park.albedoColor=new Color3(.42,.51,.38);park.roughness=.90;
 const cool=clay.clone('loading-cool-stone');cool.albedoColor=new Color3(.47,.57,.59);
 const casters=[],visible=[],waterNames=[],inheritedAlpha=[];
 for(const mesh of w.scene.meshes){
  if(!mesh.getTotalVertices())continue;
  const name=mesh.name;
  if(/atmosphere|sky|cloud|sun-disc|^rain|puddle|glow|particle|sign|grass|flower|pedestrian|vehicle|wheel_|car_|sport-|cockpit|lamp|light|tree|palm|leaf|bark|canopy/i.test(name)&&!name.includes('bamboo')){mesh.setEnabled(false);continue;}
  mesh.computeWorldMatrix(true);const s=mesh.getBoundingInfo().boundingSphere;
  if(Math.hypot(s.centerWorld.x-center.x,s.centerWorld.z-center.z)-s.radiusWorld>650){mesh.setEnabled(false);continue;}
  if(mesh.isDisposed())continue;
  if(mesh.hasVertexAlpha)inheritedAlpha.push(mesh.name);
  mesh.setEnabled(true);mesh.receiveShadows=true;mesh.useVertexColors=false;mesh.hasVertexAlpha=false;mesh.visibility=1;mesh.renderingGroupId=0;
  const materialName=mesh.material?.name??'';
  if(/water|pool|pond/i.test(name+' '+materialName)){mesh.material=water;waterNames.push(name);}
  else if(name.includes('bamboo'))mesh.material=/glass/i.test(materialName)?glass:ribs;
  else if(/terrain_(park|land)|ground_relief/i.test(name))mesh.material=park;
  else if(/terrain|asphalt|road|pavement|ground/i.test(name))mesh.material=ground;
  else mesh.material=Array.from(name).reduce((n,c)=>n+c.charCodeAt(0),0)%3===0?cool:clay;
  visible.push(mesh);if(mesh.material!==water&&!/terrain|asphalt|road/i.test(name))casters.push(mesh);
 }
 // Existing modeled water is kept reflective; no architectural geometry is invented.
 w.waterMirror.resize(1024);w.waterMirror.renderList=visible.filter(m=>m.material!==water);w.waterMirror.refreshRate=1;w.waterMirror.level=.5;
 w.mirror.renderList=[];w.mirror.refreshRate=0;w.shadows.getShadowMap()!.renderList=casters;w.shadows.getShadowMap()!.refreshRate=1;
 w.camera.maxZ=1900;w.camera.minZ=1;w.camera.fov=.87;w.engine.setHardwareScalingLevel(1);w.engine.resize();
 function pose(frame:number){const a=.75+(frame%total)/total*Math.PI*2,radius=365;
  const right=new Vector3(-Math.cos(a),0,Math.sin(a));
  w.camera.position.set(center.x+Math.sin(a)*radius,195,center.z+Math.cos(a)*radius);
  w.camera.setTarget(center.add(new Vector3(0,85,0)).subtract(right.scale(55)));
  w.scene.render();return {eye:w.camera.position.asArray(),target:w.camera.getTarget().asArray()};
 }
 for(let i=0;i<80;i++){pose(0);await new Promise(r=>setTimeout(r,35));if(i>30&&w.scene.isReady())break;}
 const opacityAudit=visible.filter(m=>m.material!==water).map(m=>({name:m.name,vertexAlpha:m.hasVertexAlpha,visibility:m.visibility,alpha:m.material!.alpha,depthWrite:!m.material!.disableDepthWrite,blend:m.material!.needAlphaBlendingForMesh(m)}));
 const film=document.createElement('canvas');film.width=1920;film.height=1080;const ctx=film.getContext('2d',{alpha:false})!;
 function render(frame:number){pose(frame);ctx.drawImage(canvas,0,0,1920,1080);}
 // Render a bright test card behind actual picked facades. An opaque facade
 // must return the same foreground pixel regardless of the hidden card color.
 const occlusionChecks=[];
 const probeMaterial=new StandardMaterial('occlusion-probe',w.scene);probeMaterial.disableLighting=true;probeMaterial.backFaceCulling=false;
 const probe=MeshBuilder.CreatePlane('occlusion-probe',{size:5,sideOrientation:2},w.scene);probe.material=probeMaterial;probe.setEnabled(false);
 for(const f of [0,180,360,540]){
  render(f);let checked=0;
  for(const [x,y] of [[1160,450],[1130,650],[1420,620],[1600,600],[980,550],[820,640],[1380,450]]){
   const ray=w.scene.createPickingRay(x,y,Matrix.Identity(),w.camera);
   const hit=w.scene.pickWithRay(ray,m=>visible.includes(m)&&m.material!==water&&!/terrain|road|facade/i.test(m.name));
   if(!hit?.hit||!hit.pickedPoint)continue;
   probe.position.copyFrom(hit.pickedPoint.add(ray.direction.scale(2)));probe.lookAt(w.camera.position);probe.setEnabled(true);
   const pixels=[];
   for(const color of [new Color3(1,0,1),new Color3(0,1,0)]){
    probeMaterial.emissiveColor.copyFrom(color);render(f);pixels.push(Array.from(ctx.getImageData(x,y,1,1).data));
   }
   const difference=Math.max(...pixels[0].map((v,i)=>Math.abs(v-pixels[1][i])));
   occlusionChecks.push({frame:f,mesh:hit.pickedMesh!.name,pixel:[x,y],difference,pass:difference<=1});probe.setEnabled(false);checked++;
   if(checked>=3)break;
  }
 }
 probe.dispose();probeMaterial.dispose();
 if(occlusionChecks.length<8||occlusionChecks.some(c=>!c.pass))throw Error('Loading film facade occlusion check failed: '+JSON.stringify(occlusionChecks));
 let frame=0,encoded=0;const chunks:Uint8Array[]=[];let error='';
 const encoder=new VideoEncoder({output(chunk){const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push(data);encoded++;},error(e){error=String(e);}});
 encoder.configure({codec:'avc1.640028',width:1920,height:1080,bitrate:18000000,framerate:fps,latencyMode:'realtime',hardwareAcceleration:'prefer-hardware',avc:{format:'annexb'}});
 return {ready:true,total,fps,duration,opacityAudit,inheritedAlpha,occlusionChecks,waterNames,visible:visible.length,casters:casters.length,
  still(f:number){render(f);return film.toDataURL('image/png');},
  async batch(count=30){for(let i=0;i<count&&frame<total;i++,frame++){render(frame);const f=new VideoFrame(film,{timestamp:Math.round(frame*1e6/fps),duration:Math.round((frame+1)*1e6/fps)-Math.round(frame*1e6/fps)});encoder.encode(f,{keyFrame:frame%60===0});f.close();if(encoder.encodeQueueSize>4)await encoder.flush();}await encoder.flush();if(error)throw Error(error);const data=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}chunks.length=0;let binary='';for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));return {frame,encoded,data:btoa(binary)};},
  seam:{start:pose(0),end:pose(total)},
 };
}
