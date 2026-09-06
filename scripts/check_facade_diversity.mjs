import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {NullEngine,Scene,PBRMaterial,MeshBuilder,RawTexture,Texture,VertexBuffer,MaterialDefines} from '@babylonjs/core';
import {CityFacadeDiversityPlugin,ACCENT_WINDOW_MOTIF,RARE_WINDOW_LIGHT_RATE,WINDOW_HDR_SCALES,WINDOW_BLOOM_SCALES,WINDOW_KERNEL_SCALES,facadeWindowLightFor,facadeOccupancyFor} from '../src/city-facade-diversity.ts';
import {familyFor} from './prepare_facade_diversity.mjs';
const engine=new NullEngine(),scene=new Scene(engine),mat=new PBRMaterial('architecture:city-office',scene),mesh=MeshBuilder.CreateBox('block_0_0_office',{},scene);
const texture=RawTexture.CreateRGBTexture(new Uint8Array([128,128,128]),1,1,scene);mat.albedoTexture=texture;mat.emissiveTexture=texture;mesh.material=mat;
mesh.setVerticesData(VertexBuffer.UV2Kind,new Float32Array(mesh.getTotalVertices()*2).fill(2));
const shared={albedo:texture,windows:texture,ready:true,night:false,failures:[]},plugin=new CityFacadeDiversityPlugin(mat,shared),defines=new MaterialDefines();
plugin.prepareDefines(defines,scene,mesh);assert.equal(defines.CITY_FACADE_VARIETY,true);
for(const name of ['detail_pingan_office','detail_bamboo_landmarkglass']){const lm=MeshBuilder.CreateBox(name,{},scene);lm.setVerticesData(VertexBuffer.UV2Kind,new Float32Array(lm.getTotalVertices()*2));plugin.prepareDefines(defines,scene,lm);assert.equal(defines.CITY_FACADE_VARIETY,false);}
const samplers=[];plugin.getSamplers(samplers);assert.deepEqual(samplers,['cityFacadeAtlas','cityFacadeWindows']);
const attributes=[];plugin.getAttributes(attributes,scene,mesh);assert.deepEqual(attributes,['uv2']);
const code=plugin.getCustomCode('fragment');let input='vec4 albedoTexture=texture2D(albedoSampler,vAlbedoUV+uvOffset);vec3 emissiveColorTex=texture2D(emissiveSampler,vEmissiveUV+uvOffset).rgb;';
for(const [key,value] of Object.entries(code))if(key.startsWith('!')){assert.match(input,new RegExp(key.slice(1)));input=input.replace(new RegExp(key.slice(1),'g'),value);}
assert(!input.includes('texture2D('));assert(input.includes('cityFacadeAlbedo(')&&input.includes('cityFacadeEmission('));
const samples=[];for(let seed=0;seed<120;seed++)for(let y=0;y<ACCENT_WINDOW_MOTIF[1];y++)for(let x=0;x<ACCENT_WINDOW_MOTIF[0];x++)samples.push(facadeWindowLightFor(seed,[x,y],[1,.86,.74]));
const rare=samples.filter(sample=>sample.rare),ratio=rare.length/samples.length;assert.equal(ratio,RARE_WINDOW_LIGHT_RATE,`accent window ratio ${ratio}`);assert.deepEqual([...new Set(rare.map(sample=>sample.slot))].sort(),[0,1,2]);
assert.equal(ratio,.0625/4,'user requested one quarter of the previous accent density');
const uniforms={};const buffer={updateFloat:(name,value)=>uniforms[name]=value,updateFloat2:(name,x,y)=>uniforms[name]=[x,y],setTexture:()=>{}};
shared.mode='day';plugin.bindForSubMesh(buffer);assert.deepEqual(uniforms.cityFacadeGlow,[0,0],'daylight disables emission and its bounce');
shared.mode='night';shared.night=true;plugin.bindForSubMesh(buffer);assert(uniforms.cityFacadeGlow[0]>0);shared.mode='sunset';shared.night=false;
for(let seed=0;seed<120;seed++){const motif=[];for(let y=0;y<ACCENT_WINDOW_MOTIF[1];y++)for(let x=0;x<ACCENT_WINDOW_MOTIF[0];x++)motif.push(facadeWindowLightFor(seed,[x,y],[1,.86,.74]));const accents=motif.filter(sample=>sample.rare);assert.equal(accents.length,6);assert.deepEqual(accents.reduce((counts,sample)=>(counts[sample.slot]++,counts),[0,0,0]),[2,2,2]);}
assert.deepEqual(facadeWindowLightFor(77,[13,29],[1,.86,.74]),facadeWindowLightFor(77,[13,29],[1,.86,.74]));assert.equal(facadeWindowLightFor(0,[1,1],[1,.86,.74]).rare,true);const unresolvedAccent=facadeWindowLightFor(0,[1,1],[1,.86,.74],1);assert.deepEqual(unresolvedAccent.color,[1,.86,.74]);assert.deepEqual([unresolvedAccent.hdrScale,unresolvedAccent.bloomScale,unresolvedAccent.kernelScale],[1,1,1],'unresolved accent brightness must average with its tint');
const ordinary=samples.filter(sample=>!sample.rare);assert.deepEqual([...new Set(ordinary.map(sample=>sample.hdrScale))].sort(),[...WINDOW_HDR_SCALES]);assert.deepEqual([...new Set(ordinary.map(sample=>sample.bloomScale))].sort(),[...WINDOW_BLOOM_SCALES]);assert.deepEqual([...new Set(samples.map(sample=>sample.kernelScale))].sort(),[...WINDOW_KERNEL_SCALES]);assert(rare.every(sample=>sample.hdrScale>=Math.min(...WINDOW_HDR_SCALES)*1.22&&sample.bloomScale>=Math.min(...WINDOW_BLOOM_SCALES)*1.12));
const occupancy=[];let darkFloorSamples=0,farFieldError=0;
for(let seed=0;seed<120;seed++)for(let y=0;y<ACCENT_WINDOW_MOTIF[1];y++)for(let x=0;x<ACCENT_WINDOW_MOTIF[0];x++){
 const light=facadeOccupancyFor(seed,seed%8,[x,y],true),far=facadeOccupancyFor(seed,seed%8,[x,y],true,1);
 farFieldError=Math.max(farFieldError,Math.abs(far.coverage-far.expected));
 if(!light.rareColor){occupancy.push(light.binary);if(light.floorLit===0){
  darkFloorSamples++;assert.equal(light.binary,0,'supplementary ordinary windows cannot light a closed floor');
  assert.equal(facadeOccupancyFor(seed,seed%8,[x,y],true,{suite:1,floor:0,pane:0}).coverage,0,'horizontal minification cannot light a resolved closed floor');
  assert.equal(facadeOccupancyFor(seed,seed%8,[x,y],true,{suite:1,floor:0,pane:1}).coverage,RARE_WINDOW_LIGHT_RATE,'compressed panes on a closed floor retain only the sparse accent expectation');
 }}
}
const ordinaryLitRatio=occupancy.reduce((sum,value)=>sum+value,0)/occupancy.length;assert(ordinaryLitRatio>.20&&ordinaryLitRatio<.30,`ordinary lit window ratio ${ordinaryLitRatio}: preserve occupied suites and dark floors`);assert(darkFloorSamples>10000);assert(farFieldError<1e-12,'fully unresolved coverage must conserve hierarchical occupancy');
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
const report={passed:true,scope:'CPU NullEngine shader preprocessing and family invariants; GPU compilation, current-world appearance and FPS require browser integration',checks:['existing albedo and emissive samples replaced','one uv2 attribute','two shared samplers','Ping An and Bamboo named landmarks excluded','high residential tags preserved','stable deterministic family','industrial type separated','ordinary white-light windows remain the visible majority','closed floors remain dark under horizontal minification','fully unresolved occupancy conserves expected coverage','six forced-lit accent panes per 24x16 motif','two red, two blue and two green accents per motif','accent colors and energy average together when unresolved','discrete HDR, Bloom and prefilter kernel scales','NullEngine PBR preprocessing'],rareWindowRatio:ratio,rareWindowTarget:RARE_WINDOW_LIGHT_RATE,ordinaryLitRatio,darkFloorSamples,farFieldError,accentMotif:ACCENT_WINDOW_MOTIF,windowOpticalVariation:{hdr:WINDOW_HDR_SCALES,bloom:WINDOW_BLOOM_SCALES,kernel:WINDOW_KERNEL_SCALES},materialCount:scene.materials.length,shaderReady:effect?.isReady()??null};
await fs.writeFile('artifacts/materials/facade-diversity/cpu-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));scene.dispose();engine.dispose();
