#!/usr/bin/env node
// CPU-only post-process. Changes COLOR_0; never rebuilds or reorders geometry.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Document, NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';

const PALETTES = {
  office: [[.68,.83,.92],[.72,.86,.84],[.88,.90,.92],[.90,.85,.78],[.76,.84,.90],[.82,.88,.84]],
  residential: [[.94,.92,.87],[.90,.84,.72],[.90,.77,.68],[.76,.84,.76],[.82,.84,.84],[.95,.89,.80]],
  stone: [[.94,.89,.78],[.79,.82,.84],[.86,.79,.67],[.89,.86,.81]],
};
const DEFAULTS = {cellSize:64, maxUnmatchedFraction:.01, maxGroupSize:64, neighborGap:12};
const sha = data => createHash('sha256').update(data).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));
const finite = v => typeof v === 'number' && Number.isFinite(v);
function hashText(text) {let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function accessorDigest(a) {
  return a ? {type:a.getType(), componentType:a.getComponentType(), normalized:a.getNormalized(),
    count:a.getCount(), sha256:sha(bytes(a.getArray()))} : null;
}
function geometrySnapshot(doc) {
  const meshes=doc.getRoot().listMeshes();
  const parts=meshes.map(mesh=>({name:mesh.getName(), primitives:mesh.listPrimitives().map(p=>({
    mode:p.getMode(), material:p.getMaterial()?.getName()??null, indices:accessorDigest(p.getIndices()),
    attributes:Object.fromEntries(p.listSemantics().filter(s=>s!=='COLOR_0').sort().map(s=>[s,accessorDigest(p.getAttribute(s))])),
  }))}));
  const nodes=doc.getRoot().listNodes().map(n=>({name:n.getName(),mesh:meshes.indexOf(n.getMesh()),matrix:n.getMatrix()}));
  const positionsAndIndices=parts.map(m=>({name:m.name,primitives:m.primitives.map(p=>({mode:p.mode,
    indices:p.indices,POSITION:p.attributes.POSITION}))}));
  return {positionAndIndicesSha256:sha(JSON.stringify(positionsAndIndices)),
    otherAttributesAndStructureSha256:sha(JSON.stringify({parts,nodes})),meshCount:meshes.length};
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
function selectColors(index,parent,touched,options) {
  const groups=new Map();
  for(const i of touched){const root=find(parent,i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(i);}
  const selected=new Map();let maxGroupSize=0,maxGroupParts=0,mixedStyleGroups=0,adjacentColorConflicts=0;
  for(const [root,members] of [...groups].sort((a,b)=>a[0]-b[0])){
    members.sort((a,b)=>a-b);const buildingCount=new Set(members.map(i=>index.buildings[i].id)).size;
    maxGroupSize=Math.max(maxGroupSize,buildingCount);maxGroupParts=Math.max(maxGroupParts,members.length);
    if(buildingCount>options.maxGroupSize)throw Error(`焊接颜色组含 ${buildingCount} 栋，超过上限 ${options.maxGroupSize}，停止以免整片同色`);
    if(new Set(members.map(i=>index.buildings[i].style)).size>1)mixedStyleGroups++;
    const base=index.buildings[root],palette=PALETTES[base.style],neighbors=new Set();
    for(const id of members){const b=index.buildings[id],g=options.neighborGap;
      for(let ix=Math.floor((b.minX-g)/index.cellSize);ix<=Math.floor((b.maxX+g)/index.cellSize);ix++)
        for(let iz=Math.floor((b.minZ-g)/index.cellSize);iz<=Math.floor((b.maxZ+g)/index.cellSize);iz++)
          for(const other of index.grid.get(ix+','+iz)??[]){const r=find(parent,other);if(r===root||!selected.has(r))continue;
            const q=index.buildings[other],dx=Math.max(0,b.minX-q.maxX,q.minX-b.maxX),dz=Math.max(0,b.minZ-q.maxZ,q.minZ-b.maxZ);
            if(Math.hypot(dx,dz)<=g)neighbors.add(r);
          }
    }
    const start=hashText(base.id+'|'+base.seed)%palette.length;let choice=start,minConflicts=Infinity;
    for(let off=0;off<palette.length;off++){const candidate=(start+off)%palette.length;
      const conflicts=[...neighbors].filter(n=>selected.get(n).style===base.style&&selected.get(n).choice===candidate).length;
      if(conflicts<minConflicts){choice=candidate;minConflicts=conflicts;}if(conflicts===0)break;
    }
    adjacentColorConflicts+=minConflicts;
    selected.set(root,{style:base.style,choice,rgb:palette[choice].map(v=>Math.round(v*255)),members,buildingCount});
  }
  return {selected,maxGroupSize,maxGroupParts,mixedStyleGroups,adjacentColorConflicts};
}
export function paintDocument(doc,city,excluded=new Set(),settings={}) {
  const options={...DEFAULTS,...settings},index=prepareBuildings(city,excluded,options.cellSize);
  const parent=Int32Array.from(index.buildings.map((_,i)=>i)),touched=new Set(),jobs=[];
  const idRoots=new Map();
  for(let i=0;i<index.buildings.length;i++){const id=index.buildings[i].id;if(idRoots.has(id))join(parent,idRoots.get(id),i);else idRoots.set(id,i);}
  let totalVertices=0,unmatched=0,unmatchedTriangles=0,triangles=0,sharedVertexAssignments=0,candidateEvaluations=0;
  const before=geometrySnapshot(doc);
  for(const mesh of doc.getRoot().listMeshes()){
    const nodes=doc.getRoot().listNodes().filter(n=>n.getMesh()===mesh);
    if(nodes.length!==1)throw Error(`网格 ${mesh.getName()} 被 ${nodes.length} 个node引用；禁止为实例改复制几何`);
    const matrix=nodes[0].getWorldMatrix();
    for(const p of mesh.listPrimitives()){
      if(p.getMode()!==4)throw Error('仅支持TRIANGLES：'+mesh.getName());
      const pos=p.getAttribute('POSITION');if(!pos)throw Error('缺少POSITION');
      const count=pos.getCount(),world=new Float64Array(count*3),tmp=[];
      for(let i=0;i<count;i++){pos.getElement(i,tmp);const w=worldPoint(matrix,...tmp);
        // glTF Y-up and south-positive Z -> project east,north,height.
        world[i*3]=w[0];world[i*3+1]=-w[2];world[i*3+2]=w[1];
      }
      const owners=new Int32Array(count).fill(-1),indices=p.getIndices()?.getArray(),length=indices?.length??count;
      if(length%3)throw Error('三角形索引数量不是3的倍数');
      const role=p.getMaterial()?.getName()??'',cache=new Map();
      for(let at=0;at<length;at+=3){const a=indices?indices[at]:at,b=indices?indices[at+1]:at+1,c=indices?indices[at+2]:at+2;
        if(a>=count||b>=count||c>=count)throw Error('索引越界');
        const ax=world[a*3],az=world[a*3+1],ay=world[a*3+2],bx=world[b*3],bz=world[b*3+1],by=world[b*3+2],cx=world[c*3],cz=world[c*3+1],cy=world[c*3+2];
        const x=(ax+bx+cx)/3,z=(az+bz+cz)/3,y=(ay+by+cy)/3;
        const nx=(bz-az)*(cy-ay)-(by-ay)*(cz-az),nz=(by-ay)*(cx-ax)-(bx-ax)*(cy-ay),ny=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
        const horizontal=Math.hypot(nx,nz),vertical=horizontal>Math.abs(ny)*3&&horizontal>1e-12;
        const key=Math.round(x*50)+','+Math.round(z*50);let candidates=cache.get(key);
        if(!candidates){candidates=planarCandidates(x,z,index);if(cache.size>=50000)cache.clear();cache.set(key,candidates);}
        candidateEvaluations+=candidates.length;
        const owner=chooseOwner(candidates,y,Math.max(ay,by,cy),vertical?nx/horizontal:0,vertical?nz/horizontal:0,vertical,role,index);
        triangles++;if(owner<0){unmatchedTriangles++;continue;}touched.add(owner);
        for(const v of [a,b,c]){if(owners[v]<0)owners[v]=owner;else if(owners[v]!==owner){join(parent,owners[v],owner);sharedVertexAssignments++;}}
      }
      // Unreferenced vertices may exist in a valid file; map them without
      // changing their presence, or keep their original color and report them.
      for(let i=0;i<count;i++)if(owners[i]<0){const x=world[i*3],z=world[i*3+1],y=world[i*3+2];
        const owner=chooseOwner(planarCandidates(x,z,index),y,y,0,0,false,role,index);
        if(owner>=0){owners[i]=owner;touched.add(owner);}else unmatched++;
      }
      totalVertices+=count;jobs.push({p,owners,count,meshName:mesh.getName()});
    }
  }
  if(!totalVertices)throw Error('没有可着色顶点');
  if(unmatched/totalVertices>options.maxUnmatchedFraction)throw Error(`未匹配顶点 ${unmatched}/${totalVertices} 超过允许比例 ${options.maxUnmatchedFraction}`);
  const colors=selectColors(index,parent,touched,options),oldColors=new Set(),unique=new Set();
  for(const {p,owners,count,meshName} of jobs){const old=p.getAttribute('COLOR_0'),data=new Uint8Array(count*4),tmp=[];
    if(old)oldColors.add(old);
    for(let i=0;i<count;i++){if(old)old.getElement(i,tmp);else tmp.splice(0,tmp.length,1,1,1,1);
      const rgb=owners[i]>=0?colors.selected.get(find(parent,owners[i])).rgb:tmp.slice(0,3).map(v=>Math.round(clamp(v,0,1)*255));
      data.set(rgb,i*4);data[i*4+3]=Math.round(clamp(tmp[3]??1,0,1)*255);if(owners[i]>=0)unique.add(rgb.join(','));
    }
    const attr=doc.createAccessor(meshName+'-building-color').setType('VEC4').setArray(data).setNormalized(true).setBuffer(p.getAttribute('POSITION').getBuffer());
    p.setAttribute('COLOR_0',attr);
  }
  for(const old of oldColors)if(old.listParents().every(p=>p.propertyType==='Root'))old.dispose();
  const after=geometrySnapshot(doc);assert.deepEqual(after,before,'着色阶段改变了geometry/其他attributes/indices');
  const assignments=[...colors.selected.values()].flatMap(g=>{
    const parts=new Map();for(const i of g.members){const b=index.buildings[i];
      if(!parts.has(b.id))parts.set(b.id,{id:b.id,style:b.style,group:index.buildings[find(parent,i)].id,rgb8:g.rgb,footprintParts:0});
      parts.get(b.id).footprintParts++;
    }return [...parts.values()];
  });
  return {totalVertices,paintedVertices:totalVertices-unmatched,unmatched,unmatchedTriangles,triangles,
    paintedBuildings:assignments.length,paintedFootprintParts:touched.size,uniqueColors:unique.size,sharedVertexAssignments,
    weldedColorGroups:[...colors.selected.values()].filter(g=>g.buildingCount>1).length,
    maxWeldedGroupSize:colors.maxGroupSize,maxColorGroupFootprintParts:colors.maxGroupParts,mixedStyleWeldedGroups:colors.mixedStyleGroups,
    adjacentPaletteConflicts:colors.adjacentColorConflicts,candidateEvaluations,sourceBuildings:idRoots.size,sourceFootprintParts:index.buildings.length,
    spatialHashCells:index.grid.size,cellSizeGameMeters:options.cellSize,assignments,before,after};
}
async function makeIO() {await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);return new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});}
export async function runPipeline(args) {
  const input=path.resolve(args.input),output=path.resolve(args.output),cityPath=path.resolve(args.city??'public/city/city.json');
  if(input===output)throw Error('input/output不能相同；输出到单独待审查资产');
  if(!output.endsWith('.glb'))throw Error('output须为.glb');
  const reportPath=path.resolve(args.report??output.replace(/\.glb$/,'.report.json'));
  if(reportPath===output||reportPath===input||reportPath===cityPath)throw Error('report不能覆盖input/output/city');
  for(const target of [output,reportPath])if(!args.overwrite&&!args.dryRun){try{await fs.access(target);throw Error('目标已存在；明确--overwrite后重做：'+target);}catch(e){if(e.code!=='ENOENT')throw e;}}
  const [inputBytes,cityBytes,inputStat]=await Promise.all([fs.readFile(input),fs.readFile(cityPath),fs.stat(input)]);
  let exclusions=new Set(),exclusionsSha256=null;
  const exclusionPath=args.exclusions===null?null:path.resolve(args.exclusions??'public/city/building-exclusions.json');
  if(exclusionPath===reportPath||exclusionPath===output)throw Error('输出不能覆盖exclusions');
  if(exclusionPath){try{const b=await fs.readFile(exclusionPath);exclusions=new Set(JSON.parse(b).excludedIds??[]);exclusionsSha256=sha(b);}catch(e){if(e.code!=='ENOENT'||args.exclusions)throw e;}}
  const io=await makeIO(),doc=await io.readBinary(new Uint8Array(inputBytes));
  const result=paintDocument(doc,JSON.parse(cityBytes),exclusions,args);
  const report={schemaVersion:1,input,output,city:cityPath,inputSha256:sha(inputBytes),citySha256:sha(cityBytes),exclusionsSha256,
    paletteSpace:'linear RGB multiplicative tint; source textures/light remain separate',
    policy:'triangle footprint mapping; welded shared vertices join building color groups; no splitting or new materials',...result};
  if(args.dryRun)return {...report,dryRun:true};
  const current=await fs.stat(input);if(current.size!==inputStat.size||current.mtimeMs!==inputStat.mtimeMs)throw Error('处理期间input变化，取消写出');
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(path.dirname(reportPath),{recursive:true});
  const temporary=path.join(path.dirname(output),'.'+path.basename(output)+'.'+process.pid+'.pending.glb');
  try{
    await io.write(temporary,doc);
    const decoded=await io.read(temporary),verification=geometrySnapshot(decoded);
    assert.deepEqual(verification,result.before,'写出再读取后的geometry/其他attributes/indices变化');
    const outputBytes=await fs.readFile(temporary);
    report.outputSha256=sha(outputBytes);report.outputBytes=outputBytes.length;report.verifiedGeometry=verification;
    report.checkedAt=new Date().toISOString();
    await fs.rename(temporary,output);await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
    return report;
  }finally{await fs.rm(temporary,{force:true});}
}

async function selfTest() {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'architecture-color-fixture-'));
  try{
    const io=await makeIO(),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene();
    const city={buildings:[]},boxes=[{id:'way/1',x:0,z:0,h:10,style:'office'},
      {id:'way/2',x:14,z:0,h:10,style:'office'},{id:'way/3',x:30,z:0,h:12,style:'residential'},
      {id:'way/4',x:0,z:10,h:10,style:'office'}];
    const tracks=[];
    for(const role of ['office','roof']){const positions=[],indices=[],ranges=[],shared=new Map();
      function vertex(x,y,z,id){const key=role==='roof'?[x,y,z].join(','):null;
        if(key&&shared.has(key))return shared.get(key);
        const i=positions.length/3;positions.push(x,y,-z);if(key)shared.set(key,i);return i;}
      for(const b of boxes){const ring=[[b.x,b.z],[b.x,b.z+10],[b.x+10,b.z+10],[b.x+10,b.z]],owned=new Set();
        if(role==='office'){
          for(let i=0;i<4;i++){const a=ring[i],c=ring[(i+1)%4],q=[vertex(a[0],0,a[1]),vertex(c[0],0,c[1]),vertex(c[0],b.h,c[1]),vertex(a[0],b.h,a[1])];indices.push(q[0],q[1],q[2],q[0],q[2],q[3]);q.forEach(v=>owned.add(v));}
          city.buildings.push({id:b.id,seed:b.id,height:b.h*1.5,style:b.style,rings:[[...ring,ring[0]].map(([x,z])=>[100+x*2,50+z*2])]});
        }else{const q=ring.map(([x,z])=>vertex(x,b.h,z));indices.push(q[0],q[2],q[1],q[0],q[3],q[2]);q.forEach(v=>owned.add(v));}
        ranges.push({id:b.id,owned:[...owned]});
      }
      const count=positions.length/3,p=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
        .setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(Float32Array.from({length:count*3},(_,i)=>i%3===1?1:0)).setBuffer(buffer))
        .setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(new Float32Array(count*2)).setBuffer(buffer))
        .setAttribute('COLOR_0',doc.createAccessor().setType('VEC4').setArray(new Uint8Array(count*4).fill(255)).setNormalized(true).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer)).setMaterial(doc.createMaterial(role));
      const mesh=doc.createMesh('block_fixture_'+role).addPrimitive(p);scene.addChild(doc.createNode(role).setMesh(mesh).setTranslation([100,0,-50]).setScale([2,1.5,2]));tracks.push({name:mesh.getName(),ranges});
    }
    const input=path.join(temp,'input.glb'),cityPath=path.join(temp,'city.json');await io.write(input,doc);await fs.writeFile(cityPath,JSON.stringify(city));
    const args={input,city:cityPath,exclusions:null,output:path.join(temp,'output.glb'),maxUnmatchedFraction:0};
    const first=await runPipeline(args),second=await runPipeline({...args,output:path.join(temp,'second.glb')});
    assert.equal(first.unmatched,0);assert.equal(first.uniqueColors>=3,true);assert.equal(first.weldedColorGroups,1);assert.equal(first.maxWeldedGroupSize,2);
    assert.deepEqual(first.assignments,second.assignments);assert.deepEqual(first.before,first.verifiedGeometry);
    const painted=await io.read(args.output),byID=new Map();
    for(const track of tracks){const p=painted.getRoot().listMeshes().find(m=>m.getName()===track.name).listPrimitives()[0],color=p.getAttribute('COLOR_0');
      for(const range of track.ranges)for(const i of range.owned){const value=[];color.getElement(i,value);const key=value.slice(0,3).join(',');
        if(byID.has(range.id))assert.equal(byID.get(range.id),key,'同栋各面颜色不一致');else byID.set(range.id,key);
      }
    }
    assert.equal(byID.get('way/1'),byID.get('way/4'));assert.notEqual(byID.get('way/1'),byID.get('way/2'));
    const multipartCity=JSON.parse(JSON.stringify(city)),part=multipartCity.buildings.find(b=>b.id==='way/3');
    part.id='way/2';part.seed='way/2';part.style='office';
    const multipart=paintDocument(await io.read(input),multipartCity,new Set(),{maxUnmatchedFraction:0});
    assert.equal(multipart.sourceBuildings,3);assert.equal(multipart.sourceFootprintParts,4);
    assert.equal(multipart.assignments.find(b=>b.id==='way/2').footprintParts,2);
    await assert.rejects(()=>runPipeline({...args,output:input}),/不能相同/);
    const distant=JSON.parse(JSON.stringify(city));for(const b of distant.buildings)for(const r of b.rings)for(const p of r){p[0]+=10000;p[1]+=10000;}
    const testDoc=await io.read(input);assert.throws(()=>paintDocument(testDoc,distant,new Set(),{maxUnmatchedFraction:0}),/未匹配/);
    return {passed:true,fixtureVertices:first.totalVertices,paintedVertices:first.paintedVertices,uniqueColors:first.uniqueColors,
      maxWeldedGroupSize:first.maxWeldedGroupSize,checks:['node变换/坐标轴','同栋跨primitive同色','相邻独立楼栋颜色不同','焊接共顶点整组同色且不拆几何',
      'POSITION/NORMAL/UV/indices/mesh名/变换写出后哈希不变','重复执行确定性','同ID多足印分片同色','input原地覆盖拒绝','未知位置超过阈值拒绝'],temporaryFilesRemoved:true};
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
function parseArgs(argv) {
  const result={};for(let i=0;i<argv.length;i++){const key=argv[i];
    if(['--self-test','--help','--dry-run','--overwrite'].includes(key)){result[key.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=true;continue;}
    const names={'--input':'input','--output':'output','--city':'city','--report':'report','--exclusions':'exclusions',
      '--cell-size':'cellSize','--max-unmatched-fraction':'maxUnmatchedFraction','--max-group-size':'maxGroupSize'};
    if(!names[key]||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('未知或缺值参数：'+key);
    const field=names[key],value=argv[++i];result[field]=['cellSize','maxUnmatchedFraction','maxGroupSize'].includes(field)?Number(value):value;
  }
  if(result.cellSize!==undefined&&(!finite(result.cellSize)||result.cellSize<8||result.cellSize>256))throw Error('cell-size须在8–256');
  if(result.maxUnmatchedFraction!==undefined&&(!finite(result.maxUnmatchedFraction)||result.maxUnmatchedFraction<0||result.maxUnmatchedFraction>1))throw Error('max-unmatched-fraction须在0–1');
  if(result.maxGroupSize!==undefined&&(!Number.isInteger(result.maxGroupSize)||result.maxGroupSize<1))throw Error('max-group-size须为正整数');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  try{const args=parseArgs(process.argv.slice(2));
    if(args.help)console.log('node scripts/colorize_architecture.mjs --input IN.glb --output OUT.glb [--city public/city/city.json] [--exclusions JSON] [--report JSON] [--cell-size 64] [--max-unmatched-fraction 0.01] [--max-group-size 64] [--dry-run] [--overwrite]\nnode scripts/colorize_architecture.mjs --self-test');
    else if(args.selfTest)console.log(JSON.stringify(await selfTest(),null,2));
    else{if(!args.input||!args.output)throw Error('必须提供--input和--output');const report=await runPipeline(args);const {assignments,...summary}=report;console.log(JSON.stringify(summary,null,2));}
  }catch(error){console.error(JSON.stringify({passed:false,error:String(error.message??error)}));process.exitCode=1;}
}
