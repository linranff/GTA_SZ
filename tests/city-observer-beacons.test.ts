import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BEACON_LIMIT,BeaconHoldGesture,beaconName,decodeBeaconFavorites,encodeBeaconFavorites,matchingBeacon,type BeaconFavorite} from '../src/city-observer-beacon-state.ts';

const point:BeaconFavorite={id:'place-a',createdAt:100,x:12,y:5,z:-20,name:'海湾',arrival:[14,-24],yaw:1.2};
const pointer={id:7,x:100,y:200,button:0,primary:true,shift:false};
test('bookmarked terrain coordinates and road arrival survive reload without extra stored fields',()=>{
 const stored=decodeBeaconFavorites(JSON.stringify({version:1,places:[{...point,unexpected:'discard'}]}));
 assert.deepEqual(stored,[point]);assert.deepEqual(decodeBeaconFavorites(encodeBeaconFavorites(stored)),[point]);
 stored[0].arrival![0]=300;assert.equal(point.arrival![0],14);
});
test('corrupt, oversized, unsupported and unsafe browser data cannot create broken destinations',()=>{
 for(const raw of [null,'{','null','[]',JSON.stringify({version:2,places:[point]}),' '.repeat(100001)])assert.deepEqual(decodeBeaconFavorites(raw),[]);
 const places=[{...point,x:null},{...point,x:Infinity},{...point,y:1e7},{...point,arrival:[1]},{...point,yaw:'0'},{...point,createdAt:-1},{...point,name:1},point,{...point,name:'duplicate'}];
 assert.deepEqual(decodeBeaconFavorites(JSON.stringify({version:1,places})),[point]);
 const tooMany=Array.from({length:40},(_,n)=>({...point,id:`place-${n}`}));
 assert.equal(decodeBeaconFavorites(JSON.stringify({version:1,places:tooMany})).length,BEACON_LIMIT);
});
test('names preserve literal user text safely, trim controls, and bookmarks match the picked location rather than road arrival',()=>{
 assert.equal(beaconName('  <b>海湾</b>\n '),'<b>海湾</b>');assert.equal(beaconName('\n\t'),'我的地点');assert.equal(beaconName('海'.repeat(70)).length,48);
 assert.equal(matchingBeacon([point],{...point,x:13,z:-21})?.id,'place-a');
 assert.equal(matchingBeacon([point],{...point,x:80,z:80}),undefined);
 assert.equal(matchingBeacon([point],{...point,y:20}),undefined);
});
test('a stationary primary hold fires once after 650ms and consumes motion until release',()=>{
 const gesture=new BeaconHoldGesture();assert.equal(gesture.begin(pointer,1000),true);
 assert.equal(gesture.fire(1649),null);assert.equal(gesture.move(7,104,203,false),true);
 assert.deepEqual(gesture.fire(1650),{x:100,y:200});assert.equal(gesture.fire(1800),null);
 assert.equal(gesture.move(7,180,290,true),true);assert.equal(gesture.end(9),false);assert.equal(gesture.end(7),true);assert.equal(gesture.pointer,null);
});
test('a click, orbit, shift pan or second pointer never fires a beacon',()=>{
 const gesture=new BeaconHoldGesture();gesture.begin(pointer,0);assert.equal(gesture.end(7),false);assert.equal(gesture.fire(1000),null);
 gesture.begin(pointer,0);assert.equal(gesture.move(7,109,200,false),false);assert.equal(gesture.fire(1000),null);
 gesture.begin(pointer,0);assert.equal(gesture.move(7,101,200,true),false);assert.equal(gesture.fire(1000),null);
 for(const altered of [{button:2},{primary:false},{shift:true}])assert.equal(gesture.begin({...pointer,...altered},0),false);
 gesture.begin(pointer,0);assert.equal(gesture.begin({...pointer,id:8},5),false);assert.equal(gesture.fire(1000),null);
});
test('wheel, lost capture, blur and mode cancellation can reset an unfinished or consumed hold',()=>{
 const gesture=new BeaconHoldGesture();gesture.begin(pointer,0);assert.equal(gesture.progress(325),.5);gesture.cancel();assert.equal(gesture.fire(800),null);
 gesture.begin(pointer,0);gesture.fire(650);gesture.cancel();assert.equal(gesture.move(7,100,200,false),false);assert.equal(gesture.end(7),false);
});
test('mouse button chords cancel pending holds and releasing left ends a consumed hold even before pointerup',()=>{
 const gesture=new BeaconHoldGesture();gesture.begin(pointer,0);
 assert.equal(gesture.move(7,100,200,false,3),false);assert.equal(gesture.fire(1000),null);
 gesture.begin(pointer,0);assert.equal(gesture.move(7,100,200,false,2),false);assert.equal(gesture.fire(1000),null);
 gesture.begin(pointer,0);gesture.fire(650);assert.equal(gesture.move(7,100,200,false,3),true);
 assert.equal(gesture.move(7,100,200,false,2),false);assert.equal(gesture.pointer,null);
});
