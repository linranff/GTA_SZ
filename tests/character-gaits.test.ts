import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {NodeIO,type Animation as GltfAnimation} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';

for(const kind of ['rider','maid','jk'])test(`${kind}: exported knees bend forward, extend in support and match travel`,async()=>{
 await MeshoptDecoder.ready;
 const dir=new URL(kind==='rider'?'../public/city/rider/':'../public/city/bamboo-cafe/characters/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
 const model=kind==='rider'?manifest:manifest.models.find((m:{id:string})=>m.id===kind);
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.read(fileURLToPath(new URL(kind+'.glb',dir))),root=doc.getRoot();
 const nodes=root.listNodes(),rest=nodes.map(n=>({n,t:n.getTranslation(),r:n.getRotation(),s:n.getScale()}));
 const joint=(name:string)=>{const m=nodes.find(n=>n.getName()===name)!.getWorldMatrix();return [m[12],m[13],m[14]];};
 function pose(clip:GltfAnimation,time:number){
  for(const v of rest)v.n.setTranslation(v.t).setRotation(v.r).setScale(v.s);
  for(const channel of clip.listChannels()){
   const sampler=channel.getSampler()!,input=sampler.getInput()!,output=sampler.getOutput()!,n=channel.getTargetNode()!;
   let i=0;while(i+1<input.getCount()&&input.getScalar(i+1)<=time)i++;
   const j=Math.min(i+1,input.getCount()-1),ta=input.getScalar(i),tb=input.getScalar(j),f=tb>ta?Math.max(0,Math.min(1,(time-ta)/(tb-ta))):0;
   const a=output.getElement(i,[]),b=output.getElement(j,[]),path=channel.getTargetPath();
   if(path==='rotation'&&a.reduce((v,x,k)=>v+x*b[k],0)<0)for(let k=0;k<b.length;k++)b[k]*=-1;
   const value=a.map((x,k)=>x+(b[k]-x)*f);
   if(path==='rotation'){const length=Math.hypot(...value);n.setRotation(value.map(v=>v/length) as [number,number,number,number]);}
   else if(path==='translation')n.setTranslation(value as [number,number,number]);else if(path==='scale')n.setScale(value as [number,number,number]);
  }
 }
 for(const clipName of kind==='rider'?['Rider_Walk','Rider_Run']:['CafeWalk']){
  const clip=root.listAnimations().find(a=>a.getName()===clipName)!;assert.ok(clip);
  const meta=kind==='rider'?model.gait[clipName==='Rider_Run'?'run':'walk']:model.gait;
  const angles:number[]=[];const lower=kind==='rider'?'calf':'shin';
  for(let sample=0;sample<60;sample++){
   pose(clip,sample/60*meta.cycleSeconds);
   for(const side of ['L','R']){
    const h=joint('thigh_'+side),k=joint(lower+'_'+side),a=joint('foot_'+side);
    const u=k.map((v,i)=>v-h[i]),v=a.map((x,i)=>x-k[i]);
    angles.push(Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,x,i)=>sum+x*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI);
    const line=a.map((x,i)=>x-h[i]),projection=u.reduce((sum,x,i)=>sum+x*line[i],0)/line.reduce((sum,x)=>sum+x*x,0);
    assert.ok(k[2]-(h[2]+line[2]*projection)>-.002,clipName+' knee bent backward');
   }
  }
  assert.ok(Math.min(...angles)<27,clipName+' support leg remains crouched');
  assert.ok(Math.max(...angles)>(clipName==='Rider_Run'?85:45),clipName+' swing knee stays locked');
  const positions=[.14,.29].map(p=>{const time=p*meta.cycleSeconds;pose(clip,time);return joint('foot_L')[2]+meta.authoredSpeed*time;});
  assert.ok(Math.abs(positions[1]-positions[0])<.018,clipName+' planted ankle slides relative to authored travel');
  pose(clip,0);const first=joint('foot_L');pose(clip,meta.cycleSeconds);const end=joint('foot_L');
  assert.ok(Math.hypot(...first.map((x,i)=>x-end[i]))<.001,clipName+' loop has a foot jump');
 }
});
