import {Vector3,PBRMaterial,ShadowGenerator,Texture} from '@babylonjs/core';
import {DrivingWorld} from './city-world.ts';
import {RoadGraph} from './navigation.ts';
import {FILM_SHOTS as TRAILER_SHOTS,FILM_FPS,filmProgress,type FilmPose,type FilmShot,type Point3} from './trailer-shots.ts';
import {AERIAL_SHOTS} from './aerial-film-shots.ts';
import {createAerialFilmHud} from './aerial-film-hud.ts';
import type {V2} from './city-types.ts';

const aerialReel=new URLSearchParams(location.search).get('reel')==='aerial';
const FILM_SHOTS=aerialReel?AERIAL_SHOTS:TRAILER_SHOTS;
const canvas=document.querySelector<HTMLCanvasElement>('#render')!,film=document.querySelector<HTMLCanvasElement>('#film')!;
film.width=1920;film.height=1080;
const ctx=film.getContext('2d',{alpha:false})!,nightPlate=document.createElement('canvas');nightPlate.width=1920;nightPlate.height=1080;
ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
const nightCtx=nightPlate.getContext('2d',{alpha:false})!;
const world=new DrivingWorld(canvas),status=document.querySelector<HTMLElement>('#status')!;
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
let shot:FilmShot=FILM_SHOTS[0],frame=0,capturing=false,preparedShot:string|null=null;
let encoder:VideoEncoder|null=null,encodedChunks:Uint8Array[]=[],encodedFrames=0,encoderError='';
let path:V2[]=[],pathLengths:number[]=[],lastWheelDistance=0;
let aerialHud:ReturnType<typeof createAerialFilmHud>|null=null;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

function roadPoint(distance:number){
 const d=Math.max(0,Math.min(pathLengths.at(-1)!-.05,distance));let i=1;while(i<pathLengths.length-1&&pathLengths[i]<d)i++;
 const a=path[i-1],b=path[i],u=(d-pathLengths[i-1])/(pathLengths[i]-pathLengths[i-1]);
 const yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
 // Right-hand lane on the authored westbound carriageway; this is a staged replay.
 return {x:a[0]+(b[0]-a[0])*u+Math.cos(yaw)*1.85,z:a[1]+(b[1]-a[1])*u-Math.sin(yaw)*1.85,yaw};
}
function setupRoad(){
 const ids=['way/357768082','way/1468004415'];
 path=ids.flatMap(id=>world.data.roads.find(r=>r.id===id)!.points);
 // The cameras use the coastal part of this continuous road, starting near its bend.
 pathLengths=[0];for(let i=1;i<path.length;i++)pathLengths.push(pathLengths.at(-1)!+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
}
function drivePose(s:FilmShot,t:number):FilmPose{
 const d=s.drive!,travel=d.speed*t+.5*d.acceleration*t*t;
 const p=roadPoint(d.start+travel),ahead=roadPoint(d.start+travel+3),behind=roadPoint(d.start+travel-3);
 const yaw=Math.atan2(ahead.x-behind.x,ahead.z-behind.z),ground=world.groundHeight(p.x,p.z);
 Object.assign(world.state,{x:p.x,z:p.z,yaw,speed:d.speed+d.acceleration*t,steer:0,distance:d.start+travel});
 const dyaw=Math.atan2(Math.sin(ahead.yaw-behind.yaw),Math.cos(ahead.yaw-behind.yaw));world.state.steer=Math.max(-.25,Math.min(.25,Math.atan(dyaw/6*3.2)));
 world.drivingInput={throttle:.22,steer:world.state.steer,handbrake:false};
 const f=(forward:number,right:number,height:number):Point3=>[p.x+Math.sin(yaw)*forward+Math.cos(yaw)*right,ground+height,p.z+Math.cos(yaw)*forward-Math.sin(yaw)*right];
 if(s.id==='11')return {eye:f(8.5,6,1.65),target:f(.2,0,1.0),fov:.84};
 if(s.id==='12')return {eye:f(-10.5,-3.0,2.3),target:f(2.7,0,1.35),fov:.86};
 if(s.id==='13'){const u=filmProgress(t,s.seconds);return {eye:f(-12-u*130,6+u*24,8+u*155),target:f(15+u*24,0,1+u*10),fov:.88};}
 return {eye:f(-10.5,1.2,2.55),target:f(3.2,0,1.5),fov:.86};
}
function poseAt(t:number){return shot.drive?drivePose(shot,t):shot.pose(t);}
function placeCamera(p:FilmPose){
 const delta=Vector3.FromArray(p.target).subtract(Vector3.FromArray(p.eye));
 world.observer.active=true;world.observer.focus={x:p.target[0],y:p.target[1],z:p.target[2]};world.observer.distance=delta.length();world.observer.yaw=Math.atan2(delta.x,delta.z);world.observer.pitch=Math.asin(-delta.y/delta.length());
 world.camera.position.copyFromFloats(...p.eye);world.camera.setTarget(Vector3.FromArray(p.target));world.camera.fov=p.fov;
 world.camera.minZ=shot.drive?.speed ? .4:Math.max(.8,Math.min(3,world.observer.distance*.0015));
 if(aerialReel)world.camera.minZ=Math.max(2,Math.min(16,(p.eye[1]-world.groundHeight(p.eye[0],p.eye[2]))*.004));
}
function quality(){
 world.cinematic?.finish({msaa:4,fxaa:true,grain:false,chromaticAberration:false,vignette:true,vignetteWeight:.18,sharpen:false});
 world.pipeline.bloomWeight=world.lightMode==='night'?.13:.10;world.pipeline.bloomThreshold=1.55;
 world.shadows.filteringQuality=ShadowGenerator.QUALITY_HIGH;
 for(const rtt of [world.mirror,world.waterMirror]){rtt.refreshRate=1;rtt.resetRefreshCounter();}
 const shadow=world.shadows.getShadowMap();if(shadow){shadow.refreshRate=1;shadow.resetRefreshCounter();}
 for(const m of world.scene.materials)if(m instanceof PBRMaterial){
  m.enableSpecularAntiAliasing=true;
  if(m.name.includes('bamboo-ribs'))m.emissiveIntensity=world.lightMode==='day'?0:world.lightMode==='night'?.60:.24;
  if(m.name==='film-bamboo-windows')m.emissiveIntensity=world.lightMode==='day'?0:world.lightMode==='night'?.85:.24;
 }
}
function light(mode:'night'|'day'|'sunset'){
 world.setLightMode(mode);
 world.cinematic?.tune(mode==='night'?{hemi:.14,environment:.70,exposure:.88,contrast:1.07,fogDensity:.000065}:mode==='day'?{exposure:1.04,contrast:1.07,fogDensity:.000060}:{exposure:.88,contrast:1.06,hemi:.17,fogDensity:.000075});
 if(aerialReel)world.cinematic?.tune(mode==='night'?{hemi:.16,environment:.74,exposure:.97,contrast:1.08,fogDensity:.000035}:mode==='day'?{exposure:1.12,contrast:1.09,fogDensity:.000043}:{exposure:.95,contrast:1.07,hemi:.19,fogDensity:.000048});
 quality();
}
function updateFrame(t:number,dt:number){
 const p=poseAt(t);placeCamera(p);world.paused=true;
 world.scene.metadata={...world.scene.metadata,captureTimeSeconds:world.time};
 if(shot.drive){
  const traveled=world.state.distance-lastWheelDistance;world.wheelSpin+=traveled/world.wheelRadius;lastWheelDistance=world.state.distance;
  for(const m of world.carMeshes)if(m.name.startsWith('wheel_')){m.rotation.x=world.wheelSpin;m.rotation.y=m.name.match(/wheel_[lr]f_/)?-world.state.steer:0;}else if(m.name.startsWith('brake_'))m.rotation.set(0,-world.state.steer,0);
 }
 world.traffic?.update(dt,world.state.x,world.state.z);world.pedestrians?.update(dt,world.state.x,world.state.z);
 world.update(dt);placeCamera(p);
 const high=p.eye[1]-world.groundHeight(p.eye[0],p.eye[2])>145;world.aerialEffects(high);
 if(world.carFill)world.carFill.position.copyFrom(world.camera.position).addInPlace(new Vector3(3,3,0));
 quality();world.scene.render();world.renderFrames++;
 return p;
}
function textLine(text:string,x:number,y:number,font:string,align:CanvasTextAlign='left'){
 ctx.font=font;ctx.textAlign=align;ctx.fillStyle='#f4f4ec';ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=8;ctx.fillText(text,x,y);ctx.shadowBlur=0;
}
function compose(t:number,transition=false){
 ctx.globalAlpha=1;ctx.drawImage(canvas,0,0,1920,1080);
 if(aerialReel){aerialHud?.(ctx,shot,poseAt(t));return;}
 if(transition){ctx.globalAlpha=1-clamp(t/.30);ctx.drawImage(nightPlate,0,0);ctx.globalAlpha=1;}
 if(shot.location){const a=clamp((t-.35)/.55)*clamp((4.5-t)/.75);if(a>0){ctx.globalAlpha=a;ctx.fillStyle='#accfbe';ctx.fillRect(82,917,38,3);textLine(shot.location,82,960,'500 28px "PingFang SC", sans-serif');textLine('深 城 纪   /   OPEN ROADS',82,993,'400 14px "PingFang SC", sans-serif');ctx.globalAlpha=1;}}
 if(shot.id==='15'){
  const a=clamp((t-1.2)/.8);ctx.fillStyle=`rgba(5,10,17,${a*.30})`;ctx.fillRect(0,0,1920,1080);ctx.globalAlpha=a;
  textLine('深 城 纪',960,500,'400 112px "Songti SC", "PingFang SC", serif','center');
  textLine('山海之间，自由出发',960,582,'400 30px "PingFang SC", sans-serif','center');
  textLine('OPEN ROADS',960,636,'400 17px sans-serif','center');
  textLine('城市数据 © OpenStreetMap contributors · ODbL',960,984,'400 16px sans-serif','center');
  textLine('CarConcept · DGG / Eric Chadwick · CC BY 4.0    |    Environment assets · Poly Haven · CC0',960,1012,'400 15px sans-serif','center');ctx.globalAlpha=1;
 }
 const fade=shot.id==='01'?1-clamp(t/.6):shot.id==='15'?clamp((t-5.45)/.53):0;
 if(fade){ctx.fillStyle=`rgba(0,0,0,${fade})`;ctx.fillRect(0,0,1920,1080);}
}
async function readyTextures(){
 const deadline=performance.now()+90000;
 while(performance.now()<deadline){world.scene.render();await sleep(40);if(world.scene.isReady()&&!world.facadeStream?.pending){await sleep(250);if(!world.facadeStream?.pending&&world.scene.isReady())return;}}
 throw Error('Scene resources did not settle for '+shot.id);
}
async function select(id:string){
 capturing=false;encoder?.close();encoder=null;shot=FILM_SHOTS.find(s=>s.id===id)!;if(!shot)throw Error('Unknown shot');frame=0;
 world.observer.active=false;world.aerial=false;world.paused=true;world.keys.clear();world.cancelAutoDrive('film');
 world.time=90;world.wheelSpin=0;world.state.speed=0;
 light(shot.mode);
 // Warm both ends; every frame uses the same resident facade set during capture.
 for(const t of [shot.seconds/2,shot.seconds,0]){updateFrame(t,0);world.cull();world.vegetation();world.facadeStream?.update(world.sceneFocus().x,world.sceneFocus().z,true,0);await readyTextures();}
 const p=poseAt(0);if(!shot.drive){world.state.x=p.target[0];world.state.z=p.target[2];world.car.setEnabled(false);}else world.car.setEnabled(true);
 world.traffic!.seed=177+Number(id);world.traffic?.place(world.state.x,world.state.z);world.pedestrians?.place(world.state.x,world.state.z);
 // Give the camera car a clear lane in the staged driving take; cross streets remain populated.
 if(shot.drive)world.traffic!.cars=world.traffic!.cars.filter(c=>{const n=world.collision.nearest(c.x,c.z);return n?.road.name!=='滨海大道';});
 for(const r of world.facadeStream?.resident.values()??[])r.meshes[0].setEnabled(true);
 lastWheelDistance=world.state.distance;
 world.time=90;updateFrame(0,0);await readyTextures();quality();world.scene.render();compose(0);
 // Settle the driving-to-observer minimap tilt before the first exported frame.
 if(aerialReel)for(let i=0;i<35;i++)compose(0);
 preparedShot=id;
 return {id,pose:poseAt(0),resolution:[world.engine.getRenderWidth(),world.engine.getRenderHeight()],facades:world.facadeStream?.stats,materials:world.scene.materials.filter(m=>/bamboo|led|lightstrip/i.test(m.name)).map(m=>({name:m.name,emission:m instanceof PBRMaterial?m.emissiveIntensity:null})),roadLength:pathLengths.at(-1)};
}
const codecConfig:VideoEncoderConfig={codec:'avc1.64002a',width:1920,height:1080,bitrate:40000000,framerate:FILM_FPS,latencyMode:'realtime',hardwareAcceleration:'prefer-hardware',avc:{format:'annexb'}};
function startEncode(){
 encodedChunks=[];encodedFrames=0;encoderError='';capturing=true;frame=0;world.time=90;
 encoder=new VideoEncoder({output(chunk){const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);encodedChunks.push(data);encodedFrames++;},error(e){encoderError=String(e);}});encoder.configure(codecConfig);
}
function bytes(){const size=encodedChunks.reduce((a,c)=>a+c.length,0),data=new Uint8Array(size);let offset=0;for(const c of encodedChunks){data.set(c,offset);offset+=c.length;}encodedChunks=[];let binary='';for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(binary);}
async function batch(count=30){
 if(!encoder)startEncode();
 const poses=[];
 for(let i=0;i<count&&frame<shot.seconds*FILM_FPS;i++){
  const t=frame/FILM_FPS;
  let p:FilmPose;
  if(shot.matchDay&&t<.30){light('night');updateFrame(t,frame?1/FILM_FPS:0);nightCtx.drawImage(canvas,0,0);light('day');p=updateFrame(t,0);}
  else p=updateFrame(t,frame?1/FILM_FPS:0);
  compose(t,!!shot.matchDay&&t<.30);
  const videoFrame=new VideoFrame(film,{timestamp:Math.round(frame*1000000/FILM_FPS),duration:Math.round((frame+1)*1000000/FILM_FPS)-Math.round(frame*1000000/FILM_FPS)});
  encoder!.encode(videoFrame,{keyFrame:frame%120===0});videoFrame.close();
  if(frame%60===0)poses.push({frame,pose:p,speed:world.state.speed,state:{...world.state},simulationTime:world.time});
  frame++;
  if(encoder!.encodeQueueSize>4)await encoder!.flush();
  if(encoderError)throw Error(encoderError);
 }
 await encoder!.flush();
 return {frame,encodedFrames,data:bytes(),poses,done:frame===shot.seconds*FILM_FPS};
}
async function boot(){
 await world.init(s=>status.textContent=s);world.engine.stopRenderLoop();world.audio.dispose();
 if(aerialReel){world.engine.setHardwareScalingLevel(.75);world.engine.resize();world.camera.maxZ=24000;aerialHud=createAerialFilmHud(world.data);}
 world.startTraffic(new RoadGraph(world.data.roads,await fetch('/city/navigation.json').then(r=>r.json())));setupRoad();
 let bambooWindows:PBRMaterial|null=null;
 for(const mesh of world.landmarks)if(mesh.name.includes('bamboo')&&mesh.material instanceof PBRMaterial&&/^led(?:\.\d+)?$/.test(mesh.material.name)){bambooWindows??=mesh.material.clone('film-bamboo-windows');mesh.material=bambooWindows;}
 world.mirror.resize(1024);world.waterMirror.resize(1024);world.shadows.mapSize=4096;
 for(const texture of world.scene.textures)if(texture instanceof Texture)texture.anisotropicFilteringLevel=16;
 const facade=world.facadeStream!;const updateFacade=facade.update.bind(facade);facade.update=(...args)=>{if(!capturing)updateFacade(...args);};
 const wind=()=>world.scene.metadata={...world.scene.metadata,captureTimeSeconds:world.time};world.scene.onBeforeRenderObservable.add(wind);
 status.hidden=true;
 const api={ready:true,shots:FILM_SHOTS.map(({pose,...s})=>s),codec:await VideoEncoder.isConfigSupported(codecConfig),select,batch,
  async still(id:string,time:number){if(preparedShot!==id||capturing)await select(id);world.time=90+time;updateFrame(time,0);await readyTextures();world.scene.render();compose(time);return film.toDataURL('image/png');},
  get diagnostics(){return {frame,encodedFrames,shot:shot.id,performance:world.performance()};}};
 Object.defineProperty(window,'__TRAILER__',{value:api});
}
boot().catch(e=>{status.textContent=String(e);console.error(e);Object.defineProperty(window,'__TRAILER_ERROR__',{value:String(e)});});
