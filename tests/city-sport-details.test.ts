import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Mesh,NullEngine,PBRMaterial,Ray,Scene,TransformNode,Vector3,VertexData} from '@babylonjs/core';
import {createCitySportDetails,inspectCitySportMounts,type SportCarSource} from '../src/city-sport-details.ts';

async function readSource(){
 const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(fileURLToPath(new URL('../public/city/car.glb',import.meta.url))),sources:SportCarSource[]=[];
 for(const node of document.getRoot().listNodes()){
  if(!/^car_(?:paint|trim|redled|led)$/.test(node.getName()))continue;
  const matrix=node.getWorldMatrix();
  for(const primitive of node.getMesh()!.listPrimitives()){
   const accessor=primitive.getAttribute('POSITION')!,positions:number[]=[],point:number[]=[];
   for(let i=0;i<accessor.getCount();i++){
    const [x,y,z]=accessor.getElement(i,point);
    positions.push(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],-(matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]));
   }
   sources.push({name:node.getName(),positions,indices:primitive.getIndices()!.getArray()!});
  }
 }
 return sources;
}
const sourcePromise=readSource();

test('actual GT mounts verify front, rear, original body surface and four exhaust outlets within the original footprint',async()=>{
 const sources=await sourcePromise,mount=inspectCitySportMounts(sources);
 assert.equal(mount.frontSign,1);assert.equal(mount.rearSign,-1);assert(Math.abs(mount.bounds.max[2]-mount.bounds.min[2]-5)<.001);
 assert(mount.topAt(0,-2.23)<.94,'rear deck must stay below the lower sports profile');
 assert.equal(mount.supports.length,2);assert.equal(mount.exhaust.length,4);assert(mount.wing.width<mount.bounds.max[0]-mount.bounds.min[0]);
 for(const support of mount.supports){assert(support.z< -2);assert(support.y>.85&&support.y<1.05);assert.equal(support.y,mount.topAt(support.x,support.z));assert(mount.wing.height-support.y>.10&&mount.wing.height-support.y<.24);}
 for(const exhaust of mount.exhaust){assert(exhaust.z< -2.3);assert(exhaust.y-mount.exhaustOuterRadius>.2);assert(exhaust.y+mount.exhaustOuterRadius<.34);assert(Math.abs(exhaust.z)<Math.abs(mount.exhaustTipZ));}
 assert(mount.exhaustTipZ>mount.bounds.min[2]);
 for(const path of mount.headPaths){assert(path.length>=5);for(const p of path){assert(p.z>2.1);assert(p.y>.7&&p.y<.8);}}
});

test('sport details follow a moving transformed car, keep materials isolated, and stay within four meshes and the 7500-triangle budget including badges and rear valance',async()=>{
 const sources=await sourcePromise,engine=new NullEngine(),scene=new Scene(engine),car=new TransformNode('player-GT',scene),root=new TransformNode('gltf-root',scene);root.parent=car;root.scaling.z=-1;car.position.set(123,4,-67);car.rotation.y=.71;
 for(const source of sources){const mesh=new Mesh(source.name,scene),data=new VertexData();data.positions=source.positions.map((v,i)=>i%3===2?-v:v);data.indices=Array.from(source.indices);data.applyToMesh(mesh);mesh.parent=root;mesh.material=new PBRMaterial(source.name==='car_led'?'led':source.name,scene);}
 const head=scene.getMeshByName('car_led')!,original=head.material!,count=scene.meshes.length;
 const result=createCitySportDetails(scene,car);assert.equal(result.stats.applied,true,result.stats.skippedReason??'sport kit should apply');assert.equal(result.stats.meshCount,4);assert(result.stats.triangles<7500);assert.deepEqual(result.stats.badges.map(b=>[b.face,b.rings]),[['front',5],['rear',5]]);assert.equal(scene.meshes.length,count+4);assert.equal(scene.lights.length,0);assert.notEqual(head.material,original);
 assert.equal(result.stats.headlightDrlDiameter,.03);assert(result.stats.headlightProjectionLift>=.0249&&result.stats.headlightProjectionLift<.10,`light band must clear the actual paint without floating away from the lamp (${result.stats.headlightProjectionLift})`);
 for(const mesh of result.meshes){assert.equal(mesh.parent,car);assert.equal(mesh.isPickable,false);assert.equal(mesh.checkCollisions,false);const b=mesh.getBoundingInfo().boundingBox;assert(b.minimum.x>=-1.027&&b.maximum.x<=1.027);assert(b.minimum.z>=-2.515&&b.maximum.z<=2.501);assert(b.maximum.y<1.5);}
 const drl=scene.getMaterialByName('city-sport:daytime-running-light') as PBRMaterial;
 for(const mesh of result.meshes)mesh.computeWorldMatrix(true);
 const mount=inspectCitySportMounts(sources),sample=mount.headPaths[0][4],x=sample.x+Math.sign(sample.x)*.010,y=sample.y+.012,z=Math.max(sample.z+.025,mount.frontAt(x,y)+.022),world=car.computeWorldMatrix(true);
 const ray=new Ray(Vector3.TransformCoordinates(new Vector3(x,y,z+.5),world),Vector3.TransformNormal(new Vector3(0,0,-1),world).normalize(),1);
 const lightHit=ray.intersectsMesh(result.meshes.find(m=>m.name.endsWith('daytime-running-light'))!,false),housingHit=ray.intersectsMesh(result.meshes.find(m=>m.name.endsWith('lamp-and-exhaust-cavity'))!,false);
 assert(lightHit.hit,'the front ray reaches the luminous tube');assert(!housingHit.hit||lightHit.distance<housingHit.distance-.003,'dark housing must not enclose the luminous front surface');
 result.setMode('night');assert.equal(drl.emissiveColor.b,4.2);assert.equal((head.material as PBRMaterial).emissiveColor.b,2.8);assert.equal((head.material as PBRMaterial).emissiveIntensity,1);result.setMode('day');assert.equal(drl.emissiveColor.b,1.55);result.setMode('sunset');assert.equal(drl.emissiveColor.b,2.9);
 result.dispose();result.dispose();assert.equal(head.material,original);assert.equal(scene.meshes.length,count);assert(scene.materials.includes(original));scene.dispose();engine.dispose();
});

test('missing source surfaces do not leave floating guessed hardware or partial resources',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),car=new TransformNode('empty-car',scene),result=createCitySportDetails(scene,car);
 assert.equal(result.stats.applied,false);assert.match(result.stats.skippedReason!,/lenses/);assert.equal(result.meshes.length,0);assert.equal(scene.materials.length,0);result.dispose();scene.dispose();engine.dispose();
});
