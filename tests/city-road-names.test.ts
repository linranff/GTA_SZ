import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assignRoadDisplayNames,roadDisplayName} from '../src/city-road-names.ts';
import {MapRoadIndex,mapPointDestination} from '../src/city-map-geometry.ts';
import type {CityData,Road,V2} from '../src/city-types.ts';
const road=(id:string,name:string,points:V2[],kind='service',grade='0'):Road=>({id,name,points,kind,grade,width:6,oneway:false});
const city=(roads:Road[])=>({roads,meta:{extent:[-1000,-1000,1000,1000]}} as CityData);

test('unnamed road labels retain original source names and distinguish nearby road from official name',()=>{
 const named=road('a','滨海大道',[[-300,0],[300,0]],'primary');
 const side=road('b','支路',[[10,10],[30,40]]);
 const linked=road('c','支路',[[40,0],[40,25]],'primary_link');
 assignRoadDisplayNames(city([named,side,linked]));
 assert.equal(roadDisplayName(named),'滨海大道');assert.equal(side.name,'支路');
 assert.equal(roadDisplayName(side),'滨海大道附近 · 内部道路');
 assert.equal(roadDisplayName(linked),'滨海大道 · 连接匝道');
 const index=new MapRoadIndex([named,side,linked]);
 assert.match(mapPointDestination([20,25],index)!.name,/滨海大道附近/);
 assert.equal(index.nearest([40,15],undefined,'c')!.road.id,'c');
});

test('labels avoid unrelated elevated roads and remote landmarks',()=>{
 const elevated=road('a','深南大道',[[-300,0],[300,0]],'primary','1');
 const side=road('b','支路',[[0,0],[0,20]]);
 assignRoadDisplayNames(city([elevated,side]),[{name:'后海',x:20,z:30,category:'district',kind:'suburb'}]);
 assert.equal(roadDisplayName(side),'后海附近 · 内部道路');
 assignRoadDisplayNames(city([elevated,side]),[{name:'后海',x:20000,z:30000,category:'district',kind:'suburb'}]);
 assert.equal(roadDisplayName(side),'城市西北侧 · 内部道路');
});

test('current city resolves every generic road, is deterministic, and leaves geometry and source names intact',()=>{
 const data=JSON.parse(fs.readFileSync('public/city/city.json','utf8')) as CityData;
 const before=data.roads.map(r=>({name:r.name,points:JSON.stringify(r.points)}));
 const places=JSON.parse(fs.readFileSync('data/map-places.json','utf8')).places;
 const stats=assignRoadDisplayNames(data,places),names=data.roads.map(roadDisplayName);
 assert.ok(stats.contextual>7000);assert.ok(names.every(n=>n!=='支路'&&n.length>0));
 assignRoadDisplayNames(data,places);assert.deepEqual(data.roads.map(roadDisplayName),names);
 data.roads.forEach((r,i)=>{assert.equal(r.name,before[i].name);assert.equal(JSON.stringify(r.points),before[i].points);});
});
