import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3,PBRMaterial} from '@babylonjs/core';
import {CityMeadow,MEADOW_LIMITS,createMeadowGeometry,createMeadowPatch,decodeMeadowTile,meadowVisibility,validateMeadowManifest,type MeadowManifest,type MeadowPatch} from '../src/city-meadow.ts';

const fixture=():MeadowManifest=>({schemaVersion:1,tileSize:128,step:4,gridSize:32,stride:3,safeRadius:2.9,channels:['safe','soil','slopeDegreesX4'],sourceSHA:{city:'a'.repeat(64)},tiles:[{id:'0_0',ix:0,iz:0,url:'meadow/tile_0_0.bin',bytes:3072,count:1024}]});
const fullMask=()=>{const data=new Uint8Array(3072);for(let i=0;i<data.length;i+=3)data[i]=255;return data;};

test('meadow mask decodes negative tiles and rejects unproved points, steep/soil cells and bad counts',()=>{
 const m=fixture();m.tiles[0].ix=-2;m.tiles[0].iz=-3;m.tiles[0].count=3;const data=new Uint8Array(3072);data.set([255,51,12],0);data.set([255,0,60],3);data.set([255,250,0],6);data.set([254,0,0],9);
 const patches=decodeMeadowTile(validateMeadowManifest(m),m.tiles[0],data);assert.equal(patches.length,1);assert.equal(patches[0].x,-254);assert.equal(patches[0].z,-382);assert.equal(patches[0].slope,3);assert.equal(patches[0].soil,.2);
 assert.throws(()=>decodeMeadowTile(m,{...m.tiles[0],count:4},data),/数量/);assert.throws(()=>decodeMeadowTile(m,m.tiles[0],data.subarray(1)),/长度/);
 assert.throws(()=>validateMeadowManifest({...m,sourceSHA:{city:'not-a-hash'}}),/哈希/);assert.throws(()=>validateMeadowManifest({...m,tiles:[{...m.tiles[0],url:'../unsafe.bin'}]}),/分块/);
});

test('curved blade mesh has nondegenerate LH normals and stays inside every certified patch including maximum wind',()=>{
 const g=createMeadowGeometry(),p=Array.from(g.positions!),n=Array.from(g.normals!),ind=Array.from(g.indices!);assert.equal(ind.length/3,35);assert.equal(p.length/3,49);
 for(let i=0;i<ind.length;i+=3){
  const a=Vector3.FromArray(p,ind[i]*3),b=Vector3.FromArray(p,ind[i+1]*3),c=Vector3.FromArray(p,ind[i+2]*3);const face=Vector3.Cross(a.subtract(b),c.subtract(b));assert(face.length()>1e-5);
  for(const j of [ind[i],ind[i+1],ind[i+2]]){const normal=Vector3.FromArray(n,j*3);assert(Math.abs(normal.length()-1)<1e-6);assert(Vector3.Dot(face,normal)>0,'normals must agree with Babylon LH winding');}
 }
 const normalsRH=Array.from(createMeadowGeometry(true).normals!);for(let i=0;i<n.length;i++)assert(Math.abs(n[i]-normalsRH[i])<1e-6);
 let tall=0,short=0;
 for(let seed=0;seed<80;seed++){
  const patch:MeadowPatch={x:-5112,z:512,soil:0,slope:5,seed,safeRadius:2.9};const clumps=createMeadowPatch(patch);assert.equal(clumps.length,48);assert.deepEqual(clumps,createMeadowPatch(patch));
  for(const c of clumps){
   assert(c.height>=.05&&c.height<=.15);if(c.height>.12)tall++;else short++;
   const centre=Math.hypot(c.x-patch.x,c.z-patch.z);
   for(let i=0;i<p.length;i+=3){const leafRadius=Math.hypot(p[i],p[i+2])*c.width;const maximumWind=Math.hypot(.10,.045)*p[i+1]**2*c.width;assert(centre+leafRadius+maximumWind<=patch.safeRadius,'entire animated blade must remain in certified safe disc');}
  }
 }
 assert(tall>0&&tall/(tall+short)<.04);assert(short>3500);
});

test('distance LOD shrinks continuously to zero and aerial height disables geometry',()=>{
 for(const range of [7,14,21,28]){assert.equal(meadowVisibility(0,range),1);assert.equal(meadowVisibility(range,range),0);assert(meadowVisibility(range*.85,range)>.49&&meadowVisibility(range*.85,range)<.51);assert(meadowVisibility(range-.001,range)<.00001);assert.equal(meadowVisibility(0,range,16),0);}
});

test('CPU runtime caps instances, reuses buffers, gates terrain work, disables aerial and clears resources',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('meadow-test',new Vector3(64,4,64),scene);scene.activeCamera=camera;camera.getViewMatrix(true);
 let heightCalls=0;const m=fixture();const fetcher:typeof fetch=async url=>String(url).endsWith('meadow.json')?new Response(JSON.stringify(m)):new Response(fullMask());
 const meadow=new CityMeadow(scene,()=>{heightCalls++;return 0;},{fetcher});await meadow.init();meadow.update(64,64);
 await new Promise(resolve=>setTimeout(resolve,90));meadow.update(64,64);
 assert.equal(meadow.stats.pendingTiles,0);assert.equal(meadow.stats.status,'ready');assert(meadow.stats.instances>1500);assert(meadow.stats.instances<=2304);assert.equal(meadow.stats.drawCalls,1);assert(meadow.stats.triangles<=80640);
 const mesh=meadow.meshes[0],material=mesh.material as PBRMaterial;assert.equal(mesh.checkCollisions,false);assert.equal(mesh.receiveShadows,true);assert.equal(mesh.metadata.castsShadows,false);assert.equal(mesh.isPickable,false);assert.equal(material.transparencyMode,PBRMaterial.PBRMATERIAL_OPAQUE);assert.equal(material.getActiveTextures().length,0);assert.deepEqual(material.emissiveColor.asArray(),[0,0,0]);assert(material.albedoColor.g>material.albedoColor.r);
 // Exercise the material's real extra-event dispatch. Calling the plugin
 // directly would miss an incorrect registerForExtraEvents activation order.
 const events=material as unknown as {_uniformBuffer:{updateFloat4:(name:string,x:number,y:number,z:number,w:number)=>void};_callbackPluginEventHardBindForSubMesh:(event:{subMesh:unknown})=>void};
 const writes:number[][]=[],original=events._uniformBuffer.updateFloat4;events._uniformBuffer.updateFloat4=(name,...values)=>{if(name==='meadowEyeTime')writes.push(values);};
 events._callbackPluginEventHardBindForSubMesh({subMesh:mesh.subMeshes[0]});camera.position.x=67;camera.getViewMatrix(true);events._callbackPluginEventHardBindForSubMesh({subMesh:mesh.subMeshes[0]});
 events._uniformBuffer.updateFloat4=original;assert.equal(writes.length,2);assert.deepEqual(writes[0].slice(0,3),[64,4,64]);assert.deepEqual(writes[1].slice(0,3),[67,4,64]);assert(writes[1][3]>=writes[0][3]);camera.position.x=64;camera.getViewMatrix(true);
 const calls=heightCalls,rebuilds=meadow.stats.rebuilds;for(let i=0;i<100;i++)meadow.update(64+.001*i,64);assert.equal(heightCalls,calls);assert.equal(meadow.stats.rebuilds,rebuilds);
 const buffer=mesh.getVertexBuffer('world0');await new Promise(resolve=>setTimeout(resolve,75));meadow.update(68,64);assert.equal(meadow.stats.rebuilds,rebuilds+1);assert.equal(mesh.getVertexBuffer('world0'),buffer,'instance storage is reused after actual travel');assert(heightCalls-calls<MEADOW_LIMITS.clumps,'nearby terrain samples survive movement');
 meadow.update(64,64,true);assert.equal(meadow.stats.instances,0);assert(meadow.meshes.every(mesh=>!mesh.isEnabled()));
 meadow.setTerrainHeight(()=>2);meadow.update(64,64,false);assert(meadow.stats.instances>0);assert(meadow.meshes[0].getBoundingInfo().minimum.y>1.9);
 const meshes=[...meadow.meshes];meadow.dispose();assert.equal(meadow.stats.status,'disposed');assert.equal(meadow.meshes.length,0);assert(meshes.every(mesh=>mesh.isDisposed()));scene.dispose();engine.dispose();
});

test('missing data is explicit and cannot leave placeholder grass in the scene',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);const meadow=new CityMeadow(scene,()=>0,{fetcher:async()=>new Response(null,{status:404})});await meadow.init();meadow.update(0,0);assert.equal(meadow.stats.status,'missing-data');assert.equal(meadow.ready,false);assert.match(meadow.stats.error!,/404/);assert.equal(meadow.meshes.length,0);meadow.dispose();scene.dispose();engine.dispose();
});

test('scene disposal aborts pending loads and late responses cannot create grass resources',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);let release:(response:Response)=>void=()=>{},signal:AbortSignal|null=null;
 const fetcher:typeof fetch=async(_url,options)=>{signal=options?.signal??null;return await new Promise<Response>(resolve=>{release=resolve;});};
 const meadow=new CityMeadow(scene,()=>0,{fetcher}),load=meadow.init();scene.dispose();release(new Response(JSON.stringify(fixture())));await load;
 assert.equal((signal as AbortSignal|null)?.aborted,true);assert.equal(meadow.stats.status,'disposed');assert.equal(meadow.meshes.length,0);assert.equal(meadow.ready,false);engine.dispose();
});
