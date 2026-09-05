/** Hash the actual delivery, including nested landscape assets and textures.
 * --check validates and reports without writing any manifests.
 */
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const p='public/city/',check=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Supported flag: --check');
const sha=b=>createHash('sha256').update(b).digest('hex');
const excluded=new Set(['asset-manifest.json','delivery-manifest.json','building-exclusions.json']);
async function list(dir,prefix=''){const result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+e.name;if(e.isDirectory())result.push(...await list(path.join(dir,e.name),rel+'/'));else if(e.isFile()&&!excluded.has(rel))result.push(rel);}return result.sort();}
function geometry(b,file){if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2)throw Error('Invalid GLB: '+file);const n=b.readUInt32LE(12);if(b.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing GLB JSON: '+file);const j=JSON.parse(b.subarray(20,20+n).toString('utf8'));let triangles=0,primitives=0,uv2=0;
 for(const m of j.meshes??[])for(const q of m.primitives){primitives++;if(q.attributes.TEXCOORD_1!==undefined)uv2++;const count=j.accessors[q.indices??q.attributes.POSITION].count,mode=q.mode??4;if(mode===4)triangles+=count/3;else if(mode===5||mode===6)triangles+=Math.max(0,count-2);}
 return {triangles,meshes:(j.meshes??[]).length,primitives,facadeMetadataPrimitives:uv2};}
const inventory={},allGeometry={},files=await list(p);for(const file of files){const b=await fs.readFile(p+file);inventory[file]={bytes:b.length,sha256:sha(b)};if(file.endsWith('.glb'))allGeometry[file]=geometry(b,file);}
const assets=Object.fromEntries(Object.entries(inventory).filter(([file])=>file.endsWith('.glb')&&!file.includes('/')));
const stream=JSON.parse(await fs.readFile(p+'facade-tiles.json','utf8'));if(stream.sourceSha256!==assets['facades.glb']?.sha256)throw Error('Facade tiles do not match current source GLB');
for(const tile of stream.tiles){const actual=inventory['facade-tiles/'+tile.id+'.glb'];if(!actual||actual.sha256!==tile.sha256||actual.bytes!==tile.bytes)throw Error('Facade tile hash/bytes mismatch: '+tile.id);}
let vehicle=null;if(inventory['vehicle-manifest.json']){
 vehicle=JSON.parse(await fs.readFile(p+'vehicle-manifest.json','utf8'));const actual=inventory['car.glb'],reported=vehicle.delivery;if(!actual||!reported)throw Error('Vehicle metadata exists without actual car.glb/delivery');
 if(actual.sha256!==reported.sha256||actual.bytes!==reported.bytes||allGeometry['car.glb'].triangles!==reported.triangles)throw Error('Vehicle delivery metadata disagrees with installed GLB');
}
if(allGeometry['buildings.glb']?.facadeMetadataPrimitives>0)for(const name of ['facade-atlas.png','facade-windows.png'])if(!inventory['textures/architecture/'+name])throw Error('UV2 ordinary buildings require facade atlas: '+name);
if(inventory['landscape/manifest.json']){const landscape=JSON.parse(await fs.readFile(p+'landscape/manifest.json','utf8'));for(const model of landscape.models){const file='landscape/'+model.file;if(!inventory[file]||allGeometry[file]?.triangles!==model.triangles)throw Error('Landscape manifest disagrees with GLB: '+file);}}
const detail=JSON.parse(await fs.readFile(p+'landmark-detail.json','utf8')),assetFiles=Object.keys(assets),totalGlbBytes=Object.values(assets).reduce((n,a)=>n+a.bytes,0);
const summaries={assetCount:assetFiles.length,totalGlbBytes,allRuntimeFiles:files.length,totalRuntimeFileBytes:Object.values(inventory).reduce((n,a)=>n+a.bytes,0),vehicle:vehicle?{file:'car.glb',...inventory['car.glb'],triangles:vehicle.delivery.triangles}:null,facadeFamilies:allGeometry['buildings.glb']?.facadeMetadataPrimitives>0,landscape:files.filter(f=>f.startsWith('landscape/')).length};
const writes={
 'building-exclusions.json':{excludedIds:detail.baseBuildingIds,assets:{'buildings.glb':assets['buildings.glb'],'facades.glb':assets['facades.glb']}},
 'delivery-manifest.json':{date:new Date().toISOString(),assets,totalGlbBytes,files:inventory,totalRuntimeFileBytes:summaries.totalRuntimeFileBytes,streamingFacades:{totalTiles:stream.tiles.length,totalBytes:stream.tiles.reduce((n,t)=>n+t.bytes,0),sourceAssetLoadedAtRuntime:false},notes:'Exact delivered hashes and bytes. files includes nested landscape, atlas, vehicle metadata and source city data; the three generated manifests are excluded to avoid circular hashes. Presence in this inventory does not imply runtime loading or visual/performance approval.'},
 'asset-manifest.json':{version:'0.3.0',assets:assetFiles.map(file=>({file,...allGeometry[file],...assets[file]})),nestedAssets:Object.keys(allGeometry).filter(f=>f.includes('/')&&!f.startsWith('facade-tiles/')).map(file=>({file,...allGeometry[file],...inventory[file]})),treeInstances:inventory['landscape/planting.json']?JSON.parse(await fs.readFile(p+'landscape/planting.json','utf8')).trees.length:JSON.parse(await fs.readFile(p+'trees.json','utf8')).length,chunkSize:640,totalBytes:totalGlbBytes,geometrySource:'Actual GLB JSON accessors; not stale authoring reports'},
};
if(!check)for(const [file,data] of Object.entries(writes))await fs.writeFile(p+file,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({mode:check?'read-only-validation':'manifests-updated',...summaries},null,2));
