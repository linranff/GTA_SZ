/** CPU-only audit of the current public hero GLB. No browser, GPU or mutations. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
const candidate=process.argv.includes('--candidate');
const asset=candidate?'artifacts/city/vehicle-candidate/indigo-gt.glb':'public/city/car.glb';
const meta=JSON.parse(await fs.readFile(candidate?'artifacts/city/vehicle-candidate/vehicle-manifest.json':'public/city/vehicle-manifest.json','utf8'));
const bytes=await fs.readFile(asset);const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const doc=await io.read(asset);const root=doc.getRoot();
const meshes=root.listMeshes();const errors=[];const warnings=[];const checks={};
const assert=(ok,message)=>{if(!ok)errors.push(message);return ok;};
const positions=m=>m.listPrimitives().flatMap(p=>Array.from(p.getAttribute('POSITION').getArray()));
const bounds=a=>({min:[0,1,2].map(k=>{let v=Infinity;for(let i=k;i<a.length;i+=3)v=Math.min(v,a[i]);return v;}),max:[0,1,2].map(k=>{let v=-Infinity;for(let i=k;i<a.length;i+=3)v=Math.max(v,a[i]);return v;})});
const length=a=>Math.hypot(...a);const sub=(a,b)=>a.map((x,i)=>x-b[i]);
checks.hashMatchesManifest=assert(sha256===meta.delivery.sha256,'Current car.glb hash differs from vehicle-manifest delivery.');
checks.identityNodeTransforms=assert(root.listNodes().every(n=>length(n.getTranslation())<1e-7&&length(sub(n.getScale(),[1,1,1]))<1e-7&&length(sub(n.getRotation(),[0,0,0,1]))<1e-7),'Non-identity mesh node transforms would invalidate local-space pivot assumptions.');
checks.finitePositions=assert(meshes.every(m=>positions(m).every(Number.isFinite)),'Non-finite geometry position.');
const tyreMeshes=meshes.filter(m=>m.listPrimitives().some(p=>p.getMaterial()?.getName()==='wheel_rubber'));
checks.exactlyFourAnimatedTyres=assert(tyreMeshes.length===4&&tyreMeshes.every(m=>/^wheel_[lr][fr]_rubber$/.test(m.getName())),'Rubber tyres include missing/duplicated/static parts.');
checks.noRotatingCalipers=assert(!meshes.filter(m=>m.getName().startsWith('wheel_')).some(m=>m.listPrimitives().some(p=>p.getMaterial()?.getName()==='car_caliper')),'Caliper is incorrectly included in a wheel-spin mesh.');
const all=meshes.flatMap(positions);const carBounds=bounds(all);
const engine=new NullEngine({renderWidth:32,renderHeight:32});const scene=new Scene(engine);
const wheelChecks=[];const states=[{spin:0,steer:0},{spin:Math.PI/2,steer:0},{spin:Math.PI,steer:.55},{spin:Math.PI*2,steer:-.55}];
for(const key of ['lf','rf','lr','rr']){
 const parts=meshes.filter(m=>m.getName().startsWith('wheel_'+key+'_'));
 const rubber=parts.find(m=>m.getName().endsWith('_rubber'));
 assert(parts.length===3,key+' must have exactly alloy, dark alloy and rubber groups.');
 const pivot=meta.wheelCentresGltf[key];const a=positions(rubber);const b=bounds(a);
 const centre=b.min.map((v,i)=>(v+b.max[i])/2);const axleCentreError=Math.hypot(centre[1]-pivot[1],centre[2]-pivot[2]);
 // Radial shell fit uses extrema because sidewall vertices span multiple radii.
 const radiusY=(b.max[1]-b.min[1])/2;const radiusZ=(b.max[2]-b.min[2])/2;
 assert(axleCentreError<.003,key+' tyre centre is not on metadata axle.');
 assert(Math.abs(radiusY-radiusZ)<.003,key+' tyre is visibly elliptical in rolling plane.');
 assert(Math.abs((radiusY+radiusZ)/2-meta.wheelRadius)<.003,key+' rolling radius disagrees with metadata.');
 const partResults=[];
 for(const part of parts){
  const p=positions(part);const mesh=new Mesh('audit_'+part.getName(),scene);const vd=new VertexData();vd.positions=p;vd.indices=Array.from({length:p.length/3},(_,i)=>i);vd.applyToMesh(mesh);mesh.setPivotPoint(Vector3.FromArray(pivot));mesh.rotationQuaternion=null;
  let maxPivotDrift=0,maxRadiusDrift=0,maxRoundTripError=0;
  for(const state of states){
   mesh.rotation.set(state.spin,key.endsWith('f')?state.steer:0,0);const matrix=mesh.computeWorldMatrix(true);const transformedPivot=Vector3.TransformCoordinates(Vector3.FromArray(pivot),matrix);
   maxPivotDrift=Math.max(maxPivotDrift,Vector3.Distance(transformedPivot,Vector3.FromArray(pivot)));
   for(let i=0;i<p.length;i+=3){
    const v=Vector3.FromArray(p,i);const out=Vector3.TransformCoordinates(v,matrix);
    maxRadiusDrift=Math.max(maxRadiusDrift,Math.abs(Vector3.Distance(v,Vector3.FromArray(pivot))-Vector3.Distance(out,transformedPivot)));
    if(state.spin===Math.PI*2&&state.steer===0)maxRoundTripError=Math.max(maxRoundTripError,Vector3.Distance(v,out));
   }
  }
  // A pure full rolling revolution returns all vertices to their original pose.
  mesh.rotation.set(Math.PI*2,0,0);const full=mesh.computeWorldMatrix(true);
  for(let i=0;i<p.length;i+=3){const v=Vector3.FromArray(p,i);maxRoundTripError=Math.max(maxRoundTripError,Vector3.Distance(v,Vector3.TransformCoordinates(v,full)));}
  assert(maxPivotDrift<1e-5,part.getName()+' drifts off its actual axle during rotation.');assert(maxRadiusDrift<1e-5,part.getName()+' deforms during steering/spin.');assert(maxRoundTripError<1e-5,part.getName()+' does not close a full wheel rotation.');
  partResults.push({mesh:part.getName(),vertices:p.length/3,maxPivotDrift,maxRadiusDrift,maxRoundTripError});mesh.dispose();
 }
 wheelChecks.push({wheel:key,pivot,tyreBounds:b,tyreGeometricCentre:centre,axleCentreError,radiusY,radiusZ,partResults});
}

const emission=Object.fromEntries(['led','redled','amberled'].map(name=>{const m=root.listMaterials().find(m=>m.getName()===name);const factor=m?.getEmissiveFactor()??[0,0,0];const strength=m?.getExtension('KHR_materials_emissive_strength')?.getEmissiveStrength()??1;return[name,{factor,strength,effectiveLinearRgb:factor.map(x=>x*strength)}];}));
checks.headlightEmission=assert(emission.led.strength===4,'Headlight emissive strength is not 4.');checks.taillightEmission=assert(emission.redled.strength===3,'Tail light emissive strength is not 3.');checks.markerEmission=assert(Math.abs(emission.amberled.effectiveLinearRgb[0]-.35)<1e-5,'Marker effective red emission is not .35.');
const allCalipers=meshes.filter(m=>m.getName()==='car_caliper'||/^brake_[lr]f_caliper$/.test(m.getName()));const allDiscs=meshes.filter(m=>m.getName()==='car_darkalloy'||/^brake_[lr]f_darkalloy$/.test(m.getName()));
const brakeChecks=[];
for(const key of ['lf','rf','lr','rr']){
 const pivot=meta.wheelCentresGltf[key];const group=[];
 for(const m of [...allCalipers,...allDiscs]){
  const a=positions(m);const own=[];
  for(let i=0;i<a.length;i+=3){const p=a.slice(i,i+3);const closest=Object.entries(meta.wheelCentresGltf).sort((a,b)=>length(sub(p,a[1]))-length(sub(p,b[1])))[0][0];if(closest===key)own.push(...p);}
  if(!own.length)continue;
  const b=bounds(own);const c=b.min.map((v,i)=>(v+b.max[i])/2);group.push({mesh:m.getName(),vertices:own.length/3,bounds:b,centre:c,radialOffsetFromAxle:Math.hypot(c[1]-pivot[1],c[2]-pivot[2]),axialOffset:c[0]-pivot[0]});
  assert(own.length>0,key+' missing '+m.getName()+' cluster.');
 }
 assert(group.length===2,key+' must have exactly one caliper and one rotor cluster.');const caliperBounds=group.find(g=>g.mesh.endsWith('_caliper')).bounds;const discBounds=group.find(g=>g.mesh.endsWith('_darkalloy')).bounds;const axialOverlap=Math.min(caliperBounds.max[0],discBounds.max[0])-Math.max(caliperBounds.min[0],discBounds.min[0]);
 if(axialOverlap<-.005)warnings.push({severity:'visual-medium',code:'BRAKE_DISC_CALIPER_AXIAL_GAP',wheel:key,gapMetres:-axialOverlap,finding:'Brake disc and caliper do not overlap along the wheel axle; inherited from the source wheel assembly.',recommendedFix:'Translate this rotor along X to the caliper centre plane in an asset-only correction; retain tyre/rim pivots.'});
 brakeChecks.push({wheel:key,clusters:group,caliperDiscAxialOverlap:axialOverlap});
}
const brakeTransforms=[];
for(const key of ['lf','rf']){
 const expected=['brake_'+key+'_caliper','brake_'+key+'_darkalloy'];
 if(expected.some(name=>!meshes.find(m=>m.getName()===name))){warnings.push({code:'STATIC_FRONT_BRAKES_DO_NOT_STEER',wheel:key});continue;}
 for(const name of expected){
  const part=meshes.find(m=>m.getName()===name);const p=positions(part);const pivot=Vector3.FromArray(meta.wheelCentresGltf[key]);const mesh=new Mesh(name,scene);const vd=new VertexData();vd.positions=p;vd.indices=Array.from({length:p.length/3},(_,i)=>i);vd.applyToMesh(mesh);mesh.setPivotPoint(pivot);mesh.rotationQuaternion=null;
  let maxPivotDrift=0,maxPlaneMismatch=0;
  for(const steer of [-.55,0,.55]){
   mesh.rotation.set(0,steer,0);const matrix=mesh.computeWorldMatrix(true);maxPivotDrift=Math.max(maxPivotDrift,Vector3.Distance(pivot,Vector3.TransformCoordinates(pivot,matrix)));
   // Wheel axis and brake-disc normal both yaw around Y. Brake mesh has no
   // rolling X rotation, so its caliper does not orbit around the hub.
   const axle=Vector3.TransformNormal(Vector3.Right(),matrix).normalize();const expectedAxle=new Vector3(Math.cos(steer),0,-Math.sin(steer));maxPlaneMismatch=Math.max(maxPlaneMismatch,Vector3.Distance(axle,expectedAxle));
  }
  assert(maxPivotDrift<1e-5,name+' steering pivot drift.');assert(maxPlaneMismatch<1e-5,name+' brake axis diverges from steered wheel axis.');brakeTransforms.push({mesh:name,maxPivotDrift,maxPlaneMismatch,animationContract:'rotation=(0, -state.steer, 0); never wheelSpin'});mesh.dispose();
 }
}
checks.steeringBrakeGroupsPresent=brakeTransforms.length===4;
scene.dispose();engine.dispose();
const report={timestamp:new Date().toISOString(),asset,assetBytes:bytes.length,assetSha256:sha256,scope:'CPU geometry + Babylon NullEngine transform audit; no GPU/browser/FPS proof',checks,carBounds,wheelbase:meta.wheelbaseMetres,frontTrack:meta.frontTrackMetres,rearTrack:meta.rearTrackMetres,wheelChecks,emission,brakeChecks,brakeTransforms,warnings,errors,status:errors.length?'failed':warnings.length?'passed-with-visual-warning':'passed'};
await fs.mkdir('artifacts/city/vehicle-candidate',{recursive:true});await fs.writeFile('artifacts/city/vehicle-candidate/'+(candidate?'candidate-check':'delivery-check')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,sha256,checks,wheelChecks:wheelChecks.map(w=>({wheel:w.wheel,axleCentreError:w.axleCentreError,radiusY:w.radiusY,radiusZ:w.radiusZ})),emission,warnings,errors},null,2));
if(errors.length)process.exitCode=1;
