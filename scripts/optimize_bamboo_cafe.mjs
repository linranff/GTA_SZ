/** Compress only this original cafe; retain named adult animation roots. */
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=new URL('../public/city/bamboo-cafe/',import.meta.url);
const path=new URL('manifest.json',base),manifest=JSON.parse(await fs.readFile(path,'utf8'));
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const model of manifest.models){
 const file=new URL(model.file,base),before=await fs.readFile(file),hash=createHash('sha256').update(before).digest('hex');
 if(model.compression&&model.sha256===hash)continue;
 const doc=await io.read(fileURLToPath(file));
 await doc.transform(weld(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:16,quantizationVolume:'mesh'}));
 await io.write(fileURLToPath(file),doc);
 const after=await fs.readFile(file);
 model.bytes=after.length;model.sha256=createHash('sha256').update(after).digest('hex');
 model.compression={algorithm:'EXT_meshopt_compression',beforeBytes:before.length,positionBits:16,normalBits:12};
 model.meshes=doc.getRoot().listMeshes().length;
 console.log(JSON.stringify({cafe:model.id,before:before.length,after:after.length,triangles:model.triangles}));
}
await fs.writeFile(path,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(new URL('../artifacts/city/bamboo-cafe/build-report.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
