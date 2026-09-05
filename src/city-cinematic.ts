import {
 BackgroundMaterial, Color3, HDRCubeTexture, ImageProcessingConfiguration,
 Vector3, type BaseTexture, type Scene, type DirectionalLight, type HemisphericLight,
 type DefaultRenderingPipeline, type PointLight, type Material,
} from '@babylonjs/core';
import {ShenzhenSunsetEnvironment} from './city-sunset-environment.ts';
import {createCityNightSky,CITY_MOON_DIRECTION} from './city-night-sky.ts';

type CinematicScene={
 scene:Scene;sun:DirectionalLight;hemi:HemisphericLight;
 pipeline:DefaultRenderingPipeline;carFill?:PointLight|null;
};

/** One photographed sky supplies both visible atmosphere and PBR reflections.
 * No extra per-frame rendering passes. The 4K CC0 source is prefiltered once
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
 const environment=new ShenzhenSunsetEnvironment('/city/environment/belfast-sunset-4k.hdr',scene,1024,false,true,false,true,textureLoaded,textureFailed);
 let status:'loading'|'ready'|'failed'='loading';
 let failure:string|null=null;
 let skyMaterial:BackgroundMaterial|null=null;
 let skyTexture:BaseTexture|null=null;
 let night=false,disposed=false;
 const sceneDisposal=scene.onDisposeObservable.addOnce(()=>{disposed=true;});
 const nightSky=createCityNightSky(scene);
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
  // Rotate the photographed sunset toward the west/southwest, consistently for
  // the visible sky and every PBR surface. This is art direction, not astronomy.
  environment.rotationY=2.80;
  scene.environmentTexture=environment;
  if(sky){
   skyTexture=environment.createDisplayTexture(scene);
   skyMaterial=new BackgroundMaterial('cinematic-photographic-sky',scene);
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
 if(disposed||scene.isDisposed){environment.dispose();skyMaterial?.dispose(false,false);skyTexture?.dispose();nightSky.dispose();(nightEnvironment as HDRCubeTexture|null)?.dispose();throw Error('Scene disposed');}
 if(nightEnvironment) (nightEnvironment as HDRCubeTexture).rotationY=.65;

 const ip=scene.imageProcessingConfiguration;
 ip.toneMappingEnabled=true;
 ip.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
 ip.contrast=1.09;
 // Thin illuminated windows and tail lamps remain readable without spilling
 // broad white halos over neighbouring facades.
 pipeline.bloomEnabled=true;
 pipeline.bloomThreshold=1.25;
 pipeline.bloomWeight=.14;
 pipeline.bloomKernel=36;
 pipeline.bloomScale=.5;

 function setNight(active:boolean){
  if(disposed||scene.isDisposed)return;
  night=active;
  pipeline.bloomThreshold=active?1.15:1.45;
  pipeline.bloomWeight=active?.12:.14;
  ip.exposure=active?.83:.87;
  sun.direction.copyFrom(active?CITY_MOON_DIRECTION.scale(-1):new Vector3(.95,-.19,.31).normalize());
  sun.diffuse.copyFrom(active?new Color3(.70,.79,1):new Color3(1,.64,.39));
  sun.intensity=active?.24:1.12;
  hemi.diffuse.copyFrom(active?new Color3(.65,.70,.86):new Color3(.86,.79,.86));
  hemi.groundColor.copyFrom(new Color3(.24,.215,.19));
  hemi.intensity=active?.32:.54;
  scene.environmentTexture=active?(nightEnvironmentReady?nightEnvironment:nightSky.environment):status==='ready'?environment:fallbackEnvironment;
  scene.environmentIntensity=active?.62:.53;
  scene.fogDensity=active?.00010:.000078;
  scene.fogColor.copyFrom(active?new Color3(.12,.095,.17):new Color3(.54,.34,.36));
  // The sky is independently exposed so preserving dark asphalt and bright
  // clouds never requires flattening the material response of the entire city.
  if(skyMaterial)skyMaterial.primaryColor.copyFromFloats(.16,.16,.16);
  if(sky)sky.material=active?nightSky.material:skyMaterial??fallbackMaterial;
  if(world.carFill){world.carFill.intensity=active?12:10;world.carFill.diffuse.copyFrom(new Color3(.77,.79,.87));}
 }
 setNight(false);

 return {
  setNight,
  get stats(){return {status,failure,night,source:'Poly Haven / Belfast Sunset (Pure Sky)',radianceGrade:'uncompressed HDR for PBR; display-only highlight shoulder',nightSky:'directional stars and moon with matching moonlight',nightReflections:nightEnvironmentReady?'Poly Haven / Rooftop Night / 512px HDR':'neutral fallback',cubeSize:1024,sourceBytes:17420114,exposure:ip.exposure,environmentIntensity:scene.environmentIntensity};},
  dispose(){
   disposed=true;scene.onDisposeObservable.remove(sceneDisposal);
   if(scene.environmentTexture===environment||scene.environmentTexture===nightSky.environment||scene.environmentTexture===nightEnvironment)scene.environmentTexture=fallbackEnvironment;
   if(sky&&(sky.material===skyMaterial||sky.material===nightSky.material))sky.material=fallbackMaterial as Material|null;
   skyMaterial?.dispose(false,false);skyTexture?.dispose();
   nightSky.dispose();nightEnvironment?.dispose();
   if(status==='ready')environment.dispose();
  },
 };
}
