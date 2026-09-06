import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Matrix,Mesh,NullEngine,PBRMaterial,Quaternion,Scene,TransformNode,Vector3,VertexData} from '@babylonjs/core';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {buildCoastalHorizonGeometry,createCoastalHorizon,type CoastalHorizonGeometry} from '../src/city-coastal-horizon.ts';

function checkWinding(geometry:CoastalHorizonGeometry){
 const p=geometry.positions;
 for(let i=0;i<geometry.indices.length;i+=3){
  const ids=geometry.indices.slice(i,i+3),[a,b,c]=ids.map(index=>Vector3.FromArray(p,index*3));
  const face=Vector3.Cross(a.subtract(b),c.subtract(b));assert(face.length()>1e-6);
  for(const index of ids)assert(Vector3.Dot(face,Vector3.FromArray(geometry.normals,index*3))>0,'LH normals point out from skirt faces');
 }
}

test('shared indexed and split-vertex edges do not grow internal walls; only actual open boundary closes below water',()=>{
 const shared=[0,10,0,2,11,0,2,12,2,0,13,2],split=[0,10,0,2,11,0,2,12,2,0,10,0,2,12,2,0,13,2];
 for(const [positions,indices] of [[shared,[0,1,2,0,2,3]],[split,[0,1,2,3,4,5]],[split,[2,1,0,5,4,3]]]){
  const g=buildCoastalHorizonGeometry(positions,indices,Matrix.Identity());
  assert.equal(g.stats.boundaryEdges,4);assert.equal(g.stats.weldedVertices,4);assert.equal(g.stats.triangles,8);assert.equal(g.stats.nonManifoldEdges,0);checkWinding(g);
  for(let i=0;i<g.positions.length;i+=12){
   assert(g.positions[i+1]<-.25);assert(g.positions[i+4]<-.25);
   const x=(g.positions[i]+g.positions[i+3])*.5,z=(g.positions[i+2]+g.positions[i+5])*.5;
   assert((x-1)*g.normals[i]+(z-1)*g.normals[i+2]>0,'horizontal normal points away from terrain interior');
   assert(positions.some((_,j)=>j%3===0&&positions[j]===g.positions[i+6]&&positions[j+1]===g.positions[i+7]&&positions[j+2]===g.positions[i+8]),'top edge is exactly on original terrain');
  }
 }
});

test('parent reflection and quantized GLB scale are applied once; wrapper shares material without collisions or shadows',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('gltf-root',scene);root.scaling.z=-1;
 const source=new Mesh('opposite_shore_terrain',scene),material=new PBRMaterial('distant-shore',scene);source.parent=root;source.material=material;source.scaling.setAll(9485);source.position.set(-15,282.405510485,6660);source.applyFog=false;
 const data=new VertexData();data.positions=[-.3,.002,-.2,.3,.003,-.2,.3,.004,.2,-.3,.005,.2];data.indices=[0,1,2,0,2,3];data.applyToMesh(source);
 const world=source.computeWorldMatrix(true),expected=[];for(let i=0;i<data.positions.length;i+=3)expected.push(Vector3.TransformCoordinates(Vector3.FromArray(data.positions,i),world));
 const result=createCoastalHorizon(scene,source,-.25),mesh=result.mesh!;assert(mesh);assert.equal(result.stats?.triangles,8);assert.equal(mesh.material,material);assert.equal(mesh.parent,null);assert.equal(mesh.receiveShadows,false);assert.equal(mesh.checkCollisions,false);assert.equal(mesh.isPickable,false);assert.equal(mesh.applyFog,false);
 const positions=mesh.getVerticesData('position')!;
 for(let i=0;i<positions.length;i+=3)if(positions[i+1]>-.25)assert(expected.some(p=>Vector3.Distance(p,Vector3.FromArray(positions,i))<.001),'top stays on transformed source without a second root transform');
 assert(mesh.getBoundingInfo().boundingBox.minimumWorld.z<-4700);
 source.dispose(false,false);assert(mesh.isDisposed());assert(scene.materials.includes(material));scene.dispose();engine.dispose();
});

test('welding crosses quantization cell boundaries without moving the top edge',()=>{
 const p=[0,8,0,10,8,0,10,8,10,.0001,8,0,10.0001,8,10,0,8,10];
 const g=buildCoastalHorizonGeometry(p,[0,1,2,3,4,5],Matrix.Compose(new Vector3(1,1,-1),Quaternion.Identity(),new Vector3(-.00005,0,0)),-.25,.001);
 assert.equal(g.stats.boundaryEdges,4);assert.equal(g.stats.weldedVertices,4);assert.equal(g.stats.triangles,8);checkWinding(g);
});

test('actual meshopt shore closes its 1812 open edges after normalized positions and runtime root transform',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const document=await io.read(fileURLToPath(new URL('../public/city/opposite-shore.glb',import.meta.url)));
 const node=document.getRoot().listNodes().find(n=>n.getName()==='opposite_shore_terrain')!,primitive=node.getMesh()!.listPrimitives()[0],accessor=primitive.getAttribute('POSITION')!;
 const positions:number[]=[],element:number[]=[];for(let i=0;i<accessor.getCount();i++)positions.push(...accessor.getElement(i,element));
 const world=Matrix.FromArray(node.getWorldMatrix()).multiply(Matrix.Scaling(1,1,-1));
 const g=buildCoastalHorizonGeometry(positions,primitive.getIndices()!.getArray()!,world,-.25);
 assert.equal(g.stats.sourceTriangles,48868);assert.equal(g.stats.boundaryEdges,1812);assert.equal(g.stats.triangles,3624);assert.equal(g.stats.skippedTriangles,0);assert.equal(g.stats.nonManifoldEdges,0);assert.equal(g.stats.bottomHeight,-1.25);checkWinding(g);
});
