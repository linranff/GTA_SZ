import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,meshopt,prune,dedup} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const report=[];await fs.mkdir('artifacts/city/uncompressed',{recursive:true});
for(const name of (process.argv.slice(2).length?process.argv.slice(2):['buildings','roads','terrain','landmarks'])){
 const path='public/city/'+name+'.glb';const before=(await fs.stat(path)).size;await fs.copyFile(path,'artifacts/city/uncompressed/'+name+'.glb');
 const doc=await io.read(path);await doc.transform(dedup(),weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:10,quantizeTexcoord:14,quantizationVolume:'mesh'}));await io.write(path,doc);const after=(await fs.stat(path)).size;report.push({name,before,after});console.log(name,Math.round(before/1e6)+'MB → '+(after/1e6).toFixed(2)+'MB');
}
await fs.copyFile('node_modules/meshoptimizer/meshopt_decoder.cjs','public/city/meshopt_decoder.js');await fs.copyFile('node_modules/meshoptimizer/LICENSE.md','public/licenses/meshoptimizer-MIT.md');await fs.writeFile('artifacts/city/compression.json',JSON.stringify(report,null,2));
