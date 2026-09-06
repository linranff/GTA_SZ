import {Color3,MaterialPluginBase,Mesh,PBRMaterial,ShaderLanguage,VertexData,type Scene,type UniformBuffer} from '@babylonjs/core';
import {buildDistantCityGeometry} from './city-distant-geometry.ts';
import type {CityData} from './city-types.ts';
import type {CinematicLightingMode} from './city-daylight.ts';

export const CITY_BUILDING_DETAIL_RADIUS=3300;
type NightState={gain:number};

/** Tiny filtered window pattern on the distant shell; no facade atlas or bounce. */
class DistantWindows extends MaterialPluginBase{
 constructor(material:PBRMaterial,private state:NightState){super(material,'CityDistantWindows',200,{},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override getUniforms(){return {ubo:[{name:'cityDistantLight',size:1,type:'float'}],fragment:'uniform float cityDistantLight;'};}
 override bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat('cityDistantLight',this.state.gain);}
 override getCustomCode(type:string):Record<string,string>|null{if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'varying float vDistantSeed;',CUSTOM_VERTEX_MAIN_END:`
  #ifdef VERTEXCOLOR
  vDistantSeed=color.a;
  #else
  vDistantSeed=.5;
  #endif
 `};if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_DEFINITIONS:'varying float vDistantSeed;',CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
  #ifdef VERTEXCOLOR
  float distantWall=1.-smoothstep(.3,.75,abs(normalW.y));
  vec2 distantCell=vec2(dot(vPositionW.xz,vec2(normalW.z,-normalW.x))/3.2,vPositionW.y/3.3);
  vec2 distantRoom=floor(distantCell/vec2(3.,2.));
  float distantOccupied=step(.48,fract(sin(dot(distantRoom,vec2(12.9898,78.233))+vDistantSeed*97.)*43758.5453));
  vec2 pane=fract(distantCell);
  float distantPane=step(.22,pane.x)*step(pane.x,.78)*step(.20,pane.y)*step(pane.y,.79);
  #ifdef WEBGL2
  float distantUnresolved=smoothstep(.24,1.1,max(length(dFdx(distantCell)),length(dFdy(distantCell))));
  #else
  float distantUnresolved=1.;
  #endif
  float distantLight=mix(distantPane*distantOccupied,.18,distantUnresolved);
  vec3 distantTint=mix(vec3(1.,.73,.45),vec3(.75,.84,1.),smoothstep(.70,.95,vDistantSeed));
  finalEmissive+=distantTint*distantLight*cityDistantLight*distantWall;
  #endif
 `};}
}

/** Full city silhouettes share one cheap material and one mesh per existing
 * block. In overview mode the near/far sets are complementary: no overlap
 * or empty distance ring; ground-level driving keeps these meshes disabled.
 * These meshes never enter shadow maps or planar-reflection render lists.
 */
export function createDistantCity(scene:Scene,data:CityData){
 const started=performance.now(),geometry=buildDistantCityGeometry(data);
 const material=new PBRMaterial('city-distant-shells',scene),night:NightState={gain:.85};
 material.albedoColor=Color3.White();material.metallic=0;material.roughness=.88;
 material.environmentIntensity=.65;material.specularIntensity=.18;material.maxSimultaneousLights=2;
 new DistantWindows(material,night);
 const tiles=geometry.tiles.map(tile=>{
  const mesh=new Mesh('distant-block-'+tile.key,scene),v=new VertexData();
  v.positions=new Float32Array(tile.positions);v.normals=new Float32Array(tile.normals);v.colors=new Float32Array(tile.colors);
  v.indices=tile.positions.length/3<=65535?new Uint16Array(tile.indices):new Uint32Array(tile.indices);v.applyToMesh(mesh);
  mesh.material=material;mesh.useVertexColors=true;mesh.hasVertexAlpha=false;mesh.isPickable=false;mesh.receiveShadows=false;
  mesh.freezeWorldMatrix();mesh.setEnabled(false);
  return {mesh,x:tile.x,z:tile.z,triangles:tile.indices.length/3};
 });
 geometry.tiles.length=0; // GPU buffers now own the data; release build arrays.
 let enabledTiles=0,enabledTriangles=0,disposed=false;
 const initMs=performance.now()-started;
 const update=(x:number,z:number,aerial:boolean)=>{if(disposed)return;enabledTiles=0;enabledTriangles=0;for(const tile of tiles){
  // Use the existing high-altitude effects switch so street-level driving
  // keeps its original geometry/draw budget.
  const far=aerial&&Math.hypot(tile.x-x,tile.z-z)>=CITY_BUILDING_DETAIL_RADIUS;tile.mesh.setEnabled(far);
  if(far){enabledTiles++;enabledTriangles+=tile.triangles;}
 }};
 const setMode=(mode:CinematicLightingMode)=>{night.gain=mode==='night'?2.4:mode==='sunset'?.85:0;};
 const dispose=()=>{if(disposed)return;disposed=true;for(const {mesh} of tiles)mesh.dispose(false,false);material.dispose(false,false);};
 scene.onDisposeObservable.addOnce(dispose);
 return {update,setMode,dispose,get stats(){return {buildings:geometry.buildingCount,tiles:tiles.length,triangles:geometry.triangleCount,enabledTiles,enabledTriangles,initMs,detailRadius:CITY_BUILDING_DETAIL_RADIUS,skippedBuildings:geometry.skippedBuildingCount,skippedRoofs:geometry.skippedRoofCount,extraTextures:0,extraShadowDraws:0,extraReflectionDraws:0};}};
}
