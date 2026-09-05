// CPU-only geometry/height contract checks. No browser, WebGL or build invoked.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createReliefHeightSampler} from '../src/city-ground-relief.ts';
import {terrainHeight} from '../src/landmark-details.ts';

const base=process.argv[2]??'artifacts/city/ground-relief-candidate';
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const file=fs.readFileSync(path.join(base,manifest.mesh));const buffer=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
const geometry=manifest.tiles.map(tile=>({tile,positions:new Float32Array(buffer,tile.positions.offset,tile.positions.bytes/4),normals:new Float32Array(buffer,tile.normals.offset,tile.normals.bytes/4),indices:new Uint32Array(buffer,tile.indices.offset,tile.indices.bytes/4)}));
const source=JSON.parse(fs.readFileSync('public/city/terrain-detail.json','utf8'));
const city=JSON.parse(fs.readFileSync('public/city/city.json','utf8'));
const landmarks=JSON.parse(fs.readFileSync('public/city/landmark-detail.json','utf8'));
const original=(x,z)=>terrainHeight(source.grid,x,z);
const started=performance.now(),sampler=createReliefHeightSampler(geometry,original,manifest.preservedTerrainBounds,manifest.lookupCellSize);
const errors=[];let triangles=0,maxSlope=0,maxSamplerError=0,roadSamples=0,buildingSamples=0,coastSamples=0,preservedSamples=0;
for(const group of geometry){const p=group.positions,ind=group.indices;
 for(let i=0;i<ind.length;i+=3){const a=ind[i]*3,b=ind[i+1]*3,c=ind[i+2]*3;const x=(p[a]+p[b]+p[c])/3,z=(p[a+2]+p[b+2]+p[c+2])/3,expected=(p[a+1]+p[b+1]+p[c+1])/3;
  maxSamplerError=Math.max(maxSamplerError,Math.abs(sampler.deltaAt(x,z)-expected));
  const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;maxSlope=Math.max(maxSlope,Math.hypot(nx,nz)/Math.max(1e-12,Math.abs(ny)));triangles++;
 }
}
for(const road of city.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.01)continue;
 for(const offset of [-road.width/2,0,road.width/2]){const x=(a[0]+b[0])/2-(b[1]-a[1])/len*offset,z=(a[1]+b[1])/2+(b[0]-a[0])/len*offset;const delta=sampler.deltaAt(x,z);if(delta>.0001&&errors.length<12)errors.push(`Road changed: ${road.id} delta=${delta}`);roadSamples++;}
}
for(const building of [...city.buildings,...landmarks.collisionFootprints]){for(const p of building.rings[0]){if(sampler.deltaAt(p[0],p[1])>.0001&&errors.length<12)errors.push('Building edge changed');buildingSamples++;}}
for(const coast of city.coast)for(const p of coast){if(sampler.deltaAt(p[0],p[1])>.0001&&errors.length<12)errors.push('Coast elevation changed');coastSamples++;}
const g=source.grid;for(let j=0;j<g.rows;j++)for(let i=0;i<g.columns;i++){const x=g.x0+i*g.dx,z=g.z0+j*g.dz;if(sampler.heightAt(x,z)!==original(x,z)&&errors.length<12)errors.push('Existing DSM changed');preservedSamples++;}
if(maxSamplerError>.002)errors.push('Visual/physics height mismatch '+maxSamplerError);
if(maxSlope>.24)errors.push('Slope exceeds gentle grade '+maxSlope);
if(triangles>200000)errors.push('Triangle budget exceeded');
assert.equal(sampler.heightAt(city.spawn.x,city.spawn.z),original(city.spawn.x,city.spawn.z));
const report={triangles,maxSlope,maxSlopeDegrees:Math.atan(maxSlope)*180/Math.PI,maxSamplerError,roadSamples,buildingSamples,coastSamples,preservedSamples,lookupCells:sampler.cellCount,elapsedMs:performance.now()-started,errors,scope:'CPU contracts only; visual appearance and GPU performance remain with integrator.'};
fs.writeFileSync(path.join(base,'height-contract-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.deepEqual(errors,[]);
