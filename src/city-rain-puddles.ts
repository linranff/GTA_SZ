import {Color3, Material, Mesh, PBRMaterial, RawTexture, Texture, VertexData, type BaseTexture, type Scene} from '@babylonjs/core';
import type {CityData, V2} from './city-types.ts';
import type {CinematicLightingMode} from './city-daylight.ts';

const ROAD_Y = .10;
const CELL = 160;
const PROFILE_STEPS = 12;
export const RAIN_LAYOUT_VERSION = 2;
export const RAIN_PROFILE_COUNT = 5;
const NEAR_LIMIT = 1400;
const AERIAL_LIMIT = 5000;
const APRON = 1.08;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const fract=(n:number)=>n-Math.floor(n);
const hash=(n:number)=>fract(Math.sin(n*127.1+311.7)*43758.5453123);
const seedText=(s:string)=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};
const key=(x:number,z:number)=>Math.floor(x/CELL)+','+Math.floor(z/CELL);

type Polygon = {rings:V2[][];box:[number,number,number,number]};
export type RainPool = {
 id:string; roadId:string; kind:'gutter'|'rut'; x:number;z:number;
 dx:number;dz:number;length:number;width:number;lateral:number;roadWidth:number;
 seed:number;alpha:number;outline:V2[];
};
export type RainLayout = {
 pools:RainPool[];
 stats:{eligibleSegments:number;attempts:number;accepted:number;rejectedSlope:number;rejectedElevation:number;rejectedLandUse:number;rejectedOverlap:number;sampledSurfaceArea:number;estimatedWetArea:number;estimatedPuddleArea:number;eligibleSurfaceArea:number;coverageTarget:number;minutesAfterRain:number};
};
const ringRows=new WeakMap<V2[],Map<number,[V2,V2][]>>();
function inRing(x:number,z:number,r:V2[]){let inside=false;
 if(r.length>64){let rows=ringRows.get(r);if(!rows){rows=new Map();for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];for(let row=Math.floor(Math.min(a[1],b[1])/64);row<=Math.floor(Math.max(a[1],b[1])/64);row++){const edges=rows.get(row)??[];edges.push([a,b]);rows.set(row,edges);}}ringRows.set(r,rows);}
  for(const [a,b] of rows.get(Math.floor(z/64))??[])if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }else for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
 return inside;}
function polygon(rings:V2[][]):Polygon{let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(const [x,z] of rings[0]??[]){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}return{rings,box:[x0,z0,x1,z1]};}
function contains(p:Polygon,x:number,z:number){const b=p.box;return x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]&&inRing(x,z,p.rings[0])&&!p.rings.slice(1).some(r=>inRing(x,z,r));}
class PolygonIndex {
 cells=new Map<string,Polygon[]>();
 constructor(polygons:V2[][][]){for(const r of polygons){const p=polygon(r),b=p.box;for(let x=Math.floor(b[0]/CELL);x<=Math.floor(b[2]/CELL);x++)for(let z=Math.floor(b[1]/CELL);z<=Math.floor(b[3]/CELL);z++){const k=x+','+z,a=this.cells.get(k)??[];a.push(p);this.cells.set(k,a);}}}
 contains(x:number,z:number){return(this.cells.get(key(x,z))??[]).some(p=>contains(p,x,z));}
}

/** Five shoreline families share the same low-cost strip mesh. The road seed
 * chooses the silhouette, its handedness and local variation on every load.
 */
export const rainPoolVariant=(seed:number)=>Math.floor(hash(seed+71)*RAIN_PROFILE_COUNT);
export function rainPoolProfile(pool:Pick<RainPool,'seed'|'length'|'width'>,t:number,apron=1){
 const phase=hash(pool.seed+23)*Math.PI*2,variant=rainPoolVariant(pool.seed);
 const u=hash(pool.seed+89)<.5?t:1-t;
 const taper=Math.pow(Math.max(0,Math.sin(Math.PI*t)),variant===1?.34:.24);
 let left=.84+.12*Math.sin(t*13+phase)+.09*Math.sin(t*31+phase*.6);
 let right=.82+.14*Math.sin(t*17+phase+1.4)+.09*Math.cos(t*37+phase);
 let wander=.10*Math.sin(t*10+phase);
 if(variant===1){ // A broad head tapering into a narrow tail.
  left=.55+.70*u+.07*Math.sin(t*17+phase);right=.57+.66*u+.07*Math.cos(t*19+phase);
 }else if(variant===2){ // Two connected basins with an obvious narrow waist.
  const lobes=.87-.29*Math.cos(t*Math.PI*4);
  left=lobes+.08*Math.sin(t*13+phase);right=lobes+.09*Math.cos(t*19+phase);
 }else if(variant===3){ // A curved bank with one scooped-in shoreline.
  left=.74+.13*Math.sin(t*8+phase);right=.94+.12*Math.cos(t*12+phase);wander=.30*Math.sin(Math.PI*t)+.06*Math.sin(t*13+phase);
 }else if(variant===4){ // A wide broken-edged patch with offset shallow bays.
  left=.98-.36*Math.exp(-(((u-.32)/.12)**2))+.07*Math.sin(t*29+phase);
  right=.97-.35*Math.exp(-(((u-.68)/.14)**2))+.08*Math.cos(t*23+phase);
 }
 return {along:(t-.5)*pool.length,centre:pool.width*wander*taper,left:t<=0||t>=1?0:Math.max(.001,left*pool.width*taper*apron),right:t<=0||t>=1?0:Math.max(.001,right*pool.width*taper*apron)};
}
function point(pool:RainPool,t:number,v:number,apron=1):V2{const q=rainPoolProfile(pool,t,apron);const offset=q.centre+(v<0?v*q.left:v*q.right);return[pool.x+pool.dx*q.along-pool.dz*offset,pool.z+pool.dz*q.along+pool.dx*offset];}
const profileT=(i:number,steps:number)=>steps===4?[0,.10,.50,.90,1][i]:i/steps;
export function rainPoolOutline(pool:RainPool,apron=APRON,steps=PROFILE_STEPS):V2[]{const p:V2[]=[];for(let i=0;i<=steps;i++)p.push(point(pool,profileT(i,steps),-1,apron));for(let i=steps;i>=0;i--)p.push(point(pool,profileT(i,steps),1,apron));return p;}
function area(p:V2[]){let n=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];n+=a[0]*b[1]-b[0]*a[1];}return Math.abs(n)*.5;}
const outlineBounds=new WeakMap<V2[],number[]>();
function polygonBounds(p:V2[]){let bounds=outlineBounds.get(p);if(!bounds){bounds=[Infinity,Infinity,-Infinity,-Infinity];for(const v of p){bounds[0]=Math.min(bounds[0],v[0]);bounds[1]=Math.min(bounds[1],v[1]);bounds[2]=Math.max(bounds[2],v[0]);bounds[3]=Math.max(bounds[3],v[1]);}outlineBounds.set(p,bounds);}return bounds;}
function overlapping(a:V2[],b:V2[]){
 const A=polygonBounds(a),B=polygonBounds(b);
 if(A[2]<=B[0]||B[2]<=A[0]||A[3]<=B[1]||B[3]<=A[1])return false;
 const cross=(a:V2,b:V2,c:V2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];if(cross(p,q,r)*cross(p,q,s)<-1e-12&&cross(r,s,p)*cross(r,s,q)<-1e-12)return true;}
 return a.some(p=>inRing(p[0],p[1],b))||b.some(p=>inRing(p[0],p[1],a));
}

/** CPU-only deterministic placement. Current roads.glb is a flat y=.10 sheet:
 * reject elevated terrain instead of placing a flat mirror on a hillside.
 * heightAt is still sampled around every candidate to exclude local slopes.
 * grade != 0 and link ramps are excluded regardless of that flattened model.
 */
export function generateRainPuddleLayout(data:CityData,heightAt:(x:number,z:number)=>number):RainLayout {
 const land=data.land.map(polygon);
 const blocked=new PolygonIndex([...data.water.map(p=>p.rings),...data.green.map(p=>p.rings),...data.buildings.map(p=>p.rings)]);
 const occupied=new Map<string,RainPool[]>();const pools:RainPool[]=[];
 const stats:RainLayout['stats']={eligibleSegments:0,attempts:0,accepted:0,rejectedSlope:0,rejectedElevation:0,rejectedLandUse:0,rejectedOverlap:0,sampledSurfaceArea:0,estimatedWetArea:0,estimatedPuddleArea:0,eligibleSurfaceArea:0,coverageTarget:.29,minutesAfterRain:20};
 const clearance=(p:V2)=>land.some(l=>contains(l,p[0],p[1]))&&!blocked.contains(p[0],p[1]);
 for(const road of data.roads){
  if(road.grade!=='0'||road.kind.endsWith('_link')||road.width<3.2)continue;
  const seed=seedText(road.id);
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   if(length<8)continue;stats.eligibleSegments++;stats.sampledSurfaceArea+=length*road.width;
   const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
   // Two broad, discontinuous banks leave an irregular dry middle and dry
   // islands between runs. Their area is road-relative, not a fixed 50cm gutter.
   const slots=Math.max(1,Math.round(length/38)),slotLength=(length-1.4)/slots;
   for(let slot=0;slot<slots;slot++)for(const side of [-1,1]){
    const s=seed+i*997+slot*313+(side>0?157:0);
    const poolLength=slotLength*(.72+hash(s+12)*.23);
    // Position jitter uses only the free space left inside this slot. Opposite
    // banks no longer start/end together, and long pools stay near the road axis.
    const position=.7+(slot+.5)*slotLength+(hash(s+41)-.5)*(slotLength-poolLength)*.82;
    const lateral=side*road.width*(.23+(hash(s+5)-.5)*.065);
    const angle=(hash(s+53)-.5)*2*Math.min(.052,road.width*.055/poolLength);
    const px=dx*Math.cos(angle)-dz*Math.sin(angle),pz=dz*Math.cos(angle)+dx*Math.sin(angle);
    const width=.79*road.width*(.162+hash(s+11)*.021);
    if(width<.12)continue;
    const pool:RainPool={id:road.id+':'+i+':'+slot+':'+side,roadId:road.id,kind:'gutter',x:a[0]+dx*position-dz*lateral,z:a[1]+dz*position+dx*lateral,dx:px,dz:pz,length:poolLength,width,lateral,roadWidth:road.width,seed:s,alpha:.85+hash(s+27)*.12,outline:[]};
    pool.outline=rainPoolOutline(pool);stats.attempts++;
    const lodOutlines=[pool.outline,rainPoolOutline(pool,APRON,6),rainPoolOutline(pool,APRON,4)];
    const sample:V2[]=[[pool.x,pool.z],...lodOutlines.flat()];
    // Test actual rotated banks against this road segment, not just its centre.
    if(!sample.every(([x,z])=>{const rx=x-a[0],rz=z-a[1],along=rx*dx+rz*dz,cross=-rx*dz+rz*dx;return along>.18&&along<length-.18&&Math.abs(cross)<road.width/2-.18;})){stats.rejectedLandUse++;continue;}
    const heights=sample.map(p=>heightAt(p[0],p[1]));const centreHeight=heights[0];
    const sx=Math.abs(heightAt(pool.x+2,pool.z)-heightAt(pool.x-2,pool.z))/4,sz=Math.abs(heightAt(pool.x,pool.z+2)-heightAt(pool.x,pool.z-2))/4;
    if(!heights.every(Number.isFinite)||Math.hypot(sx,sz)>.008||Math.max(...heights)-Math.min(...heights)>.028){stats.rejectedSlope++;continue;}
    if(Math.abs(centreHeight)>.045){stats.rejectedElevation++;continue;}
    // Sample banks/interior as a fast rejection pass. The offline validator
    // then proves full polygon containment, including 3cm rounding clearance.
    const alongSamples=Array.from({length:PROFILE_STEPS+1},(_,j)=>[-.75,-.35,0,.35,.75].map(v=>point(pool,j/PROFILE_STEPS,v,APRON))).flat();
    if(![...sample,...alongSamples].every(clearance)){stats.rejectedLandUse++;continue;}
    stats.eligibleSurfaceArea+=slotLength*road.width*.5;
    const cx=Math.floor(pool.x/CELL),cz=Math.floor(pool.z/CELL);let overlap=false;
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const other of occupied.get(x+','+z)??[]){if(Math.hypot(pool.x-other.x,pool.z-other.z)<(pool.length+other.length+pool.width+other.width)*.55&&overlapping(pool.outline,other.outline)){overlap=true;break;}}
    if(overlap){stats.rejectedOverlap++;continue;}
    pools.push(pool);const k=key(pool.x,pool.z),bucket=occupied.get(k)??[];bucket.push(pool);occupied.set(k,bucket);stats.estimatedWetArea+=area(pool.outline);stats.estimatedPuddleArea+=area(rainPoolOutline(pool,1));
   }
  }
 }
 stats.accepted=pools.length;return{pools,stats};
}

type Geometry={positions:number[];normals:number[];uvs:number[];colors:number[];indices:number[]};
function poolGeometry(pools:RainPool[],apron:boolean,focusX:number,focusZ:number,mode:number):Geometry {
 const g:Geometry={positions:[],normals:[],uvs:[],colors:[],indices:[]};
 for(let pi=0;pi<pools.length;pi++){const p=pools[pi],distance=Math.hypot(p.x-focusX,p.z-focusZ);
  const detail=mode===0&&pi<48&&distance<160?2:mode<2&&distance<180?1:0;
  const steps=detail===2?12:detail===1?6:4,across=detail===2?[-1,-.80,0,.80,1]:detail===1?[-1,0,1]:[-1,1];
  const base=g.positions.length/3;
  for(let i=0;i<=steps;i++)for(let j=0;j<across.length;j++){
   const t=profileT(i,steps),v=across[j],[x,z]=point(p,t,v,apron?APRON:1);
   g.positions.push(Math.fround(x),ROAD_Y+(apron?.005:.008),Math.fround(z));g.normals.push(0,1,0);g.uvs.push(x/1.8,z/1.8);
   const edge=detail===0?.82:detail===1?(j===1?1:.12):(j===0||j===across.length-1?0:j===2?1:.70);const end=i===0||i===steps?0:detail===2&&(i===1||i===steps-1)?.72:1;
   g.colors.push(1,1,1,edge*end*(apron?.27:p.alpha));
  }
  for(let i=0;i<steps;i++)for(let j=0;j<across.length-1;j++){const a=base+i*across.length+j,b=a+across.length;for(const tri of [[a,a+1,b],[a+1,b+1,b]]){const [ia,ib,ic]=tri.map(v=>v*3),p=g.positions,cross=(p[ib+2]-p[ia+2])*(p[ic]-p[ia])-(p[ib]-p[ia])*(p[ic+2]-p[ia+2]);if(cross>1e-8)g.indices.push(...tri);else if(cross< -1e-8)g.indices.push(tri[0],tri[2],tri[1]);}}
 }
 return g;
}

/** Two nearby merged meshes, a shared tiny normal texture and the existing
 * planar mirror. No RTT, light, particle, screen-space pass or frame callback.
 * Call update(focusX, focusZ, cameraHeightAboveGround) from the existing culler
 * or main update. It only rebuilds after 60m travel or an overview-mode change.
 */
export function createRainPuddles(scene:Scene,_data:CityData,_heightAt:(x:number,z:number)=>number,mirror:BaseTexture|null,prepared?:RainLayout){
 const start=performance.now();let layout:RainLayout={pools:[],stats:{eligibleSegments:0,attempts:0,accepted:0,rejectedSlope:0,rejectedElevation:0,rejectedLandUse:0,rejectedOverlap:0,sampledSurfaceArea:0,estimatedWetArea:0,estimatedPuddleArea:0,eligibleSurfaceArea:0,coverageTarget:.29,minutesAfterRain:20}};
 let status:'loading'|'ready'|'fallback'='loading',failure:string|null=null,coverageEvidence:Record<string,unknown>|null=null;
 const buckets=new Map<string,RainPool[]>();
 const n=128,pixels=new Uint8Array(n*n*3);
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){const i=(z*n+x)*3;pixels[i]=Math.round(128+2.5*Math.sin(x*.43+z*.18)+1.3*Math.cos(z*.73));pixels[i+1]=Math.round(128+2.2*Math.cos(z*.39-x*.11)+1.3*Math.sin(x*.81));pixels[i+2]=255;}
 const normal=RawTexture.CreateRGBTexture(pixels,n,n,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);normal.name='rain-pool-micro-normal';normal.gammaSpace=false;normal.wrapU=Texture.WRAP_ADDRESSMODE;normal.wrapV=Texture.WRAP_ADDRESSMODE;normal.anisotropicFilteringLevel=4;normal.level=.17;
 const film=new PBRMaterial('rain-damp-apron',scene);film.albedoColor=new Color3(.033,.038,.042);film.metallic=0;film.roughness=.55;film.specularIntensity=.28;film.maxSimultaneousLights=2;film.transparencyMode=Material.MATERIAL_ALPHABLEND;film.zOffset=-1;film.backFaceCulling=false;
 const water=new PBRMaterial('rain-standing-water',scene);water.albedoColor=new Color3(.025,.036,.045);water.metallic=0;water.roughness=.075;water.specularIntensity=.85;water.environmentIntensity=1.35;water.reflectionTexture=mirror;water.bumpTexture=normal;water.invertNormalMapX=!scene.useRightHandedSystem;water.invertNormalMapY=scene.useRightHandedSystem;water.enableSpecularAntiAliasing=true;water.maxSimultaneousLights=2;water.transparencyMode=Material.MATERIAL_ALPHABLEND;water.zOffset=-1;water.backFaceCulling=false;
 let lightMode:CinematicLightingMode='sunset';
 function setMode(next:CinematicLightingMode){
  lightMode=next;const day=next==='day';
  // Keep the same rain layout and reflected scene, but reveal more asphalt
  // through sunlit shallow water. Avoid white, opaque-looking mirror patches.
  water.environmentIntensity=day?.85:1.35;water.specularIntensity=day?.65:.85;
  water.roughness=day?.13:.075;water.alpha=day?.74:1;film.alpha=day?.70:1;
 }
 const make=(name:string,mat:PBRMaterial,order:number)=>{const m=new Mesh(name,scene);m.material=mat;m.isPickable=false;m.hasVertexAlpha=true;m.useVertexColors=true;m.alphaIndex=order;m.receiveShadows=false;m.freezeWorldMatrix();m.setEnabled(false);return m;};
 const apron=make('rain-road-damp-patches',film,1),puddles=make('rain-road-local-puddles',water,2);
 let lastX=Infinity,lastZ=Infinity,lastMode=-1,lastRebuildMs=0,shown=0,disposed=false,rebuilds=0;let mode: 'driving'|'drone'|'high-overview'='driving';
 let initMs=performance.now()-start;let requested={x:0,z:0,height:4},hasRequested=false,visiblePuddleArea=0;
 function update(x:number,z:number,heightAboveGround=4){
  requested={x,z,height:heightAboveGround};hasRequested=true;
  if(disposed||status==='loading')return;const index=heightAboveGround>600?2:heightAboveGround>145?1:0;
  if(index===lastMode&&Math.hypot(x-lastX,z-lastZ)<60)return;
  lastX=x;lastZ=z;lastMode=index;mode=index===2?'high-overview':index===1?'drone':'driving';
  const t=performance.now(),radius=index?900:440,limit=index?AERIAL_LIMIT:NEAR_LIMIT;const selected:RainPool[]=[];
  for(let xx=Math.floor((x-radius)/CELL);xx<=Math.floor((x+radius)/CELL);xx++)for(let zz=Math.floor((z-radius)/CELL);zz<=Math.floor((z+radius)/CELL);zz++)for(const p of buckets.get(xx+','+zz)??[])if((p.x-x)**2+(p.z-z)**2<radius*radius)selected.push(p);
  selected.sort((a,b)=>(a.x-x)**2+(a.z-z)**2-(b.x-x)**2-(b.z-z)**2);selected.length=Math.min(limit,selected.length);shown=selected.length;visiblePuddleArea=selected.reduce((sum,p)=>sum+area(rainPoolOutline(p,1)),0);
  for(const [mesh,isApron] of [[apron,true],[puddles,false]] as const){const enabled=selected.length>0&&(isApron||index<2);mesh.setEnabled(enabled);if(!enabled)continue;const geometry=poolGeometry(selected,isApron,x,z,index);const v=new VertexData();v.positions=geometry.positions;v.normals=geometry.normals;v.uvs=geometry.uvs;v.colors=geometry.colors;v.indices=geometry.indices;v.applyToMesh(mesh,true);mesh.refreshBoundingInfo();}
  water.disableBumpMap=index>0;water.alpha=index===1?.75:1;film.alpha=index===2?.74:1;lastRebuildMs=performance.now()-t;rebuilds++;
 }
 function install(next:RainLayout){if(disposed)return;layout=next;buckets.clear();lastMode=-1;for(const p of layout.pools){const k=key(p.x,p.z),b=buckets.get(k)??[];b.push(p);buckets.set(k,b);}status='ready';initMs=performance.now()-start;if(hasRequested)update(requested.x,requested.z,requested.height);}
 // The expensive full-city safety/coverage proof belongs to asset generation.
 // Loading only reconstructs compact records and a spatial index. It never
 // blocks first input with tens of thousands of polygon intersection tests.
 const unpack=(values:number[])=>{const pools:RainPool[]=[];for(let i=0;i<values.length;i+=10){const [x,z,dx,dz,length,width,lateral,roadWidth,seed,alpha]=values.slice(i,i+10);pools.push({id:'rain-'+i/10,roadId:'prevalidated-road',kind:'gutter',x,z,dx,dz,length,width,lateral,roadWidth,seed,alpha,outline:[]});}return pools;};
 let retryTimer:ReturnType<typeof setTimeout>|null=null,retries=0;
 async function retry(){
  if(disposed)return;if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}try{
   const response=await fetch('/city/rain/puddles-layout.json',{cache:retries?'reload':'default'});
   if(!response.ok)throw Error('雨后路面积水布局加载失败');const packed=await response.json() as {version:number;stride:number;values:number[];stats:RainLayout['stats'];coverage:Record<string,unknown>};
   if(packed.version!==RAIN_LAYOUT_VERSION||packed.stride!==10||!Array.isArray(packed.values)||packed.values.length%10||packed.values.length>1000000||!packed.values.every(Number.isFinite))throw Error('积水布局格式或预算无效');
   coverageEvidence=packed.coverage;failure=null;install({pools:unpack(packed.values),stats:packed.stats});
  }catch(error){
   failure=error instanceof Error?error.message:String(error);
   // Embedded, exactly validated spawn subset keeps the opening wet while an
   // unavailable/missing asset retries; stats expose this degraded scope.
   const pools=unpack(SPAWN_FALLBACK);install({pools,stats:{...layout.stats,accepted:pools.length}});status='fallback';
   if(!disposed&&retries++<2)retryTimer=setTimeout(()=>{void retry();},2000);
  }
 }
 const readyPromise=prepared?Promise.resolve(install(prepared)):retry();
 return{
  meshes:[apron,puddles] as const,
  update,readyPromise,retry,setMode,
  get stats(){return{...layout.stats,status,failure,mode,lightMode,response:{alpha:water.alpha,roughness:water.roughness,specular:water.specularIntensity,environment:water.environmentIntensity},shown,initMs,lastRebuildMs,rebuilds,visiblePuddleArea,coverageEvidence,drawCalls:puddles.isEnabled()?(apron.isEnabled()?2:1):apron.isEnabled()?1:0,activeTriangles:(apron.isEnabled()?apron.getTotalIndices()/3:0)+(puddles.isEnabled()?puddles.getTotalIndices()/3:0),extraRenderTargets:0,extraLights:0,normalTextureBytesWithMipmaps:Math.round(n*n*3*4/3),reflection:'reuse-existing-road-mirror',placement:'20-minutes-after-rain; five seeded shorelines with irregular road positions',profileVariants:RAIN_PROFILE_COUNT,estimatedWetFraction:layout.stats.estimatedWetArea/Math.max(1,layout.stats.sampledSurfaceArea),estimatedPuddleFraction:layout.stats.estimatedPuddleArea/Math.max(1,layout.stats.sampledSurfaceArea),disposed};},
  dispose(){if(disposed)return;disposed=true;if(retryTimer)clearTimeout(retryTimer);apron.dispose(false,false);puddles.dispose(false,false);film.dispose(false,false);water.dispose(false,false);normal.dispose();},
 };
}

// Embedded prevalidated opening layout; rebuilt by validate_rain_puddle_coverage.py.
const SPAWN_FALLBACK:number[]=[-2651.35,-856.43,-0.98997,-0.141277,31.95,2.03,-3.83,15,749609774,0.861,-2675.98,-873.16,0.991474,0.130306,30.57,2.1,3.71,15,1229417462,0.943,-2646.78,-862.65,-0.986811,-0.161878,39.69,2.02,3,15,749609931,0.926,-2657.42,-845.3,-0.993345,-0.115176,24.6,1.23,1.99,9,591462327,0.964,-2657.25,-880.61,0.99414,0.1081,39.61,0.82,1.42,6,2912470427,0.924,-2659.54,-841.24,-0.993325,-0.115346,25.75,1.23,-2.31,9,591462170,0.95,-2686.41,-864.15,-0.969654,-0.244482,28.48,1.94,-3.14,15,749610145,0.909,-2642.44,-868.5,0.991115,0.133009,28.58,1.93,3.5,15,1229417775,0.894,-2655.33,-883.29,0.994039,0.109029,35.03,0.81,-1.45,6,2912470270,0.947,-2686.25,-870.68,-0.973298,-0.229546,33.83,2.13,3.22,15,749610302,0.919,-2689.78,-848.66,-0.998652,-0.051901,23.86,1.21,2.13,9,591462698,0.923,-2684.94,-884.36,0.988176,0.153322,10.85,0.84,1.2,6,2912469430,0.896,-2660.81,-830.54,0.997636,0.068713,26.04,0.8,-1.31,6,1148526210,0.94,-2685.56,-887.2,0.9803,0.197512,9.3,0.8,-1.5,6,2912469273,0.964,-2662.22,-827.95,0.998293,0.058411,24.29,0.82,1.36,6,1148526367,0.896,-2689.41,-832.36,0.997485,0.070876,25.78,0.82,-1.23,6,1148525897,0.957,-2627.53,-841.33,-0.993487,-0.113944,30.3,1.15,1.93,9,591462014,0.897,-2691.46,-829.89,0.998472,0.055256,22.67,0.83,1.38,6,1148526054,0.967,-2627.4,-837.52,-0.992338,-0.123552,27.26,1.16,-1.83,9,591461857,0.872,-2702.71,-840.21,-0.0447,0.999,11.63,0.86,-1.24,6,3309853380,0.856,-2705.33,-839.41,-0.030666,0.99953,12.54,0.87,1.36,6,3309853537,0.873,-2616.49,-875.82,0.992845,0.119408,32.87,0.82,1.54,6,2912470740,0.956,-2615.46,-878.52,0.994203,0.107521,39.59,0.85,-1.26,6,2912470583,0.937,-2711.17,-890.25,0.967512,0.252826,32.04,0.83,1.53,6,2912468433,0.908,-2716.36,-879.28,0.992553,0.121816,27.84,1.96,3.5,15,1585989238,0.912,-2714.01,-886.29,0.989659,0.14344,35.62,2.07,-3.78,15,1585989081,0.894,-2710.5,-893.06,0.96646,0.256818,34.03,0.84,-1.35,6,2912468276,0.964,-2720.36,-850.21,-0.999324,-0.036764,26.82,1.28,2.05,9,591463011,0.906,-2642.39,-807.44,-0.436108,0.899894,14.59,0.78,1.19,6,1148530042,0.854,-2604.84,-857.16,-0.986354,-0.164638,34.99,1.96,3.8,15,749609618,0.952,-2605.06,-870.12,0.989077,0.147398,26.87,2.13,-3.47,15,1229417931,0.962,-2721.68,-845.89,-0.999444,-0.03334,23.51,1.23,-2.33,9,591462854,0.891,-2723.2,-873.74,-0.966118,-0.258103,33.89,2.08,-3.08,15,749610458,0.883,-2639.82,-806.74,-0.443828,0.896112,14.62,0.81,-1.41,6,1148529885,0.906,-2603.36,-849.87,-0.989363,-0.145471,39.04,2.06,-3.18,15,749609461,0.856,-2602.05,-862.75,0.992034,0.125972,27.17,2.03,3.4,15,1229418088,0.908,-2720.83,-833.68,0.999751,0.022317,27.76,0.82,-1.19,6,1148525526,0.874,-2721.01,-830.93,0.999834,0.018224,29.22,0.84,1.56,6,1148525683,0.924,-2647.27,-793.17,-0.043448,0.999056,6.47,0.77,1.41,6,1148531039,0.879,-2644.56,-793.23,-0.056998,0.998374,7.84,0.77,-1.3,6,1148530882,0.901,-2596.23,-832.91,-0.991959,-0.126561,24.4,1.19,-2.35,9,591461544,0.963,-2574.88,-870.01,0.984354,0.176201,34.11,0.84,1.19,6,2912471424,0.863,-2751.39,-884.31,0.99195,0.126629,27.91,2.17,3.64,15,1585988925,0.889,-2753.39,-879.79,-0.990601,-0.136786,20.15,2.02,-3.55,15,749611142,0.91,-2573.4,-872.34,0.981293,0.192522,30.74,0.85,-1.37,6,2912471267,0.936,-2751.47,-891.08,0.987513,0.15754,31.85,2.08,-3.05,15,1585988768,0.895,-2755.89,-850.35,-0.999881,0.015435,27.22,1.25,1.93,9,591463695,0.934,-2755.35,-846.22,-0.999505,0.031449,31.37,1.2,-2.21,9,591463538,0.965,-2753.56,-834.57,0.999851,0.017257,27.64,0.86,-1.35,6,1148525213,0.967,-2567.66,-864.1,0.977509,0.210896,24.7,2.04,-3.54,15,1229418302,0.894,-2753.85,-899.35,0.987421,0.158115,39.21,0.81,1.29,6,2912467436,0.852,-2756.68,-831.84,0.999632,0.027128,25.02,0.84,1.45,6,1148525370,0.869,-2565.94,-856.74,0.978669,0.205444,23.42,1.97,3.37,15,1229418459,0.945,-2755.08,-902.4,0.988177,0.153319,42.11,0.86,-1.54,6,2912467279,0.941,-2561.94,-849.94,-0.990158,-0.139957,40.61,1.99,3.04,15,749609305,0.965,-2561.52,-843.31,-0.985871,-0.167504,39.58,2.15,-3.45,15,749609148,0.891,-2557.32,-826.87,-0.983522,-0.18079,33.27,1.17,-1.93,9,591461173,0.954,-2785.94,-881.85,-0.999866,-0.016392,39.12,2.08,-3.92,15,749612139,0.862,-2540.52,-863.41,0.98259,0.185786,29.09,0.79,1.32,6,2912471737,0.891,-2538.73,-865.88,0.981603,0.190934,30.6,0.79,-1.45,6,2912471580,0.918,-2789.54,-849.7,-0.999342,0.036279,30.47,1.17,2.18,9,591464008,0.95,-2786.79,-832.65,0.99976,0.021929,28.67,0.78,1.31,6,1148525057,0.886,-2789.81,-845.45,-0.999892,0.014681,29.07,1.22,-2.06,9,591463851,0.897,-2537.85,-850.91,0.983202,0.182523,25.49,2.11,3.88,15,1229418772,0.908,-2788.71,-835.57,0.999541,0.030287,25.32,0.82,-1.57,6,1148524900,0.937,-2535.47,-857.6,0.978051,0.208367,29.61,2.15,-3.13,15,1229418615,0.897,-2794.35,-888.45,0.998782,0.049346,40.52,2.1,3.22,15,1585987928,0.947,-2790.53,-907.02,0.994055,0.108877,24.41,0.86,-1.41,6,2912466282,0.919,-2792.28,-904.54,0.993984,0.109527,21.08,0.78,1.22,6,2912466439,0.926,-2795.71,-894.89,0.999869,0.016156,38.9,2.06,-3.17,15,1585987771,0.859,-2518.86,-835.61,-0.981429,-0.191826,35.88,2.12,-3.75,15,749608151,0.957,-2521.35,-823.61,-0.983671,-0.179979,32.31,1.15,1.84,9,591461017,0.927,-2521.97,-819.56,-0.978615,-0.205702,35.75,1.26,-2.26,9,591460860,0.876,-2817.81,-882.33,-0.989791,0.142526,13.1,2.06,-3.47,15,749613136,0.95,-2510.05,-841.17,-0.983503,-0.180893,37.58,2.01,3.41,15,749608308,0.936,-2820.61,-831.76,0.997547,-0.069997,30.1,0.81,1.35,6,1148524373,0.935,-2505.2,-845.4,0.988001,0.154447,25.11,1.95,3.22,15,1229419085,0.898,-2504.55,-852.34,0.980317,0.197428,29.29,2.05,-3.72,15,1229418928,0.922,-2822.14,-888.17,0.999073,-0.043056,6.33,1.99,3.87,15,1585986931,0.888,-2823.84,-848.82,-0.999669,0.025735,26.44,1.27,2.22,9,591464321,0.858,-2822.06,-834.2,0.996709,-0.081066,30.56,0.82,-1.2,6,1148524216,0.868,-2503.17,-859.04,0.984455,0.175636,33.43,0.8,-1.32,6,2912471893,0.956,-2822.12,-895.58,0.99645,-0.084183,7.65,2.02,-3.52,15,1585986774,0.854,-2825.17,-844.51,-0.999325,0.036725,32.31,1.25,-2.06,9,591464164,0.888,-2502.15,-856.13,0.984448,0.175678,29.57,0.85,1.36,6,2912472050,0.93,-2820.92,-905.91,1,0.0008,30.18,0.81,1.2,6,2912466068,0.872,-2777.11,-741.53,0.528995,0.848625,11.79,0.58,-0.91,4.5,3281019398,0.959,-2822.88,-908.55,0.999973,0.007373,29.33,0.84,-1.43,6,2912465911,0.923,-2779.34,-741.4,0.536762,0.843734,13.66,0.58,1.04,4.5,3281019555,0.854,-2756.68,-718.17,0.692676,0.721249,45.47,0.64,-0.91,4.5,3281020395,0.885,-2755.41,-714.21,0.68749,0.726194,42.43,0.59,0.92,4.5,3281020552,0.961,-2500.01,-800.49,0.99201,0.126163,38.32,0.64,-0.98,4.5,3991735042,0.884,-2503.95,-784.41,-0.996251,-0.086515,29.35,0.63,-1.06,4.5,3991730057,0.913,-2500.27,-786.13,-0.996274,-0.086243,31.64,0.58,0.95,4.5,3991730214,0.919,-2494.25,-797.65,0.992859,0.119293,42.47,0.6,1.12,4.5,3991735199,0.86,-2846.03,-892.07,0.984193,-0.177097,34.23,2.12,-3.7,15,1585985777,0.927,-2847.71,-884.52,0.988271,-0.152708,29.62,2.08,3.43,15,1585985934,0.962,-2849.48,-876.02,-0.974573,0.22407,44.05,2.16,-3.83,15,749614133,0.924,-2820.02,-759.18,0.992298,-0.123876,35.76,0.62,1.16,4.5,3365054745,0.852,-2481.46,-809.94,-0.223819,-0.974631,6.92,0.59,-0.97,4.5,1500406302,0.872,-2825,-760.78,0.993292,-0.115634,36.97,0.63,-1.01,4.5,3365054588,0.892,-2473.66,-838.18,0.966652,0.256092,28.05,2.07,3.37,15,1229419456,0.928,-2472.5,-844.78,0.961638,0.27432,26.29,2.15,-3.31,15,1229419299,0.885,-2851.14,-908.54,0.999994,-0.00339,24.6,0.83,-1.25,6,2912465598,0.94,-2854.69,-831.89,0.9971,-0.076104,28.66,0.8,-1.4,6,1148523903,0.856,-2852.51,-905.77,0.999844,0.017679,23.42,0.85,1.53,6,2912465755,0.869,-2471.78,-826.16,-0.971906,-0.23537,36.82,1.94,-3.23,15,749607154,0.884,-2858.62,-828.9,0.997724,-0.067426,24.94,0.8,1.28,6,1148524060,0.898,-2465.92,-850.85,0.96935,0.245683,33.34,0.82,-1.46,6,2912472264,0.936,-2467.62,-831.74,-0.968952,-0.247251,40.55,1.94,3.16,15,749607311,0.915,-2465.4,-847.96,0.968334,0.249657,34.43,0.84,1.21,6,2912472421,0.862,-2867.48,-845.27,-0.993939,0.109934,11.52,0.87,-1.54,6,1298372692,0.886,-2868.65,-848.29,-0.99709,0.076236,11.63,0.86,1.57,6,1298372849,0.924,-2474.33,-783.32,-0.997595,0.069314,13.43,0.58,-1.11,4.5,3991729060,0.952,-2472.46,-785.6,-0.997722,0.06746,15.84,0.61,1.03,4.5,3991729217,0.886,-2464.56,-795.68,0.986011,0.166681,10.95,0.58,-0.89,4.5,3991722081,0.872,-2465.02,-793.84,0.987535,0.1574,11.12,0.62,0.99,4.5,3991722238,0.904,-2875.68,-880.87,0.99956,-0.029668,15.14,2.04,3.22,15,1585984937,0.924,-2876.03,-887.67,0.998607,-0.052757,19.01,2.11,-3.59,15,1585984780,0.891,-2648.62,-646.13,0.999992,0.003982,21.81,0.65,-1.14,4.5,4008500697,0.961,-2878.62,-827.68,0.878031,-0.478603,8.8,0.84,-1.43,6,1148522906,0.96,-2880.56,-842.41,-0.923605,0.383345,10.33,0.84,-1.46,6,1298373689,0.939,-2881.42,-845.07,-0.929183,0.36962,10.45,0.84,1.33,6,1298373846,0.877,-2878.92,-824.39,0.857395,-0.514659,7.82,0.82,1.3,6,1148523063,0.958,-2648.85,-643.89,0.999948,0.010245,17.41,0.59,1.11,4.5,4008500854,0.876,-2884.9,-869.39,-0.994417,0.105524,8.24,1.99,-3.4,15,749615130,0.964,-2647.66,-639.75,-0.999996,-0.002997,17.84,0.61,1.03,4.5,4008502848,0.941,-2886.9,-876.26,-0.997096,0.07616,8.41,2.05,3.66,15,749615287,0.952,-2441.26,-837.08,0.971314,0.2378,29.21,2.14,-3.7,15,1229419612,0.936,-2650.28,-637.64,-1,-0.000242,16.91,0.6,-1.09,4.5,4008502691,0.852,-2450.97,-788.89,0.969198,0.246281,11.36,0.62,-1.13,4.5,3924611605,0.929,-2885.49,-818.16,0.606798,-0.794856,7.86,0.8,1.5,6,1148522066,0.914,-2451.12,-786.76,0.968044,0.25078,14.21,0.6,0.96,4.5,3924611762,0.969,-2886.09,-906.1,0.999843,0.017719,25.64,0.84,1.4,6,2912465442,0.923,-2445.84,-802.98,-0.962663,-0.270703,34.84,1.24,-2.07,9,591460176,0.902,-2440.19,-829.54,0.963588,0.26739,23.79,2.01,3.34,15,1229419769,0.932,-2886.08,-908.97,0.999994,0.003571,29.9,0.86,-1.47,6,2912465285,0.914,-2887.57,-820.02,0.560821,-0.827937,6.47,0.86,-1.26,6,1148521909,0.87,-2451.05,-781.52,-0.97579,-0.218709,20.08,0.61,-0.97,4.5,3991728063,0.915,-2892.14,-835.82,-0.756586,0.653894,10.05,0.79,-1.55,6,1298374686,0.898,-2448.51,-783.06,-0.975995,-0.217794,20.05,0.59,1.06,4.5,3991728220,0.923,-2660.21,-630.8,0.02945,-0.999566,12.73,0.61,1.11,4.5,4008499857,0.914,-2662.24,-630.45,0.038798,-0.999247,13.91,0.59,-0.91,4.5,4008499700,0.857,-2894.89,-837.44,-0.764532,0.644586,12.37,0.84,1.44,6,1298374843,0.916,-2888.36,-797.74,0.003448,-0.999994,28.72,0.8,1.3,6,1148521069,0.935,-2891.04,-798.42,0.018789,-0.999823,30.53,0.78,-1.39,6,1148520912,0.881,-2437.06,-789.1,0.966374,0.25714,35.42,0.6,-1.01,4.5,3991723078,0.911,-2437.01,-786.92,0.966953,0.254955,36.45,0.58,1.08,4.5,3991723235,0.874,-2835.71,-694.48,0.983682,-0.179917,15.27,0.61,-1.15,4.5,3314721731,0.88,-2901.59,-825.88,-0.503059,0.864252,9.47,0.85,-1.37,6,1298375683,0.869,-2881.52,-754.98,0.999767,-0.021587,21.08,0.62,-1.03,4.5,441934845,0.947,-2422.69,-836.9,0.969059,0.24683,39.44,0.77,1.28,6,2912472734,0.95,-2837.41,-691.9,0.981565,-0.191126,16.4,0.59,1.06,4.5,3314721888,0.854,-2904.48,-826.25,-0.546518,0.837447,8.3,0.86,1.28,6,1298375840,0.967,-2882.73,-752.91,0.999838,-0.017991,16.96,0.59,1.01,4.5,441935002,0.944,-2423.23,-813.65,-0.967658,-0.252265,41.52,2.1,-3.81,15,749606157,0.963,-2905.93,-816.6,-0.285347,0.958424,6.71,0.85,-1.31,6,1298376680,0.874,-2910.46,-879.72,0.999911,0.01336,30.93,2.11,3.62,15,1585985505,0.967,-2756.53,-633.21,0.968738,0.248086,15.25,0.6,-0.93,4.5,3247612252,0.879,-2910.72,-886.53,0.999931,0.011719,28.77,2,-3.19,15,1585985348,0.918,-2912.13,-873.33,-0.999996,0.002675,33.68,0.85,1.25,6,3862239023,0.899,-2908.53,-817.19,-0.25822,0.966086,6.52,0.78,1.36,6,1298376837,0.925,-2913.03,-870.63,-0.999981,0.006165,31.23,0.84,-1.46,6,3862238866,0.882,-2759.71,-632.1,0.969689,0.244344,16.98,0.62,0.91,4.5,3247612409,0.957,-2907.26,-805.96,-0.09038,0.995907,7.25,0.86,-1.45,6,1298377677,0.854,-2893.32,-762.42,0.110576,-0.993868,31.11,0.85,-1.46,6,1148519915,0.91,-2429.36,-775.93,-0.842168,-0.539215,14.51,0.6,1.15,4.5,3991727223,0.861,-2429.37,-773.41,-0.838833,-0.544389,11.4,0.61,-0.97,4.5,3991727066,0.913,-2909.99,-806.94,-0.040679,0.999172,8.65,0.85,1.32,6,1298377834,0.959,-2778.7,-636.34,0.999965,0.00842,15.71,0.58,-0.99,4.5,3247611255,0.886,-2917.74,-855.69,-0.993013,-0.118003,35.18,1.15,1.79,9,591465689,0.907,-2411.79,-828.89,0.966874,0.255253,27.92,1.99,-3.17,15,1229419925,0.85,-2779.33,-634.37,0.999809,0.019556,16.94,0.63,0.99,4.5,3247611412,0.95,-2907.84,-784.24,-0.033684,0.999433,29.15,0.81,-1.49,6,1298378674,0.896,-2916.72,-903.27,0.987826,-0.15556,21.83,1.22,2.15,9,2837944326,0.913,-2411.01,-821.78,0.973076,0.230485,24.74,1.98,3.51,15,1229420082,0.957,-2921.25,-852.24,-0.990346,-0.138614,31.52,1.16,-2.08,9,591465532,0.914,-2910.73,-784.3,-0.032323,0.999477,30.89,0.82,1.41,6,1298378831,0.895,-2920.63,-906.7,0.988173,-0.153346,23.93,1.17,-1.86,9,2837944169,0.944,-2412.19,-793.18,-0.963142,-0.268994,30.31,1.26,-2.19,9,591459863,0.953];
