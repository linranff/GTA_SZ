import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRainPuddleLayout,rainPoolProfile,rainPoolVariant,rainPoolOutline,RAIN_PROFILE_COUNT} from '../src/city-rain-puddles.ts';
import type {CityData,V2} from '../src/city-types.ts';
const box=(x0:number,z0:number,x1:number,z1:number):V2[][]=>[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]];
const fixture=():CityData=>({meta:{counts:{},extent:[-500,-100,500,100],horizontalScale:.6},land:[box(-500,-100,500,100)],coast:[],roads:[{id:'fixture-road',name:'fixture',kind:'primary',grade:'0',width:12,oneway:false,points:[[-450,0],[450,0]]}],buildings:[],green:[],water:[],landmarks:[],spawn:{x:0,z:0,yaw:0,road:'fixture'}});
test('rain pools follow road gutters and keep substantial dry road between irregular banks',()=>{
 const city=fixture(),a=generateRainPuddleLayout(city,()=>0),b=generateRainPuddleLayout(city,()=>0);
 assert(a.pools.length>=4);assert.deepEqual(a,b);assert(a.stats.estimatedPuddleArea/a.stats.sampledSurfaceArea>.25, String(a.stats.estimatedPuddleArea/a.stats.sampledSurfaceArea));assert(a.stats.estimatedPuddleArea/a.stats.sampledSurfaceArea<1/3);assert(a.stats.estimatedWetArea>a.stats.estimatedPuddleArea);
 for(const p of a.pools){assert(p.outline.every(q=>Math.abs(q[1])<city.roads[0].width/2-.4));assert(p.outline.every(q=>q[0]>-450&&q[0]<450));assert(p.outline.length===26);assert(Math.abs(Math.atan2(p.dz,p.dx))<=.052);}
 const p=a.pools[0];const x=rainPoolProfile(p,.31),y=rainPoolProfile(p,.69);assert(Math.abs(x.left-y.right)>.001,'bank must not be an evenly mirrored ellipse');
});
test('rain placement excludes sloped/elevated roads and bridge/tunnel grades',()=>{
 const city=fixture();const slope=generateRainPuddleLayout(city,(x)=>x*.04);assert.equal(slope.pools.length,0);assert(slope.stats.rejectedSlope>0);
 const raised=generateRainPuddleLayout(city,()=>2);assert.equal(raised.pools.length,0);assert(raised.stats.rejectedElevation>0);
 city.roads[0].grade='1';assert.equal(generateRainPuddleLayout(city,()=>0).pools.length,0);city.roads[0].grade='-1';assert.equal(generateRainPuddleLayout(city,()=>0).pools.length,0);
});
test('rain pools cannot be placed on water, grass, buildings or outside land',()=>{
 for(const category of ['water','green','buildings'] as const){const city=fixture();if(category==='buildings')city.buildings=[{rings:box(-490,-10,490,10),height:12,style:'fixture'}];else city[category]=[{rings:box(-490,-10,490,10),name:'fixture'}];const r=generateRainPuddleLayout(city,()=>0);assert.equal(r.pools.length,0,category);assert(r.stats.rejectedLandUse>0);}
 const sea=fixture();sea.land=[box(1000,1000,1100,1100)];assert.equal(generateRainPuddleLayout(sea,()=>0).pools.length,0);
});

test('five stable shorelines scatter banks while every LOD stays within narrow and wide roads',()=>{
 const city=fixture(),layout=generateRainPuddleLayout(city,()=>0);
 assert.equal(new Set(layout.pools.map(p=>rainPoolVariant(p.seed))).size,RAIN_PROFILE_COUNT);
 assert(new Set(layout.pools.map(p=>p.length.toFixed(1))).size>10,'lengths should visibly vary');
 assert(new Set(layout.pools.map(p=>Math.abs(p.lateral).toFixed(1))).size>4,'lateral positions should vary');
 assert(layout.pools.some(p=>p.dz>.003)&&layout.pools.some(p=>p.dz<-.003),'both small rotation directions should occur');
 const left=layout.pools.filter(p=>p.lateral<0),right=layout.pools.filter(p=>p.lateral>0);
 assert(left.some(p=>right.every(q=>Math.abs(p.x-q.x)>.1)),'opposite banks must not form paired rows');
 for(const width of [3.2,4.5,6,12,24]){
  city.roads[0].width=width;
  const pools=generateRainPuddleLayout(city,()=>0).pools;assert(pools.length>0);
  for(const p of pools)for(const steps of [12,6,4]){
   const edge=rainPoolOutline(p,1.08,steps);
   assert(edge.every(([x,z])=>x>-450+.18&&x<450-.18&&Math.abs(z)<width/2-.18),`rotated ${width}m road / LOD ${steps}`);
  }
 }
});
