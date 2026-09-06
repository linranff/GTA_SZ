// Incremental repair: partition existing wall/glass faces instead of layering
// a scaled glass shell over a full-height wall. Keeps every building's UV2,
// tint, roof, index buffer, material and transform; no city rebuild required.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';

const input = process.argv[2] ?? 'public/city/buildings.glb';
const output = process.argv[3] ?? 'artifacts/city/shopfront-repair/buildings.glb';
assert.notEqual(path.resolve(input), path.resolve(output), 'Write a candidate before installing it.');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});
const bytes = await fs.readFile(input), doc = await io.readBinary(bytes);
const city = JSON.parse(await fs.readFile('public/city/city.json', 'utf8'));
const excluded = new Set(JSON.parse(await fs.readFile('public/city/building-exclusions.json', 'utf8')).excludedIds);
const hash = b => createHash('sha256').update(b).digest('hex');
const arrayHash = a => {const b = a.getArray(); return hash(Buffer.from(b.buffer, b.byteOffset, b.byteLength));};
const original = [], expanded = [];
for (const b of city.buildings) {
  if (excluded.has(b.id)) continue;
  const points = b.rings[0].slice(0, -1), cx = points.reduce((s,p) => s+p[0],0)/points.length, cz = points.reduce((s,p) => s+p[1],0)/points.length;
  for (const [x,z] of points) {
    const vertex = {id:b.id, x, z:-z, height:b.height, top:Math.min(3.5,b.height*.25), exact:null};
    original.push(vertex);
    expanded.push({x:cx+(x-cx)*1.006, z:-(cz+(z-cz)*1.006), vertex});
  }
}
function index(points, heightKey='height') {
  const cells = new Map(), key = (x,z) => `${Math.floor(x)},${Math.floor(z)}`;
  for (const p of points) {const k=key(p.x,p.z); if(!cells.has(k))cells.set(k,[]); cells.get(k).push(p);}
  return (x,z,height) => {
    let best=null, score=Infinity;
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const p of cells.get(key(x+i,z+j))??[]) {
      const distance=Math.hypot(x-p.x,z-p.z), source=p.vertex??p;
      if(distance>.08)continue;
      const s=distance+(height===undefined?0:Math.abs(source[heightKey]-height)*.5);
      if(s<score){best=p;score=s;}
    }
    return best;
  };
}
const findOriginal=index(original), findExpanded=index(expanded,'top');
const report={input,inputSha256:hash(bytes),output,wallVertices:0,glassVertices:0,matchedBuildings:new Set(),maxOriginalOverlapOffset:0,maxUpperFacadeFloatDrift:0,preserved:['indices','normals','COLOR_0','TEXCOORD_1','materials','node transforms','upper facade geometry within 0.05 mm float conversion tolerance']};
const jobs=[];
for(const node of doc.getRoot().listNodes()) {
  if(!/^block_/.test(node.getName())||!node.getMesh())continue;
  const matrix=node.getWorldMatrix();
  assert(matrix[1]===0&&matrix[2]===0&&matrix[4]===0&&matrix[6]===0&&matrix[8]===0&&matrix[9]===0,'Unexpected rotated building chunk');
  for(const p of node.getMesh().listPrimitives()) {
    const role=p.getMaterial()?.getName();
    if(!['office','residential','stone','darkglass'].includes(role))continue;
    const pos=p.getAttribute('POSITION'), values=new Float32Array(pos.getCount()*3), v=[];
    for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);values.set(v,i*3);}
    const world=i=>[matrix[0]*values[i*3]+matrix[12],matrix[5]*values[i*3+1]+matrix[13],matrix[10]*values[i*3+2]+matrix[14]];
    const uv=p.getAttribute('TEXCOORD_0'), uvs=uv?new Float32Array(uv.getCount()*2):null;
    if(uv)for(let i=0;i<uv.getCount();i++){uv.getElement(i,v);uvs[i*2]=v[0];uvs[i*2+1]=v[1];}
    const keep=Object.fromEntries(p.listSemantics().filter(k=>!['POSITION','TEXCOORD_0'].includes(k)).map(k=>[k,arrayHash(p.getAttribute(k))]));
    const job={p,role,pos,values,uvs,world,matrix,changed:0,keep,indexHash:arrayHash(p.getIndices())}; jobs.push(job);
    if(role==='darkglass')continue;
    const heights=new Float32Array(pos.getCount()), ix=p.getIndices().getArray();
    for(let i=0;i<ix.length;i+=3){const top=Math.max(...[ix[i],ix[i+1],ix[i+2]].map(j=>world(j)[1]));for(const j of [ix[i],ix[i+1],ix[i+2]])heights[j]=Math.max(heights[j],top);}
    for(let i=0;i<pos.getCount();i++) {
      const [x,y,z]=world(i); if(Math.abs(y)>.025)continue;
      const owner=findOriginal(x,z,heights[i]); assert(owner, `Unmatched base vertex ${node.getName()} ${[x,y,z]}`);
      assert(Math.abs(owner.height-heights[i])<.06,'Ambiguous building height');
      // Share the actual decoded wall corner, not a second independently quantized corner.
      owner.exact=[x,z]; values[i*3+1]=(owner.top-matrix[13])/matrix[5];
      // Blender's V is flipped during glTF export (v = 1 - height / 24).
      if(uvs)uvs[i*2+1]-=(owner.top-y)/24;
      job.changed++; report.wallVertices++; report.matchedBuildings.add(owner.id);
    }
  }
}
assert(report.wallVertices>0,'Source already repaired or no original wall bases found');
const findRepaired=index(original.filter(p=>p.exact));
for(const job of jobs.filter(j=>j.role==='darkglass')) {
  const {pos,values,world,matrix}=job;
  const tops=new Float32Array(pos.getCount()), ix=job.p.getIndices().getArray();
  for(let i=0;i<ix.length;i+=3){const top=Math.max(...[ix[i],ix[i+1],ix[i+2]].map(j=>world(j)[1]));for(const j of [ix[i],ix[i+1],ix[i+2]])tops[j]=Math.max(tops[j],top);}
  for(let i=0;i<pos.getCount();i++) {
    const [x,y,z]=world(i), owner=findExpanded(x,z,tops[i])?.vertex;
    assert(owner,`Unmatched glass vertex ${[x,y,z]}`);
    // All corners must belong to an ordinary wall; never invent missing owners.
    const actual=owner.exact??findRepaired(owner.x,owner.z,owner.height)?.exact;
    assert(actual,`No matching repaired wall for ${owner.id}`);
    report.maxOriginalOverlapOffset=Math.max(report.maxOriginalOverlapOffset,Math.hypot(x-actual[0],z-actual[1]));
    assert(Math.abs(y-.12)<.025||Math.abs(y-owner.top)<.025,`Unexpected glass level ${[x,y,z]} ${owner.id} top ${owner.top}`);
    values[i*3]=(actual[0]-matrix[12])/matrix[0];
    values[i*3+1]=((y<.2?0:owner.top)-matrix[13])/matrix[5];
    values[i*3+2]=(actual[1]-matrix[14])/matrix[10];
    job.changed++; report.glassVertices++;
  }
}
for(const job of jobs.filter(j=>j.changed)) {
  const {p,pos,values,uvs}=job;
  if(job.role!=='darkglass')for(let i=0;i<pos.getCount();i++){
    const v=[];pos.getElement(i,v);
    if(Math.abs(v[1]*job.matrix[5]+job.matrix[13])<=.025)continue;
    const drift=Math.hypot(...v.map((n,k)=>(n-values[i*3+k])*job.matrix[k*5]));
    report.maxUpperFacadeFloatDrift=Math.max(report.maxUpperFacadeFloatDrift,drift);
    assert(drift<.00005,'Upper facade changed beyond float conversion tolerance');
  }
  p.setAttribute('POSITION',doc.createAccessor('shopfront-repaired-position').setType('VEC3').setArray(values).setBuffer(pos.getBuffer()));
  if(uvs)p.setAttribute('TEXCOORD_0',doc.createAccessor('shopfront-repaired-uv').setType('VEC2').setArray(uvs).setBuffer(pos.getBuffer()));
  assert.equal(arrayHash(p.getIndices()),job.indexHash);
  for(const [key,h]of Object.entries(job.keep))assert.equal(arrayHash(p.getAttribute(key)),h);
}
// Dispose only old accessors that are no longer referenced by any primitive.
for(const accessor of doc.getRoot().listAccessors())if(accessor.listParents().length===1)accessor.dispose();
await fs.mkdir(path.dirname(output),{recursive:true}); await io.write(output,doc);
const verify=await io.read(output); const finalJobs=verify.getRoot().listNodes().filter(n=>/^block_/.test(n.getName())&&n.getMesh()).flatMap(n=>n.getMesh().listPrimitives()).filter(p=>['office','residential','stone','darkglass'].includes(p.getMaterial()?.getName()));
assert.equal(finalJobs.length,jobs.length);
for(let i=0;i<jobs.length;i++){const p=finalJobs[i],job=jobs[i];assert.equal(arrayHash(p.getIndices()),job.indexHash);for(const [key,h]of Object.entries(job.keep))assert.equal(arrayHash(p.getAttribute(key)),h);assert.equal(arrayHash(p.getAttribute('POSITION')),arrayHash(job.p.getAttribute('POSITION')));}
report.matchedBuildings=report.matchedBuildings.size; report.outputSha256=hash(await fs.readFile(output)); report.roundtrip='positions, indices, normals, colors and UV2 verified';
await fs.writeFile(output+'.report.json',JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
