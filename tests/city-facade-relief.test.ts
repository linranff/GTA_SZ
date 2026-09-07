import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {NullEngine,Scene,PBRMaterial,Matrix,Vector3} from '@babylonjs/core';
import {CityFacadeDiversityPlugin,FACADE_RELIEF} from '../src/city-facade-diversity.ts';
import {applyGrassMaterial,FOREST_CANOPY} from '../src/city-grass-material.ts';

// The wall shader derives height above the block base from TEXCOORD_0.v.
// city_mesh.py writes v = z/24 and the glTF export flips V, so the shader must
// use (1-v)*24. This pins that convention against the shipped asset: an
// inverted reading darkened every tower top instead of its base.
test('shipped wall UVs encode height as (1-v)*24 in the runtime Y-up frame',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const document=await io.read(fileURLToPath(new URL('../public/city/buildings.glb',import.meta.url)));
 let checked=0;
 for(const node of document.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh||!/^block_-?\d+_-?\d+_(office|residential)$/.test(mesh.getName()))continue;
  const world=Matrix.FromArray(node.getWorldMatrix());
  for(const primitive of mesh.listPrimitives()){
   if(!primitive.getAttribute('TEXCOORD_1'))continue;
   const position=primitive.getAttribute('POSITION')!,uv=primitive.getAttribute('TEXCOORD_0')!,p:number[]=[],t:number[]=[];
   let flipped=0,unflipped=0,maxHeight=0;
   for(let i=0;i<position.getCount();i++){
    position.getElement(i,p);uv.getElement(i,t);
    const y=Vector3.TransformCoordinates(new Vector3(p[0],p[1],p[2]),world).y;
    flipped+=Math.abs((1-t[1])*24-y);unflipped+=Math.abs(t[1]*24-y);maxHeight=Math.max(maxHeight,y);
   }
   const n=position.getCount();
   assert.ok(flipped/n<.05,`${mesh.getName()}: mean |(1-v)*24-y| = ${(flipped/n).toFixed(3)}`);
   assert.ok(unflipped/n>5,`${mesh.getName()}: v*24 must not also match height`);
   assert.ok(maxHeight>FACADE_RELIEF.skyTop,'block should contain walls taller than the sky-visibility ramp');
   checked++;
  }
  if(checked>=6)break;
 }
 assert.ok(checked>=4,'expected several marked wall primitives');
});

test('facade relief is analytic per-pixel work on the existing wall draw',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),material=new PBRMaterial('office',scene);
 const shared={albedo:null as never,windows:null as never,ready:true,night:false,failures:[]};
 const plugin=new CityFacadeDiversityPlugin(material,shared),fragment=plugin.getCustomCode('fragment')!;
 const definitions=fragment.CUSTOM_FRAGMENT_DEFINITIONS;
 // Height convention and the four layering terms.
 assert.match(definitions,/height=\(1\.-uv\.y\)\*24\./);
 assert.match(definitions,/cityFacadeSky=mix\(cityFacadeSkyFloor,1\.,smoothstep\(0\.,28\.0,height\)\)/);
 assert.match(definitions,/groundWall=mix\(0\.72,1\.,groundT\)/);
 assert.match(definitions,/float plant=office\*step\(0\.45,/);
 assert.match(definitions,/coverage=stencil\.r\*lit\*paneShade\*\(1\.-cityFacadeSolid\)/);
 // Relief normal runs after albedo (globals filled) and before any light.
 assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_LIGHTS,/normalW=cityFacadeRelief\(normalW\)/);
 assert.match(definitions,/vec3 cityFacadeRelief\(vec3 n\)/);
 assert.match(definitions,/dFdx\(vPositionW\)/);
 // Sky occlusion touches only image-based terms, never direct sun or hemisphere.
 const composition=fragment.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION;
 assert.match(composition,/finalIrradiance\*=cityFacadeSky;finalRadianceScaled\*=cityFacadeSky/);
 assert.doesNotMatch(composition,/finalDiffuse\*=cityFacadeSky/);
 // No new sampler or attribute; the only new uniform is the per-mode sky floor.
 const samplers:string[]=[];plugin.getSamplers(samplers);assert.deepEqual(samplers,['cityFacadeAtlas','cityFacadeWindows']);
 assert.deepEqual(plugin.getUniforms().ubo!.map(u=>u.name),['cityFacadeNight','cityFacadeGlow','cityFacadeSkyFloor']);
 for(const key of ['groundFloor','skyFloor','skyFloorDay','plantWall','plantRate'] as const)assert.ok(FACADE_RELIEF[key]>0&&FACADE_RELIEF[key]<1,key);
 // Daylight bounce lifts the canyon floor but never removes the layering.
 assert.ok(FACADE_RELIEF.skyFloorDay>FACADE_RELIEF.skyFloor&&FACADE_RELIEF.skyFloorDay<.8);
 const uniforms:Record<string,number[]>={};const buffer={updateFloat:(n:string,v:number)=>{uniforms[n]=[v];},updateFloat2:(n:string,a:number,b:number)=>{uniforms[n]=[a,b];},setTexture(){}} as never;
 (shared as {mode?:string}).mode='day';plugin.bindForSubMesh(buffer,scene,engine,null as never);assert.deepEqual(uniforms.cityFacadeSkyFloor,[FACADE_RELIEF.skyFloorDay]);
 (shared as {mode?:string}).mode='sunset';plugin.bindForSubMesh(buffer,scene,engine,null as never);assert.deepEqual(uniforms.cityFacadeSkyFloor,[FACADE_RELIEF.skyFloor]);
 (shared as {mode?:string}).mode='night';plugin.bindForSubMesh(buffer,scene,engine,null as never);assert.deepEqual(uniforms.cityFacadeSkyFloor,[FACADE_RELIEF.skyFloor]);
 assert.ok(FACADE_RELIEF.recess<=.15&&FACADE_RELIEF.paneTilt<.02,'relief stays subtle');
 engine.dispose();
});

test('hill forest keeps authored vertex shading and adds canopy clumps only when flagged',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),forest=new PBRMaterial('mountain-landscape',scene),lawn=new PBRMaterial('terrain_park',scene);
 applyGrassMaterial(scene,forest,false,true);applyGrassMaterial(scene,lawn,true);
 const pluginOf=(m:PBRMaterial)=>(m.pluginManager as unknown as {_plugins:{name:string;getCustomCode(t:string):Record<string,string>|null;getUniforms():{ubo?:{name:string;size:number}[]};bindForSubMesh(b:unknown):void}[]})._plugins.find(p=>p.name==='CityGrassPBR')!;
 const code=pluginOf(forest).getCustomCode('fragment')!.CUSTOM_FRAGMENT_BEFORE_LIGHTS;
 assert.match(code,/#ifdef VERTEXCOLOR\s*[\s\S]*surfaceAlbedo\*=vColor\.rgb;/);
 assert.match(code,/if\(cityGrassPark\.y>\.5\)/);
 assert.match(code,new RegExp(`vec3\\(${FOREST_CANOPY.tint.join(',')}\\)`));
 assert.deepEqual(pluginOf(lawn).getUniforms().ubo,[{name:'cityGrassPark',size:2,type:'vec2'}]);
 const writes:Record<string,number[]>={};
 const buffer={updateFloat2(name:string,x:number,y:number){writes[name]=[x,y];},setTexture(){}};
 pluginOf(forest).bindForSubMesh(buffer);assert.deepEqual(writes.cityGrassPark,[0,1]);
 pluginOf(lawn).bindForSubMesh(buffer);assert.deepEqual(writes.cityGrassPark,[1,0]);
 assert.equal(forest.albedoColor.r,1,'grass stack owns the albedo; the old mountain albedoColor was dead code');
 engine.dispose();
});
