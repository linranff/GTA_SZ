import {NodeIO,Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {copyToDocument,unpartition} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';import crypto from 'node:crypto';
await MeshoptDecoder.ready;await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const sourcePath='public/city/facades.glb',source=await io.read(sourcePath),groups=new Map();
for(const node of source.getRoot().listScenes()[0].listChildren()){
 const match=node.getName().match(/^facade_(-?\d+)_(-?\d+)_/);if(!match)throw Error('Unexpected facade node: '+node.getName());
 const key=match[1]+'_'+match[2];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);
}
const out='public/city/facade-tiles';await fs.mkdir(out,{recursive:true});const tiles=[];
for(const [id,nodes] of groups){
 const doc=new Document();for(const ext of source.getRoot().listExtensionsUsed())doc.createExtension(ext.constructor).setRequired(ext.isRequired());
 const map=copyToDocument(doc,source,nodes),scene=doc.createScene('facade-tile');for(const n of nodes)scene.addChild(map.get(n));await doc.transform(unpartition());
 const bytes=await io.writeBinary(doc),[x,z]=id.split('_').map(Number);await fs.writeFile(out+'/'+id+'.glb',bytes);
 tiles.push({id,x:(x+.5)*640,z:(z+.5)*640,bytes:bytes.length,meshes:nodes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
const sourceSha256=crypto.createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex');
await fs.writeFile('public/city/facade-tiles.json',JSON.stringify({version:1,tileSize:640,sourceSha256,tiles}));
console.log(JSON.stringify({tiles:tiles.length,bytes:tiles.reduce((s,t)=>s+t.bytes,0),largest:Math.max(...tiles.map(t=>t.bytes)),sourceSha256}));
