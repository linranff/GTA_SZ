import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {
 MaterialPluginBase,MeshBuilder,NullEngine,PBRMaterial,Scene,
 type AbstractMesh,type MaterialDefines,type UniformBuffer,
} from '@babylonjs/core';
import {BAYPARK_LOOK,BAYPARK_PAVING,createBayparkLook} from '../src/city-baypark-look.ts';

function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine),material=new PBRMaterial('concrete',scene);
 const publicPlugin=new MaterialPluginBase(material,'ExistingPublicIrradiance',210,{},true,true);
 const mesh=(name:string,x=BAYPARK_LOOK.center[0],z=BAYPARK_LOOK.center[1])=>{
  const m=MeshBuilder.CreateGround(name,{width:4,height:4},scene);m.position.set(x,.08,z);m.material=material;return m;
 };
 return {engine,scene,material,publicPlugin,mesh};
}

// This is the important shared-state regression: Babylon caches the ordinary
// material bind across consecutive meshes, whereas HardBind always runs.
test('shared concrete is gated for every receiver and preserves existing lighting',()=>{
 const {engine,scene,material,publicPlugin,mesh}=fixture();
 try{
  const ribbon=mesh('terrain_pavement'),wall=mesh('coastal_shore_seawall');
  const building=mesh('block_-4_-2_concrete'),road=mesh('roads_-4_-2_pavement');
  mesh('terrain_park');mesh('terrain_water');
  const outside=mesh('terrain_concrete',BAYPARK_LOOK.center[0]+BAYPARK_LOOK.outerRadius+10);
  const counts={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,lights:scene.lights.length};
  const original={roughness:material.roughness,metallic:material.metallic,albedo:material.albedoColor.clone(),emission:material.emissiveColor.clone()};
  const look=createBayparkLook(scene),plugin=material.pluginManager!.getPlugin('CityBayparkSurface')!;
  assert.equal(plugin.registerForExtraEvents,true);
  assert.equal(material.pluginManager!.getPlugin('ExistingPublicIrradiance'),publicPlugin);
  let kind=-1;
  const buffer={updateFloat4(_name:string,_x:number,_z:number,value:number){kind=value;}} as UniformBuffer;
  function bind(m:AbstractMesh){plugin.hardBindForSubMesh(buffer,scene,engine,m.subMeshes![0]);return kind;}
  assert.equal(bind(ribbon),1);assert.equal(bind(building),0);
  assert.equal(bind(wall),3);assert.equal(bind(road),0);assert.equal(bind(outside),0);
  look.setEnabled(false);assert.equal(bind(ribbon),0);assert.equal(bind(wall),0);
  look.setMode('night');look.setEnabled(true);assert.equal(bind(ribbon),1);assert.equal(bind(building),0);
  assert.equal(look.stats().mode,'night');
  assert.deepEqual({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,lights:scene.lights.length},counts);
  assert.deepEqual({roughness:material.roughness,metallic:material.metallic,albedo:material.albedoColor,emission:material.emissiveColor},original);
  assert.equal(ribbon.material,material);assert.equal(building.material,material);
  assert.deepEqual(look.stats().meshes,['terrain_pavement','coastal_shore_seawall']);
 }finally{engine.dispose();}
});

test('A/B disposal and repeated creation leave one reusable, dormant plugin',()=>{
 const {engine,scene,material,mesh}=fixture();
 try{
  mesh('terrain_pavement');
  const first=createBayparkLook(scene),plugin=material.pluginManager!.getPlugin('CityBayparkSurface')!;
  assert.equal(createBayparkLook(scene),first);
  first.dispose();first.dispose();
  const defines={} as MaterialDefines&{CITY_BAYPARK_SURFACE:boolean};
  plugin.prepareDefines(defines,scene,scene.meshes[0]);assert.equal(defines.CITY_BAYPARK_SURFACE,false);
  assert.equal(first.stats().enabled,false);assert.equal(first.stats().materials,0);
  const second=createBayparkLook(scene);assert.notEqual(first,second);
  assert.equal(material.pluginManager!.getPlugin('CityBayparkSurface'),plugin);
  plugin.prepareDefines(defines,scene,scene.meshes[0]);assert.equal(defines.CITY_BAYPARK_SURFACE,true);
  second.dispose();
 }finally{engine.dispose();}
});

// The coast ribbon is deliberately selected by asset identity. This pins that
// identity and actual sample coverage to the shipped GLB, without inventing a
// broad ground plane or treating absent footway tags as a surveyed path.
test('current coast assets contain the named receivers in the sample area',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const found=new Map<string,number>();
 const expected=new Set(['terrain_pavement','terrain_concrete','coastal_shore_concrete','coastal_shore_seawall','coastal_shore_coastal-rock']);
 for(const file of ['terrain.glb','coastal-shoreline.glb']){
  const doc=await io.read(fileURLToPath(new URL('../public/city/'+file,import.meta.url)));
  if(file==='terrain.glb'){
   const paving=doc.getRoot().listMaterials().find(m=>m.getName()==='pavement')!;
   const embedded=paving.getBaseColorTexture()!.getImage()!;
   const source=await readFile(fileURLToPath(new URL('../'+BAYPARK_PAVING.source,import.meta.url)));
   const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
   // If the shipped source changes, remeasure linear mean before replacing
   // its old grid. A palette chosen from a screenshot could bleach the PBR.
   assert.equal(hash(embedded),BAYPARK_PAVING.sha256);
   assert.equal(hash(source),BAYPARK_PAVING.sha256);
   assert.deepEqual(paving.getBaseColorFactor(),[1,1,1,1]);
  }
  for(const node of doc.getRoot().listNodes()){
   const mesh=node.getMesh();if(!mesh||!expected.has(node.getName()))continue;
   const matrix=node.getWorldMatrix();let near=0;
   for(const primitive of mesh.listPrimitives()){
    const positions=primitive.getAttribute('POSITION')!;
    for(let i=0;i<positions.getCount();i++){
     const p=positions.getElement(i,[]);
     const x=matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12];
     // Runtime preserves the existing Blender north -> GLB -Z -> game +Z path.
     const z=-(matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]);
     if(Math.hypot(x-BAYPARK_LOOK.center[0],z-BAYPARK_LOOK.center[1])<200)near++;
    }
   }
   found.set(node.getName(),near);
  }
 }
 assert.deepEqual(new Set(found.keys()),expected);
 for(const [name,near] of found)assert.ok(near>20,`${name} must actually reach the 200-unit near sample, found ${near} vertices`);
});
