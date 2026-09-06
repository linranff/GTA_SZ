import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDistantCityGeometry,type DistantCityTile} from '../src/city-distant-geometry.ts';
import type {CityData,V2} from '../src/city-types.ts';

const city=(buildings:CityData['buildings']):CityData=>({meta:{counts:{},extent:[],horizontalScale:.6},land:[],coast:[],roads:[],buildings,green:[],water:[],landmarks:[],spawn:{x:0,z:0,yaw:0,road:''}});
const point=(tile:DistantCityTile,index:number)=>tile.positions.slice(index*3,index*3+3);

function checkFaces(tile:DistantCityTile){
 assert.equal(tile.normals.length,tile.positions.length);assert.equal(tile.colors.length,tile.positions.length/3*4);
 for(let i=0;i<tile.indices.length;i+=3){
  const [ia,ib,ic]=tile.indices.slice(i,i+3),a=point(tile,ia),b=point(tile,ib),c=point(tile,ic);
  const u=a.map((v,j)=>v-b[j]),v=c.map((value,j)=>value-b[j]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  assert(Math.hypot(...n)>1e-8,'no degenerate triangles');
  for(const index of [ia,ib,ic])assert(n.reduce((sum,value,j)=>sum+value*tile.normals[index*3+j],0)>0,'LH faces agree with outward/upward normals');
 }
}

test('concave roof follows both source windings without covering the missing corner; walls point out and roof points up',()=>{
 const ring:V2[]=[[0,0],[6,0],[6,2],[2,2],[2,6],[0,6],[0,0]];
 for(const exterior of [ring,[...ring].reverse()]){
  const result=buildDistantCityGeometry(city([{rings:[exterior],height:12,style:'office'}])),tile=result.tiles[0];
  assert.equal(result.buildingCount,1);assert.equal(result.triangleCount,16);assert.equal(result.skippedRoofCount,0);checkFaces(tile);
  let roofArea=0;
  for(let i=0;i<tile.indices.length;i+=3){
   const points=tile.indices.slice(i,i+3).map(index=>point(tile,index));
   if(points.some(p=>p[1]!==12))continue;
   const [a,b,c]=points;roofArea+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))*.5;
   for(const weights of [[1,1,1],[1,1,4],[1,4,1],[4,1,1]]){
    const total=weights.reduce((s,v)=>s+v,0),x=points.reduce((s,p,j)=>s+p[0]*weights[j],0)/total,z=points.reduce((s,p,j)=>s+p[2]*weights[j],0)/total;
    assert(x<=2+1e-9||z<=2+1e-9,'roof cannot expand into the concave corner');
   }
  }
  assert.equal(roofArea,20);assert(tile.positions.every((value,i)=>i%3===1?value===0||value===12:true));
  for(let i=0;i<tile.positions.length;i+=3){
   const nx=tile.normals[i],nz=tile.normals[i+2];
   if(nx===0&&nz===0)continue;
   const x=tile.positions[i],z=tile.positions[i+2];
   if(z===0&&nx===0)assert.equal(nz,-1);if(x===0&&nz===0)assert.equal(nx,-1);
  }
 }
});

test('tile ownership ignores repeated closure; negative coordinates, stable colours and seeds survive input order changes',()=>{
 const ring:V2[]=[[620,-10],[670,-10],[670,-5],[640,-5]];
 const rows=[{rings:[[...ring,ring[0]]],height:30,style:'residential'},{rings:[ring.map(([x,z]):V2=>[x-1280,z])],height:20,style:'stone'}];
 const result=buildDistantCityGeometry(city(rows));assert.deepEqual(result.tiles.map(t=>t.key),['-1_-1','1_-1']);
 const tile=result.tiles[1];assert.equal(tile.x,960);assert.equal(tile.z,-320);
 const open=buildDistantCityGeometry(city([{...rows[0],rings:[ring]}])).tiles[0];assert.deepEqual(tile,open);
 const reordered=buildDistantCityGeometry(city([...rows].reverse()));assert.deepEqual(reordered,result);
 const alpha=tile.colors.filter((_,i)=>i%4===3);assert(new Set(alpha).size===1);assert(alpha[0]>=0&&alpha[0]<=1);
 const wallColor=tile.colors.slice(0,3),roofColor=tile.colors.slice(-4,-1);assert(roofColor.every((v,i)=>v<wallColor[i]));
});

test('invalid and replacement footprints create no distant buildings; consecutive duplicates and collinear edges remain safe',()=>{
 const square:V2[]=[[0,0],[10,0],[10,10],[0,10],[0,0]];
 const rows:CityData['buildings']=[{rings:[square],height:30,style:'landmark-detail'},{rings:[square],height:NaN,style:'office'},{rings:[square],height:0,style:'office'},{rings:[],height:30,style:'office'},{rings:[[[0,0],[10,10],[0,10],[10,0]]],height:30,style:'office'},{rings:[[[0,0],[5,0],[5,0],[10,0],[10,10],[0,10],[0,0]]],height:15,style:'office'}];
 const result=buildDistantCityGeometry(city(rows));assert.equal(result.buildingCount,1);assert.equal(result.skippedBuildingCount,4);assert.equal(result.skippedRoofCount,0);checkFaces(result.tiles[0]);
});

test('current city stays under 500k triangles and 200 merged tiles without invented buildings or skipped roofs',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/city/city.json',import.meta.url),'utf8')) as CityData;
 const result=buildDistantCityGeometry(data);
 assert.equal(result.buildingCount,data.buildings.length);assert.equal(result.skippedBuildingCount,0);assert.equal(result.skippedRoofCount,0);
 assert(result.triangleCount<500_000);assert(result.tiles.length<200);
 assert.equal(result.tiles.reduce((sum,t)=>sum+t.buildingCount,0),result.buildingCount);
 for(const tile of result.tiles){assert(tile.positions.every(Number.isFinite));assert(tile.normals.every(Number.isFinite));}
});
