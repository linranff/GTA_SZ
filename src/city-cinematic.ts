import {
 BackgroundMaterial, Color3, HDRCubeTexture, ImageProcessingConfiguration, Texture,
 Vector3, type BaseTexture, type Scene, type DirectionalLight, type HemisphericLight,
 type DefaultRenderingPipeline, type PointLight, type Material,
} from '@babylonjs/core';
import {ShenzhenSunsetEnvironment,CITY_SUNSET_SOURCE} from './city-sunset-environment.ts';
import {createCityNightSky,CITY_MOON_DIRECTION} from './city-night-sky.ts';
import {CITY_DAYLIGHT_SOURCE,CITY_DAYLIGHT_SUN_DIRECTION,type CinematicLightingMode} from './city-daylight.ts';
export type {CinematicLightingMode} from './city-daylight.ts';

type CinematicScene={
 scene:Scene;sun:DirectionalLight;hemi:HemisphericLight;
 pipeline:DefaultRenderingPipeline;carFill?:PointLight|null;
};

/** One authored sky supplies both visible atmosphere and PBR reflections.
 * No extra per-frame rendering passes. The Blender-baked radiance is prefiltered once
 * during loading; display highlight compression never alters PBR radiance.
 * See data/materials/cinematic-environment.json for attribution and checksum.
 */
export async function createCinematicLook(world:CinematicScene){
 const {scene,sun,hemi,pipeline}=world;
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
 // Real clouds remain linear HDR. The unblurred level supplies the sky while
 // roughness-prefiltered levels supply glazing, wet roads and car paint.
 // Both use the same cube and rotation: no painted blue ambient substitute.
 const daylightLoaded=new Promise<void>(resolve=>{
  daylightTimeout=window.setTimeout(()=>{daylightStatus='failed';daylightFailure='Daylight HDR load timed out';resolve();},45000);
  daylightEnvironment=new HDRCubeTexture(CITY_DAYLIGHT_SOURCE.file,scene,CITY_DAYLIGHT_SOURCE.cubeSize,false,true,false,true,()=>{
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
 daylightMaterial.primaryColor.copyFromFloats(.94,1.02,1.10);
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
 // Keep HDR cores distinct: a restrained halo must not merge whole facades.
 // Daylight keeps its own smaller bloom so clouds retain their structure.
 pipeline.bloomEnabled=true;
 pipeline.bloomScale=.5;

 function setMode(next:CinematicLightingMode){
  if(disposed||scene.isDisposed)return;
  mode=next;night=next==='night';const day=next==='day';
  pipeline.bloomThreshold=night?1.30:day?2.5:1.35;
  pipeline.bloomWeight=night?.24:day?.065:.19;
  pipeline.bloomKernel=day?36:56;
  ip.exposure=night?.83:day?.91:.87;
  ip.contrast=day?1.06:1.09;
  sun.direction.copyFrom(night?CITY_MOON_DIRECTION.scale(-1):day?CITY_DAYLIGHT_SUN_DIRECTION.scale(-1):new Vector3(.95,-.19,.31).normalize());
  sun.diffuse.copyFrom(night?new Color3(.70,.79,1):day?new Color3(1,.955,.865):new Color3(1,.64,.39));
  sun.intensity=night?.24:day?1.32:1.12;
  hemi.diffuse.copyFrom(night?new Color3(.65,.70,.86):day?new Color3(.75,.84,.94):new Color3(.86,.79,.86));
  hemi.groundColor.copyFrom(day?new Color3(.29,.28,.245):new Color3(.24,.215,.19));
  hemi.intensity=night?.32:day?.39:.54;
  scene.environmentTexture=night?(nightEnvironmentReady?nightEnvironment:nightSky.environment):day&&daylightStatus==='ready'?daylightEnvironment:status==='ready'?environment:fallbackEnvironment;
  scene.environmentIntensity=night?.62:day?.83:.53;
  scene.fogDensity=night?.00010:day?.000043:.000078;
  scene.fogColor.copyFrom(night?new Color3(.12,.095,.17):day?new Color3(.60,.72,.80):new Color3(.54,.34,.36));
  // The sky is independently exposed so preserving dark asphalt and bright
  // clouds never requires flattening the material response of the entire city.
  if(skyMaterial)skyMaterial.primaryColor.copyFromFloats(.20,.20,.20);
  if(sky)sky.material=night?nightSky.material:day&&daylightStatus==='ready'?daylightMaterial:skyMaterial??fallbackMaterial;
  if(world.carFill){world.carFill.intensity=night?12:day?5.5:10;world.carFill.diffuse.copyFrom(day?new Color3(.88,.92,1):new Color3(.77,.79,.87));}
 }
 function setNight(active:boolean){setMode(active?'night':'sunset');}
 setNight(false);

 return {
  setMode,setNight,
  get stats(){return {status,failure,mode,night,source:mode==='day'?CITY_DAYLIGHT_SOURCE.name:CITY_SUNSET_SOURCE.name,radianceGrade:mode==='day'?'shared linear HDR visible sky and prefiltered PBR environment':'directional vermilion/amber fire hemisphere and dark indigo reverse; HDR for PBR, display-only highlight shoulder',nightSky:'directional Milky Way, dense stars and moonlit cirrus with matching moonlight',nightReflections:nightEnvironmentReady?'Poly Haven / Rooftop Night / 512px HDR':'neutral fallback',daylight:{status:daylightStatus,failure:daylightFailure,source:CITY_DAYLIGHT_SOURCE.name,sourceBytes:CITY_DAYLIGHT_SOURCE.bytes,cubeSize:CITY_DAYLIGHT_SOURCE.cubeSize,rotationY:CITY_DAYLIGHT_SOURCE.rotationY,sunDirection:CITY_DAYLIGHT_SUN_DIRECTION.asArray(),skyAndReflection:'shared HDR cube; raw level for sky; prefiltered levels for PBR'},cubeSize:1024,sourceBytes:mode==='day'?CITY_DAYLIGHT_SOURCE.bytes:CITY_SUNSET_SOURCE.bytes,exposure:ip.exposure,bloom:{enabled:pipeline.bloomEnabled,threshold:pipeline.bloomThreshold,weight:pipeline.bloomWeight,kernel:pipeline.bloomKernel,scale:pipeline.bloomScale},environmentIntensity:scene.environmentIntensity};},
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
