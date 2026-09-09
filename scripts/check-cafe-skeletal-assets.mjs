/** Offline glTF skin/clip validation. Does not launch a browser or GPU process. */
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const dir=new URL('../public/city/bamboo-cafe/characters/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const row=i%4,col=Math.floor(i/4);return [0,1,2,3].reduce((sum,k)=>sum+a[k*4+row]*b[col*4+k],0);});
const transform=(m,p)=>[0,1,2].map(row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const reports=[];
for(const model of manifest.models){
 const file=new URL(model.file,dir),bytes=await readFile(file);
 assert.equal(bytes.byteLength,model.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
 const doc=await io.read(fileURLToPath(file)),root=doc.getRoot(),skin=root.listSkins()[0],joints=skin.listJoints();
 assert.equal(root.listSkins().length,1);assert.equal(joints.length,16);assert.equal(model.rigged,true);
 assert.deepEqual(root.listAnimations().map(a=>a.getName()).sort(),['CafeIdle','CafeWalk','CafeWave']);
 const mesh=root.listMeshes()[0],p=mesh.listPrimitives()[0],positions=p.getAttribute('POSITION'),weights=p.getAttribute('WEIGHTS_0'),indices=p.getAttribute('JOINTS_0');
 assert.ok(weights&&indices&&positions);assert.equal(p.getIndices().getCount()/3,model.triangles);
 assert.equal(weights.getCount(),positions.getCount());
 let maximumWeightError=0;
 for(let i=0;i<weights.getCount();i++){
  const w=weights.getElement(i,[]),j=indices.getElement(i,[]);maximumWeightError=Math.max(maximumWeightError,Math.abs(w.reduce((a,b)=>a+b,0)-1));
  assert.ok(w.every(v=>v>=0&&Number.isFinite(v)));assert.ok(j.every(n=>n>=0&&n<16));
 }
 assert.ok(maximumWeightError<.008);
 const rest=new Map(root.listNodes().map(n=>[n,[n.getTranslation(),n.getRotation(),n.getScale()]]));
 const reset=()=>{for(const [node,[t,r,s]]of rest)node.setTranslation(t).setRotation(r).setScale(s);};
 function vertices(){
  const matrices=joints.map((joint,i)=>multiply(joint.getWorldMatrix(),skin.getInverseBindMatrices().getElement(i,[])));
  return Array.from({length:positions.getCount()},(_,i)=>{
   const v=positions.getElement(i,[]),w=weights.getElement(i,[]),j=indices.getElement(i,[]),out=[0,0,0];
   for(let k=0;k<4;k++){const point=transform(matrices[j[k]],v);for(let a=0;a<3;a++)out[a]+=point[a]*w[k];}
   return out;
  });
 }
 function pose(name,fraction){
  reset();const animation=root.listAnimations().find(a=>a.getName()===name);
  for(const channel of animation.listChannels()){
   const sampler=channel.getSampler(),input=sampler.getInput(),output=sampler.getOutput();
   const index=Math.round((input.getCount()-1)*fraction),value=output.getElement(index,[]),node=channel.getTargetNode(),path=channel.getTargetPath();
   if(path==='translation')node.setTranslation(value);else if(path==='rotation')node.setRotation(value);else if(path==='scale')node.setScale(value);
  }
  return vertices();
 }
 reset();const bind=vertices(),wave=pose('CafeWave',1/6),walk=pose('CafeWalk',.25);
 let waveLowerBodyMax=0,waveHandMin=Infinity,walkFootMax=0,waveEdgeStretch=0,walkEdgeStretch=0,worstEdge=null;
 for(let i=0;i<bind.length;i++){
  const v=bind[i];if(v[1]<.66)waveLowerBodyMax=Math.max(waveLowerBodyMax,distance(v,wave[i]));
  if(v[0]>.35&&v[1]>.72&&v[1]<.80)waveHandMin=Math.min(waveHandMin,distance(v,wave[i]));
  if(v[1]<.13)walkFootMax=Math.max(walkFootMax,distance(v,walk[i]));
 }
 const tris=p.getIndices().getArray();
 for(let i=0;i<tris.length;i+=3)for(let k=0;k<3;k++){
  const a=tris[i+k],b=tris[i+(k+1)%3],length=distance(bind[a],bind[b]);if(length<.008)continue;
  const stretch=distance(wave[a],wave[b])/length;
  if(stretch>waveEdgeStretch){waveEdgeStretch=stretch;worstEdge={a:bind[a],b:bind[b],wa:wave[a],wb:wave[b]};}
  walkEdgeStretch=Math.max(walkEdgeStretch,distance(walk[a],walk[b])/length);
 }
 assert.ok(waveLowerBodyMax<.025,'wave must never drag skirt/legs into the arm');
 assert.ok(waveHandMin>.45,'complete waving hand must follow its wrist');
 assert.ok(walkFootMax>.08,'walk must actually move limbs, not slide a static figure');
 if(waveEdgeStretch>=4)console.error({model:model.id,waveEdgeStretch,worstEdge});
 assert.ok(waveEdgeStretch<4,'wave skin has a stretched/stranded surface');
 const report={id:model.id,triangles:model.triangles,bytes:model.bytes,bones:joints.length,clips:root.listAnimations().map(a=>a.getName()),maximumWeightError,waveLowerBodyMax,waveHandMin,walkFootMax,waveEdgeStretch,walkEdgeStretch};
 reports.push(report);console.log(JSON.stringify(report));
}
const out=new URL('../artifacts/city/bamboo-cafe/characters/animation-validation.json',import.meta.url);await mkdir(new URL('.',out),{recursive:true});await writeFile(out,JSON.stringify({passed:true,models:reports},null,2)+'\n');
