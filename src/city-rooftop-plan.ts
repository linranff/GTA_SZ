/** Pure rooftop planning for ordinary buildings: deterministic per-building roof finish and a
 * set of rooftop props (helipads, plant rooms, cooling towers, tanks, antennas, solar, skylights)
 * fitted inside each footprint. Shared by scripts/prepare_city_rooftops.mjs (offline, writes
 * public/city/rooftops/*) and the runtime, so tests can cover placement without Blender or WebGL.
 *
 * Geometry contract mirrors scripts/build_city_facades.py: the main roof is at `height`, the
 * parapet ring reaches height+.4, and a 76 % crown (scaled about the vertex mean) rises to
 * height+max(1.2,height*.035). Props sit on the crown roof; small plant may spill onto the
 * outer ledge. Everything is an artistic typology guess from OSM footprints, not a survey.
 */
export type RooftopBuilding={id?:string;rings:number[][][];height:number;style:string;seed:number};
/** [kind, x, z, y, sx, sy, sz, yaw]. Box kinds scale per axis; unit kinds use sx=sy=sz. yaw is the Babylon Y rotation. */
export type RooftopProp=[number,number,number,number,number,number,number,number];
export type RooftopPlan={finish:number;tint:number;props:RooftopProp[];rect:InscribedRect|null};
export type InscribedRect={cx:number;cz:number;theta:number;halfU:number;halfV:number};

export const ROOFTOP_KINDS=[
 {id:'helipad',box:false,footprint:[1,1]},          // unit disc radius 1 → scale = radius
 {id:'helipad-raised',box:false,footprint:[1,1]},
 {id:'penthouse-render',box:true,footprint:[1,1]},
 {id:'penthouse-glass',box:true,footprint:[1,1]},
 {id:'penthouse-metal',box:true,footprint:[1,1]},
 {id:'stair-bulkhead',box:true,footprint:[1,1]},
 {id:'cooling-tower',box:false,footprint:[2.4,2.4]},
 {id:'ac-unit',box:false,footprint:[1.1,.9]},
 {id:'water-tank',box:false,footprint:[1.8,1.8]},
 {id:'antenna',box:false,footprint:[1.2,1.2]},
 {id:'solar-array',box:false,footprint:[4,3]},
 {id:'skylight',box:true,footprint:[1,1]},
 {id:'vent-pipe',box:false,footprint:[.5,.5]},
 {id:'crown-screen',box:true,footprint:[1,1]},      // hollow louvre ring: sx,sz = screen extent, sy = height
] as const;
export const KIND=Object.fromEntries(ROOFTOP_KINDS.map((k,i)=>[k.id,i])) as Record<(typeof ROOFTOP_KINDS)[number]['id'],number>;

/** Linear roof finish colours (artistic; multiply the procedural roof detail texture). */
export const ROOF_FINISHES=[
 {id:'membrane-dark',color:[.13,.145,.155],seams:1,grain:.25,stains:.6},
 {id:'concrete-grey',color:[.32,.33,.32],seams:.6,grain:.5,stains:.7},
 {id:'cement-pale',color:[.44,.44,.41],seams:.5,grain:.6,stains:.8},
 {id:'gravel-warm',color:[.42,.39,.34],seams:0,grain:1,stains:.4},
 {id:'terracotta',color:[.36,.20,.14],seams:.35,grain:.3,stains:.5},
 {id:'green-roof',color:[.11,.19,.085],seams:0,grain:.9,stains:.2},
 {id:'tpo-white',color:[.56,.57,.56],seams:1,grain:.15,stains:.7},
 {id:'tile-red',color:[.33,.15,.11],seams:.5,grain:.35,stains:.4},
] as const;

export function mulberry32(seed:number){
 let a=(seed>>>0)^0x9e3779b9;
 return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function polygonArea(ring:number[][]){let a=0;for(let i=0;i<ring.length-1;i++)a+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];return Math.abs(a)/2;}
export function pointInPolygon(x:number,z:number,ring:number[][]){
 let inside=false;const n=ring.length-1;
 for(let i=0,j=n-1;i<n;j=i++){const xi=ring[i][0],zi=ring[i][1],xj=ring[j][0],zj=ring[j][1];
  if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;}
 return inside;
}
/** Same crown scaling as city_mesh.footprint: about the vertex mean of the ring (closing vertex dropped). */
export function scaleRing(ring:number[][],scale:number){
 const pts=ring.slice(0,-1);const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
 const out=pts.map(([x,z])=>[cx+(x-cx)*scale,cz+(z-cz)*scale]);out.push(out[0]);return out;
}
function longestEdgeAngle(ring:number[][]){
 let best=0,theta=0;
 for(let i=0;i<ring.length-1;i++){const dx=ring[i+1][0]-ring[i][0],dz=ring[i+1][1]-ring[i][1],l=dx*dx+dz*dz;if(l>best){best=l;theta=Math.atan2(dz,dx);}}
 return theta;
}
/** Largest axis-aligned rectangle (in the longest-edge frame) grown side by side from a few seed
 * centres; boundary samples every ≤1.5 m must stay inside the polygon. Good enough for OSM
 * footprints: convex blocks fill almost completely, L/U shapes get their biggest wing. */
export function inscribedRect(ring:number[][],step=.5):InscribedRect|null{
 if(ring.length<4)return null;
 const theta=longestEdgeAngle(ring),c=Math.cos(theta),s=Math.sin(theta);
 const pts=ring.slice(0,-1);const mx=pts.reduce((a,p)=>a+p[0],0)/pts.length,mz=pts.reduce((a,p)=>a+p[1],0)/pts.length;
 const local=ring.map(([x,z])=>[(x-mx)*c+(z-mz)*s,-(x-mx)*s+(z-mz)*c]);
 let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
 for(const [u,v] of local){minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);}
 const inside=(u:number,v:number)=>pointInPolygon(u,v,local);
 const segmentInside=(u0:number,v0:number,u1:number,v1:number)=>{const n=Math.max(1,Math.ceil(Math.hypot(u1-u0,v1-v0)/1.5));for(let i=0;i<=n;i++)if(!inside(u0+(u1-u0)*i/n,v0+(v1-v0)*i/n))return false;return true;};
 const seeds:[number,number][]=[[0,0]];
 for(let a=1;a<=3;a++)for(let b=1;b<=3;b++)seeds.push([minU+(maxU-minU)*a/4,minV+(maxV-minV)*b/4]);
 let best:InscribedRect|null=null,bestArea=0;
 for(const [su,sv] of seeds){
  if(!inside(su,sv))continue;
  let l=su-step*.5,r=su+step*.5,b=sv-step*.5,t=sv+step*.5;
  if(!segmentInside(l,b,r,b)||!segmentInside(l,t,r,t)||!segmentInside(l,b,l,t)||!segmentInside(r,b,r,t))continue;
  const grow=[true,true,true,true];
  for(let guard=0;guard<400&&grow.some(Boolean);guard++){
   if(grow[0]){const nl=l-step;if(nl>minU-1&&segmentInside(nl,b,nl,t))l=nl;else grow[0]=false;}
   if(grow[1]){const nr=r+step;if(nr<maxU+1&&segmentInside(nr,b,nr,t))r=nr;else grow[1]=false;}
   if(grow[2]){const nb=b-step;if(nb>minV-1&&segmentInside(l,nb,r,nb))b=nb;else grow[2]=false;}
   if(grow[3]){const nt=t+step;if(nt<maxV+1&&segmentInside(l,nt,r,nt))t=nt;else grow[3]=false;}
  }
  const area=(r-l)*(t-b);
  if(area>bestArea){bestArea=area;const cu=(l+r)/2,cv=(b+t)/2;best={cx:mx+cu*c-cv*s,cz:mz+cu*s+cv*c,theta,halfU:(r-l)/2,halfV:(t-b)/2};}
 }
 return best;
}

type Slot={u:number;v:number;hu:number;hv:number};
class Layout{
 used:Slot[]=[];rect:InscribedRect;margin:number;
 constructor(rect:InscribedRect,margin:number){this.rect=rect;this.margin=margin;}
 get hu(){return this.rect.halfU-this.margin;}
 get hv(){return this.rect.halfV-this.margin;}
 fits(u:number,v:number,hu:number,hv:number){
  if(Math.abs(u)+hu>this.hu||Math.abs(v)+hv>this.hv)return false;
  for(const s of this.used)if(Math.abs(s.u-u)<s.hu+hu+.35&&Math.abs(s.v-v)<s.hv+hv+.35)return false;
  return true;
 }
 /** Try random positions (edge-biased when asked); returns the slot or null. */
 place(rng:()=>number,hu:number,hv:number,edge=false,tries=14):Slot|null{
  if(hu>this.hu||hv>this.hv)return null;
  for(let i=0;i<tries;i++){
   let u=(rng()*2-1)*(this.hu-hu),v=(rng()*2-1)*(this.hv-hv);
   if(edge){const side=Math.floor(rng()*4);if(side===0)u=-(this.hu-hu);else if(side===1)u=this.hu-hu;else if(side===2)v=-(this.hv-hv);else v=this.hv-hv;}
   if(this.fits(u,v,hu,hv)){const slot={u,v,hu,hv};this.used.push(slot);return slot;}
  }
  return null;
 }
 world(u:number,v:number){const c=Math.cos(this.rect.theta),s=Math.sin(this.rect.theta);return [this.rect.cx+u*c-v*s,this.rect.cz+u*s+v*c];}
}

export function crownTop(height:number){return height+Math.max(1.2,height*.035);}
function pick<T>(rng:()=>number,weights:[T,number][]):T{let total=0;for(const w of weights)total+=w[1];let r=rng()*total;for(const [v,w] of weights){r-=w;if(r<=0)return v;}return weights[weights.length-1][0];}
function irange(rng:()=>number,a:number,b:number){return a+Math.floor(rng()*(b-a+1));}
function frange(rng:()=>number,a:number,b:number){return a+rng()*(b-a);}

/** Roof finish is chosen for every building (also those too small for props). */
export function roofFinishFor(building:RooftopBuilding,rng:()=>number){
 const area=polygonArea(building.rings[0]),h=building.height,office=building.style==='office';
 if(area>2500&&h<35)return pick(rng,[[2,.3],[3,.2],[5,.25],[1,.15],[6,.1]]);
 if(office&&h>=60)return pick(rng,[[0,.5],[1,.3],[2,.15],[6,.05]]);
 if(office)return pick(rng,[[1,.35],[2,.25],[0,.2],[3,.1],[5,.1]]);
 if(h>=50)return pick(rng,[[1,.4],[2,.35],[0,.1],[3,.1],[5,.05]]);
 return pick(rng,[[2,.3],[1,.3],[3,.15],[4,.1],[7,.05],[5,.05],[0,.05]]);
}

export function planRooftop(building:RooftopBuilding):RooftopPlan{
 const rng=mulberry32(building.seed);
 const finish=roofFinishFor(building,rng),tint=Math.floor(rng()*16);
 const ring=building.rings[0];const area=polygonArea(ring),h=building.height;
 const props:RooftopProp[]=[];
 if(area<30||h<3.5)return {finish,tint,props,rect:null};
 const crown=scaleRing(ring,.76),rect=inscribedRect(crown);
 if(!rect||rect.halfU<1.2||rect.halfV<1.2)return {finish,tint,props,rect};
 const top=crownTop(h),layout=new Layout(rect,.6),yaw=-rect.theta;
 const add=(kind:number,slot:Slot,sx:number,sy:number,sz:number,dy=0,rot=yaw)=>{const [x,z]=layout.world(slot.u,slot.v);props.push([kind,round(x),round(z),round(top+dy),round(sx),round(sy),round(sz),round(rot,3)]);};
 const unit=(kind:number,scale:number,edge=false,dy=0)=>{const fp=ROOFTOP_KINDS[kind].footprint;const slot=layout.place(rng,fp[0]*scale/2,fp[1]*scale/2,edge);if(slot)add(kind,slot,scale,scale,scale,dy);return !!slot;};
 const boxProp=(kind:number,w:number,d:number,height:number,edge=false,at?:[number,number])=>{
  const hu=w/2,hv=d/2;let slot:Slot|null=null;
  if(at&&layout.fits(at[0],at[1],hu,hv)){slot={u:at[0],v:at[1],hu,hv};layout.used.push(slot);}else slot=layout.place(rng,hu,hv,edge);
  if(slot)add(kind,slot,w,height,d);return !!slot;
 };
 const office=building.style==='office'||h>=80,podium=area>2500&&h<35,minSide=Math.min(layout.hu,layout.hv)*2;
 if(podium){
  const n=irange(rng,1,2);for(let i=0;i<n;i++)boxProp(KIND['penthouse-metal'],frange(rng,4,9),frange(rng,3,6),frange(rng,2.2,3.2));
  if(rng()<.7){const k=irange(rng,2,5);for(let i=0;i<k;i++)boxProp(KIND.skylight,frange(rng,3,8),frange(rng,2,4),.8);}
  const towers=irange(rng,2,4);for(let i=0;i<towers;i++)unit(KIND['cooling-tower'],frange(rng,1,1.5),true);
  for(let i=irange(rng,1,4);i>0;i--)unit(KIND['ac-unit'],frange(rng,.9,1.3));
  for(let i=irange(rng,1,3);i>0;i--)unit(KIND['vent-pipe'],frange(rng,.9,1.3));
  return {finish,tint,props,rect};
 }
 if(h<7){if(rng()<.5)unit(KIND['water-tank'],frange(rng,.8,1.1));if(rng()<.5)unit(KIND['ac-unit'],frange(rng,.8,1.1));return {finish,tint,props,rect};}
 if(office){
  let helipad=false,screenHeight=0;
  // Mechanical screen around the crown roof on a third of mid/high offices without a helipad; it
  // changes the silhouette from the street and hides the plant inside from the air.
  if(h>=45&&minSide>=9&&rng()<.4){
   screenHeight=frange(rng,2.4,4);
   const [x,z]=layout.world(0,0);
   props.push([KIND['crown-screen'],round(x),round(z),round(top),round(layout.hu*2-.6),round(screenHeight),round(layout.hv*2-.6),round(yaw,3)]);
  }
  const radius=Math.min(7.5,minSide*.38);
  if(radius>=4.2&&!screenHeight){
   const p=h>=90?.65:h>=60?.3:0;
   if(rng()<p){
    const raised=h>=90&&rng()<.35,kind=raised?KIND['helipad-raised']:KIND.helipad;
    // Helipad at one end of the rect when there is room for a plant room beside it.
    const along=layout.hu>=layout.hv,offset=(along?layout.hu:layout.hv)-radius-.2;
    const wantSide=offset>radius+2.5;
    const u=wantSide&&along?offset*(rng()<.5?-1:1):0,v=wantSide&&!along?offset*(rng()<.5?-1:1):0;
    if(layout.fits(u,v,radius,radius)){layout.used.push({u,v,hu:radius,hv:radius});add(kind,{u,v,hu:radius,hv:radius},radius,radius,radius,0,yaw+frange(rng,-.2,.2));helipad=true;}
   }
  }
  if(rng()<.85){
   const w=Math.max(3,layout.hu*2*frange(rng,.3,.55)),d=Math.max(3,layout.hv*2*frange(rng,.3,.55));
   let ph=h>=60?frange(rng,3,5.5):frange(rng,2.4,4.2);if(screenHeight)ph=Math.min(ph,screenHeight-.3);
   const kind=pick(rng,[[KIND['penthouse-render'],.45],[KIND['penthouse-glass'],.3],[KIND['penthouse-metal'],.25]]);
   // Centre it when possible so it also swallows the legacy 1.1 m roof slab from the base asset.
   if(!boxProp(kind,w,d,ph,false,helipad?undefined:[0,0]))boxProp(kind,w*.7,d*.7,ph);
  }
  if(layout.hu*layout.hv*4>60&&rng()<.8){const n=irange(rng,1,3);for(let i=0;i<n;i++)unit(KIND['cooling-tower'],frange(rng,.9,1.4),true);}
  if(rng()<(h>=60?.5:.2))unit(KIND.antenna,frange(rng,.8,1.6),true);
  if(rng()<.5)boxProp(KIND['stair-bulkhead'],frange(rng,2.2,3.2),frange(rng,2.6,3.6),frange(rng,2.3,2.8),true);
  if(rng()<.6){const n=irange(rng,1,4);for(let i=0;i<n;i++)unit(KIND['ac-unit'],frange(rng,.8,1.2));}
  for(let i=irange(rng,1,3);i>0;i--)unit(KIND['vent-pipe'],frange(rng,.8,1.3));
  return {finish,tint,props,rect};
 }
 // Residential
 if(h>=65){
  boxProp(KIND['stair-bulkhead'],frange(rng,2.8,3.6),frange(rng,3.4,4.4),frange(rng,2.6,3),false,[0,0]);
  for(let i=irange(rng,1,2);i>0;i--)unit(KIND['water-tank'],frange(rng,1,1.5),true);
  if(rng()<.3)unit(KIND.antenna,frange(rng,.8,1.2),true);
  for(let i=irange(rng,1,3);i>0;i--)unit(KIND['ac-unit'],frange(rng,.8,1.2));
  return {finish,tint,props,rect};
 }
 if(rng()<.9){const n=irange(rng,1,3);for(let i=0;i<n;i++)unit(KIND['water-tank'],frange(rng,.9,1.5),rng()<.5);}
 const bulkheads=Math.max(1,Math.min(3,Math.round(layout.hu*2/22)));
 for(let i=0;i<bulkheads;i++)boxProp(KIND['stair-bulkhead'],frange(rng,2.2,3),frange(rng,2.6,3.4),frange(rng,2.3,2.8));
 if(h<40&&layout.hu*layout.hv*4>80&&rng()<.22){const n=irange(rng,1,4);for(let i=0;i<n;i++)unit(KIND['solar-array'],1);}
 for(let i=irange(rng,1,4);i>0;i--)unit(KIND['ac-unit'],frange(rng,.8,1.2));
 for(let i=irange(rng,1,2);i>0;i--)unit(KIND['vent-pipe'],frange(rng,.8,1.3));
 return {finish,tint,props,rect};
}
function round(v:number,digits=2){const f=10**digits;return Math.round(v*f)/f;}

/** Lookup raster encoding shared with the roof shader: 0 = no ordinary building, else 1+finish*16+tint. */
export const ROOF_LOOKUP={cell:4,pad:8} as const;
export function encodeRoofLookup(finish:number,tint:number){return 1+finish*16+tint;}
export function decodeRoofLookup(value:number){return value<=0?null:{finish:Math.floor((value-1)/16),tint:(value-1)%16};}
/** Scanline-fill the ring into a row-major Uint8Array grid (row 0 = minZ). */
export function rasterizeRing(ring:number[][],value:number,grid:Uint8Array,width:number,height:number,minX:number,minZ:number,cell:number){
 let minR=Infinity,maxR=-Infinity;
 for(const [,z] of ring){const r=(z-minZ)/cell;minR=Math.min(minR,r);maxR=Math.max(maxR,r);}
 for(let row=Math.max(0,Math.floor(minR));row<=Math.min(height-1,Math.ceil(maxR));row++){
  const z=minZ+(row+.5)*cell,xs:number[]=[];
  for(let i=0;i<ring.length-1;i++){const [x0,z0]=ring[i],[x1,z1]=ring[i+1];if((z0<=z&&z1>z)||(z1<=z&&z0>z))xs.push(x0+(z-z0)*(x1-x0)/(z1-z0));}
  xs.sort((a,b)=>a-b);
  for(let i=0;i+1<xs.length;i+=2){const c0=Math.max(0,Math.round((xs[i]-minX)/cell)),c1=Math.min(width-1,Math.round((xs[i+1]-minX)/cell)-1);for(let c=c0;c<=c1;c++)grid[row*width+c]=value;}
 }
}
