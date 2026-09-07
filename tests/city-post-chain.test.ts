import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NullEngine,Scene,FreeCamera,Vector3,DefaultRenderingPipeline,PassPostProcess,Texture} from '@babylonjs/core';
import {syncPostChain,SSAO_SCENE_PASS,CINEMATIC_FINISH,AERIAL_FINISH,applyCinematicFinish,applyAntiAliasing,applyModeFinish} from '../src/city-cinematic.ts';

function optics(){
 const engine=new NullEngine({renderWidth:1920,renderHeight:1080,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:1});
 // NullEngine reports WebGL1 caps; the browser target is WebGL2 with 4× MSAA
 // and non-power-of-two render targets, which is what the contract is about.
 Object.assign(engine.getCaps(),{maxMSAASamples:4});(engine as unknown as {_webGLVersion:number})._webGLVersion=2;
 const scene=new Scene(engine),camera=new FreeCamera('driver',new Vector3(0,2,-10),scene);scene.activeCamera=camera;
 const pipeline=new DefaultRenderingPipeline('city-optics',true,scene,[camera]);
 pipeline.bloomEnabled=true;pipeline.bloomScale=.5;applyCinematicFinish(pipeline,scene.imageProcessingConfiguration);
 return {engine,scene,camera,pipeline,passes:()=>camera._postProcesses.filter((p):p is NonNullable<typeof p>=>!!p)};
}

// Babylon appends a pipeline's passes on every (re)attach, so after the optics
// pipeline rebuilds, a previously attached contact-shading pass ends up in
// front of it only by accident. The contract: the scene pass comes first and
// owns the MSAA target; every later pass is single-sampled.
test('contact shading owns the scene target and MSAA; optics follow it',()=>{
 const {scene,camera,pipeline,passes,engine}=optics();
 const ssaoScene=new PassPostProcess(SSAO_SCENE_PASS,1,null,Texture.BILINEAR_SAMPLINGMODE,engine,false);
 camera.attachPostProcess(ssaoScene);// appended after the optics passes, as after a rebuild
 assert.notEqual(passes()[0].name,SSAO_SCENE_PASS);
 assert.equal(ssaoScene.samples,1);
 const chain=syncPostChain(scene,pipeline,camera);
 assert.equal(chain[0].name,SSAO_SCENE_PASS);
 assert.equal(chain[0].samples,CINEMATIC_FINISH.msaa);
 assert.deepEqual(chain.slice(1).map(p=>p.samples),chain.slice(1).map(()=>1),'only the scene target is multisampled');
 assert.ok(chain.slice(1).some(p=>p.name==='bloomMerge')&&chain.slice(1).some(p=>p.name==='Grain'),'optics passes follow the scene pass');
 assert.ok(!chain.some(p=>p.name==='sharpen'),'sharpening is off in the shipped finish');
 // Idempotent: a second sync neither reorders nor reallocates.
 const again=syncPostChain(scene,pipeline,camera);
 assert.deepEqual(again.map(p=>p.name),chain.map(p=>p.name));
 engine.dispose();
});

// Without contact shading (aerial), the optics' own first pass is the scene
// target and keeps MSAA.
test('without contact shading the first optics pass keeps MSAA',()=>{
 const {scene,camera,pipeline,engine}=optics();
 const chain=syncPostChain(scene,pipeline,camera);
 assert.equal(chain[0].samples,CINEMATIC_FINISH.msaa);
 assert.equal(chain.filter(p=>p.samples>1).length,1);
 engine.dispose();
});

// The drone view trades multisampling for FXAA (shading shimmer, not geometry
// edges, is what aliases there) and the street takes MSAA back on return.
test('aerial anti-aliasing switches to FXAA and back',()=>{
 const {scene,camera,pipeline,engine}=optics();
 applyAntiAliasing(pipeline,true);let chain=syncPostChain(scene,pipeline,camera);
 assert.deepEqual([pipeline.samples,pipeline.fxaaEnabled],[AERIAL_FINISH.msaa,AERIAL_FINISH.fxaa]);
 assert.equal(chain.at(-1)?.name,'fxaa');assert.ok(chain.every(p=>p.samples===1));
 applyAntiAliasing(pipeline,false);chain=syncPostChain(scene,pipeline,camera);
 assert.deepEqual([pipeline.samples,pipeline.fxaaEnabled],[CINEMATIC_FINISH.msaa,CINEMATIC_FINISH.fxaa]);
 assert.equal(chain[0].samples,CINEMATIC_FINISH.msaa);assert.ok(!chain.some(p=>p.name==='fxaa'));
 engine.dispose();
});

test('daylight pass removal and restoration preserve the scene target and aerial AA',()=>{
 const {scene,camera,pipeline,engine}=optics();
 const ssaoScene=new PassPostProcess(SSAO_SCENE_PASS,1,null,Texture.BILINEAR_SAMPLINGMODE,engine,false);camera.attachPostProcess(ssaoScene);
 try{
  for(const aerial of [false,true,false]){
   applyAntiAliasing(pipeline,aerial);
   for(const mode of ['day','sunset','night','day'] as const){
    applyModeFinish(pipeline,scene.imageProcessingConfiguration,mode);
    const chain=syncPostChain(scene,pipeline,camera);
    assert.equal(chain[0].name,SSAO_SCENE_PASS,'pipeline rebuild must not move tone mapping before scene colour');
    assert.equal(chain[0].samples,aerial?AERIAL_FINISH.msaa:CINEMATIC_FINISH.msaa);
    assert.equal(pipeline.fxaaEnabled,aerial);
    assert.equal(chain.some(p=>p.name==='Grain'),mode!=='day');
    assert.equal(pipeline.chromaticAberrationEnabled,mode!=='day');
    assert(chain.slice(1).every(p=>p.samples===1));
    assert.equal(new Set(chain.map(p=>p.name)).size,chain.length,'mode cycling must not accumulate passes');
   }
  }
 }finally{engine.dispose();}
});

// A pass's size is the size of its input, i.e. the resolution the previous pass
// renders at. Babylon's bloom therefore blurs at half size and merges into a
// full-size frame; nothing in the chain may be pinned to a different ratio.
test('bloom blurs at half size and the merged frame stays full size',()=>{
 const {scene,camera,pipeline,passes,engine}=optics();
 syncPostChain(scene,pipeline,camera);
 const merge=passes().find(p=>p.name==='bloomMerge')!,next=passes()[passes().indexOf(merge)+1];
 merge.activate(camera);next.activate(camera);
 assert.deepEqual([merge.width,merge.height],[960,540],'blur output feeding the merge');
 assert.deepEqual([next.width,next.height],[1920,1080],'merge output feeding the next pass');
 engine.dispose();
});
