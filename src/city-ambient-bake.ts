/** City-scale sky-visibility bake (pure, no Babylon). Horizon-scan ambient occlusion over the rasterised
 * building heights: for a receiver at (x,z,y) each of DIRECTIONS compass directions walks outward, keeps
 * the steepest occluder slope tanθ=(H-y)/d it meets, and the Lambertian sky visibility of that slice is
 * cos²θ=1/(1+tan²θ). Cells inside a footprint ignore their own building (a wall is not occluded by
 * itself), so the value there is what the facade base sees from its neighbours. Three receiver heights
 * are stored per cell (R=ground, G=mid, B=upper); the shader interpolates by world height so podium roofs
 * and tower bases share one field. Used offline by scripts/prepare_city_ambient.mjs and by tests. */
export const CITY_AMBIENT={
 cell:4,pad:8,
 /** Receiver heights of the three channels in metres; occlusion fades to none between the last and fadeTop. */
 heights:[0,12,40] as const,fadeTop:150,
 directions:24,
 /** Each cell rotates its direction fan by one of this many phases (deterministic hash), so the 15°
  * streaks a fixed fan draws around a tower become fine noise that bilinear sampling averages away. */
 phases:4,
 /** Sampling distances in cells: dense near the receiver, sparser out to 200 m where only towers matter. */
 steps:[1,2,3,4,5,6,7,8,10,12,14,16,19,22,26,30,34,39,44,50] as const,
 /** Cells farther than this (in cells) from any footprint keep full sky and are skipped. */
 reach:50,
} as const;

export type AmbientGrid={width:number;height:number;minX:number;minZ:number;cell:number;heights:Float32Array;ids:Int32Array};
export type AmbientBuilding={rings:number[][][];height:number};

/** Scan-line fill of every footprint's outer ring; where footprints overlap the taller building owns the cell. */
export function rasterizeHeights(buildings:AmbientBuilding[],cell=CITY_AMBIENT.cell,pad=CITY_AMBIENT.pad):AmbientGrid{
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const b of buildings)for(const [x,z] of b.rings[0]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 if(!Number.isFinite(minX))return {width:1,height:1,minX:0,minZ:0,cell,heights:new Float32Array(1),ids:new Int32Array(1)};
 minX=Math.floor(minX)-pad;minZ=Math.floor(minZ)-pad;maxX=Math.ceil(maxX)+pad;maxZ=Math.ceil(maxZ)+pad;
 const width=Math.ceil((maxX-minX)/cell),height=Math.ceil((maxZ-minZ)/cell),heights=new Float32Array(width*height),ids=new Int32Array(width*height);
 buildings.forEach((b,index)=>{
  const ring=b.rings[0],h=Math.max(0,b.height),id=index+1;
  let minR=Infinity,maxR=-Infinity;
  for(const [,z] of ring){const r=(z-minZ)/cell;minR=Math.min(minR,r);maxR=Math.max(maxR,r);}
  for(let row=Math.max(0,Math.floor(minR));row<=Math.min(height-1,Math.ceil(maxR));row++){
   const z=minZ+(row+.5)*cell,xs:number[]=[];
   for(let i=0;i<ring.length-1;i++){const [x0,z0]=ring[i],[x1,z1]=ring[i+1];if((z0<=z&&z1>z)||(z1<=z&&z0>z))xs.push(x0+(z-z0)*(x1-x0)/(z1-z0));}
   xs.sort((a,b)=>a-b);
   for(let i=0;i+1<xs.length;i+=2){
    const c0=Math.max(0,Math.round((xs[i]-minX)/cell)),c1=Math.min(width-1,Math.round((xs[i+1]-minX)/cell)-1);
    for(let c=c0;c<=c1;c++){const k=row*width+c;if(h>heights[k]){heights[k]=h;ids[k]=id;}}
   }
  }
 });
 return {width,height,minX,minZ,cell,heights,ids};
}

export const directionFan=(n:number,phase=0)=>Array.from({length:n},(_,i)=>{const a=(i+phase)*Math.PI*2/n;return [Math.cos(a),Math.sin(a)] as const;});
const FANS=Array.from({length:CITY_AMBIENT.phases},(_,p)=>directionFan(CITY_AMBIENT.directions,p/CITY_AMBIENT.phases));
export const fanFor=(cx:number,cz:number)=>FANS[((cx*73856093)^(cz*19349663))>>>0&(CITY_AMBIENT.phases-1)];

/** Sky visibility in [0,1] for a receiver at cell (cx,cz), height y above the ground plane. */
export function skyVisibility(grid:AmbientGrid,cx:number,cz:number,y:number,selfId:number,directions:readonly (readonly [number,number])[]=fanFor(cx,cz),steps:readonly number[]=CITY_AMBIENT.steps){
 const {width,height,heights,ids,cell}=grid;let sum=0;
 for(const [dx,dz] of directions){
  let tan=0;
  for(const d of steps){
   const c=Math.round(cx+dx*d),r=Math.round(cz+dz*d);
   if(c<0||r<0||c>=width||r>=height)break;
   const k=r*width+c,h=heights[k];
   if(h<=y||ids[k]===selfId)continue;
   const t=(h-y)/(d*cell);if(t>tan)tan=t;
  }
  sum+=1/(1+tan*tan);
 }
 return sum/directions.length;
}

/** Cells within `reach` cells of any footprint (Chebyshev distance), the only ones worth scanning. */
export function activeMask(grid:AmbientGrid,reach=CITY_AMBIENT.reach){
 const {width,height,ids}=grid,mask=new Uint8Array(width*height);
 // Separable dilation: rows then columns.
 const rows=new Uint8Array(width*height);
 for(let r=0;r<height;r++){let last=-Infinity;for(let c=0;c<width;c++){if(ids[r*width+c])last=c;if(c-last<=reach)rows[r*width+c]=1;}last=Infinity;for(let c=width-1;c>=0;c--){if(ids[r*width+c])last=c;if(last-c<=reach)rows[r*width+c]=1;}}
 for(let c=0;c<width;c++){let last=-Infinity;for(let r=0;r<height;r++){if(rows[r*width+c])last=r;if(r-last<=reach)mask[r*width+c]=1;}last=Infinity;for(let r=height-1;r>=0;r--){if(rows[r*width+c])last=r;if(last-r<=reach)mask[r*width+c]=1;}}
 return mask;
}

/** RGB8 field: channel i = sky visibility at CITY_AMBIENT.heights[i]. Non-active cells are full sky. */
export function bakeAmbient(grid:AmbientGrid,heights:readonly number[]=CITY_AMBIENT.heights,reach=CITY_AMBIENT.reach){
 const {width,height,ids}=grid,mask=activeMask(grid,reach),data=new Uint8Array(width*height*3).fill(255);
 let active=0,occluded=0;const sums=heights.map(()=>0);
 for(let r=0;r<height;r++)for(let c=0;c<width;c++){
  const k=r*width+c;if(!mask[k])continue;active++;
  const self=ids[k],fan=fanFor(c,r);let any=false;
  heights.forEach((y,i)=>{const v=skyVisibility(grid,c,r,y,self,fan);data[k*3+i]=Math.round(Math.min(1,Math.max(0,v))*255);sums[i]+=v;if(v<.999)any=true;});
  if(any)occluded++;
 }
 return {data,active,occluded,mean:sums.map(s=>active?+(s/active).toFixed(4):1)};
}

/** Shader-side height interpolation, mirrored here for tests: R→G over [h0,h1], G→B over [h1,h2], then to 1 by fadeTop. */
export function ambientAt(rgb:readonly [number,number,number],y:number,heights:readonly number[]=CITY_AMBIENT.heights,fadeTop=CITY_AMBIENT.fadeTop){
 const [h0,h1,h2]=heights;const t=(a:number,b:number,v:number)=>Math.min(1,Math.max(0,(v-a)/(b-a)));
 const ao=y<h1?rgb[0]+(rgb[1]-rgb[0])*t(h0,h1,y):rgb[1]+(rgb[2]-rgb[1])*t(h1,h2,y);
 const s=t(h2,fadeTop,y);return ao+(1-ao)*s*s*(3-2*s);
}
