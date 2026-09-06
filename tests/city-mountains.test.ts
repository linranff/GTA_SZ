import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {mountainHeightAt} from '../src/city-mountains.ts';

test('mountain ground follows rendered triangles, not a curved bilinear patch',()=>{
 const g={x0:0,z0:0,step:1,columns:2,rows:2},h=new Float32Array([0,0,0,4]);
 assert.equal(mountainHeightAt(h,g,.25,.25),0);
 assert.equal(mountainHeightAt(h,g,.75,.75),2);
 assert.equal(mountainHeightAt(h,g,-.1,.5),0);
 assert.equal(mountainHeightAt(h,g,NaN,.5),0);
});

test('current mountain data reserves old Lianhua terrain and contains substantial ridges',()=>{
 const path=new URL('../public/city/mountain-relief/',import.meta.url),m=JSON.parse(readFileSync(new URL('manifest.json',path),'utf8'));
 const b=readFileSync(new URL(m.file,path)),h=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),g=m.grid;
 assert.equal(b.byteLength,g.columns*g.rows*4);assert.ok(m.budgets.triangles<260000);
 assert.ok(m.ridgeSamples.some((r:{peakGameHeight:number})=>r.peakGameHeight>200));
 const [x0,z0,x1,z1]=m.preservedTerrainBounds;
 for(let z=z0;z<=z1;z+=18)for(let x=x0;x<=x1;x+=18)assert.equal(mountainHeightAt(h,g,x,z),0);
 for(const v of h)assert.ok(Number.isFinite(v)&&v>=0&&v<600);
});

test('both mountain grids keep motor-road corridors and original Lianhua ground unraised',()=>{
 const path=new URL('../public/city/',import.meta.url),city=JSON.parse(readFileSync(new URL('city.json',path),'utf8'));
 const regions=['manifest.json','near-manifest.json'].map(file=>{
  const m=JSON.parse(readFileSync(new URL('mountain-relief/'+file,path),'utf8')),b=readFileSync(new URL('mountain-relief/'+m.file,path));
  assert.equal(b.byteLength,m.grid.columns*m.grid.rows*4);
  const h=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
  for(const value of h)assert.ok(Number.isFinite(value)&&value>=0);
  const [x0,z0,x1,z1]=m.preservedTerrainBounds;
  for(let z=z0;z<=z1;z+=12)for(let x=x0;x<=x1;x+=12)assert.equal(mountainHeightAt(h,m.grid,x,z),0);
  return {m,h};
 });
 const raised=(x:number,z:number)=>regions.reduce((sum,{m,h})=>sum+mountainHeightAt(h,m.grid,x,z),0);
 for(const road of city.roads){
  if(['footway','cycleway','path','steps','pedestrian','track'].includes(road.kind))continue;
  for(let i=1;i<road.points.length;i++){
   const [x0,z0]=road.points[i-1],[x1,z1]=road.points[i],length=Math.hypot(x1-x0,z1-z0);if(!length)continue;
   const steps=Math.ceil(length/8),nx=-(z1-z0)/length,nz=(x1-x0)/length;
   for(let j=1;j<steps;j++)for(const edge of [-.5,0,.5]){
    const x=x0+(x1-x0)*j/steps+nx*road.width*edge,z=z0+(z1-z0)*j/steps+nz*road.width*edge;
    assert.ok(raised(x,z)<.001,`${road.name}: raised road at ${x},${z}`);
   }
  }
 }
});
