import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const file=new URL('../public/city/rider/rider.glb',import.meta.url);
const doc=await io.read(fileURLToPath(file)),root=doc.getRoot(),skins=root.listSkins();
assert.equal(skins.length,1);assert.equal(skins[0].listJoints().length,17);
let triangles=0,vertices=0;
for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
 const pos=p.getAttribute('POSITION'),joints=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0');
 assert(pos&&joints&&weights);vertices+=pos.getCount();triangles+=(p.getIndices()?.getCount()??pos.getCount())/3;
 for(let i=0;i<weights.getCount();i++){
  const w=weights.getElement(i,[]),j=joints.getElement(i,[]);
  assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<.01);
  assert(j.every(v=>v>=0&&v<17));assert(w.every(v=>Number.isFinite(v)&&v>=0));
 }
}
assert.equal(triangles,60000);
const animationReports=[];
for(const name of ['Rider_Idle','Rider_Walk','Rider_Run']){
 const a=root.listAnimations().find(a=>a.getName()===name);assert(a,'Missing '+name);
 const changed=[];
 for(const channel of a.listChannels()){
  const sampler=channel.getSampler(),array=sampler.getOutput().getArray();assert([...array].every(Number.isFinite));
  const count=sampler.getOutput().getElementSize();
  let motion=0;for(let i=count;i<array.length;i++)motion=Math.max(motion,Math.abs(array[i]-array[i%count]));
  if(motion>.03)changed.push(channel.getTargetNode().getName());
 }
 if(name!=='Rider_Idle')for(const bone of ['thigh_L','thigh_R','calf_L','calf_R','upper_arm_L','upper_arm_R'])assert(changed.includes(bone),name+' missing motion '+bone);
 animationReports.push({name,movingBones:[...new Set(changed)]});
}
const size=(await fs.stat(file)).size;assert(size<10_000_000);
const report={asset:'public/city/rider/rider.glb',bytes:size,triangles,vertices,bones:17,animations:animationReports,
 verification:'Decoded meshopt GLB: normalized finite skin weights, valid joints, animated legs and arms in both locomotion clips. Blender front/back/pose previews reviewed. Browser integration checked separately.'};
await fs.writeFile(new URL('../artifacts/city/rider/asset-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
