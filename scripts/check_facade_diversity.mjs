import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {NullEngine,Scene,PBRMaterial,MeshBuilder,RawTexture,Texture,VertexBuffer,MaterialDefines} from '@babylonjs/core';
import {CityFacadeDiversityPlugin} from '../src/city-facade-diversity.ts';
import {familyFor} from './prepare_facade_diversity.mjs';
const engine=new NullEngine(),scene=new Scene(engine),mat=new PBRMaterial('architecture:city-office',scene),mesh=MeshBuilder.CreateBox('block_0_0_office',{},scene);
const texture=RawTexture.CreateRGBTexture(new Uint8Array([128,128,128]),1,1,scene);mat.albedoTexture=texture;mat.emissiveTexture=texture;mesh.material=mat;
mesh.setVerticesData(VertexBuffer.UV2Kind,new Float32Array(mesh.getTotalVertices()*2).fill(2));
const shared={albedo:texture,windows:texture,ready:true,night:false,failures:[]},plugin=new CityFacadeDiversityPlugin(mat,shared),defines=new MaterialDefines();
plugin.prepareDefines(defines,scene,mesh);assert.equal(defines.CITY_FACADE_VARIETY,true);
const lm=MeshBuilder.CreateBox('detail_pingan_office',{},scene);lm.setVerticesData(VertexBuffer.UV2Kind,new Float32Array(lm.getTotalVertices()*2));plugin.prepareDefines(defines,scene,lm);assert.equal(defines.CITY_FACADE_VARIETY,false);
const samplers=[];plugin.getSamplers(samplers);assert.deepEqual(samplers,['cityFacadeAtlas','cityFacadeWindows']);
const attributes=[];plugin.getAttributes(attributes,scene,mesh);assert.deepEqual(attributes,['uv2']);
const code=plugin.getCustomCode('fragment');let input='vec4 albedoTexture=texture2D(albedoSampler,vAlbedoUV+uvOffset);vec3 emissiveColorTex=texture2D(emissiveSampler,vEmissiveUV+uvOffset).rgb;';
for(const [key,value] of Object.entries(code))if(key.startsWith('!')){assert.match(input,new RegExp(key.slice(1)));input=input.replace(new RegExp(key.slice(1),'g'),value);}
assert(!input.includes('texture2D('));assert(input.includes('cityFacadeAlbedo(')&&input.includes('cityFacadeEmission('));
for(const tag of ['apartments','residential','house','dormitory'])for(let i=0;i<100;i++){const b={id:'way/'+i,height:150};assert(![0,1].includes(familyFor(b,{building:tag}).family),'高层住宅不能再次误判office');assert.deepEqual(familyFor(b,{building:tag}),familyFor(b,{building:tag}));}
for(let i=0;i<50;i++)assert.equal(familyFor({id:'way/'+i,height:20},{building:'industrial'}).family,6);
let effect;mat.onEffectCreatedObservable.add(event=>{effect=event.effect;});await mat.forceCompilationAsync(mesh);
assert(effect?.isReady(),'NullEngine effect missing');
assert.match(effect.vertexSourceCode,/vCityFacadeInfo=uv2/);
assert.match(effect.fragmentSourceCode,/cityFacadeAlbedo\(vAlbedoUV/);
assert.match(effect.fragmentSourceCode,/cityFacadeEmission\(vEmissiveUV/);
assert.match(effect.fragmentSourceCode,/vec4 albedoTexture=cityFacadeAlbedo\(vAlbedoUV\+uvOffset\);/);
assert.match(effect.fragmentSourceCode,/vec3 emissiveColorTex=cityFacadeEmission\(vEmissiveUV\+uvOffset\);/);
assert(!/cityFacade(?:Albedo|Emission)\(v(?:Albedo|Emissive)UV\+uvOffset\)\s*\n\s*;/.test(effect.fragmentSourceCode),'statement semicolon must survive on same line for Babylon preprocessing');
await fs.writeFile('artifacts/materials/facade-diversity/vertex-shader.glsl',effect.vertexSourceCode);
await fs.writeFile('artifacts/materials/facade-diversity/fragment-shader.glsl',effect.fragmentSourceCode);
const report={passed:true,scope:'CPU NullEngine shader preprocessing and family invariants; GPU compilation, current-world appearance and FPS require browser integration',checks:['existing albedo and emissive samples replaced','one uv2 attribute','two shared samplers','named landmarks excluded','high residential tags preserved','stable deterministic family','industrial type separated','NullEngine PBR preprocessing'],materialCount:scene.materials.length,shaderReady:effect?.isReady()??null};
await fs.writeFile('artifacts/materials/facade-diversity/cpu-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));scene.dispose();engine.dispose();
