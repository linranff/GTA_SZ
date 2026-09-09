/** Compress only the two cleaned user-provided cafe figures. */
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../public/city/bamboo-cafe/characters/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const model of manifest.models){
 const path=fileURLToPath(new URL(model.file,root)),before=await fs.readFile(path);
 if(model.compression&&createHash('sha256').update(before).digest('hex')===model.sha256)continue;
 const doc=await io.read(path);
 await doc.transform(weld(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:16,quantizationVolume:'mesh'}));
 await io.write(path,doc);const after=await fs.readFile(path);
 model.bytes=after.length;model.sha256=createHash('sha256').update(after).digest('hex');
 model.compression={algorithm:'EXT_meshopt_compression',beforeBytes:before.length,positionBits:16,normalBits:12,uvBits:16};
 console.log(JSON.stringify({id:model.id,triangles:model.triangles,bytes:model.bytes}));
}
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
