// Candidate-only facade metadata pass. Spatial ownership math copied from local colorize_architecture.mjs; independent of its mutable output.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
const PALETTES={office:true,residential:true,stone:true};const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),finite=Number.isFinite;
const sha=d=>createHash('sha256').update(d).digest('hex');function hashText(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function snapshot(doc){return sha(JSON.stringify({nodes:doc.getRoot().listNodes().map(n=>({name:n.getName(),matrix:n.getMatrix(),mesh:n.getMesh()?.getName()})),meshes:doc.getRoot().listMeshes().map(m=>({name:m.getName(),parts:m.listPrimitives().map(p=>({material:p.getMaterial()?.getName(),mode:p.getMode(),attributes:Object.fromEntries(p.listSemantics().filter(k=>k!=='TEXCOORD_1').map(k=>{const a=p.getAttribute(k),v=a.getArray();return[k,{type:a.getType(),normal:a.getNormalized(),hash:sha(Buffer.from(v.buffer,v.byteOffset,v.byteLength))}]})),indices:(()=>{const v=p.getIndices()?.getArray();return v?sha(Buffer.from(v.buffer,v.byteOffset,v.byteLength)):null})()}))}))}));}
export function familyFor(b,t={}){const tag=t.building??'unknown',seed=hashText(b.id+'|family'),pick=choices=>choices[seed%choices.length];
 if(['apartments','residential','house','dormitory','terrace','detached','semidetached_house'].includes(tag))return {family:b.height<25?pick([2,5,7]):pick([2,3,3,7]),basis:'osm-building-tag'};
 if(['industrial','warehouse','manufacture','depot'].includes(tag))return {family:6,basis:'osm-building-tag'};
 if(['office','commercial'].includes(tag))return {family:pick([0,0,1,4]),basis:'osm-building-tag'};
 if(['retail','hotel','public','hospital','school','university','college','kindergarten','government','museum'].includes(tag))return {family:pick([1,4,4]),basis:'osm-building-tag'};
 // Unknown use is art direction only, never an inferred measured real facade.
 return {family:b.height>55?pick([0,1,2,3,4]):b.height<20?pick([4,5,6,7]):pick([2,3,4,7]),basis:'artistic-morphology-fallback'};
}
function worldPoint(matrix, x,y,z) {
  return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
    matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
    matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
}
function prepareBuildings(city, excluded, cellSize) {
  if(!Array.isArray(city.buildings)||!city.buildings.length)throw Error('city.json 缺少非空 buildings');
  const buildings=[], grid=new Map(), seen=new Map();
  for(const row of [...city.buildings].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en')||JSON.stringify(a.rings).localeCompare(JSON.stringify(b.rings),'en'))){
    if(excluded.has(row.id))continue;
    if(typeof row.id!=='string'||!row.id)throw Error('建筑ID缺失：'+row.id);
    const previous=seen.get(row.id);
    if(previous&&(previous.style!==row.style||previous.seed!==row.seed))throw Error('同ID分片的style/seed冲突：'+row.id);
    seen.set(row.id,row);
    const ring=row.rings?.[0];
    if(!Array.isArray(ring)||ring.length<4||!ring.every(p=>p.length>=2&&finite(p[0])&&finite(p[1]))||!finite(row.height)||row.height<=0)
      throw Error('建筑足印/高度无效：'+row.id);
    if(!PALETTES[row.style])throw Error('未知建筑样式：'+row.id+' '+row.style);
    const points=ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
    const xs=points.map(p=>p[0]), zs=points.map(p=>p[1]);
    const b={id:row.id,seed:row.seed??row.id,style:row.style,height:row.height,points,
      minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
    b.margin=Math.max(3,Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)*.025);
    b.top=b.height+Math.max(6,b.height*.12);
    b.edges=points.map((p,i)=>{const q=points[(i+1)%points.length],dx=q[0]-p[0],dz=q[1]-p[1],len2=dx*dx+dz*dz;
      return {x:p[0],z:p[1],dx,dz,len2,nx:len2?dz/Math.sqrt(len2):0,nz:len2?-dx/Math.sqrt(len2):0};});
    const index=buildings.length;buildings.push(b);
    for(let ix=Math.floor((b.minX-b.margin)/cellSize);ix<=Math.floor((b.maxX+b.margin)/cellSize);ix++)
      for(let iz=Math.floor((b.minZ-b.margin)/cellSize);iz<=Math.floor((b.maxZ+b.margin)/cellSize);iz++){
        const key=ix+','+iz;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(index);
      }
  }
  if(!buildings.length)throw Error('排除后没有可用建筑');
  return {buildings,grid,cellSize};
}
function planarCandidates(x,z,index) {
  const ids=index.grid.get(Math.floor(x/index.cellSize)+','+Math.floor(z/index.cellSize))??[];
  const result=[];
  for(const id of ids){const b=index.buildings[id];
    if(x<b.minX-b.margin||x>b.maxX+b.margin||z<b.minZ-b.margin||z>b.maxZ+b.margin)continue;
    let inside=false,dist2=Infinity,nx=0,nz=0;
    for(const edge of b.edges){const qx=edge.x+edge.dx,qz=edge.z+edge.dz;
      if((edge.z>z)!==(qz>z)&&x<(qx-edge.x)*(z-edge.z)/(qz-edge.z)+edge.x)inside=!inside;
      const t=edge.len2?clamp(((x-edge.x)*edge.dx+(z-edge.z)*edge.dz)/edge.len2,0,1):0;
      const d=(x-edge.x-t*edge.dx)**2+(z-edge.z-t*edge.dz)**2;
      if(d<dist2){dist2=d;nx=edge.nx;nz=edge.nz;}
    }
    const distance=Math.sqrt(dist2);
    if(inside||distance<=b.margin)result.push({id,inside,distance,nx,nz});
  }
  return result;
}
function chooseOwner(candidates,y,maxY,normalX,normalZ,vertical,role,index) {
  let winner=-1,best=Infinity;
  for(const c of candidates){const b=index.buildings[c.id];if(y<-.5||y>b.top)continue;
    // Interior roof points belong to their containing footprint. Wall normals
    // follow B.footprint's directed edges; this disambiguates shared boundaries.
    let score=c.inside?Math.min(c.distance,3)*.035:c.distance+.03;
    if(vertical)score+=Math.max(0,-normalX*c.nx-normalZ*c.nz)*4;
    if(vertical&&['office','residential','stone'].includes(role))score+=Math.min(200,Math.abs(maxY-b.height))*.012;
    if(!vertical&&y>b.height)score+=(y-b.height)*.02;
    if(score<best-1e-10||(Math.abs(score-best)<1e-10&&c.id<winner)){best=score;winner=c.id;}
  }
  return winner;
}
function find(parent,i) {let root=i;while(parent[root]!==root)root=parent[root];while(parent[i]!==i){const next=parent[i];parent[i]=root;i=next;}return root;}
function join(parent,a,b) {a=find(parent,a);b=find(parent,b);if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);}
export async function run(input='artifacts/materials/buildings-tinted.glb',output='artifacts/materials/facade-diversity/buildings-varied.glb'){
 if(path.resolve(input)===path.resolve(output)||path.resolve(output).includes('/public/'))throw Error('只允许独立artifacts候选输出');
 await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
 const source=await fs.readFile(input),city=JSON.parse(await fs.readFile('public/city/city.json','utf8')),raw=JSON.parse(await fs.readFile('data/processed/shenzhen_study/buildings.geojson','utf8'));
 const tags=new Map(raw.features.map(f=>[f.id,f.properties.tags]));const excluded=new Set(JSON.parse(await fs.readFile('public/city/building-exclusions.json','utf8')).excludedIds);
 const doc=await io.readBinary(source),before=snapshot(doc),index=prepareBuildings(city,excluded,64),parent=Int32Array.from(index.buildings.map((_,i)=>i)),ids=new Map(),jobs=[];
 for(let i=0;i<index.buildings.length;i++){const id=index.buildings[i].id;if(ids.has(id))join(parent,i,ids.get(id));else ids.set(id,i);}
 let total=0,unmatched=0,shared=0,triangles=0;
 for(const mesh of doc.getRoot().listMeshes()){
  const textured=mesh.listPrimitives().filter(p=>p.getAttribute('TEXCOORD_0'));if(!textured.length)continue;
  const nodes=doc.getRoot().listNodes().filter(n=>n.getMesh()===mesh);if(nodes.length!==1)throw Error('复用网格不支持：'+mesh.getName());const matrix=nodes[0].getWorldMatrix();
  for(const p of textured){if(p.getAttribute('TEXCOORD_1'))throw Error('已有UV2，禁止覆盖');const pos=p.getAttribute('POSITION'),count=pos.getCount(),world=new Float64Array(count*3),tmp=[],owners=new Int32Array(count).fill(-1),indices=p.getIndices().getArray(),role=p.getMaterial()?.getName()??'';
   for(let i=0;i<count;i++){pos.getElement(i,tmp);const w=worldPoint(matrix,...tmp);world.set([w[0],-w[2],w[1]],i*3);}
   for(let at=0;at<indices.length;at+=3){const [a,b,c]=[indices[at],indices[at+1],indices[at+2]],ax=world[a*3],az=world[a*3+1],ay=world[a*3+2],bx=world[b*3],bz=world[b*3+1],by=world[b*3+2],cx=world[c*3],cz=world[c*3+1],cy=world[c*3+2];
    const x=(ax+bx+cx)/3,z=(az+bz+cz)/3,y=(ay+by+cy)/3,nx=(bz-az)*(cy-ay)-(by-ay)*(cz-az),nz=(by-ay)*(cx-ax)-(bx-ax)*(cy-ay),length=Math.hypot(nx,nz);
    const owner=chooseOwner(planarCandidates(x,z,index),y,Math.max(ay,by,cy),length?nx/length:0,length?nz/length:0,true,role,index);triangles++;if(owner<0)continue;
    for(const v of[a,b,c]){if(owners[v]<0)owners[v]=owner;else if(owners[v]!==owner){join(parent,owners[v],owner);shared++;}}
   }
   for(let i=0;i<count;i++)if(owners[i]<0){const x=world[i*3],z=world[i*3+1],y=world[i*3+2];owners[i]=chooseOwner(planarCandidates(x,z,index),y,y,0,0,false,role,index);if(owners[i]<0)unmatched++;}
   // No interpolation of family IDs/seeds within a triangle, including the
   // small unmatched fringe left by clipped OSM footprints.
   for(let at=0;at<indices.length;at+=3){const tri=[indices[at],indices[at+1],indices[at+2]],known=tri.map(v=>owners[v]).find(v=>v>=0);if(known===undefined)continue;
    for(const v of tri){if(owners[v]<0){owners[v]=known;unmatched--;}else join(parent,owners[v],known);}
   }
   total+=count;jobs.push({p,owners,count,name:mesh.getName()});
  }
 }
 if(unmatched/total>.005)throw Error('未映射顶点过多：'+unmatched+'/'+total);
 const metadata=new Map(),counts={},basis={},members=new Map();
 for(let i=0;i<index.buildings.length;i++){const root=find(parent,i);if(!members.has(root))members.set(root,new Set());members.get(root).add(index.buildings[i].id);}
 for(const [root,group] of members){if(group.size>64)throw Error('同索引建筑组过大');const b=index.buildings[root],f=familyFor(b,tags.get(b.id));metadata.set(root,{...f,seed:hashText(b.id+'|facade-phase')%65521,id:b.id});}
 const used=new Set();for(const {p,owners,count,name} of jobs){const uv2=new Float32Array(count*2);for(let i=0;i<count;i++){
  const root=owners[i]>=0?find(parent,owners[i]):-1,meta=root>=0?metadata.get(root):{family:4,seed:177};uv2[i*2]=meta.family+.25;uv2[i*2+1]=meta.seed;used.add(root);
 }const ix=p.getIndices().getArray();for(let at=0;at<ix.length;at+=3)for(const v of [ix[at+1],ix[at+2]])assert(uv2[v*2]===uv2[ix[at]*2]&&uv2[v*2+1]===uv2[ix[at]*2+1],'triangle元数据不得插值');p.setAttribute('TEXCOORD_1',doc.createAccessor(name+'-facade-grammar').setType('VEC2').setArray(uv2).setBuffer(p.getAttribute('POSITION').getBuffer()));}
 assert.equal(snapshot(doc),before,'元数据阶段破坏原几何/UV/顶点色');await fs.mkdir(path.dirname(output),{recursive:true});await io.write(output,doc);const verified=await io.read(output);assert.equal(snapshot(verified),before,'GLB roundtrip破坏原几何/UV/顶点色');
 const assignments=[...used].filter(r=>r>=0).map(r=>{const m=metadata.get(r);counts[m.family]=(counts[m.family]??0)+members.get(r).size;basis[m.basis]=(basis[m.basis]??0)+members.get(r).size;return {...m,ids:[...members.get(r)]};});
 const report={schemaVersion:1,input,output,inputSha256:sha(source),outputSha256:sha(await fs.readFile(output)),outputBytes:(await fs.stat(output)).size,beforeSha256:before,afterSha256:snapshot(verified),preserved:['POSITION','NORMAL','TEXCOORD_0','COLOR_0','indices','mesh names','node transforms','materials'],newAttribute:'TEXCOORD_1',additionalVertexBytes:total*8,totalTexturedVertices:total,unmatchedVertices:unmatched,triangles,sharedVertexAssignments:shared,weldedGroups:[...used].filter(r=>members.get(r)?.size>1).length,familyCounts:counts,classificationBasis:basis,assignments};
 await fs.writeFile(output.replace('.glb','.report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,assignments:undefined}));return report;
}
if(process.argv[1]?.endsWith('/prepare_facade_diversity.mjs'))await run(process.argv[2],process.argv[3]);
