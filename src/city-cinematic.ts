import {
 BackgroundMaterial, Color3, Color4, ColorCurves, HDRCubeTexture, ImageProcessingConfiguration, Texture,
 Vector3, type BaseTexture, type Scene, type DirectionalLight, type HemisphericLight,
 type DefaultRenderingPipeline, type PointLight, type Material, type Camera, type PostProcess,
} from '@babylonjs/core';
import {ShenzhenSunsetEnvironment,CITY_SUNSET_SOURCE} from './city-sunset-environment.ts';
import {createCityNightSky,CITY_MOON_DIRECTION} from './city-night-sky.ts';
import {CITY_DAYLIGHT_SOURCE,CITY_DAYLIGHT_SUN_DIRECTION,type CinematicLightingMode} from './city-daylight.ts';
import {ShenzhenDaylightEnvironment} from './city-daylight-environment.ts';
export type {CinematicLightingMode} from './city-daylight.ts';

type CinematicScene={
 scene:Scene;sun:DirectionalLight;hemi:HemisphericLight;camera:Camera;
 pipeline:DefaultRenderingPipeline;carFill?:PointLight|null;
};

type RGB=readonly [number,number,number];
type Grade={shadowsHue:number;shadowsDensity:number;highlightsHue:number;highlightsDensity:number;saturation:number;shadowsSaturation:number};
type LookMode={
 sun:number;sunColor:RGB;hemi:number;hemiSky:RGB;hemiGround:RGB;environment:number;
 fogDensity:number;fogColor:RGB;exposure:number;contrast:number;bloomThreshold:number;bloomWeight:number;grade:Grade;
};
/** Shared photographic finish on top of ACES: MSAA instead of FXAA smear,
 * film grain to break flat shading bands, a soft vignette and a hint of lens
 * fringing. The per-mode split tone (cool shadows / warm highlights) lives in
 * `grade`. Clear daylight has its own lighter finish below.
 * Fringing is kept under 2 px and pushed to the frame edge: at 5 px it drew
 * magenta/green streaks down every tower mullion in the outer third of 1080p.
 * Sharpening was added while the chain still returned a 960×540 frame and only
 * crunched the upscale; at full resolution its pass buys nothing visible, so
 * it stays off (the amounts remain for the look-dev toggle).
 * The vignette is elliptical (stretch 1) at weight 1: the earlier 1.35/0.15
 * circle took 26% off the towers at the frame's side edges, which in daylight
 * read as dirty walls rather than as a lens.
 */
export const CINEMATIC_FINISH={msaa:4,fxaa:false,sharpen:false,sharpenEdge:.22,sharpenColor:1,grain:6.5,vignetteWeight:1,vignetteStretch:1,chromaticAberration:1.8,aberrationRadial:.8} as const;
/** Clear daylight does not need animated grain or lens fringing. Disabling
 * those passes also saves two full-resolution draws; keep the existing AA. */
export const DAYLIGHT_FINISH={grain:false,chromaticAberration:false,vignetteWeight:.25} as const;
export function applyModeFinish(pipeline:DefaultRenderingPipeline,ip:ImageProcessingConfiguration,mode:CinematicLightingMode){
 const day=mode==='day';
 pipeline.grainEnabled=day?DAYLIGHT_FINISH.grain:true;
 pipeline.chromaticAberrationEnabled=day?DAYLIGHT_FINISH.chromaticAberration:true;
 ip.vignetteWeight=day?DAYLIGHT_FINISH.vignetteWeight:CINEMATIC_FINISH.vignetteWeight;
}
/** Aerial anti-aliasing. From the drone the aliasing that reads is shading
 * shimmer from sub-pixel window grids and lamp rows, which MSAA does not touch
 * and FXAA does soften; geometry edges are far and thin. 4× MSAA there cost
 * ~7 ms of GPU at 1080p against ~1 ms for FXAA, so the aerial view trades
 * multisampling for FXAA and the street keeps MSAA for crisp near edges. */
export const AERIAL_FINISH={msaa:1,fxaa:true} as const;
export function applyAntiAliasing(pipeline:DefaultRenderingPipeline,aerial:boolean){
 const {msaa,fxaa}=aerial?AERIAL_FINISH:CINEMATIC_FINISH;
 if(pipeline.samples===msaa&&pipeline.fxaaEnabled===fxaa)return false;
 // Each property change rebuilds the whole post chain, and every rebuild flips
 // imageProcessingConfiguration.applyByPostProcess off and back on. Each flip
 // marks every material dirty (~35 ms per call on this city, four calls per
 // toggle) and re-keys every submesh's defines in the next frame. The end
 // state is identical, so suppress that storm and rebuild once for both
 // properties.
 const scene=pipeline.scene as Scene&{_forceBlockMaterialDirtyMechanism(value:boolean):void},blocked=scene.blockMaterialDirtyMechanism,automatic=pipeline.automaticBuild;
 scene._forceBlockMaterialDirtyMechanism(true);
 try{pipeline.automaticBuild=false;pipeline.samples=msaa;pipeline.fxaaEnabled=fxaa;pipeline.automaticBuild=automatic;pipeline.prepare();}
 finally{scene._forceBlockMaterialDirtyMechanism(blocked);}
 return true;
}
/** Per-mode lighting balance. Direct sun against total fill (hemisphere +
 * HDR irradiance) is kept near 4–5:1 so lit and shaded faces read as different
 * planes; before this the three sources were almost equal and every wall
 * flattened into one warm grey. Values are authored, linear, pre-tonemap.
 * Sunset irradiance was re-balanced once the post chain kept HDR and full
 * resolution: the fire-hemisphere cube alone pushed west walls past white.
 */
export const CINEMATIC_LOOK:Record<CinematicLightingMode,LookMode>={
 sunset:{sun:1.4,sunColor:[1,.60,.33],hemi:.12,hemiSky:[.55,.62,.95],hemiGround:[.20,.16,.17],environment:.40,
  fogDensity:.00011,fogColor:[.44,.27,.31],exposure:1.0,contrast:1.09,bloomThreshold:1.35,bloomWeight:.19,
  grade:{shadowsHue:235,shadowsDensity:28,highlightsHue:32,highlightsDensity:18,saturation:-6,shadowsSaturation:-4}},
 night:{sun:.30,sunColor:[.70,.79,1],hemi:.08,hemiSky:[.42,.50,.82],hemiGround:[.06,.06,.09],environment:.55,
  fogDensity:.00010,fogColor:[.055,.05,.095],exposure:.83,contrast:1.09,bloomThreshold:1.30,bloomWeight:.24,
  grade:{shadowsHue:225,shadowsDensity:30,highlightsHue:45,highlightsDensity:10,saturation:-10,shadowsSaturation:-8}},
 day:{sun:3.0,sunColor:[1,.91,.78],hemi:.28,hemiSky:[.74,.80,.94],hemiGround:[.30,.27,.22],environment:.78,
  fogDensity:.000045,fogColor:[.57,.70,.84],exposure:1.08,contrast:1.10,bloomThreshold:2.5,bloomWeight:.045,
  grade:{shadowsHue:215,shadowsDensity:5,highlightsHue:42,highlightsDensity:2,saturation:3,shadowsSaturation:0}},
};

/** Configure the shared pipeline finish once; per-mode grade applied in setMode. */
export function applyCinematicFinish(pipeline:DefaultRenderingPipeline,ip:ImageProcessingConfiguration){
 pipeline.fxaaEnabled=CINEMATIC_FINISH.fxaa;
 pipeline.samples=CINEMATIC_FINISH.msaa;
 pipeline.sharpenEnabled=CINEMATIC_FINISH.sharpen;pipeline.sharpen.edgeAmount=CINEMATIC_FINISH.sharpenEdge;pipeline.sharpen.colorAmount=CINEMATIC_FINISH.sharpenColor;
 pipeline.grainEnabled=true;pipeline.grain.intensity=CINEMATIC_FINISH.grain;pipeline.grain.animated=true;
 pipeline.chromaticAberrationEnabled=true;pipeline.chromaticAberration.aberrationAmount=CINEMATIC_FINISH.chromaticAberration;pipeline.chromaticAberration.radialIntensity=CINEMATIC_FINISH.aberrationRadial;
 ip.vignetteEnabled=true;ip.vignetteWeight=CINEMATIC_FINISH.vignetteWeight;ip.vignetteStretch=CINEMATIC_FINISH.vignetteStretch;ip.vignetteColor=new Color4(.01,.01,.025,0);ip.vignetteBlendMode=ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
 ip.colorCurvesEnabled=true;ip.colorCurves=ip.colorCurves??new ColorCurves();
}
/** Name of the pass that receives the scene when contact shading is attached. */
export const SSAO_SCENE_PASS='SSAOOriginalSceneColor';
/** Camera post-chain contract, re-applied after every pipeline rebuild or
 * attach. Babylon appends a pipeline's passes whenever it (re)attaches, so a
 * `city-optics` rebuild or a `contact-shading` re-attach flips the order at
 * random; contact shading must run first, on linear HDR scene colour, before
 * tone mapping, grain and aberration. DefaultRenderingPipeline also sets MSAA
 * on its own first pass only: when the SSAO pass owns the scene target the
 * geometry was drawn without any anti-aliasing while a 4× target sat under a
 * full-screen quad. Whichever pass receives the scene carries the samples.
 * (A pass's size is the size of its input, i.e. the resolution the previous
 * pass renders at; Babylon's SSAO2 and bloom ratios are already the classic
 * half-size estimate / full-size combine and are left alone.)
 * Returns the ordered passes with their input sizes for diagnostics. */
export function syncPostChain(scene:Scene,pipeline:DefaultRenderingPipeline,camera:Camera){
 const manager=scene.postProcessRenderPipelineManager,passes=()=>camera._postProcesses.filter((p):p is PostProcess=>!!p);
 if(passes().findIndex(p=>p.name===SSAO_SCENE_PASS)>0){manager.detachCamerasFromRenderPipeline(pipeline.name,camera);manager.attachCamerasToRenderPipeline(pipeline.name,camera);}
 return passes().map((p,i)=>{const samples=i===0?pipeline.samples:1;if(p.samples!==samples)p.samples=samples;return {name:p.name,samples:p.samples,width:p.width,height:p.height};});
}
export function applyCinematicGrade(ip:ImageProcessingConfiguration,grade:Grade){
 const curves=ip.colorCurves??(ip.colorCurves=new ColorCurves());
 curves.shadowsHue=grade.shadowsHue;curves.shadowsDensity=grade.shadowsDensity;curves.shadowsSaturation=grade.shadowsSaturation;
 curves.highlightsHue=grade.highlightsHue;curves.highlightsDensity=grade.highlightsDensity;curves.highlightsSaturation=0;
 curves.midtonesHue=0;curves.midtonesDensity=0;curves.midtonesSaturation=0;
 curves.globalHue=0;curves.globalDensity=0;curves.globalSaturation=grade.saturation;curves.globalExposure=0;
}

/** One authored sky supplies both visible atmosphere and PBR reflections.
 * No extra per-frame rendering passes. The Blender-baked radiance is prefiltered once
 * during loading; display highlight compression never alters PBR radiance.
 * See data/materials/cinematic-environment.json for attribution and checksum.
 */
export async function createCinematicLook(world:CinematicScene){
 const {scene,sun,hemi,pipeline,camera}=world;
 const sky=scene.getMeshByName('atmosphere');
 const fallbackEnvironment=scene.environmentTexture;
 const fallbackMaterial=sky?.material??null;
 let textureLoaded!:()=>void;
 let textureFailed!:(message?:string)=>void;
 const loaded=new Promise<void>((resolve,reject)=>{
  textureLoaded=resolve;textureFailed=message=>reject(new Error(message??'HDR environment load failed'));
 });
 const environment=new ShenzhenSunsetEnvironment(CITY_SUNSET_SOURCE.file,scene,CITY_SUNSET_SOURCE.cubeSize,false,true,false,true,textureLoaded,textureFailed);
 let status:'loading'|'ready'|'failed'='loading';
 let failure:string|null=null;
 let skyMaterial:BackgroundMaterial|null=null;
 let skyTexture:BaseTexture|null=null;
 let night=false,mode:CinematicLightingMode='sunset',disposed=false;
 const sceneDisposal=scene.onDisposeObservable.addOnce(()=>{disposed=true;});
 const nightSky=createCityNightSky(scene);
 let daylightEnvironment:HDRCubeTexture|null=null,daylightSkyTexture:HDRCubeTexture|null=null,daylightMaterial:BackgroundMaterial|null=null;
 let daylightStatus:'loading'|'ready'|'failed'='loading',daylightFailure:string|null=null;
 let daylightTimeout:number|undefined;
 // Real clouds remain linear HDR; only extreme solar radiance rolls off before
 // SH and roughness filtering. The unblurred level supplies the sky while
 // roughness-prefiltered levels supply glazing, wet roads and car paint.
 // Both use the same cube and rotation: no painted blue ambient substitute.
 const daylightLoaded=new Promise<void>(resolve=>{
  daylightTimeout=window.setTimeout(()=>{daylightStatus='failed';daylightFailure='Daylight HDR load timed out';resolve();},45000);
  daylightEnvironment=new ShenzhenDaylightEnvironment(CITY_DAYLIGHT_SOURCE.file,scene,CITY_DAYLIGHT_SOURCE.cubeSize,false,true,false,true,()=>{
   window.clearTimeout(daylightTimeout);
   if(!disposed&&!scene.isDisposed){
    // A lightweight clone shares the loaded GPU cube, while keeping skybox
    // lookup coordinates separate from the PBR surface reflection lookup.
    daylightSkyTexture=daylightEnvironment!.clone();
    daylightSkyTexture.name='daylight-visible-sky-shared-radiance';
    daylightSkyTexture.coordinatesMode=Texture.SKYBOX_MODE;
    daylightSkyTexture.rotationY=CITY_DAYLIGHT_SOURCE.rotationY;
    daylightMaterial!.reflectionTexture=daylightSkyTexture;
    daylightStatus='ready';
    if(mode==='day')setMode('day');
   }
   resolve();
  },message=>{window.clearTimeout(daylightTimeout);daylightStatus='failed';daylightFailure=message??'Daylight HDR could not load';resolve();});
 });
 (daylightEnvironment as HDRCubeTexture|null)!.rotationY=CITY_DAYLIGHT_SOURCE.rotationY;
 daylightMaterial=new BackgroundMaterial('cinematic-blue-sky-white-clouds',scene);
 // BackgroundMaterial defaults to the alpha-test queue, which runs AFTER
 // opaque terrain. Put our finite sky in the sky-first opaque queue instead,
 // otherwise it paints over land outside its 4 km radius in aerial views.
 daylightMaterial.transparencyMode=BackgroundMaterial.MATERIAL_OPAQUE;
 daylightMaterial.backFaceCulling=false;daylightMaterial.disableDepthWrite=true;
 daylightMaterial.useRGBColor=false;daylightMaterial.enableNoise=true;
 daylightMaterial.reflectionBlur=0;daylightMaterial.maxSimultaneousLights=0;
 // Display-only lift: a clearer blue sky and brighter clouds, sharing the
 // original HDR reflections and sun direction without changing city exposure.
 daylightMaterial.primaryColor.copyFromFloats(.76,.90,1.03);
 let nightEnvironment:HDRCubeTexture|null=null,nightEnvironmentReady=false;
 // A real CC0 urban HDR retains small city-light reflections. The visible
 // night sky remains our stars/moon. Decode and prefilter only once at load.
 const nightLoaded=new Promise<void>(resolve=>{
  nightEnvironment=new HDRCubeTexture('/city/environment/rooftop-night-2k.hdr',scene,512,false,true,false,true,()=>{
   if(!disposed&&!scene.isDisposed){nightEnvironmentReady=true;if(night)scene.environmentTexture=nightEnvironment;}
   resolve();
  },()=>resolve());
 });

 // Keep the existing sky usable if a texture cannot load. Network failures
 // settle immediately; a stalled decode also has a bounded fallback.
 const timeout=window.setTimeout(()=>textureFailed('HDR environment load timed out'),45000);
 const disposeObserver=scene.onDisposeObservable.addOnce(()=>textureFailed('Scene disposed'));
 try{
  await loaded;
  if(scene.isDisposed)throw new Error('Scene disposed');
  // Rotate the restored photographic sunset toward the west/southwest, for
  // the visible sky and every PBR surface. This is art direction, not astronomy.
  environment.rotationY=CITY_SUNSET_SOURCE.rotationY;
  scene.environmentTexture=environment;
  if(sky){
   skyTexture=environment.createDisplayTexture(scene);
   skyMaterial=new BackgroundMaterial('cinematic-photographic-sky',scene);
   skyMaterial.transparencyMode=BackgroundMaterial.MATERIAL_OPAQUE;
   skyMaterial.reflectionTexture=skyTexture;
   skyMaterial.backFaceCulling=false;
   skyMaterial.disableDepthWrite=true;
   skyMaterial.useRGBColor=false;
   skyMaterial.enableNoise=true;
   skyMaterial.reflectionBlur=0;
   skyMaterial.maxSimultaneousLights=0;
   sky.material=skyMaterial;
   sky.applyFog=false;
   sky.receiveShadows=false;
  }
  status='ready';
 }catch(error){
  status='failed';failure=error instanceof Error?error.message:String(error);
  environment.dispose();
 }finally{
  window.clearTimeout(timeout);scene.onDisposeObservable.remove(disposeObserver);
 }
 let nightTimeout:number|undefined;
 await Promise.race([nightLoaded,new Promise<void>(resolve=>{nightTimeout=window.setTimeout(resolve,15000);})]);
 window.clearTimeout(nightTimeout);
 // This controller is not ready until the third environment has completed
 // decode and PBR prefiltering (or a reported bounded failure).
 await daylightLoaded;
 window.clearTimeout(daylightTimeout);
 if(disposed||scene.isDisposed){environment.dispose();skyMaterial?.dispose(false,false);skyTexture?.dispose();nightSky.dispose();(nightEnvironment as HDRCubeTexture|null)?.dispose();daylightMaterial?.dispose(false,false);(daylightSkyTexture as HDRCubeTexture|null)?.dispose();(daylightEnvironment as HDRCubeTexture|null)?.dispose();throw Error('Scene disposed');}
 if(nightEnvironment) (nightEnvironment as HDRCubeTexture).rotationY=.65;

 const ip=scene.imageProcessingConfiguration;
 ip.toneMappingEnabled=true;
 ip.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
 ip.contrast=1.09;
 applyCinematicFinish(pipeline,ip);
 // Keep HDR cores distinct: a restrained halo must not merge whole facades.
 // Daylight keeps its own smaller bloom so clouds retain their structure.
 pipeline.bloomEnabled=true;
 pipeline.bloomScale=.5;
 syncPostChain(scene,pipeline,camera);

 function setMode(next:CinematicLightingMode){
  if(disposed||scene.isDisposed)return;
  mode=next;night=next==='night';const day=next==='day';
  const look=CINEMATIC_LOOK[next];
  pipeline.bloomThreshold=look.bloomThreshold;
  pipeline.bloomWeight=look.bloomWeight;
  pipeline.bloomKernel=day?36:56;
  ip.exposure=look.exposure;
  ip.contrast=look.contrast;
  applyCinematicGrade(ip,look.grade);
  applyModeFinish(pipeline,ip,next);
  syncPostChain(scene,pipeline,camera);
  sun.direction.copyFrom(night?CITY_MOON_DIRECTION.scale(-1):day?CITY_DAYLIGHT_SUN_DIRECTION.scale(-1):new Vector3(.95,-.19,.31).normalize());
  sun.diffuse.copyFromFloats(...look.sunColor);
  // PBR uses diffuse for both diffuse/specular energy. Standard materials use
  // the independent specular colour, so keep their daytime sun equally warm.
  sun.specular.copyFrom(day?sun.diffuse:Color3.White());
  sun.intensity=look.sun;
  // The hemisphere is a residual fill only. Diffuse sky light now comes from
  // the HDR irradiance, so shade turns toward the actual sky colour opposite
  // the sun instead of a flat warm grey shared by every surface.
  hemi.diffuse.copyFromFloats(...look.hemiSky);
  hemi.groundColor.copyFromFloats(...look.hemiGround);
  hemi.intensity=look.hemi;
  scene.environmentTexture=night?(nightEnvironmentReady?nightEnvironment:nightSky.environment):day&&daylightStatus==='ready'?daylightEnvironment:status==='ready'?environment:fallbackEnvironment;
  scene.environmentIntensity=look.environment;
  // Aerial perspective: enough density that ridges 3–6 km away lose contrast
  // and saturation toward the horizon haze; nearby streets stay untouched.
  scene.fogDensity=look.fogDensity;
  scene.fogColor.copyFromFloats(...look.fogColor);
  // The sky is independently exposed so preserving dark asphalt and bright
  // clouds never requires flattening the material response of the entire city.
  if(skyMaterial)skyMaterial.primaryColor.copyFromFloats(.20,.20,.20);
  if(sky)sky.material=night?nightSky.material:day&&daylightStatus==='ready'?daylightMaterial:skyMaterial??fallbackMaterial;
  // Shared sky irradiance and physical scene lamps illuminate the car too.
  // No camera-following vehicle light: changing the view must not move a lamp.
 }
 function setNight(active:boolean){setMode(active?'night':'sunset');}
 /** Look-dev only: override the current mode's balance and re-apply it. */
 function tune(overrides:Partial<LookMode>){Object.assign(CINEMATIC_LOOK[mode],overrides);setMode(mode);return CINEMATIC_LOOK[mode];}
 /** Look-dev only: toggle finish passes to attribute their GPU cost. */
 function finish(o:Partial<{msaa:number;fxaa:boolean;sharpen:boolean;grain:boolean;vignette:boolean;vignetteWeight:number;vignetteStretch:number;chromaticAberration:boolean;colorCurves:boolean;ssao:boolean;bloom:boolean;gbuffer:boolean}>){
  if(o.msaa!==undefined)pipeline.samples=o.msaa;if(o.fxaa!==undefined)pipeline.fxaaEnabled=o.fxaa;if(o.sharpen!==undefined)pipeline.sharpenEnabled=o.sharpen;if(o.bloom!==undefined)pipeline.bloomEnabled=o.bloom;
  if(o.grain!==undefined)pipeline.grainEnabled=o.grain;if(o.chromaticAberration!==undefined)pipeline.chromaticAberrationEnabled=o.chromaticAberration;
  if(o.vignette!==undefined)ip.vignetteEnabled=o.vignette;if(o.vignetteWeight!==undefined)ip.vignetteWeight=o.vignetteWeight;if(o.vignetteStretch!==undefined)ip.vignetteStretch=o.vignetteStretch;if(o.colorCurves!==undefined)ip.colorCurvesEnabled=o.colorCurves;
  // Profiling only: the SSAO pipeline is owned by the world; attach/detach it on the same cameras.
  const manager=scene.postProcessRenderPipelineManager,ssao=manager.supportedPipelines.find(p=>p.name==='contact-shading');
  if(o.ssao!==undefined&&ssao){if(o.ssao)manager.attachCamerasToRenderPipeline('contact-shading',pipeline.cameras);else manager.detachCamerasFromRenderPipeline('contact-shading',pipeline.cameras);}
  if(o.gbuffer===false&&scene.geometryBufferRenderer)scene.geometryBufferRenderer.renderList=[];
  const chain=syncPostChain(scene,pipeline,camera);
  return {samples:pipeline.samples,fxaa:pipeline.fxaaEnabled,sharpen:pipeline.sharpenEnabled,grain:pipeline.grainEnabled,vignette:ip.vignetteEnabled,colorCurves:ip.colorCurvesEnabled,chromaticAberration:pipeline.chromaticAberrationEnabled,bloom:pipeline.bloomEnabled,ssao:ssao?ssao.cameras.length>0:null,chain};
 }
 setNight(false);

 return {
  setMode,setNight,tune,finish,
  get stats(){return {status,failure,mode,night,source:mode==='day'?CITY_DAYLIGHT_SOURCE.name:CITY_SUNSET_SOURCE.name,radianceGrade:mode==='day'?'shared linear HDR; solar-only luminance shoulder 8→32 before irradiance and reflection filtering':'directional vermilion/amber fire hemisphere and dark indigo reverse; HDR for PBR, display-only highlight shoulder',nightSky:'directional Milky Way, dense stars and moonlit cirrus with matching moonlight',nightReflections:nightEnvironmentReady?'Poly Haven / Rooftop Night / 512px HDR':'neutral fallback',daylight:{status:daylightStatus,failure:daylightFailure,source:CITY_DAYLIGHT_SOURCE.name,sourceBytes:CITY_DAYLIGHT_SOURCE.bytes,cubeSize:CITY_DAYLIGHT_SOURCE.cubeSize,rotationY:CITY_DAYLIGHT_SOURCE.rotationY,sunDirection:CITY_DAYLIGHT_SUN_DIRECTION.asArray(),skyAndReflection:'shared solar-balanced HDR cube; sharp level for sky; prefiltered levels for PBR',solarHighlight:{knee:8,ceiling:32},sunColor:sun.diffuse.asArray(),sunIntensity:sun.intensity,skyFill:hemi.intensity,carFill:world.carFill?.intensity??null,fogDensity:scene.fogDensity},cubeSize:1024,sourceBytes:mode==='day'?CITY_DAYLIGHT_SOURCE.bytes:CITY_SUNSET_SOURCE.bytes,exposure:ip.exposure,look:CINEMATIC_LOOK[mode],finish:{...CINEMATIC_FINISH,vignetteWeight:ip.vignetteWeight,vignetteStretch:ip.vignetteStretch,samples:pipeline.samples,fxaa:pipeline.fxaaEnabled,sharpen:pipeline.sharpenEnabled,grain:pipeline.grainEnabled,vignette:ip.vignetteEnabled,colorCurves:ip.colorCurvesEnabled,chromaticAberration:pipeline.chromaticAberrationEnabled},postChain:camera._postProcesses.filter((p):p is PostProcess=>!!p).map(p=>({name:p.name,samples:p.samples,width:p.width,height:p.height})),lightBalance:{sun:sun.intensity,hemisphere:hemi.intensity,environment:scene.environmentIntensity,directToFill:+(sun.intensity/(hemi.intensity+scene.environmentIntensity*.5)).toFixed(2)},bloom:{enabled:pipeline.bloomEnabled,threshold:pipeline.bloomThreshold,weight:pipeline.bloomWeight,kernel:pipeline.bloomKernel,scale:pipeline.bloomScale},environmentIntensity:scene.environmentIntensity};},
  dispose(){
   disposed=true;scene.onDisposeObservable.remove(sceneDisposal);
   if(scene.environmentTexture===environment||scene.environmentTexture===nightSky.environment||scene.environmentTexture===nightEnvironment||scene.environmentTexture===daylightEnvironment)scene.environmentTexture=fallbackEnvironment;
   if(sky&&(sky.material===skyMaterial||sky.material===nightSky.material||sky.material===daylightMaterial))sky.material=fallbackMaterial as Material|null;
   skyMaterial?.dispose(false,false);skyTexture?.dispose();
   nightSky.dispose();nightEnvironment?.dispose();daylightMaterial?.dispose(false,false);daylightSkyTexture?.dispose();daylightEnvironment?.dispose();
   if(status==='ready')environment.dispose();
  },
 };
}
