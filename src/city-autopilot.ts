import {clamp,closest,stepCar,type CarState,type CityCollision} from './driving.ts';
import type {RoadGraph} from './navigation.ts';
import type {V2} from './city-types.ts';

export type DrivingInput={throttle:number;steer:number;handbrake:boolean};
export type AutopilotDestination={id:string;name:string;arrival:V2};
export type AutopilotTraffic={x:number;z:number;speed?:number;yaw?:number};
export type AutopilotPhase='idle'|'driving'|'yielding'|'maneuvering'|'parking'|'arrived'|'blocked'|'cancelled';
export type AutopilotStatus={active:boolean;phase:AutopilotPhase;destination:AutopilotDestination|null;remainingDistance:number;
 etaSeconds:number|null;route:readonly V2[];reason:string|null;waitingSeconds:number;maneuvers:number;reroutes:number};
export type AutopilotResult={input:DrivingInput;status:AutopilotStatus};
/** Distances/speeds use game world units. Default parking tolerance is 2.5 units. */
export type AutopilotOptions={cruiseSpeed?:number;maxWaitSeconds?:number;arrivalRadius?:number};
type TrafficSample=AutopilotTraffic&{vx:number;vz:number};
type ManeuverPoint={x:number;z:number;yaw:number;gear:1|-1};
type SearchNode=ManeuverPoint&{cost:number;score:number;parent:SearchNode|null};
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const separation=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const stopped=():DrivingInput=>({throttle:0,steer:0,handbrake:true});
const neutral=():DrivingInput=>({throttle:0,steer:0,handbrake:false});
const ROAD_CRUISE:Record<string,number>={trunk:24,primary:24,secondary:20,tertiary:17,residential:15,unclassified:14,service:10};

/** Pure controller. The world owns stepCar/collision and must call cancel before manual input.
 * Uses the existing map RoadGraph's connectivity; it does not rewrite road direction rules.
 * No teleports, mesh access, timers, DOM input, or mutation of the supplied CarState.
 */
export class CityAutopilot {
 private phase:AutopilotPhase='idle';
 private destination:AutopilotDestination|null=null;
 private route:V2[]=[];
 private tail:number[]=[];
 private speedCautions:{index:number;speed:number}[]=[];
 private junctions=new Set<string>();
 private cursor=0;
 private reason:string|null=null;
 private remaining=0;
 private wait=0;
 private stalled=0;
 private lastPosition:{x:number;z:number}|null=null;
 private previousTraffic:AutopilotTraffic[]=[];
 private maneuver:ManeuverPoint[]=[];
 private maneuverCursor=0;
 private maneuverSeconds=0;
 private maneuverCount=0;
 private maneuverStart:ManeuverPoint|null=null;
 private turnRetry=0;
 private incidentTurns=0;
 private lastTurnDistance=-Infinity;
 private routeSearch:Generator<void,V2[],void>|null=null;
 private detourSearch:Generator<void,V2[],void>|null=null;
 private detourAttempts=0;
 private detourCount=0;
 private lastDetourDistance=-Infinity;
 private turnSearch:Generator<void,ManeuverPoint[],void>|null=null;
 private maneuverReplans=0;
 private readonly cruise:number;
 private readonly maxWait:number;
 private readonly arrivalRadius:number;

 constructor(private readonly graph:RoadGraph,private readonly collision:CityCollision,options:AutopilotOptions={}) {
  // 24 game m/s = 86.4 on the current HUD (which uses speed * 3.6).
  // Road classes and preview braking still reduce this free-road ceiling.
  this.cruise=clamp(options.cruiseSpeed??24,6,28);
  for(let i=0;i<graph.nodes.length;i++)if(graph.edges[i].size>2)this.junctions.add(graph.nodes[i].map(v=>Math.round(v*10)).join(','));
  this.maxWait=clamp(options.maxWaitSeconds??20,3,60);
  this.arrivalRadius=clamp(options.arrivalRadius??2.5,.8,3);
 }

 get status():AutopilotStatus {
  return {active:['driving','yielding','maneuvering','parking'].includes(this.phase),phase:this.phase,
   destination:this.destination,remainingDistance:this.remaining,etaSeconds:this.phase==='arrived'?0:this.phase==='blocked'?null:Math.ceil(this.remaining/Math.max(3,this.cruise*.7)+this.wait),
   route:this.route,reason:this.reason,waitingSeconds:this.wait,maneuvers:this.maneuverCount,reroutes:this.detourCount};
 }
 start(destination:AutopilotDestination):AutopilotStatus {
  if(destination?.arrival?.length!==2||!destination.arrival.every(Number.isFinite))throw Error('Autopilot destination must have finite road coordinates');
  this.destination={id:destination.id,name:destination.name,arrival:[...destination.arrival]};
  this.phase='driving';this.reason=null;this.route=[];this.tail=[];this.cursor=0;this.remaining=0;
  this.wait=0;this.stalled=0;this.lastPosition=null;this.previousTraffic=[];this.maneuver=[];this.maneuverCursor=0;this.maneuverSeconds=0;this.maneuverCount=0;this.maneuverStart=null;this.turnRetry=0;this.incidentTurns=0;this.lastTurnDistance=-Infinity;
  this.routeSearch=null;this.detourSearch=null;this.detourAttempts=0;this.detourCount=0;this.lastDetourDistance=-Infinity;this.turnSearch=null;this.maneuverReplans=0;
  return this.status;
 }
 cancel(reason='manual-takeover'):AutopilotStatus {
  this.phase='cancelled';this.reason=reason;this.maneuver=[];this.routeSearch=null;this.detourSearch=null;this.turnSearch=null;this.wait=0;return this.status;
 }
 private result(input:DrivingInput):AutopilotResult {return {input,status:this.status};}
 private block(reason:string):AutopilotResult {this.phase='blocked';this.reason=reason;return this.result(stopped());}

 /** Same projected road endpoints/connectivity as RoadGraph, with bounded CPU slices.
  * RoadGraph.route is synchronous; scanning and shortest-path work must not stall a frame.
  */
 private *findRoute(start:V2,end:V2,avoid:readonly V2[]=[]):Generator<void,V2[],void> {
  const nodes=this.graph.nodes,edges=this.graph.edges;
  // A confirmed stationary traffic blockage excludes only intersecting graph
  // segments. Check partial start/end connectors too: seeding both endpoints
  // of a blocked edge would silently route straight through the obstruction.
  const clear=(a:V2,b:V2)=>!avoid.some(p=>closest(p[0],p[1],a,b).d<3.5);
  type Edge={a:number;b:number;point:V2;t:number;d:number;length:number};
  const nearest:Edge[]=[start,end].map(()=>({a:0,b:0,point:[0,0],t:0,d:Infinity,length:0}));
  let slice=performance.now(),visited=0;
  for(let i=0;i<nodes.length;i++)for(const [j,length] of edges[i]) {
   if(j<=i)continue;
   for(let which=0;which<2;which++){const p=which?end:start,q=closest(p[0],p[1],nodes[i],nodes[j]);if(q.d<nearest[which].d)nearest[which]={a:i,b:j,point:[q.x,q.z],t:q.t,d:q.d,length};}
   if(++visited%128===0&&performance.now()-slice>2){yield;slice=performance.now();}
  }
  const [a,b]=nearest;if(!Number.isFinite(a.d)||!Number.isFinite(b.d))return [];
  if(!clear(start,a.point)||!clear(b.point,end))return [];
  if(a.a===b.a&&a.b===b.b&&clear(a.point,b.point))return [start,a.point,b.point,end];
  const distance=new Float64Array(nodes.length).fill(Infinity),parent=new Int32Array(nodes.length).fill(-1);
  type Entry={id:number;cost:number;score:number};const heap:Entry[]=[];
  const heuristic=(id:number)=>Math.hypot(nodes[id][0]-b.point[0],nodes[id][1]-b.point[1]);
  const push=(item:Entry)=>{let i=heap.length;heap.push(item);while(i>0){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].score<heap[j].score)j++;if(heap[j].score>=last.score)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
  for(const [id,cost] of [[a.a,a.t*a.length],[a.b,(1-a.t)*a.length]])if(clear(a.point,nodes[id])){distance[id]=cost;push({id,cost,score:cost+heuristic(id)});}
  let best=Infinity,last=-1;visited=0;
  while(heap.length) {
   const node=pop();if(node.score>=best)break;if(node.cost!==distance[node.id])continue;
   if((node.id===b.a||node.id===b.b)&&clear(nodes[node.id],b.point)){const total=node.cost+(node.id===b.a?b.t:1-b.t)*b.length;if(total<best){best=total;last=node.id;}}
   for(const [next,length] of edges[node.id]) {if(!clear(nodes[node.id],nodes[next]))continue;const cost=node.cost+length;if(cost<distance[next]){distance[next]=cost;parent[next]=node.id;push({id:next,cost,score:cost+heuristic(next)});}}
   if(++visited%32===0&&performance.now()-slice>2){yield;slice=performance.now();}
  }
  if(last<0)return [];
  const path:V2[]=[];for(let id=last;id>=0;id=parent[id])path.push(nodes[id]);
  return [start,a.point,...path.reverse(),b.point,end];
 }
 private plan(raw:V2[]):boolean {
  if(raw.length<2)return false;
  this.route=[];this.cursor=0;
  for(const p of raw) {
   if(!this.route.length){this.route.push([...p]);continue;}
   const from=this.route.at(-1)!,d=Math.hypot(p[0]-from[0],p[1]-from[1]);
   if(d<.03)continue;
   const n=Math.ceil(d/4);for(let i=1;i<=n;i++)this.route.push([from[0]+(p[0]-from[0])*i/n,from[1]+(p[1]-from[1])*i/n]);
  }
  this.tail=Array(this.route.length).fill(0);
  for(let i=this.route.length-2;i>=0;i--)this.tail[i]=this.tail[i+1]+Math.hypot(this.route[i+1][0]-this.route[i][0],this.route[i+1][1]-this.route[i][1]);
  this.speedCautions=[];
  for(let i=1;i<this.route.length-1;i++){const a=this.route[i-1],b=this.route[i],c=this.route[i+1];const turn=Math.abs(wrap(Math.atan2(c[0]-b[0],c[1]-b[1])-Math.atan2(b[0]-a[0],b[1]-a[1])));let speed=turn>.75?3.5:turn>.35?6:Infinity;if(this.junctions.has(b.map(v=>Math.round(v*10)).join(',')))speed=Math.min(speed,11);if(Number.isFinite(speed))this.speedCautions.push({index:i,speed});}
  this.remaining=this.tail[0];return this.route.length>1;
 }
 private nearest(state:CarState) {
  let best={index:this.cursor,x:state.x,z:state.z,d:Infinity,t:0};
  for(let i=Math.max(0,this.cursor-3);i<Math.min(this.route.length-1,this.cursor+25);i++) {
   const point=closest(state.x,state.z,this.route[i],this.route[i+1]);
   if(point.d<best.d)best={...point,index:i};
  }
  this.cursor=best.index;
  this.remaining=this.tail[best.index+1]+Math.hypot(best.x-this.route[best.index+1][0],best.z-this.route[best.index+1][1]);
  return best;
 }
 private ahead(near:{index:number;x:number;z:number},distance:number):V2 {
  let p:V2=[near.x,near.z];
  for(let i=near.index+1;i<this.route.length;i++) {
   const q=this.route[i],d=Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(d>=distance)return [p[0]+(q[0]-p[0])*distance/(d||1),p[1]+(q[1]-p[1])*distance/(d||1)];
   distance-=d;p=q;
  }
  return this.route.at(-1)!;
 }
 private trafficSamples(traffic:readonly AutopilotTraffic[],dt:number):TrafficSample[] {
  const result=traffic.map((car,i)=>{
   const previous=this.previousTraffic[i];let vx=0,vz=0;
   if(previous&&separation(car,previous)<Math.max(2,dt*25)){vx=(car.x-previous.x)/dt;vz=(car.z-previous.z)/dt;}
   return {...car,vx:clamp(vx,-25,25),vz:clamp(vz,-25,25)};
  });
  this.previousTraffic=traffic.map(c=>({x:c.x,z:c.z}));return result;
 }
 private roadAt(x:number,z:number):{d:number;width:number}|null {
  // Read the collision system's existing segment index. Prediction calls this
  // often; scalar projection avoids allocating one closest-point object per segment.
  let best=Infinity,width=0;
  for(const segment of this.collision.cells.get(`${Math.floor(x/this.collision.size)},${Math.floor(z/this.collision.size)}`)??[]) {
   const dx=segment.b[0]-segment.a[0],dz=segment.b[1]-segment.a[1];
   const t=clamp(((x-segment.a[0])*dx+(z-segment.a[1])*dz)/(dx*dx+dz*dz||1),0,1);
   const px=x-segment.a[0]-dx*t,pz=z-segment.a[1]-dz*t,d=px*px+pz*pz;
   if(d<best){best=d;width=segment.road.width;}
  }
  return width?{d:Math.sqrt(best),width}:null;
 }
 private poseClear(p:{x:number;z:number;yaw:number},traffic:readonly TrafficSample[],time=0):boolean {
  const n=this.roadAt(p.x,p.z);
  if(!n||n.d>n.width/2+.1)return false;
  const dx=Math.sin(p.yaw)*1.45,dz=Math.cos(p.yaw)*1.45;
  // Distance to a road segment is 1-Lipschitz. If this whole 1.45-unit disk is
  // within CityCollision's road exemption, both nose checks have the same result.
  if(n.d+1.45>=n.width/2-.65&&(this.collision.blocked(p.x+dx,p.z+dz)||this.collision.blocked(p.x-dx,p.z-dz)))return false;
  return !traffic.some(car=>Math.hypot(car.x+car.vx*time-p.x,car.z+car.vz*time-p.z)<3.05);
 }
 private clearance(state:CarState,steer:number,traffic:readonly TrafficSample[],maxDistance:number):number {
  const p={...state,speed:Math.max(2,Math.abs(state.speed))};let moved=0;
  for(let i=0;i<30&&moved<maxDistance;i++) {
   const x=p.x,z=p.z;stepCar(p,{throttle:0,steer,handbrake:false},.05);
   moved+=Math.hypot(p.x-x,p.z-z);
   if(!this.poseClear(p,traffic,(i+1)*.05))return Math.max(0,moved-.5);
  }
  return Infinity;
 }
 private inputFor(state:CarState,targetSpeed:number,steer:number):DrivingInput {
  if(Math.abs(targetSpeed)<.15)return {throttle:0,steer,handbrake:true};
  const drag=state.speed*.038+state.speed*Math.abs(state.speed)*.0022;
  let throttle=targetSpeed>=0?clamp((targetSpeed-state.speed)*.65+drag/9,-1,1):clamp((targetSpeed-state.speed)*.5+drag/5,-1,1);
  if(targetSpeed>0&&state.speed<-.3)throttle=1;
  return {throttle,steer,handbrake:false};
 }

 /** A short reversible road maneuver, searched in CPU slices while stopped. Each arc is collision checked.
  * It changes only future control targets, never the real car pose. Finite search and duration.
  */
 private *findManeuver(state:CarState,target:V2,targetYaw:number,traffic:readonly TrafficSample[]):Generator<void,ManeuverPoint[],void> {
  const queue:SearchNode[]=[],costs=new Map<string,number>();
  const key=(n:ManeuverPoint)=>`${Math.round(n.x/1.1)},${Math.round(n.z/1.1)},${Math.round(wrap(n.yaw)/.18)},${n.gear}`;
  const heuristic=(x:number,z:number,yaw:number)=>Math.hypot(x-target[0],z-target[1])+Math.abs(wrap(yaw-targetYaw))*2.5;
  const push=(node:SearchNode)=>{let i=queue.length;queue.push(node);while(i>0){const parent=(i-1)>>1;if(queue[parent].score<=node.score)break;queue[i]=queue[parent];i=parent;}queue[i]=node;};
  const pop=()=>{const first=queue[0],last=queue.pop()!;if(queue.length){let i=0;while(i*2+1<queue.length){let j=i*2+1;if(j+1<queue.length&&queue[j+1].score<queue[j].score)j++;if(queue[j].score>=last.score)break;queue[i]=queue[j];i=j;}queue[i]=last;}return first;};
  push({x:state.x,z:state.z,yaw:state.yaw,gear:1,cost:0,score:heuristic(state.x,state.z,state.yaw),parent:null});
  let slice=performance.now();
  for(let expanded=0;queue.length&&expanded<5000;expanded++) {
   if(expanded%4===0&&performance.now()-slice>2){yield;slice=performance.now();}
   const node=pop();if(node.cost>(costs.get(key(node))??Infinity)+.001)continue;
   if(Math.hypot(node.x-target[0],node.z-target[1])<1.8&&Math.abs(wrap(node.yaw-targetYaw))<.3) {
    const path:ManeuverPoint[]=[];for(let n:SearchNode|null=node;n?.parent;n=n.parent)path.push({x:n.x,z:n.z,yaw:n.yaw,gear:n.gear});return path.reverse();
   }
   for(const gear of [1,-1] as const)for(const steer of [-1,0,1]) {
    let x=node.x,z=node.z,yaw=node.yaw,valid=true;
    for(let i=0;i<5;i++){yaw+=gear*.32/3.2*Math.tan(steer*.445);x+=Math.sin(yaw)*gear*.32;z+=Math.cos(yaw)*gear*.32;if(Math.hypot(x-state.x,z-state.z)>25||!this.poseClear({x,z,yaw},traffic)){valid=false;break;}}
    if(!valid)continue;
    const cost=node.cost+1.6+(gear<0?.35:0)+(gear!==node.gear?3.2:0)+Math.abs(steer)*.08;
    const next={x,z,yaw,gear,cost,score:cost+heuristic(x,z,yaw),parent:node},k=key(next);
    if(cost>=(costs.get(k)??Infinity))continue;costs.set(k,cost);push(next);
   }
  }
  return [];
 }
 private searchTurn(state:CarState,target:V2,yaw:number,traffic:readonly TrafficSample[]):ManeuverPoint[]|null {
  this.turnSearch??=this.findManeuver({...state},target,yaw,traffic);
  const next=this.turnSearch.next();if(!next.done)return null;
  this.turnSearch=null;return next.value;
 }
 private followManeuver(state:CarState,traffic:readonly TrafficSample[],dt:number):AutopilotResult {
  this.phase='maneuvering';this.maneuverSeconds+=dt;
  if(this.maneuverSeconds>45)return this.block('turn-could-not-complete-safely');
  const gear=this.maneuver[this.maneuverCursor].gear;
  let end=this.maneuverCursor;while(end+1<this.maneuver.length&&this.maneuver[end+1].gear===gear)end++;
  let near={index:this.maneuverCursor,x:state.x,z:state.z,d:Infinity,t:0};
  for(let i=this.maneuverCursor;i<=end;i++) {
   const a=i?this.maneuver[i-1]:this.maneuverStart!,b=this.maneuver[i],p=closest(state.x,state.z,[a.x,a.z],[b.x,b.z]);
   if(p.d<near.d)near={...p,index:i};
  }
  this.maneuverCursor=near.index;
  const endPoint=this.maneuver[end],endPrevious=end?this.maneuver[end-1]:this.maneuverStart!;
  const pastEnd=(state.x-endPoint.x)*(endPoint.x-endPrevious.x)+(state.z-endPoint.z)*(endPoint.z-endPrevious.z)>0;
  // Search accepts a pose within this terminal tolerance. Tracking must accept
  // the same pose: otherwise a short recovery can be an empty successful path,
  // while this follower keeps trying to reach the exact point at a road edge.
  const terminalPose=end===this.maneuver.length-1&&separation(state,endPoint)<1.8&&Math.abs(wrap(state.yaw-endPoint.yaw))<.3;
  if(terminalPose||separation(state,endPoint)<.35||(near.index===end&&pastEnd&&near.d<1.3)) {
   if(Math.abs(state.speed)>.15)return this.result(stopped());
   if(end===this.maneuver.length-1){this.maneuver=[];this.stalled=0;this.wait=0;this.phase='driving';return this.result(stopped());}
   this.maneuverCursor=end+1;return this.result(stopped());
  }
  if(Math.sign(state.speed)!==gear&&Math.abs(state.speed)>.12)return this.result(stopped());
  let target={x:near.x,z:near.z},look=2.2;
  for(let i=near.index;i<=end;i++) {const q=this.maneuver[i],d=separation(target,q);if(d>look){target={x:target.x+(q.x-target.x)*look/d,z:target.z+(q.z-target.z)*look/d};break;}look-=d;target=q;}
  const motionYaw=state.yaw+(gear<0?Math.PI:0),error=wrap(Math.atan2(target.x-state.x,target.z-state.z)-motionYaw);
  const length=Math.max(.7,separation(state,target)),wheel=gear*Math.atan(6.4*Math.sin(error)/length);
  const limit=.48/(1+Math.abs(state.speed)*.026),steer=clamp(wheel/limit,-1,1);
  // At a gear change the real steering rack needs time to cross from one lock
  // to the other. Set the wheels while stopped before following the next arc.
  if(Math.abs(state.speed)<.15&&Math.abs(state.steer-steer*limit)>.08)return this.result({...stopped(),steer});
  // A straight nose probe can reject a safe curved departure at the road edge
  // forever. Predict the requested arc with the same steering lag and wheelbase
  // as the actual car, covering at least its braking distance in either gear.
  const probe={...state,speed:gear*Math.max(.8,Math.abs(state.speed))};let clear=true,moved=0;
  for(let i=0;i<16&&moved<.4+state.speed*state.speed/20;i++) {
   const x=probe.x,z=probe.z;stepCar(probe,this.inputFor(probe,gear*Math.max(.8,Math.abs(state.speed)),steer),.05);
   moved+=Math.hypot(probe.x-x,probe.z-z);
   if(!this.poseClear(probe,traffic,(i+1)*.05)){clear=false;break;}
  }
  if(!clear) {
   this.wait+=dt;
   if(this.wait>1&&Math.abs(state.speed)<.15&&this.maneuverReplans<2) {
    const goal=this.maneuver.at(-1)!,path=this.searchTurn(state,[goal.x,goal.z],goal.yaw,traffic);
    if(path){this.maneuverReplans++;if(path.length){this.maneuver=path;this.maneuverStart={...state,gear:path[0].gear};this.maneuverCursor=0;this.wait=0;}}
   }
   if(this.wait>this.maxWait)return this.block('turn-blocked');return this.result(stopped());
  }
  this.wait=0;return this.result(this.inputFor(state,gear*Math.min(1.7,Math.sqrt(3*Math.max(.12,separation(state,endPoint)-.2))),steer));
 }

 update(state:CarState,traffic:readonly AutopilotTraffic[],dt:number):AutopilotResult {
  if(!this.status.active)return this.result(this.phase==='arrived'||this.phase==='blocked'?stopped():neutral());
  dt=clamp(Number.isFinite(dt)?dt:0,.001,.05);
  const cars=this.trafficSamples(traffic,dt);
  if(this.detourSearch) {
   this.wait+=dt;this.phase='yielding';this.reason='rerouting-around-traffic';
   const next=this.detourSearch.next();if(!next.done)return this.result(stopped());
   this.detourSearch=null;
   if(next.value.length>1&&this.plan(next.value)) {
    this.detourCount++;this.wait=0;this.stalled=0;this.lastPosition=null;this.phase='driving';this.reason=null;
   }else this.reason='traffic-no-detour';
   return this.result(stopped());
  }
  if(Math.hypot(state.x-this.destination!.arrival[0],state.z-this.destination!.arrival[1])<=this.arrivalRadius&&Math.abs(state.speed)<.2) {
   this.phase='arrived';this.remaining=0;this.wait=0;this.reason=null;return this.result(stopped());
  }
  if(!this.route.length) {
   this.routeSearch??=this.findRoute([state.x,state.z],this.destination!.arrival);
   const next=this.routeSearch.next();if(!next.done){this.reason='planning-route';return this.result(stopped());}
   this.routeSearch=null;this.reason=null;if(!this.plan(next.value))return this.block('no-road-route');
  }
  const moved=this.lastPosition?separation(state,this.lastPosition):0;this.lastPosition={x:state.x,z:state.z};
  this.stalled=moved<.003&&Math.abs(state.speed)<.3?this.stalled+dt:0;
  if(this.maneuver.length)return this.followManeuver(state,cars,dt);
  const near=this.nearest(state),arrival=this.destination!.arrival,arrivalDistance=Math.hypot(state.x-arrival[0],state.z-arrival[1]);
  if(arrivalDistance<=this.arrivalRadius&&this.remaining<8) {
   this.phase=Math.abs(state.speed)<.2?'arrived':'parking';if(this.phase==='arrived'){this.remaining=0;this.wait=0;this.reason=null;}
   return this.result(stopped());
  }
  const guide=this.ahead(near,Math.min(8,Math.max(3,this.remaining))),guideAfter=this.ahead(near,Math.min(11,this.remaining));
  const heading=Math.atan2(guideAfter[0]-guide[0],guideAfter[1]-guide[1]);
  const toGuide=Math.atan2(guide[0]-state.x,guide[1]-state.z),headingError=wrap(toGuide-state.yaw);
  const staticObstruction=this.wait>2&&this.clearance(state,0,[],4)<1.5;
  if((Math.abs(headingError)>1.75&&arrivalDistance>this.arrivalRadius)||staticObstruction) {
   this.phase='maneuvering';
   if(Math.abs(state.speed)>.15)return this.result(stopped());
   if(state.distance-this.lastTurnDistance>35)this.incidentTurns=0;
   if(this.incidentTurns>=3||this.maneuverCount>=20)return this.block('route-requires-another-unsafe-turn');
   this.turnRetry-=dt;
   if(this.turnRetry>0){this.wait+=dt;this.phase='yielding';if(this.wait>this.maxWait)return this.block('no-safe-turn-space');return this.result(stopped());}
   const target=this.ahead(near,Math.min(8,this.remaining));
   const path=this.searchTurn(state,target,Number.isFinite(heading)&&Math.hypot(guideAfter[0]-guide[0],guideAfter[1]-guide[1])>.1?heading:toGuide,cars);
   if(!path)return this.result(stopped());this.maneuver=path;
   if(!this.maneuver.length){this.turnRetry=1;this.wait+=dt;this.phase='yielding';if(this.wait>this.maxWait)return this.block('no-safe-turn-space');return this.result(stopped());}
   this.maneuverStart={x:state.x,z:state.z,yaw:state.yaw,gear:this.maneuver[0].gear};
   this.maneuverCount++;this.incidentTurns++;this.lastTurnDistance=state.distance;this.maneuverCursor=0;this.maneuverSeconds=0;this.maneuverReplans=0;return this.followManeuver(state,cars,dt);
  }
  const roadWidth=Math.min(...[0,5,10,15].map(d=>{const p=this.ahead(near,d);return this.collision.nearest(...p)?.road.width??4;}));
  const available=Math.max(0,roadWidth/2-1.1),fade=clamp((this.remaining-5)/25,0,1);
  const offsets=[Math.min(1.15,available)*fade];
  if(this.remaining>15)offsets.push(0);
  if(available>3.5&&this.remaining>35)offsets.push(Math.min(5.2,available));
  let best:{steer:number;clearance:number;error:number;offset:number;score:number}|null=null;
  for(const offset of offsets) {
   const look=offset>3.5?6:clamp(4+Math.abs(state.speed)*.5,5.5,10),a=this.ahead(near,look),b=this.ahead(near,look+3),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
   const target=[a[0]+Math.cos(yaw)*offset,a[1]-Math.sin(yaw)*offset],error=wrap(Math.atan2(target[0]-state.x,target[1]-state.z)-state.yaw);
   const wheel=Math.atan(6.4*Math.sin(error)/Math.max(2,Math.hypot(target[0]-state.x,target[1]-state.z))),limit=.48/(1+Math.abs(state.speed)*.026),steer=clamp(wheel/limit,-1,1);
   const clearance=this.clearance(state,steer,cars,Math.max(8,state.speed*1.5));
   const score=Math.min(clearance,25)-Math.abs(error)*2-(offset===offsets[0]?0:.4);
   if(!best||score>best.score)best={steer,clearance,error,offset,score};
  }
  const choice=best!,far=this.ahead(near,18),bend=Math.abs(wrap(Math.atan2(far[0]-guide[0],far[1]-guide[1])-toGuide));
  const road=this.collision.nearest(state.x,state.z)?.road;
  let speed=Math.min(this.cruise,road?.kind.endsWith('_link')?10:ROAD_CRUISE[road?.kind??'']??16,roadWidth<4.5?10:roadWidth<6?14:Infinity);
  // Anticipate route turns/junctions over the complete braking distance.
  // This changes desired speed before steering starts, rather than accelerating
  // into a corner and relying on the near-target heading error to brake late.
  const preview=Math.max(32,state.speed*state.speed/12+14);
  for(const caution of this.speedCautions){if(caution.index<this.cursor)continue;const distance=this.remaining-this.tail[caution.index];if(distance>preview)break;speed=Math.min(speed,Math.sqrt(caution.speed*caution.speed+12*Math.max(0,distance-7)));}
  if(bend>.75||Math.abs(choice.error)>.65)speed=Math.min(speed,3.5);else if(bend>.35||Math.abs(choice.error)>.3)speed=Math.min(speed,6);
  const stopDistance=this.remaining<10?arrivalDistance:this.remaining;
  speed=Math.min(speed,Math.sqrt(10*Math.max(.08,stopDistance-this.arrivalRadius)),Math.sqrt(12*Math.max(0,choice.clearance-1.2)));
  if(this.remaining<15)speed=Math.min(speed,4);
  if(speed<.3) {
   this.phase='yielding';this.wait+=dt;
   if(this.wait>3&&Math.abs(state.speed)<.2&&this.detourAttempts<3&&state.distance-this.lastDetourDistance>30
    &&this.clearance(state,choice.steer,[],8)>4) {
    const stationary=cars.filter(c=>Math.hypot(c.vx,c.vz)<.35&&separation(c,state)<18);
    if(stationary.length) {
     this.detourAttempts++;this.lastDetourDistance=state.distance;
     this.detourSearch=this.findRoute([state.x,state.z],arrival,stationary.map(c=>[c.x,c.z]));
     this.reason='rerouting-around-traffic';return this.result(stopped());
    }
   }
   if(this.wait>this.maxWait)return this.block('road-blocked');
   return this.result(stopped());
  }
  if(this.phase==='yielding')this.stalled=0;
  if(this.stalled>5)return this.block('unable-to-make-progress');
  this.wait=0;this.reason=null;this.phase=this.remaining<15?'parking':'driving';return this.result(this.inputFor(state,speed,choice.steer));
 }
}
