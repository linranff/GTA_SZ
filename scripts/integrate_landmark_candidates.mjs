// Merge reviewed single-object candidates (artifacts/landmark-candidates) into one
// incremental game asset: public/city/landmark-candidates.glb + .json.
// The Babylon runtime loads it after landmark-detail, hides the legacy base
// landmark meshes it replaces, and adds map/photo records for the new objects.
// This does not rebuild buildings.glb/facades.glb; OSM base blocks under
// spec-anchored objects stay in place (see manifest.limitations).
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,meshopt,prune,dedup,mergeDocuments} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CANDIDATES=path.join(ROOT,'artifacts/landmark-candidates');
const OUT_GLB=path.join(ROOT,'public/city/landmark-candidates.glb');
const OUT_JSON=path.join(ROOT,'public/city/landmark-candidates.json');
const ARTIFACT=path.join(ROOT,'artifacts/city/landmark-candidates-integration.json');
const CHECK_ONLY=process.argv.includes('--check');

const sha=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));

const top50=await readJson(path.join(ROOT,'data/landmarks/shenzhen-top50.json'));
const city=await readJson(path.join(ROOT,'public/city/city.json'));
const detail=await readJson(path.join(ROOT,'public/city/landmark-detail.json'));
const nav=await readJson(path.join(ROOT,'public/city/navigation.json'));
const scale=city.meta.horizontalScale;

// Objects already replaced by the source-grounded landmark-detail increment keep
// that model; candidates for them are not accepted here.
const detailIds=new Set(detail.landmarks.map(l=>l.id));
// Reviewed in game on 2026-09-16: the legacy landmarks.glb silhouette is preferred
// for these ids, so their candidates are not merged and the base meshes stay.
const KEEP_LEGACY=new Map([['bamboo','legacy landmarks.glb model preferred after in-game review']]);
const cityLandmarks=new Map(city.landmarks.map(l=>[l.id,l]));

// Legacy base landmark meshes are named landmark_<id>_<material> in landmarks.glb.
function glbMeshNames(buffer){
 const len=buffer.readUInt32LE(12);const gltf=JSON.parse(buffer.subarray(20,20+len).toString('utf8'));
 return (gltf.meshes??[]).map(m=>m.name??'');
}
const baseNames=glbMeshNames(await fs.readFile(path.join(ROOT,'public/city/landmarks.glb')));
const baseIds=new Set(baseNames.map(n=>n.match(/^landmark_([a-z0-9-]+)_/)?.[1]).filter(Boolean));

// Reachable arrival on the largest connected navigation component (same rule as
// build_landmark_details.py).
const parent=nav.nodes.map((_,i)=>i);
const find=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
const adjacency=nav.nodes.map(()=>[]);
for(const [a,b] of nav.edges){parent[find(a)]=find(b);adjacency[a].push(b);adjacency[b].push(a);}
const counts=new Map();for(let i=0;i<parent.length;i++){const r=find(i);counts.set(r,(counts.get(r)??0)+1);}
const main=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
const reachable=[];for(let i=0;i<parent.length;i++)if(find(i)===main&&adjacency[i].length)reachable.push(i);
function arrival(x,z,extent){
 // Nearest reachable node that is not under the candidate's own footprint, so
 // the car is not parked inside a podium that overlaps an unrebuilt base block.
 const inside=([nx,nz])=>extent&&nx>extent.minX-18&&nx<extent.maxX+18&&nz>extent.minZ-18&&nz<extent.maxZ+18;
 // Base OSM blocks near the anchor: a node hugging one puts the chase camera inside a wall
 // (seg street shot, 2026-09-16), so keep 10 m clear of their footprints as well.
 const blocks=[];
 for(const b of city.buildings){const r=b.rings[0];let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const [px,pz] of r){if(px<minX)minX=px;if(px>maxX)maxX=px;if(pz<minZ)minZ=pz;if(pz>maxZ)maxZ=pz;}
  if(maxX<x-400||minX>x+400||maxZ<z-400||minZ>z+400)continue;blocks.push({minX:minX-10,maxX:maxX+10,minZ:minZ-10,maxZ:maxZ+10});}
 const nearBlock=([nx,nz])=>blocks.some(b=>nx>b.minX&&nx<b.maxX&&nz>b.minZ&&nz<b.maxZ);
 let best=-1,bd=Infinity;
 for(const i of reachable){const n=nav.nodes[i];if(inside(n)||nearBlock(n))continue;const d=(n[0]-x)**2+(n[1]-z)**2;if(d<bd){bd=d;best=i;}}
 if(best<0)for(const i of reachable){const n=nav.nodes[i];if(inside(n))continue;const d=(n[0]-x)**2+(n[1]-z)**2;if(d<bd){bd=d;best=i;}}
 if(best<0)for(const i of reachable){const n=nav.nodes[i];const d=(n[0]-x)**2+(n[1]-z)**2;if(d<bd){bd=d;best=i;}}
 const a=nav.nodes[best];
 const j=adjacency[best].reduce((p,q)=>Math.hypot(nav.nodes[q][0]-x,nav.nodes[q][1]-z)<Math.hypot(nav.nodes[p][0]-x,nav.nodes[p][1]-z)?q:p);
 const q=nav.nodes[j];
 return {arrival:[a[0],a[1]],yaw:Math.atan2(q[0]-a[0],q[1]-a[1]),arrivalRoad:'周边连通道路'};
}

const GROUP_AREA={skyline:'深圳 · 天际线',axis:'福田 · 中轴',complex:'深圳 · 综合体',district:'深圳 · 片区',park:'深圳 · 公园',offmap:'地图外'};

async function latestRun(id){
 const dir=path.join(CANDIDATES,id+'-visual-v1');
 let runs;try{runs=(await fs.readdir(dir)).filter(n=>n.startsWith('run-')).sort();}catch{return {error:'no candidate directory'};}
 for(const run of runs.reverse()){
  const runDir=path.join(dir,run);
  try{
   const report=await readJson(path.join(runDir,'report.json'));
   if(!report.ok||report.objectId!==id)continue;
   const glb=path.join(runDir,path.basename(report.glb.path));
   const glbSha=await sha(glb);
   if(glbSha!==report.glb.sha256){continue;}
   return {runDir,report,glb,glbSha};
  }catch{continue;}
 }
 return {error:'no run with ok report and matching GLB'};
}

const selected=[],skipped=[];
for(const place of top50.places){
 const id=place.id;
 if(place.coverage!=='in_bbox'){skipped.push({id,reason:'outside game bbox'});continue;}
 if(detailIds.has(id)){skipped.push({id,reason:'already replaced by landmark-detail'});continue;}
 if(KEEP_LEGACY.has(id)){skipped.push({id,reason:KEEP_LEGACY.get(id)});continue;}
 const run=await latestRun(id);
 if(run.error){skipped.push({id,reason:run.error});continue;}
 const {report}=run;
 const modulePath=report.inputs.module.path,specPath=report.inputs.spec.path;
 const moduleFresh=report.inputs.module.sha256===await sha(modulePath).catch(()=>null);
 const specFresh=report.inputs.spec.sha256===await sha(specPath).catch(()=>null);
 const spec=await readJson(specPath).catch(()=>null);
 selected.push({id,place,run,moduleFresh,specFresh,spec});
}

const stale=selected.filter(s=>!s.moduleFresh||!s.specFresh);
console.log(`candidates: ${selected.length} selected, ${skipped.length} skipped, ${stale.length} stale (module/spec changed after last export)`);
for(const s of stale)console.log('  stale:',s.id,path.basename(s.run.runDir),s.moduleFresh?'':'module',s.specFresh?'':'spec');
if(CHECK_ONLY){console.log(JSON.stringify({selected:selected.map(s=>s.id),skipped},null,1));process.exit(stale.length?2:0);}

await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});

let target=null;const landmarks=[],sources=[];
for(const s of selected){
 const doc=await io.read(s.run.glb);
 // Height/extent from the delivered geometry, not from a copied manifest.
 let maxY=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
  const pos=prim.getAttribute('POSITION');if(!pos)continue;const mn=pos.getMin([]),mx=pos.getMax([]);
  maxY=Math.max(maxY,mx[1]);minX=Math.min(minX,mn[0]);maxX=Math.max(maxX,mx[0]);
  // glTF Y-up export: Blender north (+Y) becomes -Z.
  minZ=Math.min(minZ,-mx[2]);maxZ=Math.max(maxZ,-mn[2]);
 }
 const lm=s.run.report.landmark;const base=cityLandmarks.get(id(s));
 const kind=s.place.kind;const isPark=kind==='park';
 const footprintRadius=Math.max(maxX-minX,maxZ-minZ)/2;
 const isWide=isPark||kind==='district'||maxY<40||footprintRadius>maxY;
 const record={
  id:s.id,name:s.place.name,x:base?.x??lm.x,z:base?.z??lm.z,lon:base?.lon??lm.lon,lat:base?.lat??lm.lat,
  height:base&&isPark?base.height:maxY,
  area:base?.area??GROUP_AREA[s.place.group]??'深圳',
  excludeRadius:base?.excludeRadius??0,
  ...(base?{arrival:base.arrival,yaw:base.yaw,arrivalRoad:base.arrivalRoad}:arrival(lm.x,lm.z,{minX,maxX,minZ,maxZ})),
  // The GLB is the visual; runtime circle collision is not invented for it.
  detailCollision:true,
  // Frame the whole object: tall towers need roughly 1.8× their height of standoff.
  // Low or wide objects (parks, districts, stations) are viewed from higher up so the
  // drone camera does not end up inside neighbouring base towers.
  photoDistance:Math.max(120,Math.round(footprintRadius*(isWide?3.0:2.4)+maxY*1.8)),
  photoTargetHeight:Math.round(maxY*.45),
  photoElevation:isWide?.5:maxY>150?.16:.22,
  sourceStatus:s.run.report.buildReport?.source_spec?`candidate ${path.basename(s.run.runDir)}; spec ${path.basename(s.run.report.buildReport.source_spec)}`:`candidate ${path.basename(s.run.runDir)}`,
  candidateKind:kind,
 };
 landmarks.push(record);
 sources.push({id:s.id,runDir:path.relative(ROOT,s.run.runDir),glbSha256:s.run.glbSha,bytes:s.run.report.glb.bytes,
  triangles:s.run.report.glb.triangles,meshes:s.run.report.glb.meshes,moduleSha256:s.run.report.inputs.module.sha256,specSha256:s.run.report.inputs.spec.sha256,
  moduleFresh:s.moduleFresh,specFresh:s.specFresh,anchor:cityLandmarks.has(id)?'city.json landmark':(s.spec?.anchor?.basis==='osm-footprint-centroid'?'spec anchor (OSM footprint centroid from city.json)':'spec anchor (reported WGS84)'),
  extentGame:{minX,maxX,minZ,maxZ,maxY}});
 if(!target){target=doc;continue;}
 mergeDocuments(target,doc);
}
function id(s){return s.id;}

// Merge every imported scene into the first one so a single glTF scene loads.
const root=target.getRoot();const scenes=root.listScenes();
for(const scene of scenes.slice(1)){for(const child of scene.listChildren())scenes[0].addChild(child);scene.dispose();}
root.setDefaultScene(scenes[0]);
// One buffer for GLB output: point every accessor at the first buffer.
const buffers=root.listBuffers();
for(const accessor of root.listAccessors())accessor.setBuffer(buffers[0]);
for(const buffer of buffers.slice(1))buffer.dispose();
await target.transform(dedup(),weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:10,quantizeTexcoord:14,quantizationVolume:'mesh'}));
await io.write(OUT_GLB,target);
const outBuffer=await fs.readFile(OUT_GLB);
const meshNames=glbMeshNames(outBuffer);
const replacedMeshPrefixes=selected.map(s=>s.id).filter(i=>baseIds.has(i)).map(i=>`landmark_${i}_`);

const manifest={
 schemaVersion:1,asset:'/city/landmark-candidates.glb',
 assetStats:{bytes:outBuffer.length,sha256:createHash('sha256').update(outBuffer).digest('hex'),meshes:meshNames.length,
  triangles:sources.reduce((a,b)=>a+b.triangles,0)},
 replacedMeshPrefixes,
 landmarks,sources,skipped,
 generator:'scripts/integrate_landmark_candidates.mjs',
 coordinateSystem:{originWGS84:city.meta.originWGS84,horizontalScale:scale,verticalScale:city.meta.verticalScale},
 compression:'EXT_meshopt_compression',
 limitations:[
  '候选几何来自 scripts/landmarks/<id>.py 的体块建模，不是实测立面；spec-anchor 对象的位置是公开来源报告的 WGS84，不是配准质心。',
  'buildings.glb / facades.glb 未重建：spec-anchor 对象下方的 OSM 基础楼块仍在，可能与候选体块重叠。',
  '本增量不为候选对象新增运行时碰撞，只作为视觉与地图/照片目标。',
  '合并与 meshopt 压缩由本脚本完成；候选预览图不等于游戏内视觉验收。',
 ],
};
await fs.writeFile(OUT_JSON,JSON.stringify(manifest,null,1)+'\n');
await fs.mkdir(path.dirname(ARTIFACT),{recursive:true});
await fs.writeFile(ARTIFACT,JSON.stringify({generatedAt:new Date().toISOString(),...manifest},null,1)+'\n');
console.log(`wrote ${path.relative(ROOT,OUT_GLB)} ${(outBuffer.length/1e6).toFixed(2)}MB, ${meshNames.length} meshes, ${manifest.assetStats.triangles} triangles`);
console.log(`landmarks: ${landmarks.map(l=>l.id).join(', ')}`);
console.log(`replacedMeshPrefixes: ${replacedMeshPrefixes.join(', ')}`);
if(stale.length)console.log(`WARNING ${stale.length} candidates were exported from older module/spec; rerun landmark_candidate.py for: ${stale.map(s=>s.id).join(', ')}`);
