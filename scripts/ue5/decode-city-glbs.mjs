/** Decode meshopt city GLBs into Interchange-readable files. Does not rewrite public/city. */
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {dequantize, prune} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'artifacts/ue5-import');
const layoutPath = join(root, 'ue5/Shenchengji/Content/City/mesh-layout.json');

const GROUPS = [
  {id: 'landmarks', file: 'landmarks.glb', destination: '/Game/Imported/Landmarks'},
  {id: 'landmark-detail', file: 'landmark-detail.glb', destination: '/Game/Imported/LandmarkDetail'},
  {id: 'terrain', file: 'terrain.glb', destination: '/Game/Imported/Terrain'},
  {id: 'roads', file: 'roads.glb', destination: '/Game/Imported/Roads'},
  {id: 'buildings', file: 'buildings.glb', destination: '/Game/Imported/Buildings'},
  {id: 'facades', file: 'facades.glb', destination: '/Game/Imported/Facades'},
];

function ueName(name, used) {
  let base = String(name || 'mesh').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, 'm_$1');
  if (!base) base = 'mesh';
  let next = base;
  let index = 2;
  while (used.has(next.toLowerCase())) {
    next = `${base}_${index++}`;
  }
  used.set(next.toLowerCase(), true);
  return next;
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
mkdirSync(outDir, {recursive: true});

const layout = {version: 1, unit: 'game-meters-y-up', note: 'Decoded for UE Interchange. Source remains public/city.', groups: []};

for (const group of GROUPS) {
  const source = join(root, 'public/city', group.file);
  const doc = await io.read(source);
  await doc.transform(dequantize(), prune());
  for (const extension of doc.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME) {
      extension.dispose();
    }
  }
  const used = new Map();
  const meshes = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = ueName(node.getName() || mesh.getName(), used);
    node.setName(name);
    mesh.setName(name);
    const t = node.getWorldTranslation();
    const s = node.getScale();
    meshes.push({
      name,
      t: [Number(t[0].toFixed(4)), Number(t[1].toFixed(4)), Number(t[2].toFixed(4))],
      s: Number(((s[0] + s[1] + s[2]) / 3).toFixed(5)),
    });
  }
  const outFile = join(outDir, group.file);
  await io.write(outFile, doc);
  layout.groups.push({
    id: group.id,
    file: group.file,
    destination: group.destination,
    decoded: outFile,
    meshes,
  });
  console.log(JSON.stringify({id: group.id, meshes: meshes.length, out: outFile}));
}

writeFileSync(layoutPath, JSON.stringify(layout));
console.log(JSON.stringify({ok: true, groups: layout.groups.map(group => ({id: group.id, meshes: group.meshes.length}))}));
