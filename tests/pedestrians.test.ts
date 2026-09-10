import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {Matrix,MeshBuilder,NullEngine,Scene,Vector3,type Mesh} from '@babylonjs/core';
import {CityPedestrians} from '../src/pedestrians.ts';
import type {ImpactCarPose} from '../src/pedestrian-impact.ts';

type Part='body'|'leftLeg'|'rightLeg'|'leftArm'|'rightArm';
type Bounds={min:number[];max:number[]};
type Walker=CityPedestrians['people'][number];
const DT=1/60,PELVIS=new Vector3(0,.9,0);
// The same five rigid parts / twelve material splits as pedestrian.glb. Boxes
// approximate its local extents; the real render and thin-instance code runs.
const parts:Record<Part,{prefix:string;materials:string[];bounds:Bounds;joint?:Vector3}>={
 body:{prefix:'person_body',materials:['hair','shirt','skin','trousers'],bounds:{min:[-.23,.85,-.21],max:[.23,1.74,.12]}},
 leftLeg:{prefix:'person_leg_-1',materials:['shoes','trousers'],bounds:{min:[-.194,.035,-.10],max:[-.016,.89,.205]},joint:new Vector3(-.105,.89,0)},
 rightLeg:{prefix:'person_leg_1',materials:['shoes','trousers'],bounds:{min:[.016,.035,-.10],max:[.194,.89,.205]},joint:new Vector3(.105,.89,0)},
 leftArm:{prefix:'person_arm_-1',materials:['shirt','skin'],bounds:{min:[-.313,.86,-.065],max:[-.146,1.367,.079]},joint:new Vector3(-.21,1.35,0)},
 rightArm:{prefix:'person_arm_1',materials:['shirt','skin'],bounds:{min:[.146,.86,-.065],max:[.313,1.367,.079]},joint:new Vector3(.21,1.35,0)},
};
function fixture(t:TestContext,paths:number[][]=[[-10,0,10,0],[-10,18,10,18]],heightAt=(x:number,z:number)=>0,blocked=(x:number,z:number)=>false){
 const engine=new NullEngine(),scene=new Scene(engine),pedestrians=new CityPedestrians(scene,heightAt,blocked);
 const buffers=new Map<Mesh,Float32Array>(),templates=new Map<Part,Mesh[]>();
 for(const [key,part] of Object.entries(parts) as [Part,typeof parts[Part]][]){
  const {min,max}=part.bounds,group:Mesh[]=[];
  for(const material of part.materials){
   const mesh=MeshBuilder.CreateBox(`${part.prefix}_${material}`,{width:max[0]-min[0],height:max[1]-min[1],depth:max[2]-min[2]},scene);
   mesh.bakeTransformIntoVertices(Matrix.Translation((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2));
   // Observe the exact typed array handed to Babylon. Its cached world-matrix
   // accessor does not refresh after an in-place thinInstanceBufferUpdated.
   const original=mesh.thinInstanceSetBuffer.bind(mesh);
   mesh.thinInstanceSetBuffer=(kind,buffer,stride,staticBuffer)=>{
    if(kind==='matrix'&&buffer)buffers.set(mesh,buffer);
    original(kind,buffer,stride,staticBuffer);
   };
   group.push(mesh);pedestrians.meshes.push(mesh);
  }
  templates.set(key,group);
 }
 // init() normally derives this asset metadata after GLB I/O. Supply only that
 // metadata here, without replacing collision, animation or instance methods.
 (pedestrians as unknown as {bounds:Map<Part,Bounds>}).bounds=new Map(
  Object.entries(parts).map(([key,part])=>[key as Part,part.bounds]));
 pedestrians.paths=paths.map(path=>[...path]);pedestrians.place(0,0);
 t.after(()=>{scene.dispose();engine.dispose();});
 function matrix(part:Part,slot:number){
  const data=buffers.get(templates.get(part)![0]);assert(data,`${part} has an instance buffer`);
  return Matrix.FromArray(data,slot*16);
 }
 function finiteMatrices(){
  for(const mesh of pedestrians.meshes){
   const data=buffers.get(mesh);assert(data);assert.equal(mesh.thinInstanceCount,pedestrians.people.length);
   assert.equal(data.length,pedestrians.people.length*16);assert(data.every(Number.isFinite),`${mesh.name} contains a non-finite matrix`);
   for(let slot=0;slot<pedestrians.people.length;slot++){
    const m=Matrix.FromArray(data,slot*16);assert(Math.abs(m.determinant())>.5,`${mesh.name}/${slot} must not collapse`);
   }
  }
 }
 return {pedestrians,scene,buffers,templates,matrix,finiteMatrices};
}
function pose(x:number,z:number,speed=12,yaw=0,groundY=0):ImpactCarPose{return {x,z,speed,yaw,groundY};}
test('tank crossings leave pedestrians upright; the same sports-car crossing still launches them',t=>{
 const {pedestrians}=fixture(t),person=pedestrians.people[0];
 const before=pose(person.x,person.z-4,18),after=pose(person.x,person.z+4,18);
 const original=structuredClone(person),stats={...pedestrians.stats};
 assert.deepEqual(pedestrians.collideVehicle(before,after,'tank'),{hits:0,peakSpeed:0});
 assert.deepEqual(person,original);assert.deepEqual(pedestrians.stats,stats);
 assert.ok(pedestrians.collideVehicle(before,after,'sports-car').hits>0);
 assert.equal(person.body?.phase,'airborne');assert.ok(person.body!.vy>0);
});
function hit(pedestrians:CityPedestrians,person:Walker,speed=12){
 return pedestrians.collideVehicle(pose(person.x,person.z-4,speed,0,pedestrians.heightAt(person.x,person.z)),
  pose(person.x,person.z+4,speed,0,pedestrians.heightAt(person.x,person.z)));
}
function near(actual:number,expected:number,tolerance=1e-5,message='values differ'){
 assert(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected}`);
}
function nearVector(a:Vector3,b:Vector3,tolerance=1e-5,message='points differ'){
 assert(Vector3.Distance(a,b)<=tolerance,`${message}: ${a.asArray()} vs ${b.asArray()}`);
}
function groundMinimum(bounds:Bounds,m:Matrix){
 let min=Infinity;
 for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])
  min=Math.min(min,Vector3.TransformCoordinates(new Vector3(x,y,z),m).y);
 return min;
}

test('an impact carries its walker off the path while every untouched walker keeps the same gait',t=>{
 const f=fixture(t),control=fixture(t),p=f.pedestrians.people[0],other=f.pedestrians.people[1];
 const {hits,peakSpeed}=hit(f.pedestrians,p,18);assert.equal(hits,1);assert(peakSpeed>10);assert(p.body);
 const body=p.body,pathTime=p.t,originalZ=p.z,meshCount=f.scene.meshes.length;
 const matrixBuffers=[...f.buffers.values()];
 for(let frame=0;frame<30;frame++){
  f.pedestrians.update(DT,0,0);control.pedestrians.update(DT,0,0);
  assert.equal(p.body,body);near(p.x,body.x);near(p.z,body.z);near(p.t,pathTime);
  assert(p.z>originalZ+.05,'the next walk frame must not snap an airborne walker back to its path');
  const expected=control.pedestrians.people[1];
  near(other.x,expected.x);near(other.z,expected.z);near(other.yaw,expected.yaw);assert.equal(other.body,null);
  for(const part of Object.keys(parts) as Part[]){
   const a=f.matrix(part,other.slot).m,b=control.matrix(part,expected.slot).m;
   for(let i=0;i<16;i++)near(a[i],b[i],1e-6,`untouched ${part} gait`);
  }
  f.finiteMatrices();
 }
 assert.equal(f.scene.meshes.length,meshCount,'an impact must not create a second mesh/draw batch');
 assert.deepEqual([...f.buffers.values()],matrixBuffers);
 for(let i=0;i<matrixBuffers.length;i++)assert.equal([...f.buffers.values()][i],matrixBuffers[i],'stable population reuses each instance buffer');
});

test('population stays at 56 and simultaneous simulated impact bodies stay at eight',t=>{
 const paths=Array.from({length:90},(_,i)=>[-10,i*.03,10,i*.03]);
 const f=fixture(t,paths),{pedestrians}=f;assert.equal(pedestrians.people.length,56);assert.equal(f.scene.meshes.length,12);
 // A synthetic crowd in the swept corridor makes more than eight contacts
 // possible in one call; the limit is enforced by the production controller.
 for(const p of pedestrians.people){p.x=0;p.z=0;p.t=.5;p.yaw=0;}
 const before=pose(0,-4,25),after=pose(0,4,25),first=pedestrians.collideVehicle(before,after);
 assert.equal(first.hits,8);assert.equal(pedestrians.stats.activeBodies,8);assert.equal(pedestrians.stats.totalImpacts,8);
 assert.equal(pedestrians.collideVehicle(before,after).hits,0);
 for(let frame=0;frame<30;frame++){
  pedestrians.update(DT,0,0);assert(pedestrians.stats.activeBodies<=8);assert.equal(pedestrians.stats.people,56);f.finiteMatrices();
 }
 assert.equal(pedestrians.stats.limit,8);assert.equal(pedestrians.stats.peakActive,8);assert.equal(f.scene.meshes.length,12);
 assert.equal(pedestrians.people.filter(p=>p.body).length,8);
});

test('nearby streaming preserves the same impacted slot and returning walker even without a nearby path',t=>{
 const f=fixture(t),{pedestrians}=f,p=pedestrians.people[0];hit(pedestrians,p,18);pedestrians.update(.1,0,0);
 const body=p.body,slot=p.slot,position={x:p.x,z:p.z};assert(body);
 pedestrians.place(8,5);assert.equal(pedestrians.people.find(person=>person.slot===slot),p);assert.equal(p.body,body);
 near(p.x,position.x);near(p.z,position.z);
 pedestrians.update(DT,235,0);assert.equal(pedestrians.people.find(person=>person.slot===slot),p);assert.equal(p.body,body);
 assert(pedestrians.meshes.every(mesh=>mesh.isEnabled()));f.finiteMatrices();
 pedestrians.paths=[];pedestrians.place(p.x+5,p.z+5);
 assert.equal(pedestrians.people[0],p,'a retained impact is visible even when no fresh sidewalk enters the stream');
 assert.equal(p.body,body);f.finiteMatrices();
 for(let i=0;i<1200&&p.body;i++)pedestrians.update(DT,pedestrians.origin[0],pedestrians.origin[1]);
 assert.equal(p.body,null);assert(p.returning);
 pedestrians.place(p.x+4,p.z+4);assert.equal(pedestrians.people[0],p);assert(p.returning);f.finiteMatrices();
});

test('airborne parts rotate about the pelvis and their own joints with finite articulated matrices',t=>{
 const f=fixture(t),p=f.pedestrians.people[0];hit(f.pedestrians,p,32);
 let articulatedFrames=0;
 for(let frame=0;frame<28;frame++){
  f.pedestrians.update(DT,0,0);const body=p.body;assert(body);f.finiteMatrices();
  if(body.grounded)continue;
  const root=f.matrix('body',p.slot);
  nearVector(Vector3.TransformCoordinates(PELVIS,root),new Vector3(body.x,body.y,body.z),1e-4,'hip pivot stays at the physical body centre');
  for(const part of ['leftLeg','rightLeg','leftArm','rightArm'] as Part[]){
   const limb=f.matrix(part,p.slot),joint=parts[part].joint!;
   nearVector(Vector3.TransformCoordinates(joint,limb),Vector3.TransformCoordinates(joint,root),1e-4,`${part} remains attached`);
   assert(limb.m.some((value,index)=>Math.abs(value-root.m[index])>1e-3),`${part} must animate independently during flight`);
  }
  articulatedFrames++;
 }
 assert(articulatedFrames>=10,'exercise sustained flight, not only the initial hit state');
});

test('lying and recovering parts clear the ground, stand up progressively and walk back without teleporting',t=>{
 const f=fixture(t),{pedestrians}=f,p=pedestrians.people[0];hit(pedestrians,p,14);
 let sawAirborne=false,sawSliding=false,sawRecovery=false,sawReturning=false,finished=false;
 let previousPitch=Infinity,recoveryFrames=0,firstRecoveryPitch=0,returnFrames=0;
 for(let frame=0;frame<3600;frame++){
  const oldBody=p.body,oldPosition={x:p.x,z:p.z},oldReturning=p.returning;
  const previousHip=Vector3.TransformCoordinates(PELVIS,f.matrix('body',p.slot));
  pedestrians.update(DT,0,0);f.finiteMatrices();const body=p.body;
  if(body){
   sawAirborne||=body.phase==='airborne';sawSliding||=body.phase==='sliding';
   if(body.grounded||body.phase==='recovering')for(const part of Object.keys(parts) as Part[])
    assert(groundMinimum(parts[part].bounds,f.matrix(part,p.slot))>=.0249,`${part} must remain above ground while lying/getting up`);
   if(body.phase==='recovering'){
    const pitch=Math.hypot(body.rx,body.rz);sawRecovery=true;recoveryFrames++;
    if(recoveryFrames===1){firstRecoveryPitch=pitch;assert(pitch>1,'first recovery frame remains close to the lying pose');}
    assert(pitch<=previousPitch+1e-8,'recovery rotation approaches upright monotonically');previousPitch=pitch;
    assert(Vector3.Distance(previousHip,Vector3.TransformCoordinates(PELVIS,f.matrix('body',p.slot)))<.09,'getting up is continuous between frames');
   }
  }else if(oldBody){
   assert(p.returning);assert(recoveryFrames>45,'standing up must span many real updates');assert(previousPitch<firstRecoveryPitch*.05);
   near(p.x,oldPosition.x);near(p.z,oldPosition.z);
   assert(Vector3.Distance(previousHip,Vector3.TransformCoordinates(PELVIS,f.matrix('body',p.slot)))<.09,'releasing the physics body must not move the visible hips abruptly');
  }
  if(p.returning||oldReturning){
   sawReturning=true;returnFrames++;
   assert(Math.hypot(p.x-oldPosition.x,p.z-oldPosition.z)<=Math.max(p.speed*DT,.06)+1e-6,'return movement is bounded by walking speed plus the final path snap tolerance');
  }
  if(sawReturning&&!p.returning&&!p.body){finished=true;break;}
 }
 assert(sawAirborne&&sawSliding&&sawRecovery&&sawReturning&&finished,'complete flight → lying → getting up → sidewalk return');
 assert(returnFrames>30,'returning from the impact position is actual walking');near(p.z,0,.06);
 const last={x:p.x,z:p.z};pedestrians.update(DT,0,0);
 assert(Math.hypot(p.x-last.x,p.z-last.z)<=p.speed*DT+1e-6);assert.equal(p.body,null);assert.equal(p.returning,false);
});

test('a wall can block the return walk without resetting its position onto the old sidewalk',t=>{
 let wall=false;
 const f=fixture(t,undefined,()=>0,(_x,z)=>wall&&z<1),{pedestrians}=f,p=pedestrians.people[0];
 hit(pedestrians,p,14);
 for(let i=0;i<1200&&p.body;i++)pedestrians.update(DT,0,0);
 assert(p.returning);assert(p.z>1);wall=true;
 for(let i=0;i<1200;i++){
  const before={x:p.x,z:p.z};pedestrians.update(DT,0,0);
  assert(p.z>=1);assert(Math.hypot(p.x-before.x,p.z-before.z)<=p.speed*DT+1e-6);assert(p.returning);
 }
 assert(p.z<1.1,'the walker reaches the near side of the wall');f.finiteMatrices();
});
