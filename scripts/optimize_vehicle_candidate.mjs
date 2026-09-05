import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld} from '@gltf-transform/functions';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const base='artifacts/city/vehicle-candidate';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(base+'/indigo-gt.glb');
// glTF source material variants are showroom-only. Disposing the extension
// before pruning drops hidden original paint/logo/interior textures.
for(const ext of doc.getRoot().listExtensionsUsed())if(ext.extensionName==='KHR_materials_variants')ext.dispose();
await doc.transform(dedup(),weld(),prune());
await io.write(base+'/indigo-gt.glb',doc);
const root=doc.getRoot();const stats={bytes:(await fs.stat(base+'/indigo-gt.glb')).size,primitives:root.listMeshes().reduce((s,m)=>s+m.listPrimitives().length,0),triangles:root.listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0),materials:root.listMaterials().map(m=>({name:m.getName(),color:m.getBaseColorFactor(),emissive:m.getEmissiveFactor()})),textures:root.listTextures().map(t=>({name:t.getName(),size:t.getSize(),mimeType:t.getMimeType()})),extensions:root.listExtensionsUsed().map(x=>x.extensionName)};
stats.sha256=crypto.createHash('sha256').update(await fs.readFile(base+'/indigo-gt.glb')).digest('hex');
const path=base+'/vehicle-manifest.json';const meta=JSON.parse(await fs.readFile(path,'utf8'));meta.delivery=stats;const c=meta.wheelCentresGltf;meta.wheelbaseMetres=((c.lr[2]+c.rr[2])-(c.lf[2]+c.rf[2]))/2;meta.frontTrackMetres=c.rf[0]-c.lf[0];meta.rearTrackMetres=c.rr[0]-c.lr[0];meta.recommendedHeadlightAnchorsGame=[[-.70,.79,2.36],[.70,.79,2.36]];await fs.writeFile(path,JSON.stringify(meta,null,2));console.log(JSON.stringify(stats,null,2));
if(stats.triangles>85000||stats.primitives>=28||stats.bytes>8*1024*1024)throw Error('Vehicle exceeds budget');
