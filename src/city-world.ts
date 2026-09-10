import {createVehicleReflections} from './city-vehicle-reflections.ts';
import {Engine,Scene,Vector3,Color3,Color4,FreeCamera,HemisphericLight,DirectionalLight,ShadowGenerator,TransformNode,MeshBuilder,Mesh,StandardMaterial,PBRMaterial,RawCubeTexture,RawTexture,Texture,Effect,ShaderMaterial,Quaternion,PointLight,ImportMeshAsync,DefaultRenderingPipeline,MirrorTexture,Plane,FresnelParameters,SpotLight,MeshoptCompression,SSAO2RenderingPipeline,Constants,SceneInstrumentation,EngineInstrumentation,RenderingGroup,Frustum,Matrix,type SubMesh,type AbstractMesh} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import './city-gltf-streaming.ts';
MeshoptCompression.Configuration={decoder:{url:'/city/meshopt_decoder.js'}};
import {loadLandmarkDetails,type LandmarkDetailManifest} from './landmark-details.ts';
import {CityObserver} from './city-observer.ts';
import {CityFlight} from './city-flight.ts';
import {observerNearClip} from './city-observer-depth.ts';
import {CityWalk} from './city-walk.ts';
import {CityTank} from './city-tank.ts';
import {stepTank,tankFootprintClear} from './city-tank-simulation.ts';
import {createCityRider,type CityRider} from './city-rider.ts';
import {loadRoadDisplayNames,roadDisplayName} from './city-road-names.ts';
import {CityFacadeStream} from './city-facade-stream.ts';
import {createArchitectureMaterials} from './city-architecture-materials.ts';
import {createFacadeDiversity} from './city-facade-diversity.ts';
import {CityLandscape,applyLandscapeSurfaces} from './city-landscape.ts';
import {attachCityBuildingSigns} from './city-building-signs.ts';
import {loadLandmarkSignage} from './landmark-signage.ts';
import {createCinematicLook,syncPostChain,applyAntiAliasing} from './city-cinematic.ts';
import {keepSkyInReflections} from './city-sky-reflection.ts';
import {createBambooLook} from './city-bamboo-look.ts';
import {createBambooCafe} from './city-bamboo-cafe.ts';
import {createBayparkLook} from './city-baypark-look.ts';
import {createLocalLighting} from './city-local-lighting.ts';
import {applyCinematicRoad} from './city-road-surface.ts';
import {createRainPuddles} from './city-rain-puddles.ts';
import {loadCityGroundRelief} from './city-ground-relief.ts';
import {loadCityMountains} from './city-mountains.ts';
import {applyCinematicVehicleFinish} from './city-vehicle-finish.ts';
import {refineHeroVehicleMaterials} from './city-vehicle-materials.ts';
import {CityAudio} from './city-audio.ts';
import {CityAutopilot,type DrivingInput} from './city-autopilot.ts';
import {createCityCockpit,CITY_DRIVER_POSE} from './city-cockpit.ts';
import {createCityTailLights} from './city-tail-lights.ts';
import {createCitySportDetails} from './city-sport-details.ts';
import {CityStreetFurniture} from './city-street-furniture.ts';
import {CityPedestrians} from './pedestrians.ts';
import {CityTraffic} from './traffic.ts';
import {loadCoastalInfrastructure} from './city-coastal-infrastructure.ts';
import {createBayWater} from './city-bay-water.ts';
import {createCoastalHorizon} from './city-coastal-horizon.ts';
import {createPublicLighting} from './city-public-lighting.ts';
import {setLandscapeLightingMode} from './city-landscape-lighting.ts';
import type {RoadGraph} from './navigation.ts';
import type {CityData,Landmark,V2} from './city-types.ts';
import {CityCollision,stepCar,manualSteeringInput,clamp,type CarState} from './driving.ts';
/** Screen-space contact shading at street level: a tight 2.5 m radius darkens
 * kerbs, door reveals and wheel wells within 130 m. It reads depth and normals
 * from a dedicated half-resolution geometry buffer whose render list is only
 * the meshes within reach; the previous prepass path re-rendered the whole
 * visible city into a full-resolution MRT. Occlusion is estimated and blurred
 * at `aoRatio` and multiplied into the full-size scene colour. Aerial views
 * detach the pass: the facade shader's own sky-visibility ramp grounds the
 * towers there. `listMargin` covers the 100 m of travel between culls. */
export const STREET_AO={radius:2.5,maxZ:130,strength:.65,base:.1,bufferRatio:.5,aoRatio:.5,listMargin:100} as const;
/** Hull-front lamp anchors for the 3.48 m wide, 8.3 m long tank (game metres, +Z forward). */
export const TANK_HEADLIGHT_ANCHORS:[number,number,number][]=[[-1.15,1.35,3.4],[1.15,1.35,3.4]];
export class DrivingWorld{
 flight:CityFlight|null=null;private flightRequest=0;
 tank:CityTank|null=null;rider:CityRider|null=null;riderLoading=false;walkFirstPerson=false;private riderYaw=0;private riderPending:Promise<boolean>|null=null;private walkingTransition=false;private tankRequest=0;
 coastal:Awaited<ReturnType<typeof loadCoastalInfrastructure>>|null=null;bayWater:ReturnType<typeof createBayWater>|null=null;publicLighting:ReturnType<typeof createPublicLighting>|null=null;private lampAssignments=[-1,-1];
 coastalHorizon:ReturnType<typeof createCoastalHorizon>[]=[];
 propObstacles:{x:number;z:number;heading:number}[]=[];
 buildingSigns:Awaited<ReturnType<typeof attachCityBuildingSigns>>|null=null;
 vehicleMaterials:ReturnType<typeof refineHeroVehicleMaterials>|null=null;audio=new CityAudio();autopilot:CityAutopilot|null=null;cockpit:ReturnType<typeof createCityCockpit>|null=null;tailLights:ReturnType<typeof createCityTailLights>|null=null;streetFurniture:CityStreetFurniture|null=null;
 drivingInput:DrivingInput={throttle:0,steer:0,handbrake:false};private previousAutoPhase='idle';
 cinematic:Awaited<ReturnType<typeof createCinematicLook>>|null=null;
 bambooLook:ReturnType<typeof createBambooLook>|null=null;
 bambooCafe:Awaited<ReturnType<typeof createBambooCafe>>|null=null;
 bayparkLook:ReturnType<typeof createBayparkLook>|null=null;
 localLighting:ReturnType<typeof createLocalLighting>|null=null;
 roadSurface:ReturnType<typeof applyCinematicRoad>|null=null;
 rainPuddles:ReturnType<typeof createRainPuddles>|null=null;
 groundRelief:Awaited<ReturnType<typeof loadCityGroundRelief>>|null=null;
 mountains:Awaited<ReturnType<typeof loadCityMountains>>|null=null;
 private nextDetailUpdate=0;private detailWasMoving=false;private previousDetailFocus={x:Infinity,z:Infinity};
 private sceneryTop=0;
 vehicleReflections:ReturnType<typeof createVehicleReflections>|null=null;
 vehicleFinish:ReturnType<typeof applyCinematicVehicleFinish>|null=null;
 sportDetails:ReturnType<typeof createCitySportDetails>|null=null;
 instrumentation!:SceneInstrumentation; gpuInstrumentation!:EngineInstrumentation; updateMs=0; renderMs=0; ao:SSAO2RenderingPipeline|null=null; debugSimulation=true; debugFacades=true; facadeStream:CityFacadeStream|null=null; aerial=false; observer=new CityObserver(); overviewEffects=false; renderFrames=0;
 architecture!:ReturnType<typeof createArchitectureMaterials>; facadeDiversity!:ReturnType<typeof createFacadeDiversity>; landscape:CityLandscape|null=null; signage:Awaited<ReturnType<typeof loadLandmarkSignage>>|null=null; wheelRadius=.4404; lastLandscapeAerial=false;
 engine:Engine;scene:Scene;camera:FreeCamera;car:TransformNode;data!:CityData;collision!:CityCollision;
 state:CarState={x:0,z:0,yaw:0,speed:0,steer:0,distance:0};ready=false;paused=false;night=false;lightMode:'sunset'|'night'|'day'='sunset';walk:CityWalk|null=null;debugEpoch=0;view=0;keys=new Set<string>();
 groundHeight:(x:number,z:number)=>number=()=>0;detailManifest:LandmarkDetailManifest|null=null;carFill:PointLight|null=null;traffic:CityTraffic|null=null;pedestrians:CityPedestrians|null=null;trafficSources:AbstractMesh[]=[];wheelSpin=0;
 onTick:((dt:number)=>void)|null=null;onMessage:((s:string)=>void)|null=null;
 samples:number[]=[];sun:DirectionalLight;hemi:HemisphericLight;shadows:ShadowGenerator;pipeline:DefaultRenderingPipeline;mirror:MirrorTexture;waterMirror:MirrorTexture;
 blocks:{mesh:AbstractMesh;x:number;z:number;road:boolean;detail?:boolean}[]=[];landmarks:AbstractMesh[]=[];carMeshes:AbstractMesh[]=[];
 reflectionsEnabled=true;private reflectionEye=new Vector3(1e9,0,0);private reflectionDirection=new Vector3();private reflectionMotionUntil=0;reflectionFrames={road:0,water:0};
 lastCull=new Vector3(1e9,0,1e9);lastVegetation=new Vector3(1e9,0,1e9);roadName='滨海大道';offroad=false;cameraYaw=0;cameraPitch=.22;drag=false;pointer=[0,0];viewReturn=0;time=0;skyMat!:ShaderMaterial;headlights:SpotLight[]=[];vehicleLightRig!:TransformNode;carHeadlightAnchors:[number,number,number][]=[[-.6,.82,2.25],[.6,.82,2.25]];streetLights:PointLight[]=[];windowLights:PointLight[]=[];lampData:number[][]=[];lightTick=0;lightTargets:{position:Vector3;power:number}[]=[];windowSources:{x:number;z:number}[]=[];photoTarget:Landmark|null=null;photoAngle=.5;photoElevation=.32;photoDistance=250;
 constructor(public canvas:HTMLCanvasElement){
  this.engine=new Engine(canvas,true,{stencil:true,powerPreference:'high-performance'},false);this.resize();
  this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(.39,.54,.63,1);this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogDensity=.000115;this.scene.fogColor=new Color3(.38,.24,.30);
  const ip=this.scene.imageProcessingConfiguration;ip.toneMappingEnabled=true;ip.toneMappingType=1;ip.exposure=1.05;ip.contrast=1.14;
  this.instrumentation=new SceneInstrumentation(this.scene);this.instrumentation.captureActiveMeshesEvaluationTime=true;this.instrumentation.captureRenderTargetsRenderTime=true;this.instrumentation.captureRenderTime=true;this.gpuInstrumentation=new EngineInstrumentation(this.engine);this.gpuInstrumentation.captureGPUFrameTime=true;this.gpuInstrumentation.captureShaderCompilationTime=true;
  this.camera=new FreeCamera('driving-chase',new Vector3(0,4,-8),this.scene);this.camera.minZ=.75;this.camera.maxZ=18000;this.camera.fov=.9;this.camera.inputs.clear();
  this.hemi=new HemisphericLight('sky-bounce',new Vector3(0,1,0),this.scene);this.hemi.diffuse=new Color3(.70,.80,1.0);this.hemi.groundColor=new Color3(.32,.27,.30);this.hemi.intensity=.88;
  this.sun=new DirectionalLight('sunset',new Vector3(.95,-.22,.18),this.scene);this.sun.diffuse=new Color3(1,.41,.18);this.sun.intensity=3.0;this.sun.shadowMinZ=1;this.sun.shadowMaxZ=1200;this.sun.autoUpdateExtends=false;this.sun.orthoLeft=-260;this.sun.orthoRight=260;this.sun.orthoTop=260;this.sun.orthoBottom=-260;
  this.shadows=new ShadowGenerator(2048,this.sun);this.shadows.usePercentageCloserFiltering=true;this.shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;this.shadows.bias=.0002;this.shadows.normalBias=.10;
  this.pipeline=new DefaultRenderingPipeline('city-optics',true,this.scene,[this.camera]);this.pipeline.samples=1;this.pipeline.fxaaEnabled=true;this.pipeline.bloomEnabled=true;this.pipeline.bloomThreshold=.90;this.pipeline.bloomWeight=.34;this.pipeline.bloomKernel=72;this.pipeline.bloomScale=.5;
  // The scene target must be half-float so HDR survives into bloom and ACES;
  // the default 8-bit pass clipped every highlight when this pipeline owned
  // the scene. MSAA on that target is applied by `syncPostChain`.
  if(SSAO2RenderingPipeline.IsSupported){const gbuffer=this.scene.enableGeometryBufferRenderer(STREET_AO.bufferRatio);if(gbuffer){gbuffer.renderList=[];const ao=this.ao=new SSAO2RenderingPipeline('contact-shading',this.scene,{ssaoRatio:STREET_AO.aoRatio,blurRatio:STREET_AO.aoRatio},[this.camera],gbuffer,this.engine.getCaps().textureHalfFloatRender?Constants.TEXTURETYPE_HALF_FLOAT:Constants.TEXTURETYPE_UNSIGNED_INT);ao.radius=STREET_AO.radius;ao.totalStrength=STREET_AO.strength;ao.base=STREET_AO.base;ao.samples=8;ao.expensiveBlur=false;ao.maxZ=STREET_AO.maxZ;}}
  this.sky();this.environment();this.architecture=createArchitectureMaterials(this.scene);this.facadeDiversity=createFacadeDiversity(this.scene);
  this.car=new TransformNode('player-electric-GT',this.scene);
  this.mirror=new MirrorTexture('wet-road-reflection',512,this.scene,true);this.mirror.mirrorPlane=new Plane(0,-1,0,.105);this.mirror.refreshRate=2;this.mirror.blurKernel=7;this.mirror.level=.65;
  this.waterMirror=new MirrorTexture('bay-reflection',512,this.scene,true);this.waterMirror.mirrorPlane=new Plane(0,-1,0,-.12);this.waterMirror.refreshRate=3;this.waterMirror.blurKernel=1;this.waterMirror.level=.68;
  // Sky first: its finite radius must never overwrite more distant terrain.
  // Mirrors own separate render queues and need the same ordering.
  const atmosphere=this.scene.getMeshByName('atmosphere');
  const skyFirst=(a:SubMesh,b:SubMesh)=>Number(b.getMesh()===atmosphere)-Number(a.getMesh()===atmosphere)||RenderingGroup.PainterSortCompare(a,b);
  this.scene.setRenderingOrder(0,skyFirst);
  for(const mirror of [this.mirror,this.waterMirror]){
   mirror.setRenderingOrder(0,skyFirst);
   // Infinite-distance meshes follow the real camera. During an RTT center
   // the sky at the reflected eye as well, including at 2200m drone height.
   const inverseView=Matrix.Identity(),savedSkyPosition=new Vector3();
   mirror.onBeforeRenderObservable.add(()=>{
    if(!atmosphere)return;savedSkyPosition.copyFrom(atmosphere.position);
    this.scene.getViewMatrix().invertToRef(inverseView);
    inverseView.getTranslationToRef(atmosphere.position);
    atmosphere.position.subtractInPlace(this.camera.globalPosition);
    atmosphere.computeWorldMatrix(true);
   });
   mirror.onAfterRenderObservable.add(()=>{
    if(!atmosphere)return;atmosphere.position.copyFrom(savedSkyPosition);atmosphere.computeWorldMatrix(true);
   });

   // Explicit RTT lists bypass Babylon's normal frustum culling. This callback
   // runs after MirrorTexture installs its reflected view matrix.
   mirror.getCustomRenderList=(_face,list,length)=>{
    if(!list)return null;const planes=Frustum.GetPlanes(this.scene.getTransformMatrix()),visible:AbstractMesh[]=[];
    for(let i=0;i<length;i++){const m=list[i];if(m===atmosphere||m.isInFrustum(planes))visible.push(m);}
    return visible;
   };
  }
  this.mirror.onAfterRenderObservable.add(()=>{this.reflectionFrames.road=this.renderFrames;});this.waterMirror.onAfterRenderObservable.add(()=>{this.reflectionFrames.water=this.renderFrames;});
  // Attach timing observers after the object renderers exist.
  this.instrumentation.captureRenderTargetsRenderTime=false;
  this.instrumentation.captureRenderTargetsRenderTime=true;
  // Vehicle lights hang off a rig that is never disabled. Disabling the car
  // node while the tank is driven would disable these lights too, and every
  // light enable/disable changes the light layout of each nearby PBR shader:
  // ~90 programs recompile per vehicle switch, a 1-2 s stall with holes
  // where meshes wait for their new effect. The rig follows the active vehicle.
  this.vehicleLightRig=new TransformNode('vehicle-light-rig',this.scene);
  for(const side of [-1,1]){const light=new SpotLight('headlight',new Vector3(side*.6,0.82,2.25),new Vector3(0,-.055,1),Math.PI/3,4,this.scene);light.parent=this.vehicleLightRig;light.diffuse=new Color3(.78,.87,1);light.intensity=250;light.range=65;this.headlights.push(light);}
  window.addEventListener('resize',()=>{this.resize();this.engine.resize();});
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(!this.paused&&['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))this.cancelAutoDrive('manual-takeover');if(e.repeat)return;if(e.code==='KeyB')void this.toggleFlight();if(e.code==='KeyT')void this.toggleTank();if(e.code==='Space'&&this.flight?.active)this.flight.fire();else if((e.code==='Enter'||e.code==='Space')&&this.controlMode==='tank'&&!this.paused)this.tank?.fire();if(e.code==='KeyH')this.audio.cue('horn');if(e.code==='KeyG')this.toggleAerial();if(e.code==='KeyR'&&!this.observer.active)this.resetRoad();if(e.code==='KeyC'&&!this.observer.active&&this.walk?.active){this.walkFirstPerson=!this.walkFirstPerson;this.onMessage?.(this.walkFirstPerson?'步行 · 第一人称':'步行 · 第三人称');}else if(e.code==='KeyC'&&!this.observer.active){this.view=(this.view+1)%3;this.onMessage?.(['追踪镜头','驾驶舱镜头','远景镜头'][this.view]);}if(e.code==='KeyL')this.toggleLight();if(e.code==='KeyV'){if(this.observer.active)this.exitPhoto();else this.enterPhoto({id:'car',name:'绯红海湾 GT',x:this.state.x,z:this.state.z,height:1.45,area:'车辆',excludeRadius:0,arrival:[this.state.x,this.state.z],yaw:this.state.yaw,photoDistance:7.7,photoElevation:.18,photoAngle:this.state.yaw+Math.PI+.65,photoTargetHeight:this.groundHeight(this.state.x,this.state.z)+.65});}if(e.code==='KeyF'){if(this.observer.active)this.exitPhoto();else if(!this.paused)void this.toggleWalking();}});
  window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>{this.keys.clear();this.drag=false;});
  let dragPointer:number|null=null,touchCentroid:{x:number;y:number}|null=null;
  const endDrag=()=>{this.drag=false;dragPointer=null;touchCentroid=null;this.viewReturn=2;};
  canvas.style.touchAction='none';
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||![0,2].includes(e.button))return;this.drag=true;dragPointer=e.pointerId;this.pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);window.addEventListener('blur',endDrag);
  canvas.addEventListener('pointermove',e=>{if(!this.drag||e.pointerId!==dragPointer||!e.buttons)return;const dx=e.clientX-this.pointer[0],dy=e.clientY-this.pointer[1];if(this.observer.active){if(!this.flight?.active){if(e.shiftKey)this.observer.pan(dx,dy,canvas.clientHeight);else this.observer.rotate(dx,dy);}}else if(this.walk?.active){this.walk.look(dx,dy);}else{this.cameraYaw+=dx*.005;this.cameraPitch=clamp(this.cameraPitch+dy*.002,.02,.8);}this.pointer=[e.clientX,e.clientY];});
  const touchPosition=(touches:TouchList)=>{let x=0,y=0;for(const touch of Array.from(touches)){x+=touch.clientX;y+=touch.clientY;}return {x:x/touches.length,y:y/touches.length};};
  canvas.addEventListener('touchstart',e=>{if(e.touches.length){touchCentroid=touchPosition(e.touches);e.preventDefault();}},{passive:false});
  canvas.addEventListener('touchmove',e=>{if(!touchCentroid||!e.touches.length)return;e.preventDefault();const next=touchPosition(e.touches),dx=next.x-touchCentroid.x,dy=next.y-touchCentroid.y;if(this.observer.active){if(!this.flight?.active){if(e.shiftKey)this.observer.pan(dx,dy,canvas.clientHeight);else this.observer.rotate(dx,dy);}}else if(this.walk?.active){this.walk.look(dx,dy);}else{this.cameraYaw+=dx*.005;this.cameraPitch=clamp(this.cameraPitch+dy*.002,.02,.8);}touchCentroid=next;},{passive:false});
  canvas.addEventListener('touchend',e=>{touchCentroid=e.touches.length?touchPosition(e.touches):null;});canvas.addEventListener('touchcancel',endDrag);
  canvas.addEventListener('wheel',e=>{if(this.observer.active){e.preventDefault();if(!this.flight?.active)this.observer.zoom(e.deltaY);}else if(this.walk?.active&&!this.paused){e.preventDefault();this.walk.zoom(e.deltaY);}},{passive:false});
  this.engine.runRenderLoop(()=>{if(document.hidden||!this.ready)return;const raw=this.engine.getDeltaTime(),dt=Math.min(raw/1000,.05);const begin=performance.now();if(this.ready){if(this.debugSimulation)this.update(dt);if(this.samples.length<36000)this.samples.push(raw);}this.updateMs=this.updateMs*.9+(performance.now()-begin)*.1;const render=performance.now();this.scene.render();this.renderFrames++;this.renderMs=this.renderMs*.9+(performance.now()-render)*.1;});
  document.addEventListener('visibilitychange',()=>{this.keys.clear();this.drag=false;this.engine.getDeltaTime();});
  if(new URLSearchParams(location.search).has('profile'))this.profileControls();
 }
 resize(){const ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1920*1080/(innerWidth*innerHeight)));this.engine?.setHardwareScalingLevel(1/ratio);}
 private environment(){
  const n=128,faces=[];for(let face=0;face<6;face++){const arr=new Uint8Array(n*n*3);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/(n-1)*2-1,v=y/(n-1)*2-1;let d:Vector3;switch(face){case 0:d=new Vector3(1,-v,-u);break;case 1:d=new Vector3(-1,-v,u);break;case 2:d=new Vector3(u,1,v);break;case 3:d=new Vector3(u,-1,-v);break;case 4:d=new Vector3(u,-v,1);break;default:d=new Vector3(-u,-v,-1);}d.normalize();const h=clamp(d.y*1.5,0,1),sun=Math.pow(Math.max(0,Vector3.Dot(d,new Vector3(-.95,.16,-.18).normalize())),9);const c=d.y<0?[.34,.31,.35]:[.64-h*.30+sun*.35,.49-h*.13+sun*.13,.56+h*.12-sun*.17];for(let j=0;j<3;j++)arr[(y*n+x)*3+j]=Math.min(255,c[j]*255);}faces.push(arr);}
  const env=new RawCubeTexture(this.scene,faces,n,Engine.TEXTUREFORMAT_RGB,Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,Texture.TRILINEAR_SAMPLINGMODE);env.gammaSpace=true;this.scene.environmentTexture=env;this.scene.environmentIntensity=.85;
 }

 private sky(){
  Effect.ShadersStore['szSkyVertexShader']='precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vP;void main(){vP=position;gl_Position=worldViewProjection*vec4(position,1.);}';
  Effect.ShadersStore['szSkyFragmentShader']=`precision highp float;varying vec3 vP;uniform float night;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=noise(p)*a;p=p*2.03+17.;a*=.5;}return f;}
  void main(){vec3 p=normalize(vP);vec3 sd=normalize(vec3(-.95,.16,-.18));float west=pow(max(0.,dot(p,sd)),4.);float h=smoothstep(-.05,.72,p.y);
  vec3 horizon=mix(vec3(.42,.24,.35),vec3(.94,.32,.115),west);vec3 c=mix(horizon,vec3(.047,.12,.25),h);
  float glow=pow(max(0.,dot(p,sd)),22.);c+=vec3(.5,.18,.055)*glow;
  float sun=pow(max(0.,dot(p,sd)),4200.);c+=vec3(5.,2.2,.6)*sun;
  vec2 uv=p.xz/max(.14,p.y+.08)*2.0;uv.x*=.52;float cloud=fbm(uv+fbm(uv*.4)*1.6);float stripe=noise(vec2(uv.x*.8,uv.y*4.))* .13;
  float mask=smoothstep(.40,.66,cloud+stripe)*smoothstep(.01,.12,p.y)*(1.-smoothstep(.55,.99,p.y));
  vec3 cloudDark=mix(vec3(.18,.17,.29),vec3(.38,.16,.20),west);vec3 cloudLit=mix(vec3(.68,.31,.38),vec3(1.25,.34,.10),west);
  float rim=smoothstep(.46,.53,cloud)*(1.-smoothstep(.54,.65,cloud));vec3 cloudColor=mix(cloudDark,cloudLit,rim*.85+.24*west);
  c=mix(c,cloudColor,mask*.85);c=mix(c,c*vec3(.12,.22,.44),night);gl_FragColor=vec4(c,1.);}`;
  this.skyMat=new ShaderMaterial('sky',this.scene,{vertex:'szSky',fragment:'szSky'},{attributes:['position'],uniforms:['worldViewProjection','night']});this.skyMat.backFaceCulling=false;this.skyMat.disableDepthWrite=true;this.skyMat.setFloat('night',0);
  const sky=MeshBuilder.CreateSphere('atmosphere',{diameter:8000,segments:24},this.scene);sky.material=this.skyMat;sky.infiniteDistance=true;sky.isPickable=false;sky.applyFog=false;keepSkyInReflections(sky);
 }
 private async load(name:string){const r=await ImportMeshAsync('/city/'+name+'.glb',this.scene);r.meshes[0].rotationQuaternion=Quaternion.Identity();for(const m of r.meshes){m.isPickable=false;m.receiveShadows=true;if(m.material instanceof PBRMaterial){m.material.environmentIntensity=1.0;m.material.forceIrradianceInFragment=true;m.material.maxSimultaneousLights=8;}if(m.getTotalVertices())m.freezeWorldMatrix();}this.architecture.applyMeshes(r.meshes,name);this.facadeDiversity.applyMeshes(r.meshes,name);return r;}
 async init(progress:(s:string)=>void){
  progress('正在展开深圳地图');const response=await fetch('/city/city.json');if(!response.ok)throw Error('地图加载失败');this.data=await response.json();await loadRoadDisplayNames(this.data);const detail=await loadLandmarkDetails(this.data);if(detail){this.groundHeight=detail.heightAt;this.detailManifest=detail.manifest;}progress('正在展开深圳山脊');this.mountains=await loadCityMountains(this.groundHeight);this.groundHeight=this.mountains.heightAt;progress('正在铺设公园缓坡');this.groundRelief=await loadCityGroundRelief(this.groundHeight,undefined,false);this.groundHeight=this.groundRelief.heightAt;progress('正在架设跨水桥梁');this.coastal=await loadCoastalInfrastructure(this.data,this.groundHeight);this.groundHeight=this.coastal.heightAt;this.collision=new CityCollision(this.data);this.walk=new CityWalk((x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z)||this.parkedVehicleBlocks(x,z),(x,z)=>this.walkingSurfaceHeight(x,z));this.windowSources=[];this.state={...this.data.spawn,speed:0,steer:0,distance:0};
  progress('正在铺设海岸线和城市道路');await this.load('terrain');const roads=await this.load('roads');this.mountains?.drapePaths(roads.meshes);for(const name of ['coastal-bridges','coastal-shoreline','opposite-shore']){const part=await this.load(name);for(const mesh of part.meshes.filter(m=>m.getTotalVertices()>0)){mesh.receiveShadows=name!=='opposite-shore';if(name==='opposite-shore'){mesh.applyFog=true;if(mesh.material instanceof PBRMaterial){mesh.material.albedoColor.set(.10,.15,.14);mesh.material.environmentIntensity=.35;}this.coastalHorizon.push(createCoastalHorizon(this.scene,mesh,this.coastal!.manifest.waterHeight));}if(name==='coastal-shoreline'&&mesh.material)mesh.material.backFaceCulling=false;this.landmarks.push(mesh);}}
  progress('正在载入南山、福田、罗湖建筑');const buildings=await this.load('buildings');this.facadeStream=new CityFacadeStream(this.scene,()=>this.cull(),(meshes,name)=>this.architecture.applyMeshes(meshes,name));await this.facadeStream.init(this.state.x,this.state.z);
  for(const mesh of [...roads.meshes,...buildings.meshes]){const m=mesh.name.match(/(?:block|roads)_(-?\d+)_(-?\d+)_/);if(m)this.blocks.push({mesh,x:(Number(m[1])+.5)*640,z:(Number(m[2])+.5)*640,road:mesh.name.startsWith('roads')});}
  progress('正在装配深圳地标');const lm=await this.load('landmarks');this.landmarks.push(...lm.meshes.filter(m=>m.getTotalVertices()>0));if(this.detailManifest){const prefixes=this.detailManifest.replacedMeshPrefixes;for(const m of [...this.scene.meshes])if(prefixes.some(p=>m.name.startsWith(p)))m.dispose(false,false);this.blocks=this.blocks.filter(b=>!b.mesh.isDisposed());this.landmarks=this.landmarks.filter(m=>!m.isDisposed());const details=await this.load('landmark-detail');for(const mesh of details.meshes.filter(m=>m.getTotalVertices()>0)){const tile=mesh.name.match(/detail_block_(-?\d+)_(-?\d+)_/);if(tile)this.blocks.push({mesh,x:(Number(tile[1])+.5)*640,z:(Number(tile[2])+.5)*640,road:false});else this.landmarks.push(mesh);}}
  this.signage=await loadLandmarkSignage(this.scene);this.landmarks.push(...this.signage.meshes);
  progress('正在打开春笋旁的月白咖啡馆');
  this.bambooCafe=await createBambooCafe(this.scene,this.groundHeight,meshes=>this.landmarks.push(...meshes));
  const cafeGround=this.groundHeight;
  this.groundHeight=(x,z)=>this.bambooCafe!.layout.floorAt(x,z,cafeGround(x,z));
  this.data.landmarks.push(this.bambooCafe.layout.landmark);
  progress('正在点亮城市招牌');this.buildingSigns=await attachCityBuildingSigns(this.scene,buildings.meshes,this.data);
  progress('正在启动你的车');const ambient=await this.load('traffic-car');this.trafficSources=ambient.meshes.filter(m=>m.getTotalVertices()>0);ambient.meshes[0].setEnabled(false);const metadata=await fetch('/city/vehicle-manifest.json').then(r=>r.json()) as {wheelRadius:number;wheelCentresGltf:Record<string,[number,number,number]>;recommendedHeadlightAnchorsGame:[number,number,number][]};this.wheelRadius=metadata.wheelRadius;this.carHeadlightAnchors=metadata.recommendedHeadlightAnchorsGame.slice(0,2) as [number,number,number][];this.headlights.forEach((l,i)=>l.position.copyFromFloats(...this.carHeadlightAnchors[i]));const car=await this.load('car');car.meshes[0].parent=this.car;this.carMeshes=car.meshes.filter(m=>m.getTotalVertices()>0);for(const m of car.meshes){m.unfreezeWorldMatrix();const q=m.name.match(/(?:wheel|brake)_([lr][fr])_/);if(q&&m instanceof Mesh){m.setPivotPoint(Vector3.FromArray(metadata.wheelCentresGltf[q[1]]));m.rotationQuaternion=null;}}
  this.vehicleFinish=applyCinematicVehicleFinish(this.scene,this.car,this.carMeshes);this.carMeshes.push(...this.vehicleFinish.meshes);this.cockpit=createCityCockpit(this.scene,this.car,this.carMeshes);this.carMeshes.push(...this.cockpit.meshes);
  progress('正在种植榕树、棕榈与花境');this.landscape=new CityLandscape(this.scene,this.groundHeight,(x,z,r)=>!!this.bambooCafe?.layout.reserved(x,z,r));await this.landscape.init();this.landscape.configureRoadside(this.data,{collisionFootprints:this.detailManifest?.collisionFootprints,bridgeCrossings:this.coastal?.manifest.crossings,blocked:(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z)});progress('正在布置城市座椅');this.streetFurniture=new CityStreetFurniture(this.scene,this.groundHeight);await this.streetFurniture.init();
  this.setupReflections();applyLandscapeSurfaces(this.scene);this.mountains?.attachVisuals(this.scene);this.groundRelief?.attachVisuals(this.scene);this.roadSurface=applyCinematicRoad(this.scene,this.mirror);this.setupSigns();this.pedestrians=new CityPedestrians(this.scene,this.groundHeight,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z));await this.pedestrians.init();this.pedestrians.place(this.state.x,this.state.z);this.lampData=await(await fetch('/city/lamps.json')).json();for(let i=0;i<2;i++){const l=new PointLight('street-light-pool-'+i,Vector3.Zero(),this.scene);l.diffuse=new Color3(1,.67,.36);l.range=26;l.intensity=70;this.streetLights.push(l);}for(let i=0;i<2;i++){const l=new PointLight('window-spill-'+i,Vector3.Zero(),this.scene);l.diffuse=new Color3(1,.42,.14);l.range=17;l.intensity=0;l.setEnabled(false);this.windowLights.push(l);}
  const parkPoles=await this.load('park-floodlight');this.publicLighting=createPublicLighting(this.scene,this.lampData,this.coastal!.manifest.parkLights,parkPoles.meshes,this.groundHeight);this.publicLighting.update(this.state.x,this.state.z,true);
  progress('正在调试海湾的光与倒影');this.cinematic=await createCinematicLook(this);this.vehicleMaterials=refineHeroVehicleMaterials(this.scene,this.carMeshes);
  this.sportDetails=createCitySportDetails(this.scene,this.car);this.sportDetails.setMode(this.lightMode);this.carMeshes.push(...this.sportDetails.meshes);this.scene.onDisposeObservable.addOnce(()=>this.sportDetails?.dispose());
  progress('雨停了，正在铺设路边积水');this.rainPuddles=createRainPuddles(this.scene,this.data,this.groundHeight,this.mirror);await this.rainPuddles.readyPromise;this.tailLights=createCityTailLights(this.scene,this.car,this.carMeshes,this.vehicleLightRig);this.scene.onDisposeObservable.addOnce(()=>{this.rainPuddles?.dispose();this.cockpit?.dispose();this.tailLights?.dispose();this.streetFurniture?.dispose();this.audio.dispose();this.vehicleMaterials?.dispose();});
  // Sample-area surfaces keep the existing city assets, HDR and public light
  // field. Only the nearby authored fixtures receive a bounded extra shadow.
  this.bambooLook=createBambooLook(this.scene);this.bayparkLook=createBayparkLook(this.scene);
  this.localLighting=createLocalLighting({scene:this.scene,lamps:this.lampData,parkLights:this.coastal!.manifest.parkLights,heightAt:this.groundHeight,casters:()=>this.shadows.getShadowMap()?.renderList??[],stableReceivers:this.carMeshes});
  this.bambooLook.setMode(this.lightMode);this.bayparkLook.setMode(this.lightMode);this.localLighting.setMode(this.lightMode);
  this.bambooCafe.setMode(this.lightMode);
  const depthScenery=new Set([...this.blocks.map(b=>b.mesh),...this.landmarks,...this.scene.meshes.filter(m=>/^(terrain_|ground_relief_)/.test(m.name))]);
  this.sceneryTop=Math.max(0,...Array.from(depthScenery,m=>m.getBoundingInfo().boundingBox.maximumWorld.y));
  this.vehicleReflections=createVehicleReflections(this.scene,this.car,this.carMeshes,this.camera,()=>this.mirror.renderList??[]);this.scene.onDisposeObservable.addOnce(()=>this.vehicleReflections?.dispose());
  this.flight=new CityFlight(this.scene,this.data,this.groundHeight,this.landmarks,()=>this.audio.explosion());this.scene.onDisposeObservable.addOnce(()=>this.flight?.dispose());
  this.tank=new CityTank(this.scene,this.data,this.groundHeight,()=>this.landmarks,()=>this.audio.explosion());this.scene.onDisposeObservable.addOnce(()=>{this.tank?.dispose();this.rider?.dispose();});
  this.ready=true;void this.ensureRider();this.car.position.set(this.state.x,.12,this.state.z);this.car.rotation.y=this.state.yaw;this.cameraYaw=this.state.yaw;
  this.camera.position.set(this.state.x-Math.sin(this.state.yaw)*8,3.7,this.state.z-Math.cos(this.state.yaw)*8);this.camera.setTarget(new Vector3(this.state.x,1.1,this.state.z));this.cull();this.vegetation();
 }
 startTraffic(graph:RoadGraph){this.autopilot=new CityAutopilot(graph,this.collision);this.traffic=new CityTraffic(graph,this.trafficSources,this.scene,this.groundHeight,(a,b)=>{const p=graph.nodes[a],q=graph.nodes[b],n=this.collision.nearest((p[0]+q[0])/2,(p[1]+q[1])/2);return !n?.road.oneway||(q[0]-p[0])*Math.sin(n.yaw)+(q[1]-p[1])*Math.cos(n.yaw)>0;});this.traffic.place(this.state.x,this.state.z);this.cull();}
 startAutoDrive(destination:Landmark){if(this.tank?.active){this.onMessage?.('坦克使用手动驾驶，按 T 换回轿车可自动导航');return;}if(this.walk?.active){this.onMessage?.('走回车旁，按 F 上车后开始驾驶');return;}if(!this.autopilot)return;if(this.observer.active)this.exitPhoto();this.keys.clear();this.paused=false;this.autopilot.start(destination);this.previousAutoPhase='driving';this.audio.cue('engage');this.onMessage?.('自动驾驶 · '+destination.name+' · 方向键 / WASD 随时接管');}
 cancelAutoDrive(reason='manual-takeover'){const status=this.autopilot?.status;if(!status||['idle','cancelled'].includes(status.phase))return;this.autopilot!.cancel(reason);if(reason==='manual-takeover'){this.audio.cue('cancel');this.onMessage?.('已切换为手动驾驶');}}
 propBlocked(x:number,z:number){return !!this.bambooCafe?.layout.blocked(x,z)||this.propObstacles.some(p=>{const dx=x-p.x,dz=z-p.z,c=Math.cos(p.heading),s=Math.sin(p.heading),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.abs(lx)<6.1&&lz> -2.4&&lz<3.3;});}
 get controlMode():'car'|'tank'|'walking'|'observer'|'aircraft'{return this.flight?.active?'aircraft':this.observer.active?'observer':this.walk?.active?'walking':this.tank?.active?'tank':'car';}
 get actor(){return this.walk?.active?{x:this.walk.x,z:this.walk.z,yaw:this.walk.yaw,speed:this.walk.speed}:this.state;}
 // Detail and lighting belong to the subject being viewed. Throttle costly
 // updates while turning the drone, without moving that detail to the eye.
 sceneFocus(){return this.observer.active?this.observer.focus:this.actor;}
 locationRoadName(){const p=this.sceneFocus(),n=this.collision.nearest(p.x,p.z);return n&&n.d<90?roadDisplayName(n.road)+(n.d>n.road.width/2+3?'周边':''):'城市风景';}
 parkedVehicleBlocks(x:number,z:number){
  const dx=x-this.state.x,dz=z-this.state.z,c=Math.cos(this.state.yaw),s=Math.sin(this.state.yaw);
  return Math.abs(dx*c-dz*s)<(this.tank?.active?1.94:1.18)&&Math.abs(dx*s+dz*c)<(this.tank?.active?3.55:2.7);
 }
 get vehicleMeshes(){return this.tank?.active?this.tank.meshes:this.carMeshes;}
 /** Headlights/rear light follow whichever vehicle is driven. Only positions
  * change here; the lights themselves stay enabled so no shader recompiles. */
 syncVehicleLightRig(){
  const tank=this.tank?.active?this.tank:null,root=tank?tank.root:this.car,rig=this.vehicleLightRig;
  rig.position.copyFrom(root.position);rig.rotation.copyFrom(root.rotation);
  const anchors=tank?TANK_HEADLIGHT_ANCHORS:this.carHeadlightAnchors;
  this.headlights.forEach((l,i)=>{const a=anchors[i];if(a&&(l.position.x!==a[0]||l.position.y!==a[1]||l.position.z!==a[2]))l.position.copyFromFloats(a[0],a[1],a[2]);});
 }
 walkingSurfaceHeight(x:number,z:number){
  const height=this.groundHeight(x,z);
  if(Number.isFinite(this.bambooCafe?.layout.floorAt(x,z,NaN)))return height;
  const n=this.collision.nearest(x,z);if(!n)return height;
  // The authored road/pavement meshes sit above the terrain sampler. Place
  // the shoe sole on those surfaces, as the vehicle already does for wheels.
  const edge=n.d-n.road.width/2;
  if(edge<=0)return height+.105;
  const pavement=['trunk','primary','secondary','tertiary'].includes(n.road.kind)?2.4:1.2;
  return height+(edge<pavement?.065:0);
 }
 async toggleTank(){
  if(!this.ready||!this.tank||this.tank.loading||(this.paused&&!this.observer.active))return;
  if(this.walk?.active){this.onMessage?.('先走回车辆旁按 F 上车，再按 T 切换坦克');return;}
  this.cancelAutoDrive('vehicle-switch');if(this.observer.active)this.exitPhoto();this.state.speed=0;this.keys.clear();
  const active=!this.tank.active,request=++this.tankRequest;
  if(active){
   const n=this.collision.nearest(this.state.x,this.state.z);if(!tankFootprintClear(this.state.x,this.state.z,this.state.yaw,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z))){
    if(!n||!tankFootprintClear(n.x,n.z,n.yaw,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z))){this.onMessage?.('这里太窄，请到宽阔道路后切换坦克');return;}
    this.state.x=n.x;this.state.z=n.z;this.state.yaw=n.yaw;
   }
   this.onMessage?.('正在准备坦克');try{await this.tank.load();}catch(error){console.error('Tank asset:',error);this.onMessage?.('坦克素材加载失败，仍可驾驶轿车；按 T 重试');return;}
   if(request!==this.tankRequest||this.scene.isDisposed)return;
   if(!tankFootprintClear(this.state.x,this.state.z,this.state.yaw,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z))){this.onMessage?.('坦克已就绪，请到开阔路段后再按 T');return;}
   if(this.walk?.active||this.observer.active){this.onMessage?.('坦克已准备好，返回车辆后按 T 切换');return;}
  }
  this.tank.setActive(active);this.car.setEnabled(!active);this.state.speed=0;this.state.steer=0;this.view=0;this.cameraYaw=this.state.yaw;
  this.tank.setPose(this.state.x,this.groundHeight(this.state.x,this.state.z),this.state.z,this.state.yaw);this.syncVehicleLightRig();
  this.vehicleReflections?.setEnabled(!active&&this.reflectionsEnabled);this.keys.clear();this.cull();
  this.onMessage?.(active?'坦克 · WASD 驾驶 · Q/E 炮塔 · 空格开炮 · T 换回轿车':'已换回轿车 · F 下车 / T 坦克');
 }
 async ensureRider():Promise<boolean>{
  if(this.rider)return true;if(this.riderPending)return this.riderPending;
  this.riderLoading=true;
  this.riderPending=(async()=>{try{
   const rider=await createCityRider(this.scene);
   if(this.scene.isDisposed){rider.dispose();return false;}
   this.rider=rider;return true;
  }catch(error){console.error('Rider asset:',error);this.onMessage?.('角色加载失败，仍可驾驶；按 F 或“重试角色”重试');return false;}
  finally{this.riderLoading=false;this.riderPending=null;}})();
  return this.riderPending;
 }
 async toggleWalking(){
  if(!this.walk||this.walkingTransition)return;
  this.walkingTransition=true;try{
  if(this.walk.active){if(!this.walk.canEnter(this.state,this.tank?.active?7:5,this.tank?.active?3:1.9)){this.onMessage?.('走回车辆旁，按 F 上车');return;}this.walk.active=false;this.rider?.setEnabled(false);this.cameraYaw=this.state.yaw;this.onMessage?.('已上车 · C 切换驾驶镜头');}
  else{
   if(Math.abs(this.state.speed)>1){this.onMessage?.('先停稳，再按 F 下车');return;}
   if(!this.rider){this.onMessage?.('正在准备步行角色');if(!await this.ensureRider())return;}
   if(this.scene.isDisposed||this.observer.active||this.paused)return;
   if(!this.walk.exitCar(this.state,this.tank?.active?3:1.9)){this.onMessage?.('车门旁需要留出空间，请到开阔处下车');return;}
   this.cancelAutoDrive('exit-car');this.state.speed=0;this.state.steer=0;this.drivingInput={throttle:0,steer:0,handbrake:false};this.walkFirstPerson=false;this.riderYaw=this.walk.yaw;
   this.onMessage?.(`${this.rider?.name??'角色'} · WASD 行走 / Shift 跑步 / 拖动环视 / 滚轮远近 / F 上车`);
  }
  this.keys.clear();this.cull();this.vegetation();
  }finally{this.walkingTransition=false;}
 }
 enterPhoto(m:Landmark){
  this.flightRequest++;this.flight?.stop();
  this.cancelAutoDrive('observer');
  this.photoTarget=m;this.aerial=true;this.paused=true;this.keys.clear();
  const distance=m.photoDistance??(m.id==='civic'?380:m.height?m.height*1.65:320),elevation=m.photoElevation??.32;
  const focus={x:m.x,y:m.photoTargetHeight??(this.groundHeight(m.x,m.z)+m.height*.38),z:m.z};
  this.observer.begin(focus,distance,m.photoAngle??.65,elevation);this.observer.step(this.keys,0,this.groundHeight,this.data.meta.extent);
  this.cull();this.vegetation();this.onMessage?.('无人机 · WASD 平移 / 方向键转头 / Q E 升降 / 拖动环绕 / Shift 拖移 / G 或 F 返回');
 }
 async toggleFlight(){
  const flight=this.flight;if(!flight||!this.ready||!this.observer.active||this.photoTarget?.id==='car')return;
  if(flight.active||flight.loading){this.returnFromFlight();return;}
  const request=++this.flightRequest;this.keys.clear();this.drag=false;
  try{await flight.load();if(request!==this.flightRequest||!this.observer.active||this.scene.isDisposed)return;
   if(!flight.start(this.observer.pose(),this.observer.yaw)){this.onMessage?.('此处没有足够起飞空间，请移动无人机后重试');return;}
   this.paused=true;this.cull();this.onMessage?.('湾翼 · W/S 抬头俯冲 · A/D 侧倾 · 空格发射导弹 · X 减速 · B 无人机');
  }catch(error){console.error('Aircraft asset failed to load',error);if(request===this.flightRequest)this.onMessage?.('飞机加载失败，已保留无人机模式，可按 B 重试');}
 }
 returnFromFlight(reason?:'recovered'|'boundary'){
  const flight=this.flight;if(!flight||(!flight.active&&!flight.loading&&!reason))return;
  this.flightRequest++;const p={...flight.sim.lastSafe};const wasLoaded=flight.loaded;
  flight.stop();this.keys.clear();this.drag=false;
  if(!wasLoaded)return;
  this.enterPhoto({id:'free-camera',name:'自由无人机',x:p.x-Math.sin(p.yaw)*25,z:p.z-Math.cos(p.yaw)*25,height:0,area:'城市全景',excludeRadius:0,arrival:[this.state.x,this.state.z],yaw:p.yaw,photoDistance:65,photoElevation:.22,photoAngle:-p.yaw,photoTargetHeight:p.y+18});
  this.onMessage?.(reason==='recovered'?'已返回无人机 · B 可再次飞行':reason==='boundary'?'已到城市边界 · 返回无人机观景':'已切换无人机 · B 进入飞机模式');
 }
 aerialEffects(active:boolean){if(this.overviewEffects===active)return;this.overviewEffects=active;this.sun.orthoLeft=this.sun.orthoBottom=active?-1050:-260;this.sun.orthoRight=this.sun.orthoTop=active?1050:260;this.sun.shadowMaxZ=active?3200:1200;this.shadows.getShadowMap()!.refreshRate=active?12:1;this.shadows.getShadowMap()!.resetRefreshCounter();if(this.ao){const manager=this.scene.postProcessRenderPipelineManager;if(active)manager.detachCamerasFromRenderPipeline('contact-shading',this.camera);else manager.attachCamerasToRenderPipeline('contact-shading',this.camera);}applyAntiAliasing(this.pipeline,active);syncPostChain(this.scene,this.pipeline,this.camera);this.cull();}
 toggleAerial(){if(this.observer.active){this.exitPhoto();return;}const s=this.actor;this.enterPhoto({id:'free-camera',name:'自由无人机',x:s.x,z:s.z,height:0,area:'城市全景',excludeRadius:0,arrival:[s.x,s.z],yaw:s.yaw,photoDistance:420,photoElevation:.42,photoAngle:.65,photoTargetHeight:this.groundHeight(s.x,s.z)+15});}
 exitPhoto(){this.flightRequest++;this.flight?.stop();this.aerialEffects(false);this.observer.active=false;this.aerial=false;this.photoTarget=null;this.paused=false;this.keys.clear();
  // Reselect lamps at the returning actor; nearby aerial slots can otherwise
  // remain latched to different poles within the 100 m assignment hysteresis.
  this.lampAssignments.fill(-1);this.lightTargets=[];this.lightTick=0;for(const light of this.streetLights)light.intensity=0;
  this.camera.position.set(this.state.x-Math.sin(this.state.yaw)*9,this.groundHeight(this.state.x,this.state.z)+3.5,this.state.z-Math.cos(this.state.yaw)*9);this.cull();this.vegetation();this.onMessage?.(this.walk?.active?'返回步行探索':'返回驾驶');}
 setupReflections(){
  for(const material of this.scene.materials)if(material instanceof PBRMaterial&&/^car_glass(?:\.\d+)?$/.test(material.name)){material.albedoColor=new Color3(.012,.020,.027);material.metallic=0;material.roughness=.17;material.environmentIntensity=.55;material.specularIntensity=.65;material.clearCoat.isEnabled=false;}
  for(const material of this.scene.materials){if(!(material instanceof PBRMaterial))continue;if(material.name==='roadline')material.zOffset=-2;if(!this.carMeshes.some(mesh=>mesh.material===material)&&/^carpaint(?:\.\d+)?$/.test(material.name)){material.albedoColor=new Color3(.028,.074,.093);material.environmentIntensity=.75;material.metallic=.52;material.roughness=.31;material.specularIntensity=.65;}}
  for(const material of this.scene.materials){if(material instanceof PBRMaterial&&material.name==='asphalt'){material.reflectionTexture=this.mirror;material.metallic=.025;material.roughness=1.0;const n=128,orm=new Uint8Array(n*n*3),normal=new Uint8Array(n*n*3);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=(y*n+x)*3,r=Math.sin(x*127.1+y*311.7)*43758.54,f=r-Math.floor(r),wet=Math.sin(x*.09)*Math.cos(y*.07);orm[k]=255;orm[k+1]=Math.round(235+wet*16);orm[k+2]=255;normal[k]=128+(f-.5)*22;normal[k+1]=128+(f-.5)*15;normal[k+2]=253;}material.metallicTexture=RawTexture.CreateRGBTexture(orm,n,n,this.scene,true,false);material.useRoughnessFromMetallicTextureGreen=true;material.useRoughnessFromMetallicTextureAlpha=false;material.bumpTexture=RawTexture.CreateRGBTexture(normal,n,n,this.scene,true,false);material.bumpTexture.level=.10;}
   if(material instanceof PBRMaterial&&!this.carMeshes.some(mesh=>mesh.material===material)&&/^carpaint(?:\.\d+)?$/.test(material.name)){material.clearCoat.isEnabled=true;material.clearCoat.intensity=.62;material.clearCoat.roughness=.23;}}
  const waterMeshes=this.scene.meshes.filter(m=>m.name==='terrain_water');if(this.coastal)this.bayWater=createBayWater(this.scene,this.waterMirror,waterMeshes,this.coastal.manifest);for(const light of this.headlights)light.excludedMeshes.push(...waterMeshes);

 }
 setupSigns(){
  // Signs are placed at actual major-road points, never at arbitrary world rows.
  let count=0;for(const road of this.data.roads){if(road.points.length<4||!['primary','trunk'].includes(road.kind)||road.name.includes('辅'))continue;const a=road.points[0],b=road.points[1];if(Math.abs(a[0]-this.data.spawn.x)>650||Math.abs(a[1]-this.data.spawn.z)>700)continue;if(count++>8)break;
   // The artwork belongs only on the traffic-facing side. Rendering the same
   // textured plane from behind mirrors both the Chinese and Latin lettering.
   const sign=MeshBuilder.CreatePlane('direction-sign',{width:8,height:2,sideOrientation:Mesh.FRONTSIDE},this.scene);const mat=new StandardMaterial('wayfinding',this.scene);
   mat.diffuseTexture=new Texture('/city/textures/sign-'+(b[0]<a[0]?'west':'east')+'.jpg',this.scene);mat.diffuseTexture.anisotropicFilteringLevel=8;
   // StandardMaterial adds emissiveTexture to emissiveColor. Keep the green
   // artwork in diffuseTexture so the unlit brightness multiplies its color.
   mat.specularColor=Color3.Black();mat.disableLighting=true;mat.emissiveColor=new Color3(.82,.82,.82);
   sign.material=mat;sign.position.set(a[0],6.8,a[1]);sign.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1])+Math.PI;sign.isPickable=false;
  }
 }
 cull(){const p=this.sceneFocus();this.lastCull.set(p.x,0,p.z);const shadowDistance=this.overviewEffects?1800:800;this.sun.position.set(p.x-this.sun.direction.x*shadowDistance,this.groundHeight(p.x,p.z)-this.sun.direction.y*shadowDistance,p.z-this.sun.direction.z*shadowDistance);this.facadeStream?.update(p.x,p.z,this.debugFacades,this.overviewEffects?250:0);const traffic=this.traffic?.meshes.flat()??[];const casters:AbstractMesh[]=[...(this.flight?.active?this.flight.meshes:[]),...this.vehicleMeshes.filter(m=>m.metadata?.castsShadows!==false),...(this.walk?.active?this.rider?.meshes??[]:[]),...traffic,...(this.pedestrians?.casters??[])];const reflect:AbstractMesh[]=[...(this.flight?.active?this.flight.meshes:[]),...(this.mountains?.meshes??[]),...this.vehicleMeshes,...(this.walk?.active?this.rider?.meshes??[]:[]),...this.landmarks,...this.coastalHorizon.flatMap(h=>h.mesh?[h.mesh]:[]),...traffic,...(this.buildingSigns?.meshes??[])];const sky=this.scene.getMeshByName('atmosphere');if(sky)reflect.push(sky);
  // Base buildings are already loaded. Aerial views retain their original
  // roofs, UV2 facade styles and glass; normal frustum culling limits draws.
  // Extra far geometry does not enter the existing shadow/reflection radii.
  for(const b of this.blocks){const d=Math.hypot(p.x-b.x,p.z-b.z);b.mesh.setEnabled((!b.detail||this.debugFacades)&&(d<(b.detail?700:b.road?2500:3300)||(this.overviewEffects&&!b.detail&&(!b.road||b.mesh.name.endsWith('_asphalt')))));if(d<(this.overviewEffects?1650:520)&&!b.road)casters.push(b.mesh);if(d<1400&&!b.road)reflect.push(b.mesh);}
  for(const m of this.landmarks){const center=m.getBoundingInfo().boundingBox.centerWorld;if(Vector3.Distance(center,new Vector3(p.x,0,p.z))<(this.overviewEffects?1650:700))casters.push(m);}
  casters.push(...(this.groundRelief?.shadowMeshes(p.x,p.z,this.overviewEffects?1450:650)??[]));casters.push(...(this.landscape?.casters??[]));for(const m of this.facadeStream?.shadowMeshes??[])casters.push(m);

  for(const light of this.windowLights){light.intensity=0;light.setEnabled(false);}
  this.shadows.getShadowMap()!.renderList=casters;if(this.aerial)this.shadows.getShadowMap()!.resetRefreshCounter();
  // Contact-shading depth/normal buffer: only meshes whose bounds reach into
  // the AO range (terrain and roads qualify through their large radii). The
  // shadow casters' 520 m radius is deliberately not reused: every mesh here
  // is drawn a second time. Vehicles and pedestrians are thin-instanced with
  // lagging bounds, so they are always in; the sky never is.
  const gbuffer=this.scene.geometryBufferRenderer;
  if(gbuffer){if(this.overviewEffects)gbuffer.renderList=[];else{const reach=STREET_AO.maxZ+STREET_AO.listMargin,near=new Set<AbstractMesh>([...this.vehicleMeshes,...(this.walk?.active?this.rider?.meshes??[]:[]),...traffic,...(this.pedestrians?.casters??[])]);for(const m of this.scene.meshes){if(near.has(m)||m===sky||!m.isEnabled()||!m.isVisible||!m.subMeshes?.length)continue;const s=m.getBoundingInfo().boundingSphere;if(Math.hypot(s.centerWorld.x-p.x,s.centerWorld.z-p.z)-s.radiusWorld<reach)near.add(m);}gbuffer.renderList=[...near];}}
  // A detail landmark can contain asphalt: never draw a material into its own texture.
  this.mirror.renderList=reflect.filter(m=>!m.material?.hasTexture(this.mirror));this.waterMirror.renderList=reflect.filter(m=>!m.material?.hasTexture(this.waterMirror));
  this.localLighting?.update(0,this.camera.position,true);
 }
 localLights(dt:number){
  this.lightTick-=dt;const p=this.sceneFocus();
  if(this.lightTick<=0){this.lightTick=.25;
   const sorted=this.lampData.map((l,id)=>({id,d:Math.hypot(l[0]-p.x,l[1]-p.z)})).filter(q=>q.d<120).sort((a,b)=>a.d-b.d);
   for(let i=0;i<this.streetLights.length;i++){
    const old=this.lampAssignments[i],lamp=this.lampData[old],d=lamp?Math.hypot(lamp[0]-p.x,lamp[1]-p.z):Infinity;
    // Keep identity across ranking changes; replace only an expired slot.
    if(d>100&&this.streetLights[i].intensity<1)this.lampAssignments[i]=sorted.find(q=>!this.lampAssignments.includes(q.id))?.id??-1;
   }
   this.lightTargets=this.lampAssignments.map(id=>{const l=this.lampData[id],d=l?Math.hypot(l[0]-p.x,l[1]-p.z):Infinity;return {position:l?new Vector3(l[0]-l[2]*1.5,this.groundHeight(l[0],l[1])+8.2,l[1]-l[3]*1.5):Vector3.Zero(),power:(this.night?360:this.lightMode==='day'?0:75)*clamp((108-d)/30,0,1)};});
  }
  this.streetLights.forEach((l,i)=>{const t=this.lightTargets[i];if(!t)return;const changing=Vector3.DistanceSquared(l.position,t.position)>1;if(changing&&l.intensity<1)l.position.copyFrom(t.position);const target=changing?0:t.power;l.intensity+=(target-l.intensity)*(1-Math.exp(-dt*6));l.range=46;});
 }


 vegetation(){
  const focus=this.sceneFocus();this.lastVegetation.set(focus.x,0,focus.z);this.lastLandscapeAerial=this.overviewEffects;
  this.landscape?.update(focus.x,focus.z,this.overviewEffects,true);
  const plants=new Set(this.landscape?.meshes??[]),shadow=this.shadows.getShadowMap()!;
  shadow.renderList=[...(shadow.renderList??[]).filter(m=>!plants.has(m)),...(this.landscape?.casters??[])];shadow.resetRefreshCounter();
  this.localLighting?.update(0,this.camera.position,true);
 }
 setLightMode(mode:'sunset'|'night'|'day'){
  this.lightMode=mode;this.night=mode==='night';this.skyMat.setFloat('night',this.night?1:0);
  this.architecture.setMode(mode);this.facadeDiversity.setMode(mode);this.signage?.setMode(mode);this.buildingSigns?.setNight(this.night);
  this.cinematic?.setMode(mode);this.roadSurface?.setMode(mode);this.rainPuddles?.setMode(mode);this.bayWater?.setMode(mode);this.publicLighting?.setMode(mode);this.lightTick=0;
  setLandscapeLightingMode(this.scene,mode);this.sportDetails?.setMode(mode);
  for(const light of this.headlights)light.intensity=mode==='day'?20:250;
  for(const m of this.scene.materials){
   if(m instanceof PBRMaterial&&/^lamp(?:\.\d+)?$/.test(m.name))m.emissiveIntensity=mode==='day'?0:1;
   // Dedicated civic materials retain the photographed blue roof/red-yellow
   // towers. Only the underside and eave fixtures receive night illumination.
   if(m instanceof PBRMaterial&&/^civic_(?:eave_light|flood_light)(?:\.\d+)?$/.test(m.name))m.emissiveIntensity=mode==='day'?0:mode==='night'?2.1:.55;
   if(m instanceof PBRMaterial&&/^civic_soffit(?:\.\d+)?$/.test(m.name))m.emissiveIntensity=mode==='day'?0:mode==='night'?.45:.08;
   if(m instanceof StandardMaterial&&m.name==='wayfinding'){const brightness=mode==='day'?.95:mode==='night'?.60:.82;m.emissiveColor.copyFromFloats(brightness,brightness,brightness);}
  }
  this.bambooLook?.setMode(mode);this.bayparkLook?.setMode(mode);this.localLighting?.setMode(mode);
  this.bambooCafe?.setMode(mode);
  this.cull();this.shadows.getShadowMap()?.resetRefreshCounter();this.mirror.resetRefreshCounter();this.waterMirror.resetRefreshCounter();
  this.onMessage?.({sunset:'海湾日落 · L 切换夜色',night:'月下深圳 · L 切换晴日',day:'雨后晴日 · 蓝天白云 · L 切换日落'}[mode]);
 }
 toggleLight(){this.setLightMode(this.lightMode==='sunset'?'night':this.lightMode==='night'?'day':'sunset');}
 resetRoad(){if(!this.ready)return;this.debugEpoch++;if(this.walk?.active)this.walk.active=false;this.cancelAutoDrive('reset-road');const n=this.collision.nearest(this.state.x,this.state.z);if(n){this.state.x=n.x;this.state.z=n.z;this.state.yaw=n.yaw;this.state.speed=0;this.state.steer=0;this.cameraYaw=n.yaw;this.onMessage?.('已回到 '+roadDisplayName(n.road));}else this.travel(this.data.landmarks.find(m=>m.id==='baypark')!);}
 travel(m:Landmark){this.debugEpoch++;if(this.walk)this.walk.active=false;this.cancelAutoDrive('debug-travel');if(this.observer.active)this.exitPhoto();this.state.x=m.arrival[0];this.state.z=m.arrival[1];this.state.yaw=m.yaw;this.state.speed=0;this.state.steer=0;this.cameraYaw=m.yaw;this.car.position.set(this.state.x,this.groundHeight(this.state.x,this.state.z)+.115,this.state.z);this.camera.position.set(this.state.x-Math.sin(m.yaw)*9,this.groundHeight(this.state.x,this.state.z)+4,this.state.z-Math.cos(m.yaw)*9);this.cull();this.vegetation();this.traffic?.place(this.state.x,this.state.z);this.pedestrians?.place(this.state.x,this.state.z);this.onMessage?.('已抵达 '+m.name+' 周边道路');}
 update(dt:number){
  this.time+=dt;if(!this.paused)this.tank?.step(dt);
  if(this.flight?.active){const result=this.flight.step(this.keys,dt,performance.now());if(result==='recovered'||result==='boundary')this.returnFromFlight(result);else if(result==='crashed'){this.keys.clear();this.onMessage?.('飞机撞毁 · 3 秒后返回无人机');}}
  this.localLights(dt);const oldCarX=this.car.position.x,oldCarZ=this.car.position.z;if(!this.paused&&this.controlMode==='walking'&&this.walk){const before={x:this.walk.x,z:this.walk.z};this.walk.step(this.keys,dt);if(this.walk.moving){const target=Math.atan2(this.walk.x-before.x,this.walk.z-before.z),delta=Math.atan2(Math.sin(target-this.riderYaw),Math.cos(target-this.riderYaw));this.riderYaw+=delta*(1-Math.exp(-dt*16));}}
  if(this.walk&&this.rider){this.rider.setEnabled(this.walk.active&&(!this.walkFirstPerson||this.observer.active));this.rider.setPose({x:this.walk.x,y:this.walkingSurfaceHeight(this.walk.x,this.walk.z),z:this.walk.z,yaw:this.riderYaw,speed:this.paused?0:this.walk.speed},dt);}
  if(!this.paused&&!this.walk?.active){const n=this.collision.nearest(this.state.x,this.state.z);this.offroad=!n||n.d>n.road.width/2+1;if(n&&n.d<40)this.roadName=roadDisplayName(n.road);
   const throttle=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0),steer=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0);
   const manual={throttle,steer:this.tank?.active?steer:manualSteeringInput(steer,this.state.speed),handbrake:this.keys.has(this.tank?.active?'KeyX':'Space')};const status=this.autopilot?.status;
   this.drivingInput=status&&!['idle','cancelled'].includes(status.phase)?this.autopilot!.update(this.state,this.traffic?.cars??[],dt).input:manual;
   const phase=this.autopilot?.status.phase??'idle';if(phase!==this.previousAutoPhase){if(phase==='arrived'){this.audio.cue('arrival');this.onMessage?.('已自动停靠 · '+this.autopilot!.status.destination!.name);}if(phase==='blocked')this.onMessage?.('前方暂时无法通过，已停车 · 可以手动接管或重选路线');this.previousAutoPhase=phase;}
   const before={...this.state};if(this.tank?.active){stepTank(this.state,this.drivingInput,dt);this.tank.aim(this.keys,dt);if(this.keys.has('Space'))this.tank.fire();}else stepCar(this.state,this.drivingInput,dt);
   // Substep collision along nose/center prevents tunnelling through facades.
   if(Math.abs(this.state.speed)>.02){const steps=Math.max(1,Math.ceil(Math.abs(this.state.speed)*dt/.7));let hit=false;for(let i=1;i<=steps;i++){const x=before.x+(this.state.x-before.x)*i/steps,z=before.z+(this.state.z-before.z)*i/steps;const f=Math.sign(this.state.speed)*(this.tank?.active?3.4:1.45);if((this.tank?.active&&!tankFootprintClear(x,z,this.state.yaw,(a,b)=>this.collision.blocked(a,b)||this.propBlocked(a,b)))||this.collision.blocked(x+Math.sin(this.state.yaw)*f,z+Math.cos(this.state.yaw)*f)||this.propBlocked(x,z)||this.traffic?.cars.some(c=>Math.hypot(c.x-x,c.z-z)<2.7)){hit=true;break;}}if(hit){this.state.x=before.x;this.state.z=before.z;this.state.distance=before.distance;this.state.speed=this.tank?.active?0:-before.speed*.15;}}
   const impact=this.pedestrians?.collideVehicle({...before,groundY:this.groundHeight(before.x,before.z)},{...this.state,groundY:this.groundHeight(this.state.x,this.state.z)},this.tank?.active?'tank':'sports-car');
   if(impact?.hits){this.state.speed*=Math.pow(.97,Math.min(3,impact.hits));this.audio.impact(impact.peakSpeed);}
  }
  const s=this.state;if(!this.paused){this.traffic?.update(dt,this.actor.x,this.actor.z);this.pedestrians?.update(dt,this.actor.x,this.actor.z);this.wheelSpin+=s.speed*dt/this.wheelRadius;for(const m of this.carMeshes)if(m.name.startsWith('wheel_')){m.rotation.x=this.wheelSpin;m.rotation.y=m.name.match(/wheel_[lr]f_/)?-s.steer:0;}else if(m.name.startsWith('brake_'))m.rotation.set(0,-s.steer,0);}const ground=this.groundHeight(s.x,s.z);this.car.position.set(s.x,ground+.115+Math.sin(this.time*7)*Math.min(.008,Math.abs(s.speed)*.0004),s.z);const front=this.groundHeight(s.x+Math.sin(s.yaw)*1.5,s.z+Math.cos(s.yaw)*1.5),rear=this.groundHeight(s.x-Math.sin(s.yaw)*1.5,s.z-Math.cos(s.yaw)*1.5);this.car.rotation.set(-Math.atan2(front-rear,3),s.yaw,-s.steer*s.speed*.0025);
  if(this.tank?.active)this.tank.setPose(s.x,ground,s.z,s.yaw);
  this.syncVehicleLightRig();
  if(!this.drag){this.viewReturn-=dt;if(this.viewReturn<=0){let d=s.yaw-this.cameraYaw;d=Math.atan2(Math.sin(d),Math.cos(d));this.cameraYaw+=d*(1-Math.exp(-dt*3));}}
  const f=this.tank?.active?(this.view===1?-5:this.view===2?-22:-13):this.view===1?0.75:this.view===2?-18:-8.6;const height=this.tank?.active?(this.view===1?4:this.view===2?11:5.2):this.view===1?1.35:this.view===2?9:1.75+this.cameraPitch*2;
  const target=new Vector3(s.x+Math.sin(s.yaw)*5,ground+(this.view===0?2.65:1.15),s.z+Math.cos(s.yaw)*5);
  const desired=new Vector3(s.x+Math.sin(this.cameraYaw)*f,ground+height,s.z+Math.cos(this.cameraYaw)*f);this.camera.position.x+=s.x-oldCarX;this.camera.position.z+=s.z-oldCarZ;this.camera.position=Vector3.Lerp(this.camera.position,desired,1-Math.exp(-dt*(this.view===1?20:9)));this.camera.setTarget(target);this.camera.fov=.80+Math.abs(s.speed)*.00045;if(this.flight?.active){
   const p=this.flight.sim.pose,shot=this.flight.camera;this.observer.focus={x:p.x,y:p.y,z:p.z};this.observer.yaw=p.yaw;
   this.camera.position.copyFrom(shot.eye);this.camera.setTarget(shot.target);this.camera.minZ=.5;this.camera.fov=.88;this.aerialEffects(p.y-this.groundHeight(p.x,p.z)>(this.overviewEffects?125:165));
  }else if(this.observer.active){
   this.observer.step(this.keys,dt,this.groundHeight,this.data.meta.extent);const p=this.observer.pose(),f=this.observer.focus;
   this.camera.position.set(p.x,p.y,p.z);this.camera.setTarget(new Vector3(f.x,f.y,f.z));this.camera.fov=.85;
   this.camera.minZ=observerNearClip(this.observer.distance,p.y,this.sceneryTop,this.photoTarget?.id==='car');
   this.aerialEffects(p.y-this.groundHeight(p.x,p.z)>(this.overviewEffects?125:165));
  }else if(this.walk?.active){
   const e=this.walk.eye,direction=new Vector3(Math.sin(this.walk.yaw)*Math.cos(this.walk.pitch),-Math.sin(this.walk.pitch),Math.cos(this.walk.yaw)*Math.cos(this.walk.pitch));
   const eye=new Vector3(e.x,e.y,e.z),desired=eye.subtract(direction.scale(this.walk.cameraDistance)).addInPlaceFromFloats(.35,.4,0);
   if(this.walkFirstPerson){this.camera.position.copyFrom(eye);this.camera.setTarget(eye.add(direction));}
   else{let distance=1;for(let t=.15;t<=1;t+=.07){const p=Vector3.Lerp(eye,desired,t);if(this.collision.blocked(p.x,p.z)||this.propBlocked(p.x,p.z)){distance=Math.max(.12,t-.1);break;}}this.camera.position.copyFrom(Vector3.Lerp(eye,desired,distance));this.camera.position.y=Math.max(this.camera.position.y,this.groundHeight(this.camera.position.x,this.camera.position.z)+.3);this.camera.setTarget(eye.add(direction.scale(.7)).addInPlaceFromFloats(0,-.55,0));}this.camera.minZ=.12;this.camera.fov=.88;
  }else if(this.view===1&&this.cockpit&&!this.tank?.active){
   const transform=this.car.computeWorldMatrix(true);this.camera.position.copyFrom(Vector3.TransformCoordinates(Vector3.FromArray(CITY_DRIVER_POSE.position),transform));this.camera.setTarget(Vector3.TransformCoordinates(Vector3.FromArray(CITY_DRIVER_POSE.lookAhead),transform));this.camera.minZ=CITY_DRIVER_POSE.nearZ;this.camera.fov=CITY_DRIVER_POSE.fov;
  }else this.camera.minZ=.75;
  this.cockpit?.setActive(this.view===1&&!this.observer.active&&!this.walk?.active&&!this.tank?.active);this.cockpit?.update(s.speed,s.steer/.48,{night:this.night,distanceMetres:s.distance});
  const braking=this.drivingInput.handbrake||this.drivingInput.throttle*s.speed<-.1;this.tailLights?.update({braking,night:this.night,speed:s.speed,enabled:!this.tank?.active});this.audio.update({speed:s.speed,throttle:this.drivingInput.throttle,steer:s.steer,braking,paused:this.paused,cockpit:this.view===1&&!this.observer.active,offroad:this.offroad});

  // Vehicle highlights come from world lighting, never a camera-following fill.
  if(!this.tank?.active)this.vehicleReflections?.update(this.time);
  this.buildingSigns?.update(this.camera.position);
  const focus=this.sceneFocus(),detailMoving=Math.hypot(focus.x-this.previousDetailFocus.x,focus.z-this.previousDetailFocus.z)>.01;
  if(detailMoving)this.facadeStream?.noteFocusMotion();
  const detailSettled=this.detailWasMoving&&!detailMoving;
  this.previousDetailFocus={x:focus.x,z:focus.z};this.detailWasMoving=detailMoving;
  if(!this.overviewEffects||this.time>=this.nextDetailUpdate||detailSettled){
   this.nextDetailUpdate=this.time+.25;
   this.streetFurniture?.update(focus.x,focus.z,this.overviewEffects);this.rainPuddles?.update(focus.x,focus.z,this.camera.position.y-this.groundHeight(this.camera.position.x,this.camera.position.z));
   if(!this.overviewEffects){const d=this.sun.direction;this.sun.position.set(focus.x-d.x*800,this.groundHeight(focus.x,focus.z)-d.y*800,focus.z-d.z*800);}
   if(Math.hypot(focus.x-this.lastCull.x,focus.z-this.lastCull.z)>100||detailSettled)this.cull();
   if(Math.hypot(focus.x-this.lastVegetation.x,focus.z-this.lastVegetation.z)>22||this.lastLandscapeAerial!==this.overviewEffects)this.vegetation();
   this.publicLighting?.update(focus.x,focus.z);
  }
  this.bayWater?.update(this.time);
  this.localLighting?.update(dt,this.camera.position);
  this.bambooCafe?.update(this.camera.position.x,this.camera.position.z,this.walk?.active?this.actor:null);
  const direction=this.camera.getForwardRay().direction,moving=Vector3.DistanceSquared(this.camera.position,this.reflectionEye)>.000001||Vector3.DistanceSquared(direction,this.reflectionDirection)>.0000001;
  if(moving||this.drag)this.reflectionMotionUntil=this.time+.22;
  if(this.reflectionsEnabled){for(const [texture,idleRate] of [[this.mirror,2],[this.waterMirror,3]] as const){const rate=this.time<this.reflectionMotionUntil?1:idleRate;if(texture.refreshRate!==rate){texture.refreshRate=rate;texture.resetRefreshCounter();}}}
  this.reflectionEye.copyFrom(this.camera.position);this.reflectionDirection.copyFrom(direction);
  this.onTick?.(dt);
 }
 carPaintDiagnostics(){const m=this.carMeshes.map(m=>m.material).find(m=>m instanceof PBRMaterial&&/^carpaint(?:\.\d+)?$/.test(m.name)) as PBRMaterial|undefined;return m?{name:m.name,clearCoat:m.clearCoat.isEnabled,albedo:m.albedoColor.asArray(),environmentIntensity:m.environmentIntensity,roughness:m.roughness}:null;}

 profileControls(){const panel=document.createElement('div');panel.id='render-profile';panel.style.cssText='position:fixed;z-index:100;right:12px;top:140px;background:#102029ee;padding:12px;color:white;font:13px sans-serif;pointer-events:auto';for(const [name,change] of Object.entries({facades:(v:boolean)=>{this.debugFacades=v;this.cull();},shadows:(v:boolean)=>{this.scene.shadowsEnabled=v;},reflections:(v:boolean)=>{this.reflectionsEnabled=v;this.vehicleReflections?.setEnabled(v);this.mirror.refreshRate=v?1:0;this.waterMirror.refreshRate=v?1:0;},ssao:(v:boolean)=>{if(v)this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('contact-shading',this.camera);else this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('contact-shading',this.camera);},simulation:(v:boolean)=>{this.debugSimulation=v;}})){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.profile=name;input.onchange=()=>change(input.checked);label.append(input,name);label.style.display='block';panel.append(label);}document.body.append(panel);}
 diagnostics(){const i=this.instrumentation;return {shaders:{compiles:this.gpuInstrumentation.shaderCompilationTimeCounter.count,compileMs:+this.gpuInstrumentation.shaderCompilationTimeCounter.total.toFixed(1),lights:this.scene.lights.length,materials:this.scene.materials.length,parallelCompile:!!this.engine.getCaps().parallelShaderCompile},vehicleReflections:this.vehicleReflections?.stats(),pedestrianImpacts:this.pedestrians?.stats,sampleAreas:{bamboo:this.bambooLook?.stats(),baypark:this.bayparkLook?.stats(),lighting:this.localLighting?.stats()},depthPrecision:{near:this.camera.minZ,far:this.camera.maxZ,sceneryTop:this.sceneryTop},contactShading:{attached:!!this.ao&&this.ao.cameras.includes(this.camera),gbufferMeshes:this.scene.geometryBufferRenderer?.renderList?.length??null,...STREET_AO},reflectionFrames:{...this.reflectionFrames,current:this.renderFrames,roadRate:this.mirror.refreshRate,waterRate:this.waterMirror.refreshRate},updateMs:this.updateMs,renderSubmitMs:this.renderMs,gpuMs:this.gpuInstrumentation.gpuFrameTimeCounter.lastSecAverage/1e6,activeEvaluationMs:i.activeMeshesEvaluationTimeCounter.lastSecAverage,renderTargetsMs:i.renderTargetsRenderTimeCounter.lastSecAverage,drawCalls:i.drawCallsCounter.current,instantFps:this.engine.getFps(),renderFrames:this.renderFrames,hidden:document.hidden,facades:this.facadeStream?.stats,coastalHorizon:this.coastalHorizon.map(h=>h.stats),distantCity:{strategy:"original-building-meshes",proxyMeshes:0,extraTextures:0,extraShadowDraws:0,extraReflectionDraws:0},detailFocus:{...this.sceneFocus()},aerial:this.aerial,observer:this.observer.status,loadedMeshes:this.scene.meshes.length,enabledMeshes:this.scene.meshes.filter(m=>m.isEnabled()).length};}
 performance(){const a=this.samples.slice(120),b=[...a].sort((x,y)=>x-y);const pct=(p:number)=>b[Math.floor((b.length-1)*p)]??0;const mean=a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);return {...this.diagnostics(),cafe:this.bambooCafe?.stats,samples:a.length,meanFps:a.length?1000/mean:0,p50:pct(.5),p95:pct(.95),p99:pct(.99),over50ms:a.filter(v=>v>50).length,resolution:[this.engine.getRenderWidth(),this.engine.getRenderHeight()],meshes:this.scene.getActiveMeshes().length,triangles:this.scene.getActiveIndices()/3};}
}
