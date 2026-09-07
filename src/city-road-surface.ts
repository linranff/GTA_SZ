import {Color3, MaterialPluginBase, PBRMaterial, ShaderLanguage, Texture, type BaseTexture, type Scene, type UniformBuffer} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-daylight.ts';

const BASE = '/city/textures/road-cinematic/';
// roads.glb explicitly uses world east/north / 14 (not B.face's default / 8).
// Poly Haven's 2.35 m scan follows the project's uniform 0.60 scale.
const UV_WORLD_PERIOD = 14;
const SCAN_GAME_METRES = 2.35 * .60;
const ORM_SCAN_REPEATS = 8;
const NORMAL_STRENGTH = .13;

// Daylight asphalt retains a broad, rough sky reflection rather than looking
// like charcoal beside the standing water. Sunset/night keep their wet-road look.
const ROAD_LOOK={
  day:{albedo:[1.02,1.03,1.04],specular:.55,environment:1,roughness:[.66,.19]},
  sunset:{albedo:[.72,.76,.79],specular:.22,environment:.55,roughness:[.83,.12]},
  night:{albedo:[.72,.76,.79],specular:.22,environment:.55,roughness:[.83,.12]},
} as const;
class AsphaltDryFilm extends MaterialPluginBase {
  range:readonly number[]=ROAD_LOOK.sunset.roughness;
  constructor(material:PBRMaterial){super(material,'AsphaltDryFilm',210,{},true,true,true);}
  override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
  override getUniforms(){return {ubo:[{name:'cityAsphaltRoughness',size:2,type:'vec2'}],fragment:'uniform vec2 cityAsphaltRoughness;'};}
  override bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat2('cityAsphaltRoughness',this.range[0],this.range[1]);}
  override getCustomCode(type:string){return type==='fragment'?{
    CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:'metallicRoughness.g=cityAsphaltRoughness.x+cityAsphaltRoughness.y*metallicRoughness.g;',
  }:null;}
  override dispose(){this.range=[0,1];super.dispose(false);}
}

type MapState = 'loading'|'ready'|'failed';

/** Apply after applyLandscapeSurfaces: its albedo texture is retained and its reflectance is calibrated.
 * Only asphalt materials are touched. Both maps are shared, mipmapped linear
 * data. Rough asphalt uses the shared HDR environment; only separately placed
 * puddles use the planar mirror. No added render target or animation loop.
 * Source/licence and the deterministic map recipe: data/materials/road-cinematic.json.
 */
export function applyCinematicRoad(scene:Scene, roadMirror:BaseTexture|null) {
  const materials = scene.materials.filter((material):material is PBRMaterial =>
    material instanceof PBRMaterial && /^asphalt(?:\.\d+)?$/.test(material.name));
  const previous = materials.map(material => ({
    material,
    properties: {
      albedoColor: material.albedoColor,
      bumpTexture: material.bumpTexture,
      metallicTexture: material.metallicTexture,
      microSurfaceTexture: material.microSurfaceTexture,
      reflectionTexture: material.reflectionTexture,
      metallic: material.metallic,
      roughness: material.roughness,
      disableBumpMap: material.disableBumpMap,
      invertNormalMapX: material.invertNormalMapX,
      invertNormalMapY: material.invertNormalMapY,
      useRoughnessFromMetallicTextureAlpha: material.useRoughnessFromMetallicTextureAlpha,
      useRoughnessFromMetallicTextureGreen: material.useRoughnessFromMetallicTextureGreen,
      useMetallnessFromMetallicTextureBlue: material.useMetallnessFromMetallicTextureBlue,
      useAmbientOcclusionFromMetallicTextureRed: material.useAmbientOcclusionFromMetallicTextureRed,
      enableSpecularAntiAliasing: material.enableSpecularAntiAliasing,
      specularIntensity: material.specularIntensity,
      environmentIntensity: material.environmentIntensity,
    },
  }));
  const states:Record<'normal'|'orm',MapState> = {normal:'loading',orm:'loading'};
  const errors:string[] = [];
  let normal:Texture|null = null;
  let orm:Texture|null = null;
  let disposed = false;
  let applied = false;
  let mode:CinematicLightingMode='sunset';
  const films:AsphaltDryFilm[]=[];
  function setMode(next:CinematicLightingMode){
    mode=next;if(!applied||disposed)return;
    const look=ROAD_LOOK[next];
    for(const material of materials){material.albedoColor=new Color3(...look.albedo);material.specularIntensity=look.specular;material.environmentIntensity=look.environment;}
    for(const film of films)film.range=look.roughness;
  }

  function attachWhenReady() {
    if (disposed || scene.isDisposed || applied || !normal || !orm || states.normal !== 'ready' || states.orm !== 'ready') return;
    for (const material of materials) {
      material.albedoColor = new Color3(.72,.76,.79);
      material.bumpTexture = normal;
      material.disableBumpMap = false;
      // Match Babylon's glTF normal-map convention for this scene handedness.
      material.invertNormalMapX = !scene.useRightHandedSystem;
      material.invertNormalMapY = scene.useRightHandedSystem;
      material.metallicTexture = orm;
      material.microSurfaceTexture = null;
      material.metallic = 0;
      material.roughness = 1; // The linear green channel supplies actual roughness.
      material.useRoughnessFromMetallicTextureAlpha = false;
      material.useRoughnessFromMetallicTextureGreen = true;
      material.useMetallnessFromMetallicTextureBlue = true;
      material.useAmbientOcclusionFromMetallicTextureRed = true;
      material.enableSpecularAntiAliasing = true;
      material.specularIntensity = .22;
      material.environmentIntensity = .55;
      material.reflectionTexture = null; // Standing-water meshes alone use the planar mirror.
      films.push(new AsphaltDryFilm(material));
    }
    applied = true;
    setMode(mode); // An L press before the texture callbacks must not restore dusk.
  }

  function loadMap(kind:'normal'|'orm', file:string, size:number, worldPeriod:number) {
    const texture = new Texture(BASE + file, scene, {
      noMipmap: false,
      invertY: false,
      samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
      gammaSpace: false,
      onLoad: () => queueMicrotask(() => {
        if (disposed || scene.isDisposed) return;
        const dimensions = texture.getSize();
        if (dimensions.width !== size || dimensions.height !== size) {
          states[kind] = 'failed';errors.push(kind + ':unexpected-size');return;
        }
        states[kind] = 'ready';attachWhenReady();
      }),
      onError: () => queueMicrotask(() => {
        if (disposed || scene.isDisposed) return;
        states[kind] = 'failed';errors.push(kind + ':load-failed');
      }),
    });
    texture.name = 'cinematic-road:' + kind;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 8;
    texture.uScale = UV_WORLD_PERIOD / worldPeriod;
    texture.vScale = UV_WORLD_PERIOD / worldPeriod;
    // UV.v is 1 - north/14 after GLB export. Align both frequencies at north=0
    // so the 8x repeated roughness scan agrees with the fine normal texels.
    texture.vOffset = 1 - texture.vScale;
    return texture;
  }

  if (materials.length) {
    normal = loadMap('normal','asphalt-normal-gl.webp',1024,SCAN_GAME_METRES);
    normal.level = NORMAL_STRENGTH;
    orm = loadMap('orm','asphalt-orm.webp',2048,SCAN_GAME_METRES * ORM_SCAN_REPEATS);
  }

  return {
    setMode,
    get stats() {
      return {
        applied,
        mode,
        response:ROAD_LOOK[mode],
        ready: applied || materials.length === 0,
        materialCount: materials.length,
        materialNames: materials.map(material => material.name),
        textures: {...states},
        errors: [...errors],
        normalStrength: NORMAL_STRENGTH,
        normalGameMetres: SCAN_GAME_METRES,
        roughnessGameMetres: SCAN_GAME_METRES * ORM_SCAN_REPEATS,
        albedoPolicy: 'preserve-landscape-texture-calibrate-reflectance',
        reflectionPolicy: 'rough-environment-IBL; planar-mirror-only-on-local-puddles',
        additionalRenderTargets: 0,
        estimatedTextureMiBWithMipmapsRGBA8: materials.length ? 26.67 : 0,
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!scene.isDisposed) for (const entry of previous) {
        // A later material controller may have taken ownership already.
        if (entry.material.bumpTexture === normal && entry.material.metallicTexture === orm)
          Object.assign(entry.material,entry.properties);
      }
      normal?.dispose();orm?.dispose();
      for(const film of films)film.dispose();
    },
  };
}
