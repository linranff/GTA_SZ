import {inRing} from './driving.ts';
import type {CityData,V2} from './city-types.ts';
import type {FlightPoint,FlightHit} from './city-flight-simulation.ts';
type Solid={id:string;rings:V2[][];height:number;x0:number;x1:number;z0:number;z1:number};
const mix=(a:FlightPoint,b:FlightPoint,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
/** Intersect a full-height building extrusion, respecting courtyard holes.
 * Height is essential here: the car's 2D collision circles cannot be reused. */
export function intersectFlightPrism(a:FlightPoint,b:FlightPoint,rings:V2[][],height:number):number|null{
 const dy=b.y-a.y;let lo=0,hi=1;
 if(Math.abs(dy)<1e-9){if(a.y<0||a.y>height)return null;}
 else{const p=-a.y/dy,q=(height-a.y)/dy;lo=Math.max(0,Math.min(p,q));hi=Math.min(1,Math.max(p,q));if(lo>hi)return null;}
 const inside=(t:number)=>{const p=mix(a,b,t);return inRing(p.x,p.z,rings[0])&&!rings.slice(1).some(r=>inRing(p.x,p.z,r));};
 if(inside(lo))return lo;
 const dx=b.x-a.x,dz=b.z-a.z,cuts=[lo,hi];
 for(const ring of rings)for(let i=1;i<ring.length;i++){
  const p=ring[i-1],q=ring[i],ex=q[0]-p[0],ez=q[1]-p[1],den=dx*ez-dz*ex;
  if(Math.abs(den)<1e-9)continue;
  const px=p[0]-a.x,pz=p[1]-a.z,t=(px*ez-pz*ex)/den,u=(px*dz-pz*dx)/den;
  if(t>=lo&&t<=hi&&u>=0&&u<=1)cuts.push(t);
 }
 cuts.sort((a,b)=>a-b);
 for(let i=0;i<cuts.length-1;i++)if(inside((cuts[i]+cuts[i+1])*.5))return cuts[i];
 return inside(hi)?hi:null;
}
export class FlightCityCollision{
 private cells=new Map<string,Solid[]>();private size=160;
 constructor(data:CityData,private heightAt:(x:number,z:number)=>number){
  data.buildings.forEach((b,index)=>{
   if(b.style==='landmark-detail'||b.height<=1.1)return; // Exact meshes handle replacement landmarks.
   const xs=b.rings[0].map(p=>p[0]),zs=b.rings[0].map(p=>p[1]);
   const s:Solid={id:(b as typeof b&{id?:string}).id??'building-'+index,rings:b.rings,height:b.height,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)};
   for(let x=Math.floor(s.x0/this.size);x<=Math.floor(s.x1/this.size);x++)for(let z=Math.floor(s.z0/this.size);z<=Math.floor(s.z1/this.size);z++){
    const key=x+','+z,list=this.cells.get(key)??[];list.push(s);this.cells.set(key,list);
   }
  });
 }
 sweep(a:FlightPoint,b:FlightPoint):FlightHit|null{
  const candidates=new Set<Solid>();let t=Infinity,id='';
  for(let x=Math.floor(Math.min(a.x,b.x)/this.size);x<=Math.floor(Math.max(a.x,b.x)/this.size);x++)for(let z=Math.floor(Math.min(a.z,b.z)/this.size);z<=Math.floor(Math.max(a.z,b.z)/this.size);z++)
   for(const s of this.cells.get(x+','+z)??[])candidates.add(s);
  for(const s of candidates){if(Math.min(a.y,b.y)>s.height||Math.max(a.x,b.x)<s.x0||Math.min(a.x,b.x)>s.x1||Math.max(a.z,b.z)<s.z0||Math.min(a.z,b.z)>s.z1)continue;const hit=intersectFlightPrism(a,b,s.rings,s.height);if(hit!==null&&hit<t){t=hit;id=s.id;}}
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/1.5));
  for(let i=0;i<=steps;i++){const u=i/steps;if(u>=t)break;const p=mix(a,b,u);if(p.y<=Math.max(-.1,this.heightAt(p.x,p.z))+.25)return {point:p,kind:'terrain'};}
  return t<Infinity?{point:mix(a,b,t),kind:'building',id}:null;
 }
}
