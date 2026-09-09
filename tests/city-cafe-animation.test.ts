import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {NullEngine,Scene,ImportMeshAsync,FreeCamera,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

test('cafe employees import real independent skeletons and a wave cannot animate the other maid',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.read(fileURLToPath(new URL('../public/city/bamboo-cafe/characters/maid.glb',import.meta.url)));
 // Decode the exact published GLB offline: NullEngine does not need a browser
 // script loader or texture/image decoders to validate its skin and clips.
 doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='EXT_meshopt_compression')?.dispose();
 const data=await io.writeBinary(doc),engine=new NullEngine(),scene=new Scene(engine);
 try{
  scene.useRightHandedSystem=true;new FreeCamera('test-camera',new Vector3(0,2,-5),scene);
  const options={pluginExtension:'.glb',pluginOptions:{gltf:{skipMaterials:true,animationStartMode:0}}};
  const first=await ImportMeshAsync(data,scene,options),second=await ImportMeshAsync(data,scene,options);
  assert.equal(first.skeletons.length,1);assert.equal(first.skeletons[0].bones.length,16);
  assert.notEqual(first.skeletons[0],second.skeletons[0]);
  assert.deepEqual(first.animationGroups.map(a=>a.name),['CafeIdle','CafeWalk','CafeWave']);
  const armA=first.skeletons[0].bones.find(b=>b.name==='forearm_R')!.getTransformNode()!;
  const armB=second.skeletons[0].bones.find(b=>b.name==='forearm_R')!.getTransformNode()!;
  const beforeA=armA.rotationQuaternion!.clone(),beforeB=armB.rotationQuaternion!.clone();
  const wave=first.animationGroups.find(a=>a.name==='CafeWave')!;
  wave.start(true);wave.goToFrame((wave.from+wave.to)/2);scene.render();
  assert.ok(!armA.rotationQuaternion!.equalsWithEpsilon(beforeA,.1),'wave really rotates the forearm joint');
  assert.ok(armB.rotationQuaternion!.equalsWithEpsilon(beforeB,1e-6),'other maid remains independent');
  const waveMesh=first.meshes.find(m=>m.getTotalVertices()>0)!;
  assert.equal(waveMesh.numBoneInfluencers,4);assert.equal(waveMesh.skeleton,first.skeletons[0]);
 }finally{scene.dispose();engine.dispose();}
});
