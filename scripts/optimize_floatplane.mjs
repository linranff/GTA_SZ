// Optimize only the replaceable aircraft; never rebuild or rewrite city assets.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup, weld, prune, meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const path = 'public/city/floatplane.glb';
const manifestPath = 'public/city/floatplane-manifest.json';
const before = (await fs.stat(path)).size;
const doc = await io.read(path);
const prop = doc.getRoot().listNodes().find(node => node.getName() === 'floatplane_propeller');
if (!prop || Math.abs(prop.getTranslation()[2] + 4.09) > .0001) {
  throw new Error('Missing or displaced propeller pivot');
}
await doc.transform(dedup(), weld(), prune(), meshopt({encoder:MeshoptEncoder,
  level:'high', quantizePosition:16, quantizeNormal:10, quantizeTexcoord:12,
  quantizationVolume:'mesh',}));
await io.write(path, doc);
const bytes = await fs.readFile(path);
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
manifest.assetStats.bytes = bytes.length;
manifest.assetStats.sha256 = createHash('sha256').update(bytes).digest('hex');
manifest.compression = {before, after:bytes.length, algorithm:'EXT_meshopt_compression'};
manifest.sourceSha256['scripts/optimize_floatplane.mjs'] = createHash('sha256')
  .update(await fs.readFile('scripts/optimize_floatplane.mjs')).digest('hex');
manifest.validation.decodedPropellerTranslation = prop.getTranslation();
manifest.validation.decodedMaterials = doc.getRoot().listMaterials().length;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2)+'\n');
console.log(JSON.stringify({assetStats:manifest.assetStats, propeller:prop.getTranslation(),
  materials:manifest.validation.decodedMaterials}));
