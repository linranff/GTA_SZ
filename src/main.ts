import './style.css';
import './area-reveal.css';
import './city-audio.css';
import './city-experience.css';
import {createCityLoading} from './city-loading.ts';
import {createCityQuickTips} from './city-quicktips.ts';
import {createFlightHud} from './city-flight-hud.ts';
import {initializeCityMap,type CityMapController} from './city-map.ts';
import {initializeCinematicHud,updateCinematicHud,drawCinematicMinimap} from './city-hud.ts';
import {DrivingWorld} from './city-world.ts';
import {createObserverBeacons} from './city-observer-beacons.ts';
import {createObserverDestinationResolver} from './city-observer-destination.ts';
import {createCareerExperience} from './city-career-experience.ts';
import {newLife,readLife,settleRide,type Ride,type ActiveRide} from './city-life.ts';
import {RoadGraph} from './navigation.ts';
import type {Landmark,V2} from './city-types.ts';
const ui=document.querySelector<HTMLDivElement>('#ui')!;
const loading=createCityLoading(document.body);
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
let cityMap:CityMapController|null=null;let world:DrivingWorld,graph:RoadGraph,selected:Landmark|null=null,route:V2[]=[],mapOpen=false,toastTime=0,hudTick=0,visited=new Set<string>(),lastRevealedPlaceId:string|null=null;
let career:Awaited<ReturnType<typeof createCareerExperience>>|null=null;
let observerBeacons:ReturnType<typeof createObserverBeacons>|null=null;
let quickTips:ReturnType<typeof createCityQuickTips>|null=null;
let flightHud:ReturnType<typeof createFlightHud>|null=null;
let life=newLife(),activeRide:ActiveRide|null=null,rides:Ride[]=[],journalOpen=false;try{life=readLife(JSON.parse(localStorage.getItem('shenchengji-city-life-v1')??'null'));}catch{}
const $=(s:string)=>document.querySelector<HTMLElement>(s)!;
const num=(n:number)=>n.toLocaleString('zh-CN');
function toast(s:string){$('#toast').textContent=s;$('#toast').classList.add('visible');toastTime=4;}
function revealPlace(place:Landmark){
 const element=$('#area-reveal');element.textContent=place.area+' · '+place.name;element.classList.remove('visible');void element.offsetWidth;element.classList.add('visible');
}
function mapDraw(canvas:HTMLCanvasElement,_large=false){const o=world.observer;drawCinematicMinimap(canvas,world.data,{x:o.active?o.focus.x:world.actor.x,z:o.active?o.focus.z:world.actor.z,yaw:o.active?o.yaw:world.actor.yaw,speed:world.actor.speed,observer:o.active,route});}
function openMap(open:boolean){
 const mapFocus:V2|null=world.observer.active?[world.observer.focus.x,world.observer.focus.z]:null;
 if(open&&journalOpen){journalOpen=false;$('#life-journal').hidden=true;}
 if(open&&world.observer.active)world.exitPhoto();
 mapOpen=open;world.paused=open;world.keys.clear();$('#pause').hidden=true;if(open&&selected&&!world.autopilot?.status.active)route=graph.route([world.state.x,world.state.z],selected.arrival);
 cityMap?.updateState({...world.state,visited,selected,route,mapFocus});if(open)cityMap?.open();else cityMap?.close();
}
function selectDestination(destination:Landmark,preview:V2[]){if(selected?.id!==destination.id||Math.hypot((selected?.arrival[0]??Infinity)-destination.arrival[0],(selected?.arrival[1]??Infinity)-destination.arrival[1])>.1)world.cancelAutoDrive('destination-changed');selected=destination;route=preview;}
function initLife(){
 const onRoad=(x:number,z:number):[number,number]=>{const n=world.collision.nearest(x,z);return n?[n.x,n.z]:[x,z];};const sp=world.data.spawn,along=(d:number)=>onRoad(sp.x+Math.sin(sp.yaw)*d,sp.z+Math.cos(sp.yaw)*d);
 const place=(id:string)=>world.data.landmarks.find(m=>m.id===id)!.arrival;
 rides=[{id:'coast-shift',title:'收工后的一段路',person:'老陈 · 城市工人',description:'刚换下反光背心，他想去海边坐一会儿。顺路送他一段，不赶时间。',pickupLine:'“今天晒了一整天。到海边吹吹风，才算真的下班。”',arrivalLine:'“你看，晚霞还没下班。谢谢啊，年轻人。”',reward:128,from:along(155),to:along(900)},
 {id:'office-evening',title:'不回工作群的十分钟',person:'阿琳 · 年轻职场人',description:'会又拖了半小时。去香蜜湖，给今晚留十分钟自己的时间。',pickupLine:'“消息还在响。先不看了，我想看看今天的天。”',arrivalLine:'“原来今天也可以不只有公司和出租屋。”',reward:160,from:place('civic'),to:place('xiangmi')},
 {id:'day-pay',title:'一天也算数',person:'阿辉 · 日结打工者',description:'临时搬运刚结了工钱。送他去后海赴一个约，他说今天值得吃顿好的。',pickupLine:'“到账了。这回我请，别又给我抢着付。”',arrivalLine:'“今天累是累，但有钱到账，还有人等吃饭。挺好。”',reward:220,from:place('tencent'),to:place('talent')}];
 $('#journal-button').onclick=()=>showJournal(!journalOpen);
 window.addEventListener('keydown',e=>{if(e.code!=='Escape'&&e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.repeat)return;if(e.code==='KeyJ')showJournal(!journalOpen);if(e.code==='KeyE')interactRide();});
 renderJournal();
}
function showJournal(open:boolean){if(open&&world.aerial)world.exitPhoto();if(open&&mapOpen)openMap(false);journalOpen=open;$('#life-journal').hidden=!open;world.paused=open;world.keys.clear();if(open)renderJournal();}
function renderJournal(){
 if(career){life.cash=career.game.save.cash;life.completed=career.game.save.legacyCompleted;career.render();return;}
 $('#wallet').textContent='¥ '+num(life.cash);$('#life-savings').textContent='自己的房间基金 · ¥ '+num(life.cash)+' / 1,800';($('#life-progress') as HTMLProgressElement).value=Math.min(1800,life.cash);
 $('#ride-list').innerHTML=rides.map(r=>`<article><small>${r.person}</small><h3>${r.title}</h3><p>${r.description}</p><button data-ride="${r.id}" ${life.completed.includes(r.id)?'disabled':''}>${life.completed.includes(r.id)?'已完成 · 这一程记下了':activeRide?.id===r.id?(activeRide.debugged?'重新接单':'继续导航'):'接下这段路 · ¥ '+r.reward}</button></article>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-ride]').forEach(b=>b.onclick=()=>{const r=rides.find(r=>r.id===b.dataset.ride)!;if(activeRide?.id!==r.id||activeRide.debugged)activeRide={id:r.id,phase:'pickup',startOdometer:world.state.distance,debugged:false};showJournal(false);rideNavigation(r);toast('顺路单 · '+r.title);document.querySelector('.intro')?.classList.add('gone');});
}
function rideNavigation(r:Ride){world.cancelAutoDrive('ride-destination-changed');const p=activeRide?.phase==='riding'?r.to:r.from;selected={id:r.id,name:(activeRide?.phase==='riding'?'送达 · ':'接上 · ')+r.person,x:p[0],z:p[1],height:0,excludeRadius:0,area:'城市生活',arrival:p,yaw:0};route=graph.route([world.state.x,world.state.z],p);}
function interactRide(){if(world.paused||(world.tank?.active&&!world.walk?.active))return;if(world.bambooCafe?.interact(world))return;if(career?.interact())return;if(!activeRide){if(career&&Math.hypot(world.actor.x-career.game.places.hub[0],world.actor.z-career.game.places.hub[1])<40)showJournal(true);return;}const r=rides.find(r=>r.id===activeRide!.id)!,p=activeRide.phase==='pickup'?r.from:r.to;const at=Math.hypot(world.state.x-p[0],world.state.z-p[1])<28;if(!at||Math.abs(world.state.speed)>1)return;
 if(activeRide.phase==='pickup'){activeRide.phase='riding';activeRide.startOdometer=world.state.distance;activeRide.debugged=false;toast(r.pickupLine);toastTime=9;rideNavigation(r);return;}
 if(settleRide(life,activeRide,r,world.state.distance,true,world.state.speed)){career?.creditLegacy(r.id,r.reward);try{localStorage.setItem('shenchengji-city-life-v1',JSON.stringify(life));}catch{toast('浏览器未允许保存进度');}toast(r.arrivalLine+'  ·  收入 +¥ '+r.reward);toastTime=12;activeRide=null;selected=null;route=[];$('#route-hud').hidden=true;renderJournal();}
 else toast(activeRide.debugged?'这趟使用了调试跳转。手账中重新接单可正常体验。':'再实际行驶一段，抵达后停车完成这一程。');
}
function debugJump(){if(activeRide?.phase==='riding')activeRide.debugged=true;}
function initObserverBeacons(){
 const resolve=createObserverDestinationResolver({data:world.data,collision:world.collision,groundHeight:world.groundHeight,propBlocked:(x,z)=>world.propBlocked(x,z),waterHeight:world.coastal?.manifest.waterHeight??-.25});
 // Picking is performed once per completed hold, against visible static city
 // surfaces. Keep the ordinary per-frame scene picking disabled for all of them.
 const surfaces=new Set([...world.blocks.map(b=>b.mesh),...world.landmarks,...world.scene.meshes.filter(m=>/^(terrain_|ground_relief_|bay-horizon-water)/.test(m.name))]);
 observerBeacons=createObserverBeacons({scene:world.scene,camera:world.camera,canvas,host:ui,
  active:()=>world.observer.active&&!world.flight?.active&&!world.flight?.loading&&world.photoTarget?.id!=='car'&&!mapOpen&&!journalOpen,
  pick:(clientX,clientY)=>{
   const rect=canvas.getBoundingClientRect();
   const hit=world.scene.pick(clientX-rect.left,clientY-rect.top,m=>surfaces.has(m)&&m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0,false,world.camera);
   return hit?.hit&&hit.pickedPoint?resolve(hit.pickedPoint):null;
  },
  stopDrag:()=>{world.drag=false;world.keys.clear();},toast,
  focus:point=>{
   const valid=resolve(point,point.name);if(!valid)return;
   world.enterPhoto({id:'saved-view',name:point.name,x:point.x,z:point.z,height:0,area:'收藏地点',excludeRadius:0,arrival:[point.x,point.z],yaw:0,photoTargetHeight:point.y,photoDistance:Math.max(260,Math.min(900,world.observer.distance)),photoElevation:.58,photoAngle:-world.observer.yaw});
  },
  travel:point=>{
   // Recompute the road arrival: persisted coordinates never bypass current
   // terrain, bridge, prop or vehicle-clearance checks.
   const valid=resolve(point,point.name);if(!valid?.arrival){toast('这里没有合适的落车道路，可以先收藏景色');return false;}
   debugJump();world.travel({id:'beacon-travel',name:valid.name,x:valid.x,z:valid.z,height:0,area:'收藏地点',excludeRadius:0,arrival:valid.arrival,yaw:valid.yaw??0});
   selected=null;route=[];return true;
  }
 });
 world.scene.onDisposeObservable.addOnce(()=>observerBeacons?.dispose());
}
function initUI(){
 ui.innerHTML=`<header><div class="wordmark">深城纪<span>OPEN ROADS</span></div><div class="location"><i></i><span id="district">南山 · 后海</span><small id="clock">18:25</small></div><button id="map-button">城市地图 <kbd>M</kbd></button></header>
 <div class="intro"><span>一路向海</span><h1>今晚，开远一点。</h1><p>南山 → 福田 → 罗湖，整座城市等你出发。</p></div>
 <div id="area-reveal" role="status" aria-live="polite"></div><div id="toast" role="status"></div><div id="route-hud" hidden><small>正在前往</small><strong id="route-title"></strong><span id="route-distance"></span><button id="cancel-autodrive" hidden>接管驾驶</button></div>
 <div id="minimap"><canvas id="mini-map"></canvas><span class="north">N</span><div id="road-name">滨海大道</div></div>
 <div id="speedometer"><div><b id="speed">000</b><span>KM/H</span></div><div class="speed-line"><i id="speed-bar"></i></div><small><span id="gear">P</span><span id="odometer">0.0 KM</span><span>海湾 GT</span></small></div>
 <div class="controls"><span><kbd>W S</kbd> 油门 / 刹车</span><span><kbd>A D</kbd> 转向</span><span><kbd>空格</kbd> 手刹</span><span><kbd>C</kbd> 镜头</span><span><kbd>L</kbd> 日落 / 夜色 / 晴日</span><span><kbd>F</kbd> 上下车</span><span><kbd>V</kbd> 看车</span><span><kbd>G</kbd> 无人机</span><span><kbd>K</kbd> 显隐鼠标</span><span><kbd>R</kbd> 回到道路</span></div>
 <button id="journal-button">城市生活 <span id="wallet"></span> <kbd>J</kbd></button><div id="ride-prompt" hidden></div><section id="life-journal" hidden><div class="life-heading"><small>下班以后 / 城市手账</small><h2>今天，也为自己活一点。</h2><p id="life-savings"></p><progress id="life-progress" max="1800" value="180"></progress></div><div id="ride-list"></div><p class="life-note">这三位是虚构人物。接人和送达时停车，按 E 交谈。按 J 返回。</p></section><div id="observer-help" hidden><strong>无人机观景 · B 切换飞机</strong><span>WASD 平移 · 方向键转头 · QE 升降 · Shift 加速</span><span>拖动环绕 · Shift + 拖动平移 · 滚轮远近 · G / F 返回驾驶</span><span>长按地点 · 光柱标记 / 收藏 / 移动</span></div><div id="fps" hidden></div>
 <section id="map-panel" hidden></section>
 <div id="pause" hidden><h2>歇一会儿。</h2><button id="resume">继续驾驶</button></div>`;
 initializeCinematicHud(world.data);
 flightHud=createFlightHud(ui,world);world.scene.onDisposeObservable.addOnce(()=>flightHud?.dispose());
 quickTips=createCityQuickTips(ui,{onOpenChange:()=>world.keys.clear(),onFlight:()=>{canvas.focus();void world.toggleFlight();}});
 world.scene.onDisposeObservable.addOnce(()=>quickTips?.dispose());
 $('#observer-help').insertAdjacentHTML('beforeend','<span>K 隐藏 / 显示鼠标 · 方便录屏</span>');
 window.addEventListener('keydown',e=>{
  if(e.code!=='KeyK'||e.repeat||e.isComposing||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  e.preventDefault();
  const hidden=document.body.classList.toggle('recording-cursor-hidden');
  toast(hidden?'鼠标已隐藏 · 再按 K 显示':'鼠标已显示');
 });
 initObserverBeacons();
 world.audio.mountControls($('#pause'));
 cityMap=initializeCityMap({data:world.data,graph,onSelect:selectDestination,
  onAutoDrive:(destination,preview)=>{selectDestination(destination,preview);openMap(false);document.querySelector('.intro')?.classList.add('gone');world.startAutoDrive(destination);},
  onManualRoute:(destination,preview)=>{selectDestination(destination,preview);world.cancelAutoDrive('manual-route');openMap(false);toast('沿小地图上的浅绿路线行驶');},
  onPhoto:destination=>{openMap(false);world.enterPhoto(destination);},onClose:()=>openMap(false),
  onVisit:()=>{openMap(false);selected=null;route=[];void world.bambooCafe?.enter(world);},
  onDebugTravel:(destination:Landmark)=>{debugJump();const nearby=world.collision.nearest(...destination.arrival);world.travel(nearby?{...destination,arrival:[nearby.x,nearby.z],yaw:nearby.yaw}:destination);selected=null;route=[];openMap(false);}
 });
 $('#map-button').onclick=()=>openMap(true);$('#resume').onclick=()=>{world.paused=false;$('#pause').hidden=true;};
 $('#cancel-autodrive').onclick=()=>world.cancelAutoDrive('manual-takeover');
 window.addEventListener('keydown',e=>{if(e.code!=='Escape'&&e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.repeat)return;if(e.code==='KeyG'){mapOpen=false;journalOpen=false;cityMap?.close();$('#life-journal').hidden=true;$('#pause').hidden=true;world.paused=world.aerial;}if(e.code==='KeyM'||e.code==='Tab')openMap(!mapOpen);if(e.code==='Escape'){if(world.aerial){world.toggleAerial();return;}if(journalOpen){showJournal(false);return;}if(world.photoTarget){world.exitPhoto();return;}if(mapOpen)openMap(false);else{world.paused=!world.paused;$('#pause').hidden=!world.paused;}}if(e.code==='KeyP')$('#fps').hidden=!$('#fps').hidden;});
 world.onMessage=toast;world.onTick=dt=>{
  observerBeacons?.update(dt);flightHud?.update(mapOpen||journalOpen);
  career?.tick(dt);
  $('#observer-help').hidden=!world.observer.active||!!world.flight?.active;$('#minimap').classList.toggle('observer-muted',world.observer.active);$('#speedometer').classList.toggle('observer-muted',world.observer.active||!!world.walk?.active);
  hudTick+=dt;toastTime-=dt;if(toastTime<=0)$('#toast').classList.remove('visible');if(hudTick<.12)return;hudTick=0;
 const s={...world.state,...world.actor};
 const location=world.sceneFocus();
 const nearest=world.data.landmarks.reduce((a,b)=>Math.hypot(a.x-location.x,a.z-location.z)<Math.hypot(b.x-location.x,b.z-location.z)?a:b);
  const nearestDistance=Math.hypot(nearest.x-location.x,nearest.z-location.z);
  if(nearestDistance<520&&nearest.id!==lastRevealedPlaceId){lastRevealedPlaceId=nearest.id;revealPlace(nearest);}
  else if(nearestDistance>650)lastRevealedPlaceId=null;
  quickTips?.update({hidden:!!world.flight?.active,flightLoading:!!world.flight?.loading,mode:world.observer.active?'observer':world.walk?.active?'walking':world.tank?.active?'tank':'driving',carView:world.photoTarget?.id==='car',menuOpen:mapOpen||journalOpen||(world.paused&&!world.observer.active)});
  updateCinematicHud({flight:!!world.flight?.active,speed:s.speed,distance:s.distance,roadName:world.locationRoadName(),district:nearest.area,night:world.night,lightMode:world.lightMode,walking:!!world.walk?.active,observer:world.observer.active,menuOpen:mapOpen||journalOpen||(world.paused&&!world.observer.active),navigation:!!selected});
  if(activeRide){const r=rides.find(r=>r.id===activeRide!.id)!,p=activeRide.phase==='pickup'?r.from:r.to,d=Math.hypot(s.x-p[0],s.z-p[1]);$('#ride-prompt').hidden=d>35;$('#ride-prompt').textContent=Math.abs(s.speed)>1?'靠边停车，与 '+r.person.split(' · ')[0]+' 交谈':'按 E · '+(activeRide.phase==='pickup'?'接上':'送达')+r.person.split(' · ')[0];}else {const prompt=world.bambooCafe?.prompt(world)??career?.prompt()??(!career?.game.active&&world.walk?.active&&Math.hypot(world.actor.x-(career?.game.places.hub[0]??1e9),world.actor.z-(career?.game.places.hub[1]??1e9))<40?'按 E · 驿站接活 / 热饭补给':null);$('#ride-prompt').hidden=!prompt||mapOpen||journalOpen;$('#ride-prompt').textContent=prompt??'';}
  if(s.distance>30)document.querySelector('.intro')?.classList.add('gone');
  mapDraw($('#mini-map') as HTMLCanvasElement,false);
  const auto=world.autopilot?.status;if(auto?.route.length&&auto.destination?.id===selected?.id&&!['idle','cancelled'].includes(auto.phase))route=auto.route.map(p=>[p[0],p[1]]);
  if(mapOpen)cityMap?.updateState({...s,visited,selected,route});
  $('#cancel-autodrive').hidden=!auto?.active;
  if(selected){const d=Math.hypot(selected.arrival[0]-s.x,selected.arrival[1]-s.z);$('#route-hud').hidden=false;$('#route-title').textContent=selected.name;
   const controlled=auto?.destination?.id===selected.id&&!['idle','cancelled'].includes(auto.phase);const labels={idle:'正在前往',driving:'自动驾驶',yielding:'前方车辆 · 正在等候',maneuvering:'低速调整方向',parking:'正在停靠',arrived:'已到达并停稳',blocked:'已停车 · 请接管或重选路线',cancelled:'手动驾驶'};
   $('#route-hud small').textContent=controlled?(auto?.reason==='planning-route'?'正在规划道路路线':labels[auto!.phase]):'手动导航';
   $('#route-distance').textContent=controlled?(auto!.phase==='arrived'?'目的地周边道路':auto!.phase==='blocked'?'WASD / 方向键接管':`${(auto!.remainingDistance/1000).toFixed(1)} km · ${auto!.etaSeconds===null?'等待通行':'约 '+Math.max(1,Math.ceil(auto!.etaSeconds/60))+' 分钟'}`):(d<40?'已到达周边':(d/1000).toFixed(1)+' km · 直线距离');
   if((controlled?auto!.phase==='arrived':d<40&&Math.abs(s.speed)<1)&&!visited.has(selected.id)){visited.add(selected.id);toast('城市足迹 +1 · '+selected.name);}
  }else $('#route-hud').hidden=true;
  if(!$('#fps').hidden)$('#fps').textContent=Math.round(world.engine.getFps())+' FPS · '+world.engine.getRenderWidth()+' × '+world.engine.getRenderHeight();
 };
 mapDraw($('#mini-map') as HTMLCanvasElement,false);
}
async function boot(){try{world=new DrivingWorld(canvas);await world.init(s=>loading.update(s));loading.update('navigation');graph=new RoadGraph(world.data.roads,await(await fetch('/city/navigation.json')).json());world.startTraffic(graph);loading.update('life-sites');const communitySites=(await(await fetch('/city/life-sites.json')).json()).sites;for(const site of communitySites)world.data.landmarks.push({id:'life:'+site.id,name:site.name,x:site.x,z:site.z,height:4.34,area:'生活驿站',excludeRadius:0,detailCollision:true,arrival:site.arrival,yaw:site.yaw,photoDistance:22,photoElevation:.25,photoAngle:-site.heading,photoTargetHeight:world.groundHeight(site.x,site.z)+1.8});loading.update('interface');initUI();initLife();await cityMap?.ready;loading.update('experience');career=await createCareerExperience(world,graph,{toast,close:()=>showJournal(false),open:()=>showJournal(true),menuOpen:()=>mapOpen||journalOpen||(world.paused&&!world.observer.active),navigate:selectDestination,clearRoute:()=>{selected=null;route=[];world.cancelAutoDrive('career-objective-complete');},legacy:{rides:()=>rides,active:()=>activeRide,cancel:()=>{activeRide=null;selected=null;route=[];world.cancelAutoDrive('legacy-cancelled');},start:r=>{if(activeRide?.id!==r.id||activeRide.debugged)activeRide={id:r.id,phase:'pickup',startOdometer:world.state.distance,debugged:false};showJournal(false);rideNavigation(r);toast('顺路单 · '+r.title);}}});await career.ready;document.querySelector('.intro')?.classList.add('gone');Object.defineProperty(window,'__SHENCHENGJI_CITY__',{value:{get ready(){return world.ready;},get telemetry(){return {state:{...world.state},autopilot:world.autopilot?.status,render:world.diagnostics()};},get state(){return {...world.state,road:world.roadName,height:world.groundHeight(world.state.x,world.state.z),carY:world.car.position.y};},get performance(){return world.performance();},get stats(){return {tank:world.tank?.stats,rider:{loaded:!!world.rider,loading:world.riderLoading,firstPerson:world.walkFirstPerson},flight:world.flight?.stats,career:career?.game.view,careerSites:career?.sites,lifeHubs:career?.hubs,walking:world.walk?{active:world.walk.active,x:world.walk.x,z:world.walk.z,yaw:world.walk.yaw,distance:world.walk.distance}:null,lightMode:world.lightMode,coastal:world.coastal?.stats,bayWater:world.bayWater?.stats(),publicLighting:world.publicLighting?.stats(),buildingSigns:world.buildingSigns?.stats(),vehicleMaterials:world.vehicleMaterials?.stats,cockpit:world.cockpit?.stats,audio:world.audio.stats,tailLights:world.tailLights?.stats,autopilot:world.autopilot?.status,streetFurniture:world.streetFurniture?.stats,camera:{view:world.view,minZ:world.camera.minZ,position:world.camera.position.asArray(),fov:world.camera.fov},cinematic:world.cinematic?.stats,roadSurface:world.roadSurface?.stats,rainPuddles:world.rainPuddles?.stats,groundRelief:world.groundRelief?.stats,mountains:world.mountains?.stats,vehicleFinish:world.vehicleFinish?.stats,sportDetails:world.sportDetails?.stats,observer:world.observer.status,observerBeacons:observerBeacons?.stats,architecture:world.architecture.stats(),facadeDiversity:world.facadeDiversity.stats(),landscape:world.landscape?.stats,signage:world.signage?.stats(),life:{cash:life.cash,completed:[...life.completed],active:activeRide?{...activeRide}:null,rides:rides.map(r=>({...r}))},lighting:{carPaint:world.carPaintDiagnostics(),environmentReady:!!world.scene.environmentTexture?.sphericalPolynomial,treeInstances:world.landscape?.stats.sourceTreeCount,carMaterial:world.carMeshes[0]?.material?.name,headlightsExcludeWater:world.headlights.every(l=>l.excludedMeshes.some(m=>m.name==='terrain_water'))},counts:world.data.meta.counts,landmarks:world.data.landmarks,graphNodes:graph.nodes.length,pedestrianImpacts:world.pedestrians?.stats,pedestrians:world.pedestrians?.people.map(p=>({x:p.x,z:p.z})),trafficMeshes:world.traffic?.meshes.flat().map(m=>({name:m.name,parent:m.parent?.name,instances:m.thinInstanceCount,enabled:m.isEnabled()})),traffic:world.traffic?.cars.map(c=>({x:c.x,z:c.z})),photo:world.photoTarget?.id};},resetPerformance(){world.samples=[];},tune(overrides:Record<string,unknown>){return world.cinematic?.tune(overrides);},finish(overrides:Record<string,unknown>){return world.cinematic?.finish(overrides);}}});await loading.finish();await loading.reveal();canvas.focus();}catch(e){console.error(e);loading.error(e);}}
void boot();
