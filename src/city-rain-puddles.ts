import {Color3, Material, Mesh, PBRMaterial, RawTexture, Texture, VertexData, type BaseTexture, type Scene} from '@babylonjs/core';
import type {CityData, V2} from './city-types.ts';

const ROAD_Y = .10;
const CELL = 160;
const PROFILE_STEPS = 12;
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

/** A long, lobed depression aligned with the road. This is a variable-width
 * meandering strip, not a scaled ellipse. Different left/right harmonics make
 * an asymmetric shoreline; tapered ends and a wider damp apron soften edges.
 */
export function rainPoolProfile(pool:Pick<RainPool,'seed'|'length'|'width'>,t:number,apron=1){
 const phase=hash(pool.seed+23)*Math.PI*2;
 const taper=Math.pow(Math.max(0,Math.sin(Math.PI*t)),.24);
 const left=(.84+.12*Math.sin(t*13+phase)+.09*Math.sin(t*31+phase*.6))*pool.width*taper*apron;
 const right=(.82+.14*Math.sin(t*17+phase+1.4)+.09*Math.cos(t*37+phase))*pool.width*taper*apron;
 const wander=pool.width*.10*Math.sin(t*10+phase)*taper;
 return {along:(t-.5)*pool.length,centre:wander,left:t<=0||t>=1?0:Math.max(.001,left),right:t<=0||t>=1?0:Math.max(.001,right)};
}
function point(pool:RainPool,t:number,v:number,apron=1):V2{const q=rainPoolProfile(pool,t,apron);const offset=q.centre+(v<0?v*q.left:v*q.right);return[pool.x+pool.dx*q.along-pool.dz*offset,pool.z+pool.dz*q.along+pool.dx*offset];}
function outline(pool:RainPool,apron=APRON):V2[]{const p:V2[]=[];for(let i=0;i<=PROFILE_STEPS;i++)p.push(point(pool,i/PROFILE_STEPS,-1,apron));for(let i=PROFILE_STEPS;i>=0;i--)p.push(point(pool,i/PROFILE_STEPS,1,apron));return p;}
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
    const s=seed+i*997+slot*313+(side>0?157:0),position=.7+(slot+.5)*slotLength;
    const poolLength=slotLength*(.85+hash(s+12)*.07);
    const lateral=side*road.width*(.25+(hash(s+5)-.5)*.025);
    const width=.77*Math.min(road.width*(.162+hash(s+11)*.021),(road.width/2-.22-Math.abs(lateral))/1.235);
    if(width<.12)continue;const gutter=true;
    const pool:RainPool={id:road.id+':'+i+':'+slot+':'+side,roadId:road.id,kind:gutter?'gutter':'rut',x:a[0]+dx*position-dz*lateral,z:a[1]+dz*position+dx*lateral,dx,dz,length:poolLength,width,lateral,roadWidth:road.width,seed:s,alpha:.85+hash(s+27)*.12,outline:[]};
    pool.outline=outline(pool);stats.attempts++;
    const sample:[number,number][]=[[pool.x,pool.z],...pool.outline,[pool.x+dx*poolLength*.5,pool.z+dz*poolLength*.5],[pool.x-dx*poolLength*.5,pool.z-dz*poolLength*.5]];
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
    pools.push(pool);const k=key(pool.x,pool.z),bucket=occupied.get(k)??[];bucket.push(pool);occupied.set(k,bucket);stats.estimatedWetArea+=area(pool.outline);stats.estimatedPuddleArea+=area(outline(pool,1));
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
   const t=steps===4?[0,.10,.50,.90,1][i]:i/steps,v=across[j],[x,z]=point(p,t,v,apron?APRON:1);
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
  selected.sort((a,b)=>(a.x-x)**2+(a.z-z)**2-(b.x-x)**2-(b.z-z)**2);selected.length=Math.min(limit,selected.length);shown=selected.length;visiblePuddleArea=selected.reduce((sum,p)=>sum+area(outline(p,1)),0);
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
   if(packed.version!==1||packed.stride!==10||!Array.isArray(packed.values)||packed.values.length%10||packed.values.length>1000000||!packed.values.every(Number.isFinite))throw Error('积水布局格式或预算无效');
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
  update,readyPromise,retry,
  get stats(){return{...layout.stats,status,failure,mode,shown,initMs,lastRebuildMs,rebuilds,visiblePuddleArea,coverageEvidence,drawCalls:puddles.isEnabled()?(apron.isEnabled()?2:1):apron.isEnabled()?1:0,activeTriangles:(apron.isEnabled()?apron.getTotalIndices()/3:0)+(puddles.isEnabled()?puddles.getTotalIndices()/3:0),extraRenderTargets:0,extraLights:0,normalTextureBytesWithMipmaps:Math.round(n*n*3*4/3),reflection:'reuse-existing-road-mirror',placement:'20-minutes-after-rain; prevalidated irregular road banks and dry islands',estimatedWetFraction:layout.stats.estimatedWetArea/Math.max(1,layout.stats.sampledSurfaceArea),estimatedPuddleFraction:layout.stats.estimatedPuddleArea/Math.max(1,layout.stats.sampledSurfaceArea),disposed};},
  dispose(){if(disposed)return;disposed=true;if(retryTimer)clearTimeout(retryTimer);apron.dispose(false,false);puddles.dispose(false,false);film.dispose(false,false);water.dispose(false,false);normal.dispose();},
 };
}

// Embedded prevalidated opening layout; rebuilt by validate_rain_puddle_coverage.py.
const SPAWN_FALLBACK:number[]=[-2676.35,-873.07,0.989642,0.143559,32.69,2.05,3.85,15,1229417462,0.943,-2659.55,-845.81,-0.991546,-0.129758,28.21,1.19,2.22,9,591462327,0.964,-2646.88,-863.25,-0.988881,-0.148711,39.52,1.97,3.58,15,749609931,0.926,-2647.99,-855.86,-0.988881,-0.148711,37.16,1.98,-3.9,15,749609774,0.861,-2657.19,-880.51,0.993502,0.113817,38.61,0.79,1.52,6,2912470427,0.924,-2660.14,-841.29,-0.991546,-0.129758,28.56,1.2,-2.34,9,591462170,0.95,-2656.84,-883.53,0.993502,0.113817,37.21,0.78,-1.53,6,2912470270,0.947,-2688.87,-864.28,-0.968109,-0.250528,31.69,1.9,-3.63,15,749610145,0.909,-2639.65,-867.83,0.989642,0.143559,32.09,1.88,3.77,15,1229417775,0.894,-2638.55,-875.36,0.989642,0.143559,33.8,2.01,-3.84,15,1229417618,0.869,-2685.3,-884.18,0.985702,0.168496,10.66,0.82,1.43,6,2912469430,0.896,-2691.73,-848.9,-0.998582,-0.053237,25.36,1.18,2.27,9,591462698,0.923,-2660.59,-830.68,0.997766,0.066802,25.95,0.78,-1.47,6,1148526210,0.94,-2684.79,-887.11,0.985702,0.168496,10.19,0.77,-1.55,6,2912469273,0.964,-2660.79,-827.72,0.997766,0.066802,25.41,0.79,1.49,6,1148526367,0.896,-2689.09,-832.56,0.997766,0.066802,25.87,0.8,-1.44,6,1148525897,0.957,-2689.29,-829.62,0.997766,0.066802,24.92,0.8,1.5,6,1148526054,0.967,-2626.98,-841.52,-0.991546,-0.129758,29.95,1.12,2.2,9,591462014,0.897,-2702.51,-839.9,-0.02429,0.999705,12.53,0.83,-1.45,6,3309853380,0.856,-2627.54,-837.21,-0.991546,-0.129758,29.02,1.13,-2.16,9,591461857,0.872,-2705.44,-839.98,-0.02429,0.999705,12.8,0.8,1.49,6,3309853537,0.873,-2615.38,-875.67,0.993502,0.113817,36.56,0.76,1.56,6,2912470740,0.956,-2714.87,-878.79,0.98928,0.146033,32.44,1.92,3.77,15,1585989238,0.912,-2713.76,-886.35,0.98928,0.146033,34.81,2.01,-3.88,15,1585989081,0.894,-2712.11,-890.47,0.967455,0.253045,35.24,0.76,1.56,6,2912468433,0.908,-2711.34,-893.42,0.967455,0.253045,35.85,0.8,-1.49,6,2912468276,0.964,-2720.38,-850.4,-0.998582,-0.053237,26.27,1.25,2.24,9,591463011,0.906,-2642.01,-808.71,-0.44777,0.894149,17.15,0.76,1.43,6,1148530042,0.854,-2720.63,-845.81,-0.998582,-0.053237,25.26,1.19,-2.35,9,591462854,0.891,-2639.38,-807.4,-0.44777,0.894149,17.16,0.79,-1.51,6,1148529885,0.906,-2604.95,-849.64,-0.988881,-0.148711,39.32,2.01,-3.65,15,749609461,0.856,-2603.83,-857.09,-0.988881,-0.148711,38.08,1.91,3.89,15,749609618,0.952,-2724.2,-873.45,-0.968109,-0.250528,33.34,2.03,-3.61,15,749610458,0.883,-2602.95,-862.54,0.989642,0.143559,31.66,1.98,3.73,15,1229418088,0.908,-2601.87,-869.95,0.989642,0.143559,31.57,2.08,-3.76,15,1229417931,0.962,-2721.29,-833.93,0.999753,0.022232,29.25,0.8,-1.43,6,1148525526,0.874,-2721.35,-830.93,0.999753,0.022232,29.69,0.75,1.57,6,1148525683,0.924,-2647.36,-793.48,-0.057388,0.998352,7.46,0.75,1.51,6,1148531039,0.879,-2644.38,-793.31,-0.057388,0.998352,7.88,0.75,-1.47,6,1148530882,0.901,-2595.0,-832.74,-0.991546,-0.129758,28.15,1.16,-2.36,9,591461544,0.963,-2575.37,-869.86,0.9827,0.185204,33.24,0.82,1.43,6,2912471424,0.863,-2754.31,-850.66,-0.999645,0.026645,31.04,1.22,2.19,9,591463695,0.934,-2752.46,-884.28,0.98928,0.146033,32.46,2.11,3.82,15,1585988925,0.889,-2753.59,-879.58,-0.989828,-0.142271,19.79,1.97,-3.79,15,749611142,0.91,-2754.19,-846.16,-0.999645,0.026645,32.3,1.17,-2.3,9,591463538,0.965,-2751.38,-891.62,0.98928,0.146033,33.66,2.03,-3.6,15,1585988768,0.895,-2754.25,-834.72,0.999753,0.022232,29.21,0.8,-1.49,6,1148525213,0.967,-2754.31,-831.71,0.999753,0.022232,28.41,0.78,1.53,6,1148525370,0.869,-2567.82,-856.74,0.982578,0.185848,27.1,1.92,3.72,15,1229418459,0.945,-2566.43,-864.12,0.982578,0.185848,27.49,1.99,-3.78,15,1229418302,0.894,-2754.98,-899.35,0.988274,0.152692,40.18,0.79,1.47,6,2912467436,0.852,-2754.52,-902.34,0.988274,0.152692,41.06,0.76,-1.56,6,2912467279,0.941,-2560.87,-850.33,-0.988881,-0.148711,39.8,1.94,3.59,15,749609305,0.965,-2561.96,-843.07,-0.988881,-0.148711,39.48,2.1,-3.75,15,749609148,0.891,-2558.83,-826.9,-0.981071,-0.193646,34.07,1.14,-2.2,9,591461173,0.954,-2539.78,-863.11,0.9827,0.185204,31.71,0.77,1.48,6,2912471737,0.891,-2787.55,-881.9,-0.999306,-0.037237,39.99,2.02,-3.93,15,749612139,0.862,-2539.22,-866.06,0.9827,0.185204,32.17,0.77,-1.53,6,2912471580,0.918,-2787.21,-835.54,0.999753,0.022232,28.5,0.75,-1.57,6,1148524900,0.937,-2787.27,-832.5,0.999753,0.022232,29.52,0.76,1.47,6,1148525057,0.886,-2790.37,-849.79,-0.999645,0.026645,32.02,1.14,2.29,9,591464008,0.95,-2790.25,-845.25,-0.999645,0.026645,31.6,1.19,-2.25,9,591463851,0.897,-2536.75,-850.67,0.982578,0.185848,27.73,2.05,3.91,15,1229418772,0.908,-2535.35,-858.08,0.982578,0.185848,28.98,2.1,-3.63,15,1229418615,0.897,-2794.38,-888.01,0.999491,0.031896,40.33,2.05,3.66,15,1585987928,0.947,-2791.35,-904.23,0.995173,0.098131,22.83,0.76,1.44,6,2912466439,0.926,-2794.15,-895.31,0.999491,0.031896,39.83,2.0,-3.64,15,1585987771,0.859,-2791.06,-907.17,0.995173,0.098131,23.84,0.79,-1.51,6,2912466282,0.919,-2521.62,-819.42,-0.981071,-0.193646,34.82,1.22,-2.32,9,591460860,0.876,-2515.67,-834.87,-0.981182,-0.193086,41.27,2.06,-3.87,15,749608151,0.957,-2514.2,-842.32,-0.981182,-0.193086,41.79,1.96,3.73,15,749608308,0.936,-2818.24,-882.0,-0.993537,0.113513,13.66,2.01,-3.76,15,749613136,0.95,-2505.6,-845.03,0.982578,0.185848,27.61,1.9,3.66,15,1229419085,0.898,-2821.94,-888.14,0.997562,-0.06978,7.46,1.94,3.91,15,1585986931,0.888,-2504.18,-856.38,0.9827,0.185204,31.86,0.8,1.49,6,2912472050,0.93,-2504.2,-852.42,0.982578,0.185848,28.89,2.0,-3.85,15,1229418928,0.922,-2822.08,-834.43,0.997056,-0.076674,30.62,0.8,-1.43,6,1148524216,0.868,-2503.63,-859.29,0.9827,0.185204,33.03,0.78,-1.48,6,2912471893,0.956,-2821.85,-831.52,0.997056,-0.076674,30.48,0.79,1.49,6,1148524373,0.935,-2822.48,-895.81,0.997562,-0.06978,7.86,1.97,-3.78,15,1585986774,0.854,-2826.42,-848.85,-0.999645,0.026645,30.8,1.23,2.31,9,591464321,0.858,-2826.3,-844.29,-0.999645,0.026645,32.58,1.22,-2.25,9,591464164,0.888,-2821.79,-905.68,0.999982,0.006074,29.66,0.79,1.43,6,2912466068,0.872,-2821.77,-908.63,0.999982,0.006074,29.41,0.79,-1.52,6,2912465911,0.923,-2777.51,-742.48,0.5309,0.847434,12.77,0.57,-1.08,4.5,3281019398,0.959,-2779.38,-741.31,0.5309,0.847434,13.34,0.56,1.13,4.5,3281019555,0.854,-2755.67,-717.36,0.691541,0.722337,45.32,0.6,-1.08,4.5,3281020395,0.885,-2757.23,-715.87,0.691541,0.722337,44.4,0.58,1.08,4.5,3281020552,0.961,-2502.0,-786.41,-0.996783,-0.080149,32.36,0.57,1.09,4.5,3991730214,0.919,-2495.91,-800.1,0.992272,0.124084,42.3,0.58,-1.1,4.5,3991735042,0.884,-2502.18,-784.19,-0.996783,-0.080149,31.66,0.56,-1.13,4.5,3991730057,0.913,-2496.19,-797.86,0.992272,0.124084,43.57,0.54,1.16,4.5,3991735199,0.86,-2845.39,-884.62,0.984108,-0.17757,32.18,2.02,3.74,15,1585985934,0.962,-2846.73,-892.09,0.984108,-0.17757,33.59,2.07,-3.85,15,1585985777,0.927,-2852.54,-875.3,-0.977626,0.210352,46.56,2.11,-3.9,15,749614133,0.924,-2824.64,-760.93,0.993032,-0.117845,40.99,0.57,-1.12,4.5,3365054588,0.892,-2481.57,-809.82,-0.225277,-0.974295,6.74,0.58,-1.1,4.5,1500406302,0.872,-2824.37,-758.65,0.993032,-0.117845,40.62,0.53,1.17,4.5,3365054745,0.852,-2479.35,-810.33,-0.225277,-0.974295,6.67,0.53,1.18,4.5,1500406459,0.914,-2473.59,-837.8,0.967972,0.251059,28.54,2.02,3.72,15,1229419456,0.928,-2471.73,-844.98,0.967972,0.251059,28.0,2.1,-3.7,15,1229419299,0.885,-2855.78,-831.91,0.997056,-0.076674,30.04,0.78,-1.51,6,1148523903,0.856,-2855.55,-828.95,0.997056,-0.076674,28.91,0.78,1.46,6,1148524060,0.898,-2854.25,-905.75,0.999982,0.006074,27.6,0.76,1.56,6,2912465755,0.869,-2854.23,-908.76,0.999982,0.006074,27.96,0.81,-1.45,6,2912465598,0.94,-2468.42,-824.93,-0.973768,-0.227544,40.18,1.89,-3.67,15,749607154,0.884,-2464.56,-847.51,0.968447,0.249218,37.22,0.82,1.43,6,2912472421,0.862,-2463.82,-850.38,0.968447,0.249218,36.89,0.78,-1.53,6,2912472264,0.936,-2867.9,-845.21,-0.995742,0.092185,11.59,0.76,-1.56,6,1298372692,0.886,-2868.19,-848.33,-0.995742,0.092185,11.62,0.75,1.57,6,1298372849,0.924,-2473.56,-785.62,-0.997705,0.067718,16.52,0.56,1.12,4.5,3991729217,0.886,-2473.41,-783.34,-0.997705,0.067718,15.78,0.55,-1.15,4.5,3991729060,0.952,-2464.48,-795.84,0.985803,0.167907,10.9,0.56,-1.07,4.5,3991722081,0.872,-2464.84,-793.69,0.985803,0.167907,10.96,0.57,1.11,4.5,3991722238,0.904,-2875.67,-880.43,0.997167,-0.075224,17.82,1.99,3.66,15,1585984937,0.924,-2876.23,-887.87,0.997167,-0.075224,18.99,2.06,-3.8,15,1585984780,0.891,-2648.91,-646.16,0.99999,0.004516,21.12,0.54,-1.17,4.5,4008500697,0.961,-2877.81,-824.82,0.873458,-0.486899,9.17,0.8,1.47,6,1148523063,0.958,-2879.26,-827.43,0.873458,-0.486899,9.46,0.79,-1.52,6,1148522906,0.96,-2881.14,-842.11,-0.930898,0.36528,11.17,0.78,-1.53,6,1298373689,0.939,-2882.24,-844.91,-0.930898,0.36528,11.21,0.81,1.48,6,1298373846,0.877,-2648.93,-643.84,0.99999,0.004516,19.78,0.55,1.15,4.5,4008500854,0.876,-2885.25,-869.02,-0.992979,0.118291,9.2,1.94,-3.73,15,749615130,0.964,-2886.14,-876.52,-0.992979,0.118291,9.25,2.0,3.83,15,749615287,0.952,-2648.94,-639.85,-0.99999,-0.004514,19.92,0.57,1.12,4.5,4008502848,0.941,-2442.9,-829.86,0.967972,0.251059,27.24,1.96,3.71,15,1229419769,0.932,-2441.0,-837.17,0.967972,0.251059,28.89,2.09,-3.84,15,1229419612,0.936,-2648.95,-637.58,-0.99999,-0.004514,19.64,0.55,-1.15,4.5,4008502691,0.852,-2885.36,-818.27,0.574908,-0.818218,7.65,0.77,1.55,6,1148522066,0.914,-2446.42,-802.96,-0.961079,-0.276274,34.44,1.21,-2.25,9,591460176,0.902,-2450.39,-788.76,0.964925,0.262525,13.39,0.54,-1.16,4.5,3924611605,0.929,-2450.99,-786.58,0.964925,0.262525,14.26,0.58,1.1,4.5,3924611762,0.969,-2886.71,-906.0,0.999982,0.006074,28.28,0.79,1.51,6,2912465442,0.923,-2886.69,-909.04,0.999982,0.006074,29.58,0.78,-1.53,6,2912465285,0.914,-2887.82,-819.99,0.574908,-0.818218,7.23,0.83,-1.45,6,1148521909,0.87,-2449.97,-783.45,-0.978123,-0.208025,22.41,0.56,1.14,4.5,3991728220,0.923,-2450.44,-781.26,-0.978123,-0.208025,22.42,0.58,-1.1,4.5,3991728063,0.915,-2892.93,-835.15,-0.776828,0.629712,11.35,0.76,-1.57,6,1298374686,0.898,-2662.4,-630.72,0.024097,-0.99971,13.56,0.58,-1.08,4.5,4008499700,0.857,-2660.17,-630.66,0.024097,-0.99971,13.2,0.55,1.16,4.5,4008499857,0.914,-2894.88,-837.55,-0.776828,0.629712,12.06,0.78,1.52,6,1298374843,0.916,-2888.18,-798.33,0.013079,-0.999914,29.08,0.78,1.47,6,1148521069,0.935,-2891.15,-798.37,0.013079,-0.999914,29.63,0.76,-1.5,6,1148520912,0.881,-2436.63,-789.1,0.966152,0.257974,37.5,0.57,-1.12,4.5,3991723078,0.911,-2437.21,-786.91,0.966152,0.257974,37.81,0.55,1.14,4.5,3991723235,0.874,-2901.61,-825.62,-0.523877,0.851794,9.98,0.8,-1.5,6,1298375683,0.869,-2837.07,-694.23,0.981342,-0.192272,17.97,0.54,-1.17,4.5,3314721731,0.88,-2423.51,-836.92,0.968447,0.249218,38.75,0.75,1.46,6,2912472734,0.95,-2881.47,-755.07,0.999615,-0.027732,20.55,0.57,-1.12,4.5,441934845,0.947,-2836.63,-691.97,0.981342,-0.192272,18.32,0.56,1.13,4.5,3314721888,0.854,-2904.13,-827.17,-0.523877,0.851794,9.63,0.82,1.46,6,1298375840,0.967,-2881.4,-752.84,0.999615,-0.027732,19.29,0.57,1.11,4.5,441935002,0.944,-2907.27,-879.51,0.999991,0.004254,33.98,2.05,3.82,15,1585985505,0.967,-2907.24,-886.98,0.999991,0.004254,33.33,1.95,-3.65,15,1585985348,0.918,-2905.88,-816.13,-0.238241,0.971206,7.04,0.81,-1.47,6,1298376680,0.874,-2422.74,-813.45,-0.968045,-0.250778,41.44,2.04,-3.89,15,749606157,0.963,-2758.23,-633.79,0.97155,0.236836,17.05,0.59,-1.08,4.5,3247612252,0.879,-2911.49,-870.55,-0.999994,-0.00355,33.64,0.78,-1.53,6,3862238866,0.882,-2911.48,-873.53,-0.999994,-0.00355,34.39,0.83,1.45,6,3862239023,0.899,-2908.76,-816.84,-0.238241,0.971206,6.98,0.76,1.49,6,1298376837,0.925,-2758.74,-631.69,0.97155,0.236836,17.58,0.59,1.08,4.5,3247612409,0.957,-2907.15,-806.63,-0.048422,0.998827,7.97,0.78,-1.53,6,1298377677,0.854,-2430.38,-773.92,-0.836014,-0.548708,13.3,0.58,-1.1,4.5,3991727066,0.913,-2893.43,-762.1,0.103575,-0.994622,33.44,0.78,-1.53,6,1148519915,0.91,-2429.14,-775.82,-0.836014,-0.548708,14.25,0.54,1.17,4.5,3991727223,0.861,-2910.15,-806.77,-0.048422,0.998827,8.39,0.81,1.48,6,1298377834,0.959,-2779.42,-636.47,0.999926,0.012137,17.41,0.56,-1.11,4.5,3247611255,0.886,-2412.23,-821.83,0.967972,0.251059,27.53,1.93,3.77,15,1229420082,0.957,-2919.33,-856.25,-0.991588,-0.129435,35.56,1.12,2.14,9,591465689,0.907,-2779.44,-634.25,0.999926,0.012137,17.79,0.57,1.11,4.5,3247611412,0.95,-2919.9,-851.88,-0.991588,-0.129435,34.45,1.13,-2.25,9,591465532,0.914,-2410.37,-829.01,0.967972,0.251059,28.5,1.94,-3.64,15,1229419925,0.85,-2907.85,-781.2,-0.02279,0.99974,33.48,0.77,-1.54,6,1298378674,0.896,-2918.75,-902.8,0.986683,-0.162656,25.57,1.19,2.28,9,2837944326,0.913,-2919.48,-907.2,0.986683,-0.162656,26.22,1.14,-2.17,9,2837944169,0.944,-2910.9,-781.27,-0.02279,0.99974,34.01,0.79,1.51,6,1298378831,0.895,-2410.11,-792.48,-0.961079,-0.276274,33.07,1.23,-2.3,9,591459863,0.953,-2891.48,-719.43,-0.03956,-0.999217,39.64,0.76,1.56,6,1148519075,0.886,-2412.15,-767.99,-0.953787,-0.300483,17.75,0.57,1.07,4.5,3991726226,0.919,-2412.82,-765.87,-0.953787,-0.300483,17.82,0.55,-1.15,4.5,3991726069,0.96];
