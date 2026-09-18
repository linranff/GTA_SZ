import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isCandidateGroundSlab} from '../src/landmark-details.ts';

const manifest={landmarks:[
 {id:'baypark',candidateKind:'park'},{id:'central-park',candidateKind:'park'},{id:'bijia',candidateKind:'park'},
 {id:'houhai',candidateKind:'district'},{id:'guomao',candidateKind:'building'},{id:'pingan',candidateKind:'building'},
]} as unknown as Parameters<typeof isCandidateGroundSlab>[2];

test('every candidate water slab is dropped regardless of kind',()=>{
 assert.equal(isCandidateGroundSlab('landmark_baypark_water',.69,manifest),true);
 assert.equal(isCandidateGroundSlab('landmark_houhai_water',.84,manifest),true);
 assert.equal(isCandidateGroundSlab('landmark_central_park_water',.72,manifest),true);
});

test('flat park slabs go, raised park geometry and building parts stay',()=>{
 assert.equal(isCandidateGroundSlab('landmark_baypark_park',.18,manifest),true);
 assert.equal(isCandidateGroundSlab('landmark_central_park_park',.21,manifest),true);
 assert.equal(isCandidateGroundSlab('landmark_bijia_park',49.2,manifest),false);
 assert.equal(isCandidateGroundSlab('landmark_houhai_park',.11,manifest),false);
 assert.equal(isCandidateGroundSlab('landmark_guomao_park',3.9,manifest),false);
 assert.equal(isCandidateGroundSlab('landmark_pingan_steel',0,manifest),false);
 assert.equal(isCandidateGroundSlab('block_3_-1_glass',0,manifest),false);
});

test('shipped manifest: park-kind ids map onto the GLB mesh naming',async()=>{
 const shipped=JSON.parse(await readFile(new URL('../public/city/landmark-candidates.json',import.meta.url),'utf8'));
 const parks=shipped.landmarks.filter((l:{candidateKind?:string})=>l.candidateKind==='park').map((l:{id:string})=>l.id);
 assert.ok(parks.length>0);
 for(const id of parks)assert.equal(isCandidateGroundSlab(`landmark_${id.replace(/-/g,'_')}_park`,.2,shipped),true,id);
});
