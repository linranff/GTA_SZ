import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CareerGame,readCareerSave,newCareerSave,careerLevel,type CareerFrame,type CareerPoint,type CareerPlaces} from '../src/city-career.ts';
const places:CareerPlaces={hub:[0,0],bay:[800,0],office:[1500,100],park:[900,650],workshop:[400,20]};
function frame(position:CareerPoint=[0,0]):CareerFrame{return {dt:.5,position,speed:0,odometer:0,debugEpoch:0,yaw:Math.PI/2};}
function travel(g:CareerGame,f:CareerFrame,to:CareerPoint){
 const start=[...f.position] as CareerPoint,dx=to[0]-start[0],dz=to[1]-start[1],length=Math.hypot(dx,dz),steps=Math.ceil(length/10);
 for(let i=1;i<=steps;i++){f.dt=.5;f.position=[start[0]+dx*i/steps,start[1]+dz*i/steps];f.speed=20;f.yaw=Math.atan2(dx,dz);f.odometer+=length/steps;g.tick(f);}
 f.speed=0;return f;
}
function finish(g:CareerGame,f:CareerFrame){while(g.active){travel(g,f,g.active.objective.position);for(let t=0;t<30&&g.active.holdProgress<1;t++){f.dt=.5;g.tick(f);}const action=g.interact(f);assert(action.ok,action.message);}return g.save;}
function dismiss(g:CareerGame){if(g.choice)assert(g.choose(g.choice.options.find(o=>o.cost===0)!.id).ok);}
test('migrate legacy money once, sanitize malformed v2 fields and preserve completed legacy rewards',()=>{
 const migrated=readCareerSave(null,{version:1,cash:528,completed:['day-pay','day-pay']});
 assert.equal(migrated.cash,528);assert.deepEqual(migrated.legacyCompleted,['day-pay']);
 const game=new CareerGame(places,migrated);assert.equal(game.creditLegacy('day-pay',220).ok,false);assert.equal(game.view.cash,528);
 assert(game.creditLegacy('coast-shift',128).ok);assert.equal(game.view.cash,656);assert.equal(game.creditLegacy('coast-shift',128).ok,false);
 const bad=readCareerSave({...migrated,cash:NaN});assert.equal(bad.cash,180);
 const sanitized=readCareerSave({...migrated,role:'engineer',xp:{office:NaN,'city-worker':-8,'day-worker':400},upgrades:['work-tools','work-tools','cheat'],relations:{ahui:300},pendingChoice:'arbitrary'});
 assert.equal(sanitized.role,'day-worker');assert.equal(sanitized.xp.office,0);assert.equal(sanitized.relations.ahui,20);assert.deepEqual(sanitized.upgrades,['work-tools']);assert.equal(sanitized.pendingChoice,null);
});
test('three mechanisms are initially available at the hub; repeat work gives money, choices and level unlocks',()=>{
 const g=new CareerGame(places),f=frame();
 for(const role of ['day-worker','office','city-worker'] as const){assert(g.selectRole(role).ok);const basic=g.view.jobs.find(j=>j.unlocked)!;assert.deepEqual(basic.objectives[0].position,places.hub);}
 g.selectRole('day-worker');assert.equal(g.accept('two-stop-relay',f).ok,false);assert(g.accept('hot-meal',f).ok);assert(g.interact(f).ok);
 const first=finish(g,f);assert(first.cash>180);assert.equal(first.completed['hot-meal'],1);assert.equal(g.interact(f).ok,false);assert.equal(g.save.cash,first.cash);
 assert(g.choice);assert.equal(g.accept('hot-meal',f).ok,false);dismiss(g);assert(g.accept('hot-meal',f).ok);finish(g,f);
 assert.equal(g.view.level,2);assert.equal(g.view.jobs.find(j=>j.id==='two-stop-relay')!.unlocked,true);assert.equal(g.save.completed['hot-meal'],2);assert.equal(careerLevel(g.save.xp['day-worker']),2);
});
test('debug jumps, unannounced teleports and odometer resets cannot earn money',()=>{
 for(const mode of ['epoch','position','odometer'] as const){
  const g=new CareerGame(places),f=frame();f.odometer=100;g.accept('hot-meal',f);g.interact(f);
  if(mode==='epoch')f.debugEpoch++;
  if(mode==='position')f.position=[800,0];
  if(mode==='odometer')f.odometer=0;
  g.tick(f);assert.equal(g.active!.invalid,true);travel(g,f,places.bay);assert.equal(g.interact(f).ok,false);assert.equal(g.view.cash,180);
  assert(g.cancel().ok);assert(g.accept('hot-meal',f).ok);assert.equal(g.active!.invalid,false);
 }
});
test('arrival requires parking and actual travel; partial relay completion never pays',()=>{
 const save=newCareerSave();save.xp['day-worker']=200;const g=new CareerGame(places,save),f=frame();g.accept('two-stop-relay',f);g.interact(f);
 travel(g,f,places.park);f.speed=3;assert.equal(g.interact(f).ok,false);f.speed=0;assert(g.interact(f).ok);assert.equal(g.view.cash,180);assert(g.active);
 assert(g.cancel().ok);assert.equal(g.view.cash,180);assert.equal(g.save.completed['two-stop-relay'],undefined);
});
test('parking work needs uninterrupted dwell and pauses in menus; tools really reduce dwell and add a subsidy',()=>{
 const s=newCareerSave();s.role='city-worker';s.cash=1000;const g=new CareerGame(places,s),f=frame();assert(g.purchase('work-tools').ok);assert.equal(g.view.cash,610);assert.equal(g.purchase('work-tools').ok,false);
 g.accept('after-rain-round',f);g.interact(f);travel(g,f,places.bay);assert.equal(g.active!.objective.holdSeconds,4.2);
 f.paused=true;for(let i=0;i<20;i++)g.tick(f);assert.equal(g.active!.holdSeconds,0);assert.equal(g.interact(f).ok,false);
 f.paused=false;for(let i=0;i<4;i++)g.tick(f);assert(g.active!.holdSeconds>0);f.speed=2;g.tick(f);assert.equal(g.active!.holdSeconds,0);f.speed=0;
 assert.equal(g.interact(f).ok,false);for(let i=0;i<9;i++)g.tick(f);assert(g.interact(f).ok);
 const before=g.view.cash;finish(g,f);assert.equal(g.view.cash-before,363); // 260 * 1.3 + 25 tool subsidy.
});
test('late delivery still pays base work, better equipment actually preserves quality; game pauses stop deadlines',()=>{
 const plain=new CareerGame(places),s=newCareerSave();s.cash=1000;const protectedGame=new CareerGame(places,s);protectedGame.purchase('insulated-box');
 for(const g of [plain,protectedGame]){const f=frame();g.accept('hot-meal',f);g.interact(f);const before=g.active!.remainingSeconds;f.paused=true;for(let i=0;i<500;i++)g.tick(f);assert.equal(g.active!.remainingSeconds,before);f.paused=false;for(let i=0;i<450;i++)g.tick(f);}
 assert(protectedGame.active!.quality>plain.active!.quality);assert(plain.active!.quality<100);
 const f=frame();travel(plain,f,places.bay);const before=plain.view.cash;assert(plain.interact(f).ok);assert(plain.view.cash>before);
});
test('comfortable driving and a paid comfort kit give better quality than repeated sudden braking',()=>{
 const run=(kit:boolean)=>{const s=newCareerSave();s.role='office';s.cash=1000;const g=new CareerGame(places,s),f=frame();if(kit)g.purchase('comfort-kit');g.accept('quiet-ten-minutes',f);g.interact(f);
  for(let i=0;i<3;i++){f.dt=.1;f.speed=25;g.tick(f);f.speed=0;g.tick(f);}return g.active!.quality;};
 assert(run(true)>run(false));assert(run(true)<100);
});
test('choice costs, relationship benefits and purchases persist without double charging or duplicate rewards',()=>{
 const g=new CareerGame(places),f=frame();g.accept('hot-meal',f);g.interact(f);finish(g,f);const cash=g.view.cash;
 assert(g.choose('share').ok);assert.equal(g.view.cash,cash-32);assert.equal(g.view.relations.ahui,3);assert.equal(g.view.supplied,true);assert.equal(g.choose('share').ok,false);
 const restored=new CareerGame(places,readCareerSave(JSON.parse(JSON.stringify(g.save))));assert.deepEqual(restored.save,g.save);assert.equal(restored.active,null);assert.equal(restored.view.pendingChoice,null);
 const saved=restored.save;saved.cash=0;assert.notEqual(restored.view.cash,0);assert.equal(restored.purchase('room-fund').ok,false);
});
test('supply has a physical location and one-use benefit; room fund adds a real ongoing reward',()=>{
 const s=newCareerSave();s.cash=3000;const g=new CareerGame(places,s),f=frame([100,0]);assert.equal(g.replenish(f).ok,false);f.position=[0,0];assert(g.replenish(f).ok);assert.equal(g.replenish(f).ok,false);assert(g.purchase('room-fund').ok);
 const before=g.view.cash;g.accept('hot-meal',f);assert.equal(g.view.supplied,false);g.interact(f);finish(g,f);assert.equal(g.view.cash-before,Math.round((190*1.3+18)*1.08));
});
test('a passenger journey cannot be completed entirely on foot but can finish with an on-foot conversation after driving',()=>{
 const s=newCareerSave();s.role='office';const g=new CareerGame(places,s),f=frame();g.accept('quiet-ten-minutes',f);g.interact(f);f.inVehicle=false;travel(g,f,places.bay);assert.equal(g.interact(f).ok,false);assert.equal(g.view.cash,180);
 g.cancel();f.inVehicle=true;g.accept('quiet-ten-minutes',f);finish(g,f); // Returns to pickup before the valid driven leg.
 assert(g.view.cash>180);
 const other=new CareerGame(places,s),ff=frame();other.accept('quiet-ten-minutes',ff);other.interact(ff);travel(other,ff,places.bay);ff.inVehicle=false;assert(other.interact(ff).ok);
});
