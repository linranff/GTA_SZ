import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCafeStaffMotion,cafeStaffPointClear,cafeStaffRouteClear,CAFE_STAFF_ROUTES} from '../src/city-cafe-staff-motion.ts';
import {cafeLayout,type CafeSpec,type CafeCollider} from '../src/city-cafe-layout.ts';
const manifest=JSON.parse(readFileSync(new URL('../public/city/bamboo-cafe/manifest.json',import.meta.url),'utf8')) as {spec:CafeSpec;colliders:CafeCollider[]};
const make=()=>createCafeStaffMotion(structuredClone(manifest.spec),manifest.colliders);

test('all closed staff service routes clear actual cafe tables, chairs and counter',()=>{
 for(const route of Object.values(CAFE_STAFF_ROUTES))assert.ok(cafeStaffRouteClear(route.map(([x,z])=>({x,z})),manifest.colliders));
 assert.equal(cafeStaffRouteClear([{x:2.3,z:2},{x:2.3,z:5}],manifest.colliders),false,'cannot walk through counter');
});

test('staff roam with distinct gait phases without hitting furniture or each other',()=>{
 const motion=make(),ranges=motion.agents.map(a=>({min:a.x,max:a.x,moves:0}));
 for(let frame=0;frame<60*180;frame++){
  const poses=motion.update(1/60,null,true);
  for(const [i,a]of poses.entries()){
   assert.ok(cafeStaffPointClear(a,manifest.colliders),a.id+' entered furniture');
   if(a.id==='wangshu')assert.ok(a.z>=5,'barista must stay behind counter');
   ranges[i].min=Math.min(ranges[i].min,a.x);ranges[i].max=Math.max(ranges[i].max,a.x);if(a.walk>.5)ranges[i].moves++;
   for(const b of poses.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>.85);
  }
 }
 for(const r of ranges){assert.ok(r.max-r.min>2);assert.ok(r.moves>500);}
});

test('approaching a staff member stops walking and greets, with a cooldown; far animation freezes',()=>{
 const motion=make(),employee=motion.agents[0];
 for(let i=0;i<180;i++)motion.update(1/60,null,true);
 const player={x:employee.x,z:employee.z-1.5};
 for(let i=0;i<120;i++)motion.update(1/60,player,true);
 assert.equal(employee.greeting,true);assert.ok(employee.wave>.9);assert.ok(employee.speed<.001);assert.ok(employee.walk<.01);
 const stopped={x:employee.x,z:employee.z};
 for(let i=0;i<360;i++)motion.update(1/60,player,true);
 assert.ok(Math.hypot(employee.x-stopped.x,employee.z-stopped.z)<.01);assert.ok(employee.wave<.01,'greeting settles during dialogue');
 const frozen=structuredClone(motion.agents);for(let i=0;i<120;i++)motion.update(1/60,null,false);assert.deepEqual(motion.agents,frozen);
 for(let i=0;i<600;i++)motion.update(1/60,null,true);
 assert.ok(Math.hypot(employee.x-stopped.x,employee.z-stopped.z)>.5,'resume service route after player leaves');
});

test('updating live staff positions also updates cafe interaction/collision coordinates',()=>{
 const spec=structuredClone(manifest.spec),layout=cafeLayout(spec,manifest.colliders,3);
 const old=layout.world(spec.staff[0].position[0],spec.staff[0].position[1]);
 assert.equal(layout.blocked(old.x,old.z),true);
 spec.staff[0].position=[-2.25,-5.55];const moved=layout.world(-2.25,-5.55);
 assert.equal(layout.blocked(old.x,old.z),false);assert.equal(layout.blocked(moved.x,moved.z),true);
});
