import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,flatten,join,simplify} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const base='artifacts/driving-experience-candidate';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(base+'/sources/street-seating/modular_street_seating.gltf');
const keep=new Set(['crossbar','legs_double','legs_single','suspended_support_01','back_support_r','back_support_l','arm_rest_01','arm_rest_02','seat','seat_back']);
for(const node of doc.getRoot().listNodes())if(!keep.has(node.getName()))node.dispose();else{const p=node.getTranslation();node.setTranslation([p[0]+1.16,p[1],p[2]]);}
await MeshoptSimplifier.ready;
await doc.transform(prune(),dedup(),flatten(),join(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.48,error:.003}),prune());
for(const material of doc.getRoot().listMaterials())material.setName('cc0-street-'+material.getName()).setDoubleSided(false);
await fs.mkdir(base+'/street',{recursive:true});
const output=base+'/street/urban-bench.glb';await io.write(output,doc);
const root=doc.getRoot();const bytes=await fs.readFile(output);
const city=JSON.parse(await fs.readFile('public/city/city.json','utf8'));
const benches=JSON.parse(await fs.readFile(base+'/sources/osm-benches.json','utf8'));
const pointIn=(x,z,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const unique=new Set(),placements=[];
for(const bench of benches){
 if(unique.has(bench.id))continue;unique.add(bench.id);
 if(city.water.some(w=>pointIn(bench.x,bench.z,w.rings[0]))||city.buildings.some(b=>pointIn(bench.x,bench.z,b.rings[0])))continue;
 let nearest=null;
 for(const road of city.roads)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
  if(len<.01)continue;const t=Math.max(0,Math.min(1,((bench.x-a[0])*dx+(bench.z-a[1])*dz)/len));
  const distance=Math.hypot(bench.x-a[0]-t*dx,bench.z-a[1]-t*dz);
  if(!nearest||distance<nearest.distance)nearest={distance,width:road.width,yaw:Math.atan2(dx,dz),road:road.name};
 }
 if(!nearest||nearest.distance<nearest.width/2+1.5)continue;
 placements.push({...bench,yaw:nearest.yaw+Math.PI/2,orientation:'game adaptation: parallel to nearest road'});
}
const metadata={source:'https://polyhaven.com/a/modular_street_seating',author:'Stuart Attenborrow',license:'CC0-1.0',adaptation:'Assembled backed bench; unused kit parts removed; geometry simplified. Placements use OSM bench points; heading adapted to nearest road.',placementLicense:'ODbL-1.0',file:'urban-bench.glb',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),triangles:root.listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??0)/3,0),0),primitives:root.listMeshes().reduce((sum,m)=>sum+m.listPrimitives().length,0),textures:root.listTextures().map(t=>({name:t.getName(),size:t.getSize()})),placements};
await fs.writeFile(base+'/street/manifest.json',JSON.stringify(metadata,null,2));
console.log(JSON.stringify({...metadata,placements:placements.length}));
