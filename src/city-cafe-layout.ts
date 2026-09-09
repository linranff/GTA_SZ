import type {Landmark} from './city-types.ts';

export type CafeSpec={
 id:string;name:string;subtitle:string;basis:string;
 site:{x:number;z:number;heading:number;arrival:number[];roadYaw:number};
 footprint:{width:number;depth:number;height:number;floor:number;patioDepth:number};
 staff:{id:string;name:string;age:number;role:string;outfit:string;position:number[];heading:number;line:string}[];
};
export type CafeCollider={x:number;z:number;width:number;depth:number};
/** Original gameplay interior, in the same local scale as CityWalk/life hubs. */
export function cafeLayout(spec:CafeSpec,colliders:CafeCollider[],baseHeight:number){
 const {x,z,heading}=spec.site,c=Math.cos(heading),s=Math.sin(heading),f=spec.footprint;
 const local=(wx:number,wz:number)=>({x:(wx-x)*c-(wz-z)*s,z:(wx-x)*s+(wz-z)*c});
 const world=(lx:number,lz:number,y=baseHeight+f.floor)=>({x:x+lx*c+lz*s,z:z-lx*s+lz*c,y});
 const inside=(wx:number,wz:number)=>{const p=local(wx,wz);return Math.abs(p.x)<f.width/2-.18&&Math.abs(p.z)<f.depth/2-.18;};
 const reserved=(wx:number,wz:number,radius=0)=>{const p=local(wx,wz);return (Math.abs(p.x)<f.width/2+1+radius&&p.z> -f.depth/2-f.patioDepth-radius&&p.z<f.depth/2+1+radius)||(Math.abs(p.x)<1.8+radius&&p.z>=-22-radius&&p.z<=-9+radius);};
 const floorAt=(wx:number,wz:number,fallback:number)=>{
  const p=local(wx,wz);
  if(Math.abs(p.x)<9.55&&p.z> -12.18&&p.z<7.15)return baseHeight+f.floor;
  if(Math.abs(p.x)<1.55&&p.z>=-22&&p.z<=-10)return baseHeight+.18;
  return fallback;
 };
 const blocked=(wx:number,wz:number,padding=.28)=>{
  const p=local(wx,wz);
  if(Math.abs(p.x)>10.5||p.z< -12.5||p.z>7.5)return false;
  if(Math.abs(p.x)>8.66-padding&&Math.abs(p.x)<9.15+padding&&Math.abs(p.z)<7.15+padding)return true;
  if(Math.abs(p.x)<9.15+padding&&Math.abs(p.z-6.95)<.15+padding)return true;
  if(spec.staff.some(s=>Math.hypot(p.x-s.position[0],p.z-s.position[1])<.21+padding))return true;
  return colliders.some(b=>Math.abs(p.x-b.x)<b.width/2+padding&&Math.abs(p.z-b.z)<b.depth/2+padding);
 };
 const entry=world(0,-6.15),door=world(0,-7.8);
 const landmark:Landmark={id:spec.id,name:spec.name,x,z,height:f.height,area:'南山 · 春笋旁',excludeRadius:0,detailCollision:true,arrival:[spec.site.arrival[0],spec.site.arrival[1]],yaw:spec.site.roadYaw,photoDistance:28,photoAngle:heading+.25,photoElevation:.22,photoTargetHeight:baseHeight+1.8};
 return {local,world,inside,reserved,floorAt,blocked,entry,door,landmark,baseHeight};
}
