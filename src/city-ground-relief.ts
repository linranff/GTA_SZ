import {MaterialPluginBase,PBRMaterial,Mesh,VertexData,Texture,Color3,ShaderLanguage,type Scene,type AbstractMesh,type MaterialDefines,type BaseTexture,type UniformBuffer,type AbstractEngine,type SubMesh} from '@babylonjs/core';
import {applyGrassMaterial,grassMaterialStats} from './city-grass-material.ts';

type Span={offset:number;bytes:number};
export type ReliefTile={id:string;x:number;z:number;vertexCount:number;triangleCount:number;bounds:number[];positions:Span;normals:Span;indices:Span};
export type ReliefManifest={schemaVersion:1;mesh:string;macroTexture:string;extent:number[];textureSize:number[];preservedTerrainBounds:number[];preservedTerrainMargin:number;lookupCellSize:number;surfaceOffset:number;tiles:ReliefTile[];budgets:{triangles:number;vertices:number;meshBytes:number;tiles:number;maxAddedHeight:number;maxSlope:number;textureBytesWithMipmaps:number}};
export type ReliefGeometry={tile:ReliefTile;positions:Float32Array;normals:Float32Array;indices:Uint32Array};
type HeightAt=(x:number,z:number)=>number;

/** Exact triangle interpolation; no analytic wave is applied to the city.
 * The lookup is constructed once. Roads/buildings have no relief triangles,
 * and the entire existing Lianhua rectangle has an explicit preservation guard.
 */
export function createReliefHeightSampler(geometry:ReliefGeometry[],baseHeightAt:HeightAt,preservedBounds:number[],cellSize=32){
 const cells=new Map<string,{geometry:ReliefGeometry;index:number}[]>();
 for(const group of geometry){const p=group.positions,ind=group.indices;
  for(let index=0;index<ind.length;index+=3){const a=ind[index]*3,b=ind[index+1]*3,c=ind[index+2]*3;
   const minX=Math.floor(Math.min(p[a],p[b],p[c])/cellSize),maxX=Math.floor(Math.max(p[a],p[b],p[c])/cellSize),minZ=Math.floor(Math.min(p[a+2],p[b+2],p[c+2])/cellSize),maxZ=Math.floor(Math.max(p[a+2],p[b+2],p[c+2])/cellSize);
   for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=x+','+z;let refs=cells.get(key);if(!refs){refs=[];cells.set(key,refs);}refs.push({geometry:group,index});}
  }
 }
 function deltaAt(x:number,z:number){
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  if(x>=preservedBounds[0]&&x<=preservedBounds[2]&&z>=preservedBounds[1]&&z<=preservedBounds[3])return 0;
  const candidates=cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize));if(!candidates)return 0;
  for(const {geometry:g,index:i} of candidates){const p=g.positions,ind=g.indices,a=ind[i]*3,b=ind[i+1]*3,c=ind[i+2]*3;
   const ax=p[a],az=p[a+2],bx=p[b],bz=p[b+2],cx=p[c],cz=p[c+2];
   const denom=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(denom)<1e-8)continue;
   const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/denom,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/denom,w=1-u-v;
   if(u>=-1e-5&&v>=-1e-5&&w>=-1e-5)return Math.max(0,p[a+1]*u+p[b+1]*v+p[c+1]*w);
  }
  return 0;
 }
 return {deltaAt,heightAt:(x:number,z:number)=>baseHeightAt(x,z)+deltaAt(x,z),cellCount:cells.size,dispose:()=>cells.clear()};
}

type GroundCover={texture:Texture;ready:boolean;extent:number[]};
class GroundCoverPlugin extends MaterialPluginBase{
 constructor(material:PBRMaterial,private cover:GroundCover){super(material,'CityGroundCover',195,{CITY_GROUND_COVER:false},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(defines:MaterialDefines){(defines as MaterialDefines&{CITY_GROUND_COVER:boolean}).CITY_GROUND_COVER=this.cover.ready;}
 override getSamplers(samplers:string[]){samplers.push('cityGroundCover');}
 override getUniforms(){return {ubo:[{name:'cityGroundExtent',size:4,type:'vec4'}],fragment:'uniform vec4 cityGroundExtent;'};}
 override bindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,_subMesh:SubMesh){const e=this.cover.extent;buffer.updateFloat4('cityGroundExtent',e[0],e[1],e[2]-e[0],e[3]-e[1]);buffer.setTexture('cityGroundCover',this.cover.texture);}
 override getActiveTextures(active:BaseTexture[]){active.push(this.cover.texture);}
 override hasTexture(texture:BaseTexture){return texture===this.cover.texture;}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:'#ifdef CITY_GROUND_COVER\nuniform sampler2D cityGroundCover;\n#endif',CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
   #ifdef CITY_GROUND_COVER
   vec2 groundUV=(vPositionW.xz-cityGroundExtent.xy)/cityGroundExtent.zw;
   vec4 groundCover=texture2D(cityGroundCover,groundUV);
   #ifdef CITY_GRASS_PBR
   cityGrassTint=groundCover.rgb*2.05;
   cityGrassSoil=groundCover.a;
   #else
   surfaceAlbedo*=groundCover.rgb*2.05;
   surfaceAlbedo=mix(surfaceAlbedo,vec3(.185,.145,.090),groundCover.a*.48);
   #endif
   #endif
  `};
 }
}

/** Load before constructing players/plants, then pass heightAt to those systems.
 * attachVisuals is called after terrain + landmark loading and after the old
 * grass material assignment. It never modifies roads, buildings, or water.
 * Candidate data comes from scripts/prepare_city_ground_relief.py; copy its
 * approved output to /city/ground-relief/ during integration.
 */
export async function loadCityGroundRelief(baseHeightAt:HeightAt,baseURL='/city/ground-relief/'){
 const metaResponse=await fetch(baseURL+'manifest.json');if(!metaResponse.ok)throw Error('公园地形清单加载失败');
 const manifest=await metaResponse.json() as ReliefManifest;
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.tiles)||manifest.tiles.length>100||manifest.budgets.triangles>200000||manifest.preservedTerrainBounds.length!==4)throw Error('公园地形预算或格式无效');
 const meshResponse=await fetch(baseURL+manifest.mesh);if(!meshResponse.ok)throw Error('公园地形网格加载失败');const packed=await meshResponse.arrayBuffer();
 if(packed.byteLength!==manifest.budgets.meshBytes)throw Error('公园地形网格长度不符');
 const readFloats=(span:Span)=>new Float32Array(packed,span.offset,span.bytes/4);
 const geometry:ReliefGeometry[]=manifest.tiles.map(tile=>({tile,positions:readFloats(tile.positions),normals:readFloats(tile.normals),indices:new Uint32Array(packed,tile.indices.offset,tile.indices.bytes/4)}));
 for(const g of geometry)if(g.positions.length!==g.tile.vertexCount*3||g.normals.length!==g.positions.length||g.indices.length!==g.tile.triangleCount*3)throw Error('公园地形分块长度不符');
 const sampler=createReliefHeightSampler(geometry,baseHeightAt,manifest.preservedTerrainBounds,manifest.lookupCellSize);
 const meshes:Mesh[]=[],plugins:GroundCoverPlugin[]=[];const enhanced=new Set<PBRMaterial>();let material:PBRMaterial|null=null,cover:GroundCover|null=null;let disposed=false,attached=false,textureError:string|null=null;
 function enhanceGroundMaterials(scene:Scene){
  if(!cover)return;
  for(const mesh of scene.meshes){const m=mesh.material;if(!(m instanceof PBRMaterial)||enhanced.has(m))continue;
   const isGround=/^(?:terrain_(?:land|park)|detail_lianhua_park|ground_relief_)/.test(mesh.name);
   if(!isGround)continue;enhanced.add(m);plugins.push(new GroundCoverPlugin(m,cover));applyGrassMaterial(scene,m,!mesh.name.startsWith('terrain_land'));
  }
 }
 function attachVisuals(scene:Scene){
  if(disposed||attached)return meshes;attached=true;
  const original=scene.meshes.find(m=>m.name==='terrain_park')?.material;
  material=new PBRMaterial('ground-relief-landscape',scene);material.albedoColor=new Color3(.92,.99,.88);material.metallic=0;material.roughness=.96;material.maxSimultaneousLights=3;material.backFaceCulling=true;
  if(original instanceof PBRMaterial)material.albedoTexture=original.albedoTexture;
  const state:GroundCover={texture:null as unknown as Texture,ready:false,extent:manifest.extent};cover=state;
  state.texture=new Texture(baseURL+manifest.macroTexture,scene,{invertY:false,noMipmap:false,gammaSpace:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,onLoad:()=>queueMicrotask(()=>{if(disposed)return;state.ready=true;for(const plugin of plugins)plugin.markAllDefinesAsDirty();}),onError:message=>{textureError=message??'cover texture failed';}});
  state.texture.hasAlpha=false;state.texture.anisotropicFilteringLevel=4;state.texture.wrapU=Texture.CLAMP_ADDRESSMODE;state.texture.wrapV=Texture.CLAMP_ADDRESSMODE;
  for(const group of geometry){const mesh=new Mesh('ground_relief_'+group.tile.id,scene);const vertices=new VertexData(),positions=new Float32Array(group.positions),uvs=new Float32Array(group.tile.vertexCount*2);
   for(let i=0;i<positions.length;i+=3){const x=positions[i],z=positions[i+2];positions[i+1]+=baseHeightAt(x,z)+manifest.surfaceOffset;uvs[i/3*2]=x/8;uvs[i/3*2+1]=z/8;}
   const indices=new Uint32Array(group.indices);
   // Packed normals are mathematical upward normals. Babylon's left-handed
   // front-face convention uses the opposite index winding.
   if(!scene.useRightHandedSystem)for(let i=0;i<indices.length;i+=3){const v=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=v;}
   vertices.positions=positions;vertices.normals=group.normals;vertices.indices=indices;vertices.uvs=uvs;vertices.applyToMesh(mesh,false);mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();meshes.push(mesh);
  }
  enhanceGroundMaterials(scene);scene.onDisposeObservable.addOnce(dispose);return meshes;
 }
 function shadowMeshes(x:number,z:number,radius=850):AbstractMesh[]{return meshes.filter((_,i)=>{const b=geometry[i].tile.bounds;return Math.hypot(Math.max(b[0]-x,0,x-b[2]),Math.max(b[1]-z,0,z-b[3]))<radius;});}
 function dispose(){if(disposed)return;disposed=true;for(const mesh of meshes)mesh.dispose(false,false);material?.dispose(false,false);cover?.texture.dispose();sampler.dispose();}
 return {heightAt:sampler.heightAt,deltaAt:sampler.deltaAt,attachVisuals,enhanceGroundMaterials,shadowMeshes,meshes,manifest,dispose,
  get stats(){return {ready:!disposed,attached,textureReady:cover?.ready??false,textureError,groundMaterials:enhanced.size,grassMaterial:material?grassMaterialStats(material.getScene()):null,lookupCells:sampler.cellCount,extraDrawCalls:meshes.length,...manifest.budgets,preservedTerrainBounds:manifest.preservedTerrainBounds};}};
}
