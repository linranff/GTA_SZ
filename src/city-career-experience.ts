import './city-career.css';
import {CareerGame,CAREER_SAVE_KEY,readCareerSave,type CareerAction,type CareerFrame,type CareerRole,type CareerUpgradeId,type CareerPoint} from './city-career.ts';
import {createObjectiveMarker} from './city-objective-marker.ts';
import type {DrivingWorld} from './city-world.ts';
import type {Landmark,V2} from './city-types.ts';
import type {Ride,ActiveRide} from './city-life.ts';
import type {RoadGraph} from './navigation.ts';

type Site={id:string;name:string;x:number;z:number;heading:number;arrival:CareerPoint;yaw:number};
type Hooks={toast:(message:string)=>void;close:()=>void;open:()=>void;menuOpen:()=>boolean;navigate:(destination:Landmark,route:V2[])=>void;clearRoute:()=>void;legacy:{rides:()=>Ride[];active:()=>ActiveRide|null;start:(ride:Ride)=>void;cancel:()=>void}};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const yuan=(n:number)=>'¥ '+Math.floor(n).toLocaleString('zh-CN');
const minutes=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.ceil(seconds%60)).padStart(2,'0')}`;
const mechanism={delivery:'准时配送',comfort:'平稳接送',service:'多站巡检'};
export async function createCareerExperience(world:DrivingWorld,graph:RoadGraph,hooks:Hooks){
 const sites:Site[]=(await(await fetch('/city/life-sites.json')).json()).sites;
 const hub=sites.find(s=>s.id==='hub')!,office=sites.find(s=>s.id==='office')!,workshop=sites.find(s=>s.id==='workshop')!;
 const spawn=world.data.spawn;
 const bayRoad=world.collision.nearest(spawn.x+Math.sin(spawn.yaw)*950,spawn.z+Math.cos(spawn.yaw)*950);
 const bay:CareerPoint=bayRoad?[bayRoad.x,bayRoad.z]:world.data.landmarks.find(m=>m.id==='bamboo')!.arrival;
 let raw:unknown=null,legacy:unknown=null;try{raw=JSON.parse(localStorage.getItem(CAREER_SAVE_KEY)??'null');legacy=JSON.parse(localStorage.getItem('shenchengji-city-life-v1')??'null');}catch{}
 const game=new CareerGame({hub:hub.arrival,bay,office:office.arrival,park:workshop.arrival,workshop:office.arrival},readCareerSave(raw,legacy));
 const panel=document.querySelector<HTMLElement>('#life-journal')!,host=document.querySelector<HTMLElement>('#ui')!;
 panel.classList.add('career-panel');
 const hud=document.createElement('section');hud.id='career-objective';hud.hidden=true;hud.innerHTML='<div class=career-status></div><button data-hud-auto>自动前往</button><button data-hud-journal>城市手账 <kbd>J</kbd></button><button data-dismiss>收起</button>';host.append(hud);const hudBody=hud.querySelector<HTMLElement>('.career-status')!;
 const walkHelp=document.createElement('div');walkHelp.id='walk-help';walkHelp.hidden=true;host.append(walkHelp);
 const invitation=document.createElement('button');invitation.id='career-invitation';invitation.innerHTML='<small>第一章 · 雨停以后</small><strong>城市这么大，先把今天过好。</strong><span>去一个新的角落 · 认识一个人 · 攒自己的房间 <kbd>J</kbd></span>';invitation.onclick=hooks.open;host.append(invitation);
 const marker=createObjectiveMarker(world.scene,host,(x,z)=>world.groundHeight(x,z));
 let tab:'jobs'|'growth'|'people'|'stories'='jobs',objectiveKey='',hudTime=0,lastMode=world.lightMode;
 let receipt:{message:string;amount:number}|null=null,dismissed=false;
 hud.querySelector<HTMLButtonElement>('[data-hud-auto]')!.onclick=()=>navigate(true);
 hud.querySelector<HTMLButtonElement>('[data-hud-journal]')!.onclick=()=>{if(game.choice)tab='people';hooks.open();};
 hud.querySelector<HTMLButtonElement>('[data-dismiss]')!.onclick=()=>{receipt=null;dismissed=true;hud.hidden=true;};
 function frame(dt=0):CareerFrame{const a=world.actor;return {dt,position:[a.x,a.z],speed:a.speed,odometer:world.state.distance,debugEpoch:world.debugEpoch,yaw:a.yaw,paused:world.paused,inVehicle:!world.walk?.active};}
 function persist(){try{localStorage.setItem(CAREER_SAVE_KEY,JSON.stringify(game.save));}catch{hooks.toast('本次进度保留在运行中，浏览器未允许写入存档');}}
 function destination():Landmark|null{const a=game.active;if(!a)return null;const p=a.objective.position,n=world.collision.nearest(...p);return {id:'career:'+a.jobId+':'+a.objectiveIndex,name:a.objective.label,area:'城市生活',x:p[0],z:p[1],arrival:p,height:0,excludeRadius:0,yaw:n?.yaw??0};}
 function navigate(auto=false){const d=destination();if(!d)return;hooks.navigate(d,graph.route([world.state.x,world.state.z],d.arrival));if(auto)world.startAutoDrive(d);}
 function syncObjective(){const a=game.active,key=a?a.jobId+':'+a.objectiveIndex:'';if(key===objectiveKey)return;objectiveKey=key;marker.set(a?{position:a.objective.position,label:a.objective.label}:null);if(a)navigate();else hooks.clearRoute();}
 function action(result:CareerAction,close=false){
  if(!result.ok){hooks.toast(result.message);return false;}
  persist();dismissed=false;const paid=result.events.find(e=>e.type==='completed');if(paid){receipt={message:paid.message,amount:paid.amount??0};world.audio.cue('arrival');}
  syncObjective();render();if(close)hooks.close();hooks.toast(result.message);return true;
 }
 function render(){
  const v=game.view;document.querySelector('#wallet')!.textContent=yuan(v.cash);
  const active=v.active;
  panel.innerHTML=`<div class="career-heading"><div><small>SHENZHEN / AFTER THE RAIN</small><h2>把今天过好。</h2><p>打工、看海，也留一点时间给自己。</p></div><button data-close aria-label="关闭生活手账">返回城市 <kbd>J</kbd></button></div>
   <div class="career-account"><div><small>可支配余额</small><strong>${yuan(v.cash)}</strong></div><div><small>累计日结</small><strong>${yuan(v.totalEarned)}</strong></div><div><small>完成合约</small><strong>${String(v.completedCount).padStart(2,'0')} <i>单</i></strong></div><div><small>自己的房间基金</small><strong>${v.roomFund?'已留好安居金':yuan(v.cash)+' / 1,800'}</strong><progress max="1800" value="${v.roomFund?1800:Math.min(1800,v.cash)}"></progress></div></div>
   <nav class="career-tabs">${[['jobs','找点事做'],['growth','攒钱与升级'],['people','人与消息'],['stories','沿途故事']].map(([id,label])=>`<button data-tab="${id}" aria-selected="${tab===id}">${label}${id==='people'&&v.pendingChoice?' <i class="unread"></i>':''}</button>`).join('')}</nav>
   <div class="career-content">${tab==='jobs'?`
    <div class="career-roles">${v.roles.map(r=>`<button data-role="${r.id}" class="${r.selected?'selected':''}" ${active?'disabled':''}><small>Lv. ${r.level}</small><strong>${r.label}</strong><span>${r.subtitle}</span></button>`).join('')}</div>
    <div class="career-level"><span>当前身份 Lv. ${v.level} · ${v.xp} / ${v.nextLevelXp} XP</span><progress value="${v.xp%200}" max="200"></progress><small>每完成 2 单，解锁进阶合约</small></div>
    ${active?`<article class="career-active"><small>正在进行 · 第 ${active.objectiveIndex+1} / ${active.objectiveCount} 站</small><h3>${esc(active.title)}</h3><p>${esc(active.objective.label)}</p>${active.invalid?'<p class="warning">这趟用过调试跳转，结束后重接即可正常结算。</p>':''}<div><button data-continue>继续这一程</button><button data-auto>自动前往</button><button data-cancel class="quiet">结束合约</button></div></article>`:''}
    <div class="career-jobs">${v.jobs.map(j=>`<article><div class="job-top"><span>${mechanism[j.mechanic]}</span><small>${j.completed?'已完成 '+j.completed+' 次':'可重复接单'}</small></div><h3>${esc(j.title)}</h3><p>${esc(j.description)}</p><div class="job-pay"><strong>${yuan(j.basePay)}</strong><span>基础工钱 + 品质与熟人奖金</span></div><button data-job="${j.id}" ${!j.unlocked||active||v.pendingChoice||hooks.legacy.active()?'disabled':''}>${!j.unlocked?'Lv. '+j.requiredLevel+' 解锁':v.pendingChoice?'先回复刚刚收到的消息':active?'完成当前合约后再接':hooks.legacy.active()?'先在沿途故事里结束旧顺路单':'接下这份活'}</button></article>`).join('')}</div>
    <p class="career-note">接单后前往实景标记处，停车按 E 交接。巡检需要原地作业；F 可下车步行。调试跳转不会结算当前合约。</p>`:tab==='growth'?`
    <div class="career-section-title"><h3>赚到的钱，让下一次更从容。</h3><p>升级会改变实际任务规则；不提高价格、不重置进度。</p></div><div class="career-upgrades">${v.upgrades.map(u=>`<article><small>${u.owned?'已经拥有':'一次购买 · 长期生效'}</small><h3>${u.title}</h3><p>${u.description}</p><button data-buy="${u.id}" ${u.owned||!u.affordable||active?'disabled':''}>${u.owned?'已购入':active?'结束本单后升级':u.affordable?'购入 · '+yuan(u.cost):'还差 '+yuan(u.cost-v.cash)}</button></article>`).join('')}</div><div class="career-supply"><div><h3>热饭与水 · ¥ 18</h3><p>到海湾生活驿站补给。下单舒适损失减少 15%，完成另加 ¥ 18。</p></div><button data-supply ${v.supplied||active?'disabled':''}>${v.supplied?'已备好，下一单生效':'在驿站补给'}</button><button data-hub class="quiet">带我去驿站</button></div>`:tab==='people'?`
    <div class="career-people">${[['阿辉','ahui','不把日结的人生当作笑话'],['阿琳','alin','慢慢熟悉，边界与关系都由你决定'],['老陈','laochen','城市亮起来，有人才能下班']].map(([name,id,sub])=>`<article><span class="person-seal">${name.slice(-1)}</span><div><h3>${name}</h3><p>${sub}</p><small>熟悉程度 ${v.relations[id as keyof typeof v.relations]} / 20 · 影响熟人奖金</small></div></article>`).join('')}</div>${v.pendingChoice?`<article class="career-conversation"><small>来自 ${v.pendingChoice.person} 的新消息</small><h3>${v.pendingChoice.title}</h3><blockquote>${v.pendingChoice.line}</blockquote>${v.pendingChoice.options.map(o=>`<button data-choice="${o.id}" ${!o.affordable?'disabled':''}><strong>${o.label}</strong><span>${o.consequence}</span></button>`).join('')}</article>`:'<div class="career-empty"><h3>故事会在一程一程之间发生。</h3><p>每个身份完成第一单、第三单后，会收到不同的消息。不花钱也可以认真经营关系。</p></div>'}`:`
    ${hooks.legacy.active()?'<article class="career-active"><h3>有一段顺路故事进行中</h3><p>继续完成，或在这里结束后自由切换职业合约。</p><button data-cancel-legacy>结束这段顺路单</button></article>':''}<div class="career-section-title"><h3>旧日的三段顺路故事，仍然在。</h3><p>这些虚构人物的初次相遇是一次性故事，收入与现在的生活钱包共用。</p></div><div class="career-jobs">${hooks.legacy.rides().map(r=>`<article><small>${r.person}</small><h3>${r.title}</h3><p>${r.description}</p><button data-legacy="${r.id}" ${game.save.legacyCompleted.includes(r.id)||active?'disabled':''}>${game.save.legacyCompleted.includes(r.id)?'这一程，已经记下了':hooks.legacy.active()?.id===r.id?'继续这一程':'接下顺路单 · '+yuan(r.reward)}</button></article>`).join('')}</div>`}</div>
   <footer class="career-footer"><span>存档保存在本浏览器 · 进行中的合约刷新后需重接</span><span>L 光照 · F 上下车 · M 地图 · J 手账</span></footer>`;
  const on=(selector:string,handler:(b:HTMLButtonElement)=>void)=>panel.querySelectorAll<HTMLButtonElement>(selector).forEach(b=>b.onclick=()=>handler(b));
  on('[data-close]',()=>hooks.close());on('[data-tab]',b=>{tab=b.dataset.tab as typeof tab;render();});
  on('[data-role]',b=>action(game.selectRole(b.dataset.role as CareerRole)));
  on('[data-job]',b=>{receipt=null;action(game.accept(b.dataset.job!,frame()),true);});
  on('[data-buy]',b=>action(game.purchase(b.dataset.buy as CareerUpgradeId)));
  on('[data-choice]',b=>action(game.choose(b.dataset.choice!)));
  on('[data-cancel]',()=>action(game.cancel()));on('[data-continue]',()=>{navigate();hooks.close();});on('[data-auto]',()=>{hooks.close();navigate(true);});
  on('[data-supply]',()=>action(game.replenish({...frame(),paused:false})));
  on('[data-hub]',()=>{const d:Landmark={id:'life-hub',name:hub.name,x:hub.x,z:hub.z,height:0,area:'城市生活',excludeRadius:0,arrival:hub.arrival,yaw:hub.yaw};hooks.navigate(d,graph.route([world.state.x,world.state.z],hub.arrival));hooks.close();hooks.toast('停好车，按 F 下车逛逛生活驿站');});
  on('[data-cancel-legacy]',()=>{hooks.legacy.cancel();render();hooks.toast('顺路单已结束，工钱和已完成的故事不变');});
  on('[data-legacy]',b=>{const r=hooks.legacy.rides().find(r=>r.id===b.dataset.legacy);if(r)hooks.legacy.start(r);});
 }
 function tick(dt:number){
  const events=game.tick(frame(dt));if(events.length){hooks.toast(events.at(-1)!.message);persist();}syncObjective();
  marker.update(world.camera,world.actor.x,world.actor.z,world.observer.active||hooks.menuOpen());
  walkHelp.hidden=!world.walk?.active||hooks.menuOpen()||world.observer.active;
  if(!walkHelp.hidden){const d=Math.round(Math.hypot(world.actor.x-world.state.x,world.actor.z-world.state.z));walkHelp.textContent=`步行探索 · WASD 移动 · 拖动 / 方向键看四周 · Shift 快走 · F 上车${d>5?' · 车辆 '+d+' m':''}`;}
  hudTime+=dt;if(hudTime<.15)return;hudTime=0;
  const a=game.active,v=game.view;
  invitation.hidden=!!a||v.completedCount>0||!!hooks.legacy.active()||hooks.menuOpen()||world.observer.active||world.state.distance>300;
  hud.hidden=hooks.menuOpen()||world.observer.active||dismissed||(!a&&!receipt&&!v.pendingChoice);
  hud.querySelector<HTMLButtonElement>('[data-hud-auto]')!.hidden=!a||!!world.walk?.active;hud.querySelector<HTMLButtonElement>('[data-dismiss]')!.hidden=!!a;
  if(a){hudBody.innerHTML=`<small>${mechanism[a.mechanic]} · 第 ${a.objectiveIndex+1}/${a.objectiveCount} 站</small><strong>${esc(a.title)}</strong><span>${esc(a.objective.label)}</span><div class="objective-metrics"><b>${a.mechanic==='delivery'?minutes(a.remainingSeconds):a.mechanic==='comfort'?'舒适 '+a.quality:'作业 '+Math.round(a.holdProgress*100)+'%'}<i>${a.mechanic==='delivery'?'剩余时间':a.mechanic==='comfort'?'/ 100':'原地停稳'}</i></b><b>品质 ${a.quality}<i>${a.invalid?'调试单 · 不结算':yuan(a.basePay)+' + 奖金'}</i></b></div>${a.mechanic==='service'&&a.objective.kind==='service'?`<progress max="1" value="${a.holdProgress}"></progress>`:''}`;
  }else if(receipt||v.pendingChoice){hudBody.innerHTML=`<small>${receipt?'日结到账':'收到一条消息'}</small><strong>${receipt?'+'+yuan(receipt.amount):v.pendingChoice!.title}</strong><span>${receipt?esc(receipt.message):'有人想和你聊聊这一程。'}</span>`;}
  else hudBody.textContent='';
  if(lastMode!==world.lightMode){lastMode=world.lightMode;for(const h of hubs)h.setMode(lastMode);}
 }
 function interact(){if(!game.active)return false;action(game.interact(frame()));return true;}
 // Landmark meshes take part in the existing shadow/reflection lists. No second city scene.
 const hubs:Awaited<ReturnType<typeof import('./city-life-hub.ts')['createCityLifeHub']>>[]=[];
 async function loadHubs(){try{const {createCityLifeHub}=await import('./city-life-hub.ts');for(const s of sites){const h=await createCityLifeHub(world.scene,{x:s.x,z:s.z,heading:s.heading,height:world.groundHeight(s.x,s.z)});h.setMode(world.lightMode);hubs.push(h);world.propObstacles.push(s);world.landmarks.push(...h.meshes);world.cull();}}catch(e){console.error('生活驿站模型载入失败',e);hooks.toast('生活驿站模型暂未载入，合约和存档仍可使用');}}
 void loadHubs();persist();render();
 return {game,render,tick,interact,prompt:()=>game.prompt(frame()),get sites(){return sites;},get hubs(){return hubs.map(h=>({name:h.root.name,position:h.root.position.asArray()}));},creditLegacy(id:string,amount:number){action(game.creditLegacy(id,amount));},dispose(){marker.dispose();hubs.forEach(h=>h.dispose());hud.remove();walkHelp.remove();invitation.remove();}};
}
