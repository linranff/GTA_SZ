import type {Road,V2} from './city-types.ts';
export class RoadGraph{
 nodes:V2[]=[];edges:Map<number,number>[]=[];lookup=new Map<string,number>();
 constructor(roads:Road[],noded?:{nodes:V2[];edges:number[][]}){if(noded){this.nodes=noded.nodes;this.edges=this.nodes.map(()=>new Map());for(const [a,b] of noded.edges){const p=this.nodes[a],q=this.nodes[b],d=Math.hypot(p[0]-q[0],p[1]-q[1]);this.edges[a].set(b,d);this.edges[b].set(a,d);}return;}for(const r of roads){let prev=-1;for(const p of r.points){const key=Math.round(p[0]/3)+','+Math.round(p[1]/3);let id=this.lookup.get(key);if(id===undefined){id=this.nodes.length;this.lookup.set(key,id);this.nodes.push(p);this.edges.push(new Map());}if(prev>=0&&prev!==id){const a=this.nodes[prev],b=this.nodes[id],d=Math.hypot(a[0]-b[0],a[1]-b[1]);this.edges[prev].set(id,d);this.edges[id].set(prev,d);}prev=id;}}}
 nearest(p:V2){let best=0,d=Infinity;for(let i=0;i<this.nodes.length;i++){const q=this.nodes[i],n=(p[0]-q[0])**2+(p[1]-q[1])**2;if(n<d){d=n;best=i;}}return best;}
 nearestEdge(p:V2){let best={a:0,b:0,point:this.nodes[0],t:0,d:Infinity,length:0};for(let i=0;i<this.nodes.length;i++){const a=this.nodes[i];for(const [j,length] of this.edges[i]){if(j<=i)continue;const b=this.nodes[j],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(length*length||1))),point:V2=[a[0]+dx*t,a[1]+dz*t],d=Math.hypot(p[0]-point[0],p[1]-point[1]);if(d<best.d)best={a:i,b:j,point,t,d,length};}}return best;}
 route(a:V2,b:V2):V2[]{
  const start=this.nearestEdge(a),end=this.nearestEdge(b);
  const dense=(points:V2[])=>{const result:V2[]=[];for(const p of points){if(!result.length){result.push(p);continue;}const q=result.at(-1)!,d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<.08)continue;const steps=Math.ceil(d/20);for(let k=1;k<=steps;k++)result.push([q[0]+(p[0]-q[0])*k/steps,q[1]+(p[1]-q[1])*k/steps]);}return result;};
  if(start.a===end.a&&start.b===end.b)return dense([a,start.point,end.point,b]);
  const dist=new Float64Array(this.nodes.length).fill(Infinity),parent=new Int32Array(this.nodes.length).fill(-1);
  const heap:[number,number][]=[];const push=(item:[number,number])=>{let i=heap.length;heap.push(item);while(i>0){const p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const result=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return result;};
  for(const [id,d] of [[start.a,start.t*start.length],[start.b,(1-start.t)*start.length]]){dist[id]=d;push([d,id]);}
  while(heap.length){const [d,id]=pop();if(d!==dist[id])continue;for(const [next,len] of this.edges[id])if(d+len<dist[next]){dist[next]=d+len;parent[next]=id;push([dist[next],next]);}}
  const costA=dist[end.a]+end.t*end.length,costB=dist[end.b]+(1-end.t)*end.length;const last=costA<=costB?end.a:end.b;if(!Number.isFinite(dist[last]))return [];
  const route:V2[]=[];for(let v=last;v>=0;v=parent[v])route.push(this.nodes[v]);return dense([a,start.point,...route.reverse(),end.point,b]);
 }
}
