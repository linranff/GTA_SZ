import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState,startWork,sortParcel,advanceCheckpoint,payout,buy,nextDay,validateSave,meet,PACKAGES } from '../src/state.ts';
function completeShift(){const s=freshState();startWork(s);for(const p of PACKAGES)sortParcel(s,p.type);for(let i=0;i<3;i++)advanceCheckpoint(s,i);return s;}
test('a shift pays once, only after all freight checkpoints; costs are explicit',()=>{
 const s=freshState();assert.equal(payout(s),null);startWork(s);assert.equal(payout(s),null);
 for(const p of PACKAGES)sortParcel(s,p.type);assert.equal(advanceCheckpoint(s,2),false);assert.equal(payout(s),null);
 for(let i=0;i<3;i++)assert.equal(advanceCheckpoint(s,i),true);
 assert.deepEqual(payout(s),{base:280,bonus:40,cost:107,net:213});assert.equal(s.cash,393);
 assert.equal(payout(s),null);assert.equal(s.cash,393);
});
test('upgrades persist and cannot be bought twice or bought with insufficient funds',()=>{
 const s=completeShift();payout(s);assert.equal(buy(s,'bicycle'),false);assert.equal(s.cash,393);
 assert.equal(buy(s,'mattress'),true);assert.equal(s.cash,133);assert.equal(buy(s,'mattress'),false);
 assert.equal(nextDay(s),true);assert.deepEqual(s.inventory,['mattress']);assert.equal(s.day,2);assert.equal(s.work,'available');
});
test('mistakes retain base income and each parcel can only be sorted once',()=>{
 const s=freshState();startWork(s);for(const p of PACKAGES)sortParcel(s,(p.type+1)%3);
 assert.equal(sortParcel(s,0),null);for(let i=0;i<3;i++)advanceCheckpoint(s,i);
 assert.equal(payout(s)?.net,173);assert.equal(s.cash,353);
});
test('a resumed partial job preserves progress, invalid saves do not enter gameplay',()=>{
 const s=freshState();startWork(s);sortParcel(s,0);const resumed=validateSave(JSON.parse(JSON.stringify(s)))!;
 assert.equal(resumed.sorted,1);assert.equal(resumed.correct,1);assert.equal(resumed.work,'sorting');
 assert.equal(validateSave({...s,cash:-1}),null);assert.equal(validateSave({...s,work:'paid'}),null);
 assert.equal(validateSave({...s,inventory:['raincoat','raincoat']}),null);
 assert.equal(validateSave({...s,inventory:['__proto__']}),null);
});
test('an evening relationship reward cannot be farmed by reopening dialogue',()=>{
 const s=completeShift();assert.equal(meet(s,'friends'),false);payout(s);
 assert.equal(meet(s,'friends'),true);assert.equal(meet(s,'friends'),false);assert.equal(s.relationship,1);
});
