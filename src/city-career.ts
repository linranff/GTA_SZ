/** Pure, deterministic city-life simulation. World/UI supply position and a monotonic debug epoch. */
export type CareerPoint = [number, number];
export type CareerRole = 'day-worker' | 'office' | 'city-worker';
export type CareerPlaceId = 'hub' | 'bay' | 'office' | 'park' | 'workshop';
export type CareerPlaces = Record<CareerPlaceId, CareerPoint>;
export type CareerMechanic = 'delivery' | 'comfort' | 'service';
export type CareerUpgradeId = 'insulated-box' | 'comfort-kit' | 'work-tools' | 'room-fund';
export type CareerFrame = {dt:number;position:CareerPoint;speed:number;odometer:number;debugEpoch:number;yaw?:number;paused?:boolean;inVehicle?:boolean};
export type CareerObjective = {id:string;label:string;position:CareerPoint;action:string;kind:'pickup'|'dropoff'|'service';holdSeconds:number};
export type CareerJob = {id:string;role:CareerRole;title:string;person:string;description:string;mechanic:CareerMechanic;basePay:number;requiredLevel:number;deadline:number;objectives:CareerObjective[];pickupLine:string;arrivalLine:string};
export type CareerEvent = {type:'message'|'objective'|'completed'|'choice'|'purchase';message:string;amount?:number;jobId?:string};
export type CareerAction = {ok:boolean;message:string;events:CareerEvent[]};
export type CareerSave = {version:2;cash:number;role:CareerRole;xp:Record<CareerRole,number>;completed:Record<string,number>;upgrades:CareerUpgradeId[];relations:Record<'ahui'|'alin'|'laochen',number>;choices:Record<string,string>;pendingChoice:string|null;supplied:boolean;totalEarned:number;legacyCompleted:string[]};
export type CareerChoiceOption = {id:string;label:string;consequence:string;cost:number;relationship:number};
export type CareerChoice = {id:string;person:string;title:string;line:string;relation:keyof CareerSave['relations'];options:CareerChoiceOption[]};
export type CareerUpgrade = {id:CareerUpgradeId;title:string;description:string;cost:number};
type ActiveContract = {jobId:string;objectiveIndex:number;elapsed:number;hold:number;quality:number;actualDistance:number;legDistance:number;legDrivenDistance:number;lastOdometer:number;invalid:boolean;debugEpoch:number;lastPosition:CareerPoint;lastSpeed:number;lastYaw:number|undefined;startOdometer:number;restBonus:boolean};
export const CAREER_SAVE_KEY = 'shenchengji-city-career-v2';
export const CAREER_ROLES: readonly {id:CareerRole;label:string;subtitle:string;person:string}[] = [
 {id:'day-worker',label:'日结打工者',subtitle:'多跑一趟，今天的工钱今天拿',person:'阿辉'},
 {id:'office',label:'年轻职场人',subtitle:'工作之外，也经营自己的生活',person:'阿琳'},
 {id:'city-worker',label:'城市工人',subtitle:'把看不见的日常，照顾妥当',person:'老陈'},
];
export const CAREER_UPGRADES: readonly CareerUpgrade[] = [
 {id:'insulated-box',title:'保温配送箱',description:'配送时限增加 35%，迟到后的品质损失减半。',cost:420},
 {id:'comfort-kit',title:'座椅与缓冲套件',description:'接送时急刹与急转造成的舒适度损失减少 45%。',cost:560},
 {id:'work-tools',title:'便携巡检工具',description:'每处作业时间缩短 40%，工人合约增加 ¥ 25 工具补贴。',cost:390},
 {id:'room-fund',title:'自己的房间基金',description:'留出 ¥ 1,800 安居金，所有合约增加 8% 长期稳定奖励。',cost:1800},
];
const isRecord = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const money = (v:unknown,fallback=0) => typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.min(1e7,Math.floor(v)):fallback;
const roleIds = CAREER_ROLES.map(r=>r.id);
const upgradeIds = CAREER_UPGRADES.map(u=>u.id);
const dictNumbers=(v:unknown):Record<string,number>=>Object.fromEntries(isRecord(v)?Object.entries(v).filter(([k,n])=>k.length<100&&typeof n==='number'&&Number.isFinite(n)&&n>=0).map(([k,n])=>[k,money(n)]):[]);
const dictStrings=(v:unknown):Record<string,string>=>Object.fromEntries(isRecord(v)?Object.entries(v).filter((entry):entry is [string,string]=>entry[0].length<100&&typeof entry[1]==='string'&&entry[1].length<100):[]);
export function newCareerSave():CareerSave {return {version:2,cash:180,role:'day-worker',xp:{'day-worker':0,office:0,'city-worker':0},completed:{},upgrades:[],relations:{ahui:0,alin:0,laochen:0},choices:{},pendingChoice:null,supplied:false,totalEarned:0,legacyCompleted:[]};}
/** v2 survives reload; the prior three-story wallet migrates once. Active jobs never survive reload. */
export function readCareerSave(value:unknown,legacy?:unknown):CareerSave {
 const fresh=newCareerSave();
 if(!isRecord(value)||value.version!==2||typeof value.cash!=='number'||!Number.isFinite(value.cash)||value.cash<0){
  if(isRecord(legacy)&&legacy.version===1&&typeof legacy.cash==='number'&&Number.isFinite(legacy.cash)&&legacy.cash>=0){fresh.cash=money(legacy.cash,180);fresh.legacyCompleted=Array.isArray(legacy.completed)?[...new Set(legacy.completed.filter((v):v is string=>typeof v==='string'&&v.length<100))]:[];}
  return fresh;
 }
 const xp=dictNumbers(value.xp),relations=dictNumbers(value.relations),choices=dictStrings(value.choices);
 return {...fresh,cash:money(value.cash),role:roleIds.includes(value.role as CareerRole)?value.role as CareerRole:fresh.role,
  xp:{'day-worker':xp['day-worker']??0,office:xp.office??0,'city-worker':xp['city-worker']??0},completed:dictNumbers(value.completed),
  upgrades:Array.isArray(value.upgrades)?[...new Set(value.upgrades.filter((v):v is CareerUpgradeId=>upgradeIds.includes(v as CareerUpgradeId)))]:[],
  relations:{ahui:Math.min(20,relations.ahui??0),alin:Math.min(20,relations.alin??0),laochen:Math.min(20,relations.laochen??0)},choices,
  pendingChoice:typeof value.pendingChoice==='string'&&CHOICES.some(c=>c.id===value.pendingChoice)&&!choices[value.pendingChoice]?value.pendingChoice:null,
  supplied:value.supplied===true,totalEarned:money(value.totalEarned),legacyCompleted:Array.isArray(value.legacyCompleted)?[...new Set(value.legacyCompleted.filter((v):v is string=>typeof v==='string'&&v.length<100))]:[],
 };
}
const CHOICES: readonly CareerChoice[] = [
 {id:'ahui-first',person:'阿辉',relation:'ahui',title:'今天值得吃顿好的',line:'“这单结了。去驿站拼个热饭？一个人吃总想凑合。”',options:[{id:'share',label:'请他一起吃热饭 · ¥ 32',consequence:'阿辉关系 +3，下次开工自带补给；工钱照常到账。',cost:32,relationship:3},{id:'save',label:'留着房租，坐一会儿聊聊天',consequence:'阿辉关系 +1，不花钱也能认真相处。',cost:0,relationship:1}]},
 {id:'alin-first',person:'阿琳',relation:'alin',title:'工作群又亮了',line:'“能再去海边走两分钟吗？今天我想自己决定几点下班。”',options:[{id:'boundary',label:'陪她把手机调成勿扰',consequence:'阿琳关系 +3，解锁一条更私人的后续对话。',cost:0,relationship:3},{id:'listen',label:'听她讲完今天，约下次去看海',consequence:'阿琳关系 +2，她尊重你的安排。',cost:0,relationship:2}]},
 {id:'laochen-first',person:'老陈',relation:'laochen',title:'城市亮起来的时候',line:'“我们收工，别人正好回家。买两杯热茶，今晚这风有点凉。”',options:[{id:'tea',label:'去窗口买两杯热茶 · ¥ 18',consequence:'老陈关系 +3，下次开工自带补给。',cost:18,relationship:3},{id:'bench',label:'一起坐在长椅上歇会儿',consequence:'老陈关系 +1，留住一段下班后的闲聊。',cost:0,relationship:1}]},
 {id:'ahui-third',person:'阿辉',relation:'ahui',title:'有个靠谱的搭子',line:'“临时群里的单真假难分。以后有靠谱活，我先叫你。”',options:[{id:'partner',label:'搭伙接活，互相照应',consequence:'阿辉关系 +3，熟人介绍的关系奖金继续提高。',cost:0,relationship:3},{id:'independent',label:'保持自由，有空就见',consequence:'阿辉关系 +1，仍然可以自由接所有合约。',cost:0,relationship:1}]},
 {id:'alin-third',person:'阿琳',relation:'alin',title:'下次不是顺路',line:'“今天不用送我回公司。下次休息日，认真约一次海边日落吧。”',options:[{id:'date',label:'认真约定，再请她一杯咖啡 · ¥ 26',consequence:'阿琳关系 +4，下次开工自带补给。关系可以向恋爱发展。',cost:26,relationship:4},{id:'friend',label:'做可以一起看海的朋友',consequence:'阿琳关系 +2，友谊同样值得经营。',cost:0,relationship:2}]},
 {id:'laochen-third',person:'老陈',relation:'laochen',title:'看不见的地方也有人记得',line:'“驿站问起最近是谁修好了这片路灯。我报了你的名字。”',options:[{id:'team',label:'写上整个班组的名字',consequence:'老陈关系 +3，共同完成的工作也共同署名。',cost:0,relationship:3},{id:'learn',label:'谢谢他，再学一个维修诀窍',consequence:'老陈关系 +2，下次开工自带补给。',cost:0,relationship:2}]},
];
const success=(message:string,events:CareerEvent[]=[]):CareerAction=>({ok:true,message,events});
const failure=(message:string):CareerAction=>({ok:false,message,events:[]});
const distance=(a:CareerPoint,b:CareerPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const deltaAngle=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const relationFor:Record<CareerRole,keyof CareerSave['relations']>={'day-worker':'ahui',office:'alin','city-worker':'laochen'};
export const careerLevel=(xp:number)=>1+Math.floor(Math.max(0,xp)/200);

export class CareerGame {
 readonly places:CareerPlaces;
 readonly jobs:CareerJob[];
 private saved:CareerSave;
 private contract:ActiveContract|null=null;
 constructor(places:CareerPlaces,save:CareerSave=newCareerSave()){
  for(const [id,p] of Object.entries(places))if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))throw new Error('Invalid career place '+id);
  this.places=structuredClone(places);this.saved=readCareerSave(save);
  const objective=(id:CareerPlaceId,label:string,kind:CareerObjective['kind'],holdSeconds=0):CareerObjective=>({id,label,position:[...this.places[id]],kind,holdSeconds,action:kind==='pickup'?'接上 / 领取':kind==='service'?'完成巡检':'送达 / 交接'});
  const contract=(job:Omit<CareerJob,'deadline'>):CareerJob=>({...job,deadline:Math.max(100,job.objectives.slice(1).reduce((s,p,i)=>s+distance(p.position,job.objectives[i].position),0)/11+55)});
  this.jobs=[
   contract({id:'hot-meal',role:'day-worker',title:'热饭趁热送',person:'阿辉',description:'驿站领餐，送到海边值班点。实际送达后结日薪，越准时品质奖金越高。',mechanic:'delivery',basePay:190,requiredLevel:1,objectives:[objective('hub','湾畔生活驿站 · 取餐','pickup'),objective('bay','海边值班点 · 送达热饭','dropoff')],pickupLine:'“今天的饭还热着，别赶到危险，稳稳送过去。”',arrivalLine:'“刚好换班，饭也刚好到。辛苦，今天的工钱结了。”'}),
   contract({id:'two-stop-relay',role:'day-worker',title:'两站连送',person:'阿辉',description:'一趟跑完公园和写字楼两站。中途交接不重置时限，完成整轮才统一结算。',mechanic:'delivery',basePay:330,requiredLevel:2,objectives:[objective('hub','湾畔生活驿站 · 领两份餐','pickup'),objective('park','公园服务点 · 第一站','dropoff'),objective('office','写字楼门厅 · 最后一站','dropoff')],pickupLine:'“两份一起跑，路线自己安排。别落下一份。”',arrivalLine:'“两边都收到了，下回有这样的单再叫你。”'}),
   contract({id:'quiet-ten-minutes',role:'office',title:'把十分钟还给自己',person:'阿琳',description:'在生活驿站接上刚下班的阿琳，平稳开到海边。急刹、急转会减少舒适度；不催你快，只想舒服一点。',mechanic:'comfort',basePay:230,requiredLevel:1,objectives:[objective('hub','生活驿站 · 等阿琳下班','pickup'),objective('bay','海边步道 · 留一点自己的时间','dropoff')],pickupLine:'“今天开了六个会。我想听一会儿没有提示音的声音。”',arrivalLine:'“这一程真安静。原来今天还可以有这样的结尾。”'}),
   contract({id:'weekend-boundary',role:'office',title:'今天准点离开',person:'阿琳',description:'熟悉之后，她邀请你从驿站到香蜜湖。舒适度和关系影响最终奖金，保持平稳比争抢车道更有用。',mechanic:'comfort',basePay:315,requiredLevel:2,objectives:[objective('office','写字楼门厅 · 赴一个下班约','pickup'),objective('park','公园入口 · 今晚不加班','dropoff')],pickupLine:'“说好了，这次不聊工作。你最近有什么开心的事？”',arrivalLine:'“下次见面，不一定还得用顺路当理由。”'}),
   contract({id:'after-rain-round',role:'city-worker',title:'雨后巡检',person:'老陈',description:'到驿站领工具，逐站检查海边照明与公园排水。停车保持到作业条完成，再按 E 确认。',mechanic:'service',basePay:260,requiredLevel:1,objectives:[objective('hub','生活驿站 · 领取巡检单','pickup'),objective('bay','滨海灯组 · 检查接线','service',7),objective('park','公园排水口 · 清理落叶','service',9)],pickupLine:'“雨刚停，灯和排水都得看一眼。我们做完，夜路就安心了。”',arrivalLine:'“两处都正常。你看这片灯亮起来，心里就踏实。”'}),
   contract({id:'night-repair',role:'city-worker',title:'城市亮灯之前',person:'老陈',description:'从维修站领设备，连续处理公园与写字楼的公共设施。多站作业奖励更高，工具升级能缩短每站工时。',mechanic:'service',basePay:350,requiredLevel:2,objectives:[objective('workshop','维修站 · 领取备用设备','pickup'),objective('park','公园探照灯 · 检修灯组','service',11),objective('office','写字楼外街灯 · 更换接头','service',10)],pickupLine:'“趁大家还没下班，把路灯亮起来。工具都点齐了吧？”',arrivalLine:'“这一片交差了。走，回驿站喝口热的。”'}),
  ];
 }
 get save():CareerSave{return structuredClone(this.saved);}
 get active(){
  const a=this.contract;if(!a)return null;const job=this.jobs.find(j=>j.id===a.jobId)!;
  const raw=job.objectives[a.objectiveIndex],holdSeconds=raw.holdSeconds*(this.owned('work-tools')?.6:1);
  return {jobId:a.jobId,title:job.title,person:job.person,mechanic:job.mechanic,objective:{...raw,position:[...raw.position] as CareerPoint,holdSeconds},objectiveIndex:a.objectiveIndex,objectiveCount:job.objectives.length,elapsed:a.elapsed,remainingSeconds:Math.max(0,this.deadline(job)-a.elapsed),quality:Math.round(a.quality),holdSeconds:a.hold,holdProgress:holdSeconds>0?clamp(a.hold/holdSeconds,0,1):1,invalid:a.invalid,actualDistance:a.actualDistance,basePay:job.basePay};
 }
 get view(){
  const s=this.saved,level=careerLevel(s.xp[s.role]);
  return {cash:s.cash,role:s.role,level,xp:s.xp[s.role],nextLevelXp:level*200,totalEarned:s.totalEarned,completedCount:Object.values(s.completed).reduce((a,b)=>a+b,0),roomFund:s.upgrades.includes('room-fund'),supplied:s.supplied,relations:{...s.relations},active:this.active,
   jobs:this.jobs.filter(j=>j.role===s.role).map(j=>({...j,objectives:structuredClone(j.objectives),unlocked:level>=j.requiredLevel,completed:s.completed[j.id]??0,deadline:this.deadline(j)})),
   roles:CAREER_ROLES.map(r=>({...r,level:careerLevel(s.xp[r.id]),selected:r.id===s.role})),
   upgrades:CAREER_UPGRADES.map(u=>({...u,owned:this.owned(u.id),affordable:s.cash>=u.cost})),
   pendingChoice:this.choice,
  };
 }
 get choice(){const c=CHOICES.find(c=>c.id===this.saved.pendingChoice);return c?{...c,options:c.options.map(o=>({...o,affordable:this.saved.cash>=o.cost}))}:null;}
 private owned(id:CareerUpgradeId){return this.saved.upgrades.includes(id);}
 private deadline(job:CareerJob){return Math.round(job.deadline*(job.mechanic==='delivery'&&this.owned('insulated-box')?1.35:1));}
 selectRole(role:CareerRole):CareerAction{
  if(this.contract)return failure('先完成或结束当前合约，再换一个生活视角。');
  if(!roleIds.includes(role))return failure('这个身份尚未开放。');
  this.saved.role=role;return success('现在以'+CAREER_ROLES.find(r=>r.id===role)!.label+'的视角出发。');
 }
 accept(jobId:string,frame:CareerFrame):CareerAction{
  if(this.contract)return failure('你还有一份进行中的合约，可以继续或先结束它。');
  if(this.choice)return failure('先回应刚刚收到的消息，再开始下一段生活。');
  const job=this.jobs.find(j=>j.id===jobId);
  if(!job||job.role!==this.saved.role)return failure('请先切换到这份合约对应的身份。');
  if(careerLevel(this.saved.xp[job.role])<job.requiredLevel)return failure('完成两次基础合约，升到 2 级后解锁。');
  if(!validFrame(frame))return failure('城市位置尚未就绪。');
  this.contract={jobId,objectiveIndex:0,elapsed:0,hold:0,quality:100,actualDistance:0,legDistance:0,legDrivenDistance:0,lastOdometer:frame.odometer,invalid:false,debugEpoch:frame.debugEpoch,lastPosition:[...frame.position],lastSpeed:frame.speed,lastYaw:frame.yaw,startOdometer:frame.odometer,restBonus:this.saved.supplied};
  this.saved.supplied=false;
  return success('已接下 · '+job.title,[{type:'objective',jobId,message:'先到 '+job.objectives[0].label+'，停车按 E。'}]);
 }
 cancel():CareerAction{if(!this.contract)return failure('目前没有进行中的合约。');this.contract=null;return success('本单已结束，没有扣款。随时可以重新接。');}
 tick(frame:CareerFrame):CareerEvent[]{
  const a=this.contract;if(!a)return [];
  if(!validFrame(frame)){a.invalid=true;return [];}
  const events:CareerEvent[]=[],movement=distance(frame.position,a.lastPosition),dt=clamp(frame.dt,0,.5);
  // A debug jump or nonphysical position/odometer reset can never be turned into a payout.
  if(!a.invalid&&(frame.debugEpoch!==a.debugEpoch||movement>Math.max(45,dt*110)||frame.odometer<a.startOdometer-2)){
   a.invalid=true;events.push({type:'message',message:'这份合约使用了调试跳转，不能结算。结束后重新接单即可。'});
  }
  if(frame.paused){a.lastPosition=[...frame.position];a.lastSpeed=frame.speed;a.lastYaw=frame.yaw;a.lastOdometer=frame.odometer;return events;}
  const job=this.jobs.find(j=>j.id===a.jobId)!,obj=job.objectives[a.objectiveIndex];
  a.actualDistance+=movement;a.legDistance+=movement;
  if(frame.inVehicle!==false)a.legDrivenDistance+=Math.min(Math.max(0,frame.odometer-a.lastOdometer),movement*1.5+1);
  a.lastOdometer=frame.odometer;
  if(a.objectiveIndex>0){
   a.elapsed+=dt;
   if(job.mechanic==='delivery'&&a.elapsed>this.deadline(job))a.quality=Math.max(20,a.quality-dt*(this.owned('insulated-box')?.19:.38));
   if(job.mechanic==='comfort'&&dt>.005){
    const braking=Math.max(0,(a.lastSpeed-frame.speed)/dt-6.5),turn=frame.yaw!==undefined&&a.lastYaw!==undefined?Math.max(0,Math.abs(deltaAngle(frame.yaw,a.lastYaw))/dt*Math.abs(frame.speed)-7):0;
    const protection=(this.owned('comfort-kit')?.55:1)*(a.restBonus?.85:1);
    a.quality=Math.max(20,a.quality-(braking*.5+turn*.27)*dt*protection);
   }
  }
  const required=obj.holdSeconds*(this.owned('work-tools')?.6:1);
  if(required>0)a.hold=distance(frame.position,obj.position)<28&&Math.abs(frame.speed)<1?Math.min(required,a.hold+dt):0;
  a.lastPosition=[...frame.position];a.lastSpeed=frame.speed;a.lastYaw=frame.yaw;
  return events;
 }
 prompt(frame:CareerFrame):string|null{
  const a=this.active;if(!a)return null;if(a.invalid)return '本单使用过调试跳转 · 按 J 结束后重新接单';
  if(distance(frame.position,a.objective.position)>35)return null;
  if(Math.abs(frame.speed)>=1)return '靠边停稳 · '+a.objective.label;
  if(a.objective.holdSeconds>0&&a.holdProgress<1)return '巡检作业中 · '+Math.ceil(a.objective.holdSeconds-a.holdSeconds)+' 秒 · 保持停车';
  return '按 E · '+a.objective.action+' · '+a.objective.label;
 }
 interact(frame:CareerFrame):CareerAction{
  const a=this.contract;if(!a)return failure('在生活手账中接一份合约，再来开始。');
  if(!validFrame(frame)||frame.paused)return failure('返回城市后再交接。');
  if(frame.debugEpoch!==a.debugEpoch||distance(frame.position,a.lastPosition)>45||frame.odometer<a.startOdometer-2)a.invalid=true;
  if(a.invalid)return failure('调试跳转不会结算工钱。请在 J 手账中结束本单后重接。');
  const job=this.jobs.find(j=>j.id===a.jobId)!,obj=job.objectives[a.objectiveIndex];
  if(distance(frame.position,obj.position)>=28)return failure('再靠近交接点一些。');
  if(Math.abs(frame.speed)>=1)return failure('请先停稳，再交接。');
  if(a.objectiveIndex>0){const previous=job.objectives[a.objectiveIndex-1],minimumDistance=Math.min(90,distance(previous.position,obj.position)*.6);if(a.legDistance<minimumDistance)return failure('需要实际走完这一程才能交接。');if(job.mechanic==='comfort'&&a.legDrivenDistance<Math.max(minimumDistance,distance(previous.position,obj.position)*.65))return failure('接送需要实际驾车带乘客走完这一程，再下车交谈。');}
  const required=obj.holdSeconds*(this.owned('work-tools')?.6:1);
  if(a.hold+1e-6<required)return failure('巡检还差 '+Math.ceil(required-a.hold)+' 秒，请保持停车。');
  if(a.objectiveIndex<job.objectives.length-1){
   const first=a.objectiveIndex===0;a.objectiveIndex++;a.hold=0;a.legDistance=0;a.legDrivenDistance=0;
   const message=first?job.pickupLine:'这一站完成，继续前往 '+job.objectives[a.objectiveIndex].label+'。';
   return success(message,[{type:'objective',jobId:job.id,message}]);
  }
  const qualityFactor=.65+.65*(a.quality/100),qualityBonus=a.restBonus?18:0,relationBonus=this.saved.relations[relationFor[job.role]]*4,toolBonus=job.mechanic==='service'&&this.owned('work-tools')?25:0;
  const amount=Math.round((job.basePay*qualityFactor+qualityBonus+relationBonus+toolBonus)*(this.owned('room-fund')?1.08:1));
  this.saved.cash=money(this.saved.cash+amount);this.saved.totalEarned=money(this.saved.totalEarned+amount);this.saved.xp[job.role]+=100;
  this.saved.completed[job.id]=(this.saved.completed[job.id]??0)+1;
  const roleCompleted=this.jobs.filter(j=>j.role===job.role).reduce((sum,j)=>sum+(this.saved.completed[j.id]??0),0),person=relationFor[job.role];
  const choiceId=person+'-'+(roleCompleted>=3?'third':'first');
  if(!this.saved.choices[choiceId]&&CHOICES.some(c=>c.id===choiceId))this.saved.pendingChoice=choiceId;
  const message=job.arrivalLine+'  收入 +¥ '+amount+' · 品质 '+Math.round(a.quality)+' · 经验 +100';this.contract=null;
  const events:CareerEvent[]=[{type:'completed',message,amount,jobId:job.id}];if(this.choice)events.push({type:'choice',message:this.choice.title});
  return success(message,events);
 }
 choose(optionId:string):CareerAction{
  const c=this.choice;if(!c)return failure('目前没有等待回复的消息。');const option=c.options.find(o=>o.id===optionId);
  if(!option)return failure('请选择一个回复。');if(this.saved.cash<option.cost)return failure('余额不足，仍可选择不花钱的回应。');
  this.saved.cash-=option.cost;this.saved.relations[c.relation]=Math.min(20,this.saved.relations[c.relation]+option.relationship);this.saved.choices[c.id]=option.id;this.saved.pendingChoice=null;
  if(option.cost>0||option.id==='learn')this.saved.supplied=true;
  return success(option.consequence,[{type:'choice',message:option.consequence}]);
 }
 purchase(upgradeId:CareerUpgradeId):CareerAction{
  if(this.contract)return failure('先结束当前合约，再安装升级。');const upgrade=CAREER_UPGRADES.find(u=>u.id===upgradeId);
  if(!upgrade)return failure('这项升级尚未开放。');if(this.owned(upgradeId))return failure('已经拥有这项升级。');if(this.saved.cash<upgrade.cost)return failure('还差 ¥ '+(upgrade.cost-this.saved.cash)+'，再跑一单慢慢攒。');
  this.saved.cash-=upgrade.cost;this.saved.upgrades.push(upgradeId);return success('已购入 · '+upgrade.title,[{type:'purchase',message:upgrade.description,amount:-upgrade.cost}]);
 }
 replenish(frame:CareerFrame):CareerAction{
  if(this.contract)return failure('当前合约结束后，再回来补给。');if(this.saved.supplied)return failure('已经补给好了，下次开工自动生效。');
  if(!validFrame(frame)||distance(frame.position,this.places.hub)>40||Math.abs(frame.speed)>=1)return failure('到生活驿站附近停稳，就能买一份热饭补给。');
  if(this.saved.cash<18)return failure('一份补给 ¥ 18，余额还不够。');this.saved.cash-=18;this.saved.supplied=true;
  return success('热饭与水已备好 · 下一单舒适损失减少 15%，完成额外奖励 ¥ 18。',[{type:'purchase',message:'生活驿站补给完成',amount:-18}]);
 }
 /** The three legacy narrative rides may credit this shared wallet once, without duplicating migration rewards. */
 creditLegacy(id:string,amount:number):CareerAction{
  if(!id||id.length>100||!Number.isFinite(amount)||amount<=0||amount>1000||this.saved.legacyCompleted.includes(id))return failure('这一程已记入手账。');
  this.saved.legacyCompleted.push(id);this.saved.cash=money(this.saved.cash+amount);this.saved.totalEarned=money(this.saved.totalEarned+amount);return success('收入 +¥ '+Math.floor(amount));
 }
}
function validFrame(frame:CareerFrame){return Array.isArray(frame.position)&&frame.position.length===2&&frame.position.every(Number.isFinite)&&Number.isFinite(frame.speed)&&Number.isFinite(frame.odometer)&&Number.isFinite(frame.debugEpoch)&&Number.isFinite(frame.dt)&&frame.dt>=0&&(frame.yaw===undefined||Number.isFinite(frame.yaw));}
