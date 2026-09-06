import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
await MeshoptDecoder.ready;
const path='public/city/landmark-detail.glb',bytes=await fs.readFile(path);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(path),groups={},errors=[];
for(const node of doc.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;
 const key=node.getName().startsWith('detail_civic_')?'detail_civic':node.getName().replace(/_(?:landmarkglass|darkglass|silver|gold|roof|steel|park|pavement|asphalt|concrete|leaflight|leaf|office|residential|stone)$/,'');
 const group=groups[key]??={triangles:0,meshes:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 group.meshes++;const m=node.getWorldMatrix();
 for(const primitive of mesh.listPrimitives()){
  const p=primitive.getAttribute('POSITION'),count=p.getCount(),element=[];
  group.triangles+=(primitive.getIndices()?.getCount()??count)/3;
  for(let i=0;i<count;i++){
   const [x,y,z]=p.getElement(i,element);
   // GLB coordinates become east / up / -north; express report east/north/up.
   const v=[m[0]*x+m[4]*y+m[8]*z+m[12],-(m[2]*x+m[6]*y+m[10]*z+m[14]),m[1]*x+m[5]*y+m[9]*z+m[13]];
   for(let axis=0;axis<3;axis++){if(!Number.isFinite(v[axis]))errors.push('nonfinite '+key);group.min[axis]=Math.min(group.min[axis],v[axis]);group.max[axis]=Math.max(group.max[axis],v[axis]);}
  }
 }
}
const tc=groups.detail_tencent;if(!tc||Math.abs(tc.max[2]-148.8)>.15)errors.push('Tencent highest point does not match 248m × 0.6');
const hill=groups.detail_lianhua;if(!hill||hill.max[0]-hill.min[0]<900||hill.max[1]-hill.min[1]<600)errors.push('Lianhua footprint collapsed or missing');
for(const id of ['detail_qijie-gongguan','detail_fortune-plaza','detail_mixc-world'])if(!groups[id])errors.push('Missing '+id);
const civic=groups.detail_civic;if(!civic||Math.abs(civic.max[0]-civic.min[0]-291.6)>.8||civic.max[2]<48||civic.max[2]>51.2)errors.push('Civic canopy span or tower height mismatch');
const report={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
 triangles:Object.values(groups).reduce((sum,g)=>sum+g.triangles,0),groups,errors};
await fs.writeFile('artifacts/city/landmark-detail-geometry.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
