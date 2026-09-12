import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {CityStoryContent,StoryFrame,StoryHooks,StoryPlace,StoryPoint} from '../src/city-story-contract.ts';
import {
  StoryGame,createStoryRuntime,readStorySave,newStorySave,validateStoryContent,storyGraph,storyHotkeysOpen,
  STORY_SAVE_KEY,STORY_SAVE_VERSION,type StoryStorage,
} from '../src/city-story.ts';
import {CITY_STORY_CONTENT} from '../src/city-story-content.ts';

const places:Record<StoryPlace,StoryPoint>={hub:[0,0],bay:[800,0],office:[1500,100],park:[900,650],workshop:[400,20]};

const CONTENT:CityStoryContent={
  schemaVersion:1,id:'bay-last-delivery',title:'最后一单',
  synopsis:'从驿站领件，在办公区见阿琳，再决定是否为老陈绕路。',
  firstStep:'hub-pickup',reward:260,
  people:{
    ahui:{name:'阿辉',role:'驿站调度'},alin:{name:'阿琳',role:'收件人'},
    laochen:{name:'老陈',role:'城市工人'},player:{name:'你',role:'配送'},
  },
  steps:[
    {id:'hub-pickup',place:'hub',title:'接到最后一单',objective:'到驿站找阿辉领件',action:'collect',
      lines:[{speaker:'ahui',text:'最后一单，办公区阿琳。别压件。'},{speaker:'player',text:'知道。今天早点收工。'}],next:'office-meet'},
    {id:'office-meet',place:'office',title:'办公区见面',objective:'把包裹交到阿琳手上',action:'talk',
      lines:[{speaker:'alin',text:'谢谢。老陈在公园等零件，你要是顺路……不当必须。'}],
      choices:[
        {id:'detour',label:'绕路去公园找老陈',next:'park-laochen',consequence:'下一站改为公园，再去滨海。'},
        {id:'direct',label:'先把这单送到滨海',next:'bay-direct',consequence:'直接去滨海交付。'},
      ]},
    {id:'park-laochen',place:'park',title:'公园绕路',objective:'把零件交给老陈',action:'deliver',
      lines:[{speaker:'laochen',text:'雨后灯还稳。你帮了大忙。'}],next:'bay-detour'},
    {id:'bay-direct',place:'bay',title:'滨海交付',objective:'把文件送到滨海',action:'deliver',
      lines:[{speaker:'alin',text:'直接过来也好。今晚我自己决定下班。'}],next:'hub-end-direct'},
    {id:'bay-detour',place:'bay',title:'滨海交付',objective:'绕路之后再到滨海',action:'deliver',
      lines:[{speaker:'alin',text:'你还是去了。老陈那边怎么样？'}],next:'hub-end-detour'},
    {id:'hub-end-direct',place:'hub',title:'回驿站结算',objective:'回驿站把单结了',action:'talk',
      lines:[{speaker:'ahui',text:'准时回来。这一单按直送记。'}],terminal:true},
    {id:'hub-end-detour',place:'hub',title:'回驿站结算',objective:'回驿站把单结了',action:'talk',
      lines:[{speaker:'ahui',text:'绕了一段。人情单，我也记一笔。'}],terminal:true},
  ],
};

function frame(at:StoryPoint=[0,0],extra:Partial<StoryFrame>={}):StoryFrame{
  return {x:at[0],z:at[1],speed:0,inVehicle:false,paused:false,blocked:false,debugEpoch:0,...extra};
}
function driveTo(game:StoryGame,state:StoryFrame,to:StoryPoint){
  const from:StoryPoint=[state.x,state.z],dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz),steps=Math.max(1,Math.ceil(length/18));
  for(let i=1;i<=steps;i++){state.x=from[0]+dx*i/steps;state.z=from[1]+dz*i/steps;state.speed=16;state.inVehicle=true;game.tick(state);}
  state.speed=0;state.inVehicle=false;game.tick(state);return state;
}
function talk(game:StoryGame,state:StoryFrame){
  let result=game.interact(state);assert(result.ok,result.message);
  while(game.view.phase==='dialogue'){result=game.interact(state);assert(result.ok,result.message);}
  return result;
}
function memory():StoryStorage{
  const data=new Map<string,string>();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}};
}
function hooks(state:StoryFrame,extra:Partial<StoryHooks>={}):{hooks:StoryHooks;nav:string[];credits:number[];creditOk:boolean}{
  const bag:{hooks:StoryHooks;nav:string[];credits:number[];creditOk:boolean}={nav:[],credits:[],creditOk:true,hooks:null as unknown as StoryHooks};
  bag.hooks={
    places,frame:()=>state,navigate:(point,title)=>bag.nav.push(`go:${point[0]},${point[1]}:${title}`),
    clearRoute:()=>bag.nav.push('clear'),toast:()=>{},setModalOpen:()=>{},
    credit:(_id,amount)=>{bag.credits.push(amount);return bag.creditOk;},
    ...extra,
  };
  return bag;
}

test('malformed saves reset safely; version and id are required',()=>{
  assert.deepEqual(readStorySave(null),newStorySave());
  assert.deepEqual(readStorySave({version:2,id:'bay-last-delivery',phase:'travel'}),newStorySave());
  assert.deepEqual(readStorySave({version:STORY_SAVE_VERSION,id:'other-story',stepId:'hub-pickup'}),newStorySave());
  const dirty=readStorySave({version:1,id:'bay-last-delivery',stepId:1,phase:'teleport',lineIndex:-3,path:[null,'hub-pickup',12],choices:{'office-meet':{id:'x'},ok:1},payout:'jackpot',debugFlagged:'yes'});
  assert.equal(dirty.phase,'idle');assert.equal(dirty.stepId,null);assert.deepEqual(dirty.path,['hub-pickup']);assert.deepEqual(dirty.choices,{});assert.equal(dirty.payout,'none');
  const game=new StoryGame(CONTENT,places,{version:1,id:'bay-last-delivery',stepId:'missing-step',phase:'travel',payout:'paid'});
  assert.equal(game.view.phase,'idle');assert.equal(game.view.payout,'paid');assert.equal(game.active,false);
});

test('refresh restores an in-progress step and cancel clears it for a clean restart',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  assert(game.start(state).ok);talk(game,state);assert.equal(game.view.step?.id,'office-meet');
  const restored=new StoryGame(CONTENT,places,JSON.parse(JSON.stringify(game.save)));
  assert.equal(restored.view.step?.id,'office-meet');assert.equal(restored.view.phase,'travel');assert.deepEqual(restored.view.path,['hub-pickup']);
  assert(restored.cancel().ok);assert.equal(restored.active,false);assert.equal(restored.view.phase,'idle');
  assert(restored.start(state).ok);assert.equal(restored.view.step?.id,'hub-pickup');
});

test('paused and blocked frames cannot start, interact, or treat standing still as progress',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  assert.equal(game.start(frame([0,0],{blocked:true})).ok,false);
  assert.equal(game.start(frame([0,0],{paused:true})).ok,false);
  assert(game.start(state).ok);
  state.paused=true;game.tick(state);assert.equal(game.interact(state).ok,false);assert.equal(game.prompt(state),null);
  state.paused=false;state.blocked=true;game.tick(state);assert.equal(game.interact(state).ok,false);assert.equal(game.skip(state).ok,false);
  state.blocked=false;assert(game.interact(state).ok);assert.equal(game.view.phase,'dialogue');
});

test('own dialog pause still lets continue and choices work; external blocked still locks them',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  game.start(state);assert(game.interact(state).ok);
  state.paused=true;
  assert(game.skip(state).ok);assert.equal(game.view.phase,'dialogue');assert.equal(game.view.step?.lineIndex,1);
  assert(game.interact(state).ok);assert.equal(game.view.step?.id,'office-meet');
  state.paused=false;driveTo(game,state,places.office);talk(game,state);
  state.paused=true;assert(game.choose('direct',state).ok);assert.equal(game.view.step?.id,'bay-direct');
  const locked=new StoryGame(CONTENT,places),hold=frame();
  locked.start(hold);assert(locked.interact(hold).ok);
  hold.blocked=true;hold.paused=true;
  assert.equal(locked.interact(hold).ok,false);assert.equal(locked.skip(hold).ok,false);assert.equal(locked.choose('direct',hold).ok,false);
  assert.equal(locked.view.phase,'dialogue');
});

test('arrival needs a stop, leaving the vehicle, and one action cannot cross two steps',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  assert(game.start(state).ok);
  state.inVehicle=true;assert.equal(game.interact(state).ok,false);
  state.inVehicle=false;state.speed=3;assert.equal(game.interact(state).ok,false);
  state.speed=0;state.x=80;assert.equal(game.interact(state).ok,false);
  state.x=0;assert(game.interact(state).ok);assert.equal(game.view.phase,'dialogue');assert.equal(game.view.step?.lineIndex,0);
  assert(game.interact(state).ok);assert.equal(game.view.step?.lineIndex,1);
  assert(game.interact(state).ok);assert.equal(game.view.step?.id,'office-meet');assert.equal(game.view.phase,'travel');
  assert.equal(game.interact(state).ok,false);assert.equal(game.view.step?.id,'office-meet');
});

test('skip stays on the current step; repeated choice clicks do not jump twice',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  game.start(state);talk(game,state);driveTo(game,state,places.office);talk(game,state);
  assert.equal(game.view.phase,'choice');
  assert.equal(game.choose('no-such',state).ok,false);assert.equal(game.view.phase,'choice');
  assert(game.choose('direct',state).ok);assert.equal(game.view.step?.id,'bay-direct');
  assert.equal(game.choose('detour',state).ok,false);assert.equal(game.view.step?.id,'bay-direct');
  const other=new StoryGame(CONTENT,places),idle=frame();
  other.start(idle);assert(other.interact(idle).ok);assert(other.skip(idle).ok);
  assert.equal(other.view.phase,'dialogue');assert.equal(other.view.step?.id,'hub-pickup');assert.equal(other.view.step?.lineIndex,1);
  assert(other.interact(idle).ok);assert.equal(other.view.step?.id,'office-meet');
});

test('both branches are reachable and change a later place plus the ending line',()=>{
  const graph=storyGraph(CONTENT);
  assert(graph.reachable.has('park-laochen'));assert(graph.reachable.has('bay-direct'));
  assert.deepEqual(new Set(graph.terminals),new Set(['hub-end-direct','hub-end-detour']));
  const walk=(choice:'detour'|'direct')=>{
    const game=new StoryGame(CONTENT,places),state=frame();
    game.start(state);talk(game,state);driveTo(game,state,places.office);talk(game,state);
    assert(game.choose(choice,state).ok);
    const placesSeen=[game.view.step!.place];
    while(game.active&&game.view.phase!=='payout'){
      driveTo(game,state,places[game.view.step!.place]);talk(game,state);
      if(game.view.step)placesSeen.push(game.view.step.place);
    }
    return {placesSeen,end:game.view.step?.line?.text??game.content.steps.find(step=>step.id===game.view.step?.id)?.lines.at(-1)?.text,path:game.view.path,payout:game.view.payout};
  };
  const detour=walk('detour'),direct=walk('direct');
  assert(detour.placesSeen.includes('park'));assert(!direct.placesSeen.includes('park'));
  assert.notEqual(detour.end,direct.end);
  assert(detour.path.includes('park-laochen'));assert(direct.path.includes('bay-direct'));
});

test('failed credits stay pending and can retry; success is not recorded before the hook returns true',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  game.start(state);talk(game,state);driveTo(game,state,places.office);talk(game,state);
  game.choose('direct',state);driveTo(game,state,places.bay);talk(game,state);driveTo(game,state,places.hub);talk(game,state);
  assert.equal(game.view.phase,'payout');assert.equal(game.view.payout,'pending');
  assert.deepEqual(game.payoutRequest(),{id:'bay-last-delivery',amount:260});
  assert.equal(game.confirmPayout(false).ok,false);assert.equal(game.view.payout,'pending');assert.equal(game.view.phase,'payout');
  assert.equal(game.view.completed,false);
  assert(game.confirmPayout(true).ok);assert.equal(game.view.payout,'paid');assert.equal(game.view.phase,'done');
  assert.equal(game.payoutRequest(),null);assert.equal(game.confirmPayout(true).ok,true);
  assert(game.start(state).ok);assert.equal(game.view.payout,'paid');
});

test('illegal content, places, and control actions are rejected without moving the story',()=>{
  const broken={...CONTENT,steps:CONTENT.steps.map(step=>step.id==='office-meet'?{...step,choices:[{id:'bad',label:'x',next:'missing',consequence:'no'}]}:step)};
  assert(validateStoryContent(broken as CityStoryContent).some(message=>message.includes('未知')));
  assert.throws(()=>new StoryGame({...CONTENT,firstStep:'ghost'},places));
  assert.throws(()=>new StoryGame(CONTENT,{...places,bay:[Number.NaN,0]}));
  const game=new StoryGame(CONTENT,places),state=frame();
  assert.equal(game.choose('direct',state).ok,false);
  assert.equal(game.cancel().ok,false);
  assert.equal(game.interact(state).ok,false);
  assert.equal(game.retryStep(state).ok,false);
  assert(game.start(state).ok);
  const step=game.view.step?.id;
  assert.equal(game.choose('direct',state).ok,false);assert.equal(game.view.step?.id,step);
});

test('debugEpoch teleports cannot finish a leg; retry and cancel-restart are the recovery paths',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  game.start(state);talk(game,state);
  state.debugEpoch=1;state.x=places.office[0];state.z=places.office[1];game.tick(state);
  assert.equal(game.view.debugFlagged,true);assert.equal(game.interact(state).ok,false);
  assert(game.retryStep(state).ok);assert.equal(game.view.debugFlagged,false);assert.equal(game.view.mustLeave,true);
  assert.equal(game.interact(state).ok,false);
  driveTo(game,state,[places.office[0]-80,places.office[1]]);
  assert.equal(game.view.mustLeave,false);
  driveTo(game,state,places.office);assert(talk(game,state));assert.equal(game.view.phase,'choice');
  const retry=new StoryGame(CONTENT,places),again=frame();
  retry.start(again);talk(retry,again);
  again.debugEpoch=4;again.x=places.office[0];again.z=places.office[1];retry.tick(again);
  assert(retry.cancel().ok);assert(retry.start(again).ok);assert.equal(retry.view.step?.id,'hub-pickup');assert.equal(retry.view.debugFlagged,false);
});

test('runtime persists across refresh, navigates once, and retries a failed wallet credit',()=>{
  const store=memory(),state=frame();
  const first=hooks(state);first.creditOk=false;
  const runtime=createStoryRuntime(CONTENT,first.hooks,store);
  assert(runtime.start().ok);assert.equal(first.nav.filter(item=>item.startsWith('go:')).length,1);
  runtime.tick();runtime.tick();runtime.tick();
  assert.equal(first.nav.filter(item=>item.startsWith('go:')).length,1);
  talk(runtime.game,state);runtime.tick();
  assert(first.nav.some(item=>item.includes('办公区见面')));
  const saved=JSON.parse(store.getItem(STORY_SAVE_KEY)!);
  assert.equal(saved.stepId,'office-meet');
  const resumed=createStoryRuntime(CONTENT,hooks(state).hooks,store);
  assert.equal(resumed.view.step?.id,'office-meet');
  driveTo(resumed.game,state,places.office);talk(resumed.game,state);resumed.choose('direct');
  driveTo(resumed.game,state,places.bay);talk(resumed.game,state);
  driveTo(resumed.game,state,places.hub);talk(resumed.game,state);
  const pay=hooks(state);pay.creditOk=false;
  const paying=createStoryRuntime(CONTENT,pay.hooks,memory());
  paying.start();talk(paying.game,state);driveTo(paying.game,state,places.office);talk(paying.game,state);
  paying.choose('direct');driveTo(paying.game,state,places.bay);talk(paying.game,state);
  driveTo(paying.game,state,places.hub);talk(paying.game,state);paying.tick();
  assert.equal(paying.view.payout,'pending');assert.equal(pay.credits.length,1);
  assert.equal(paying.tryPayout(),false);assert.equal(paying.view.payout,'pending');
  pay.creditOk=true;assert.equal(paying.tryPayout(),true);assert.equal(paying.view.payout,'paid');
  assert.equal(paying.tryPayout(),false);assert.equal(pay.credits.length,3);
  state.blocked=true;const blockedNav=hooks(state);const blocked=createStoryRuntime(CONTENT,blockedNav.hooks,memory());
  assert.equal(blocked.start().ok,false);assert.equal(blockedNav.nav.length,0);
});

test('setModalOpen pause from our own dialog does not freeze continue; blocked still closes the panel',()=>{
  const state=frame();
  const bag=hooks(state);
  bag.hooks.setModalOpen=(open)=>{state.paused=open;};
  const runtime=createStoryRuntime(CONTENT,bag.hooks,memory());
  assert(runtime.start().ok);assert.equal(state.paused,false);
  assert(runtime.interact());assert.equal(runtime.view.phase,'dialogue');assert.equal(state.paused,true);
  assert(runtime.interact());assert.equal(runtime.view.step?.lineIndex,1);
  runtime.setPanelOpen(false);assert.equal(state.paused,false);
  runtime.setPanelOpen(true);assert.equal(state.paused,true);
  state.blocked=true;runtime.tick();assert.equal(state.paused,false);
  assert.equal(runtime.skip().ok,false);assert.equal(runtime.view.phase,'dialogue');
  const settled=new StoryGame(CONTENT,places,{...newStorySave(),phase:'payout',stepId:'hub-end-direct',payout:'pending'});
  assert(settled.confirmPayout(true).ok);assert.equal(settled.payoutRequest(),null);assert.equal(settled.confirmPayout(true).ok,true);
});

test('distant E yields; hidden dialogue does not consume; payout releases pause immediately',()=>{
  const state=frame();
  const bag=hooks(state);
  bag.hooks.setModalOpen=(open)=>{state.paused=open;};
  const runtime=createStoryRuntime(CONTENT,bag.hooks,memory());
  assert(runtime.start().ok);
  state.x=400;state.z=0;assert.equal(runtime.interact(),false);assert.equal(runtime.view.phase,'travel');assert.equal(state.paused,false);
  state.x=0;state.inVehicle=true;assert.equal(runtime.interact(),true);assert.equal(runtime.view.phase,'travel');
  state.inVehicle=false;assert(runtime.interact());assert.equal(runtime.view.phase,'dialogue');assert.equal(state.paused,true);
  runtime.setPanelOpen(false);assert.equal(state.paused,false);
  state.x=400;assert.equal(runtime.interact(),false);assert.equal(runtime.view.phase,'dialogue');assert.equal(state.paused,false);
  state.x=0;assert.equal(runtime.interact(),true);assert.equal(state.paused,true);
  assert(runtime.skip().ok);assert(runtime.interact());assert.equal(runtime.view.step?.id,'office-meet');assert.equal(state.paused,false);
  driveTo(runtime.game,state,places.office);talk(runtime.game,state);runtime.choose('direct');
  driveTo(runtime.game,state,places.bay);talk(runtime.game,state);
  driveTo(runtime.game,state,places.hub);
  assert(runtime.interact());
  while(runtime.view.phase==='dialogue')assert(runtime.interact());
  assert.equal(runtime.view.payout,'paid');assert.equal(runtime.view.phase,'done');assert.equal(state.paused,false);
});

test('travel interact yields when far or blocked; only a real prompt or open dialog consumes E',()=>{
  const state=frame(),bag=hooks(state),runtime=createStoryRuntime(CONTENT,bag.hooks,memory());
  assert(runtime.start().ok);
  state.x=400;assert.equal(runtime.prompt(),null);assert.equal(runtime.interact(),false);assert.equal(runtime.view.phase,'travel');
  state.x=0;state.blocked=true;assert.equal(runtime.prompt(),null);assert.equal(runtime.interact(),false);
  state.blocked=false;state.inVehicle=true;assert.ok(runtime.prompt());assert.equal(runtime.interact(),true);assert.equal(runtime.view.phase,'travel');
});

test('leaving a collapsed dialogue keeps the line; continue and reopen require the same place, a stop, and being on foot',()=>{
  const game=new StoryGame(CONTENT,places),state=frame();
  game.start(state);assert(game.interact(state).ok);assert.equal(game.view.step?.lineIndex,0);
  state.x=400;assert.equal(game.prompt(state),null);
  assert.equal(game.interact(state).ok,false);assert.equal(game.skip(state).ok,false);
  assert.equal(game.view.phase,'dialogue');assert.equal(game.view.step?.lineIndex,0);
  state.x=0;state.speed=4;assert.equal(game.interact(state).ok,false);assert.equal(game.view.step?.lineIndex,0);
  state.speed=0;state.inVehicle=true;assert.equal(game.readyToTalk(state).ok,false);assert.equal(game.view.step?.lineIndex,0);
  state.inVehicle=false;assert(game.interact(state).ok);assert.equal(game.view.step?.lineIndex,1);
  game.interact(state);driveTo(game,state,places.office);talk(game,state);
  assert.equal(game.view.phase,'choice');
  state.x=places.office[0]+200;state.z=places.office[1];
  assert.equal(game.choose('direct',state).ok,false);assert.equal(game.view.phase,'choice');assert.equal(game.view.step?.id,'office-meet');
  state.x=places.office[0];state.z=places.office[1];assert(game.choose('direct',state).ok);
});

test('story hotkeys only fire for a visible interactive dialog, not a blocked or hidden panel',()=>{
  const open={phase:'dialogue' as const,collapsed:false,blocked:false,dialogHidden:false};
  assert.equal(storyHotkeysOpen(open),true);
  assert.equal(storyHotkeysOpen({...open,phase:'choice'}),true);
  assert.equal(storyHotkeysOpen({...open,blocked:true}),false);
  assert.equal(storyHotkeysOpen({...open,dialogHidden:true}),false);
  assert.equal(storyHotkeysOpen({...open,collapsed:true}),false);
  assert.equal(storyHotkeysOpen({...open,phase:'travel'}),false);
  assert.equal(storyHotkeysOpen({...open,phase:'payout'}),false);
});

test('collapsed dialogue stays closed when still moving or in the vehicle; progress is unchanged',()=>{
  const state=frame();
  const bag=hooks(state);
  bag.hooks.setModalOpen=(open)=>{state.paused=open;};
  const runtime=createStoryRuntime(CONTENT,bag.hooks,memory());
  runtime.start();assert(runtime.interact());assert.equal(runtime.view.step?.lineIndex,0);assert.equal(state.paused,true);
  runtime.setPanelOpen(false);assert.equal(state.paused,false);
  state.inVehicle=true;assert.equal(runtime.interact(),true);assert.equal(runtime.view.step?.lineIndex,0);assert.equal(state.paused,false);
  state.inVehicle=false;state.speed=4;assert.equal(runtime.interact(),true);assert.equal(runtime.view.step?.lineIndex,0);assert.equal(state.paused,false);
  state.speed=0;assert.equal(runtime.interact(),true);assert.equal(runtime.view.step?.lineIndex,1);assert.equal(state.paused,true);
});

test('successful payout closes the modal in the same call, before the next tick',()=>{
  const state=frame(),modals:boolean[]=[];
  const bag=hooks(state);
  bag.hooks.setModalOpen=(open)=>{modals.push(open);state.paused=open;};
  const runtime=createStoryRuntime(CONTENT,bag.hooks,memory());
  runtime.start();assert(runtime.interact());
  while(runtime.view.phase==='dialogue')assert(runtime.interact());
  driveTo(runtime.game,state,places.office);talk(runtime.game,state);runtime.choose('direct');
  driveTo(runtime.game,state,places.bay);talk(runtime.game,state);driveTo(runtime.game,state,places.hub);
  assert(runtime.interact());
  while(runtime.view.phase==='dialogue')assert(runtime.interact());
  assert.equal(runtime.view.phase,'done');assert.equal(runtime.view.payout,'paid');
  assert.equal(modals.at(-1),false);assert.equal(state.paused,false);
});

test('official content keeps dialogue on configured places, including the same-place office spare',()=>{
  assert.equal(validateStoryContent(CITY_STORY_CONTENT).length,0);
  const graph=storyGraph(CITY_STORY_CONTENT);
  assert(graph.reachable.has('office-spare'));assert(graph.reachable.has('park-help'));
  const game=new StoryGame(CITY_STORY_CONTENT,places),state=frame();
  assert(game.start(state).ok);talk(game,state);assert.equal(game.view.step?.place,'office');
  driveTo(game,state,places.office);talk(game,state);
  assert(game.choose('detour-park',state).ok);assert.equal(game.view.step?.id,'office-spare');assert.equal(game.view.step?.place,'office');
  assert(game.atObjective(state));assert(talk(game,state));assert.equal(game.view.step?.place,'park');
  driveTo(game,state,places.park);talk(game,state);assert.equal(game.view.step?.place,'bay');
});
