import type {CityData,V2} from './city-types.ts';

export type DistantCityTile={
 key:string;x:number;z:number;positions:number[];normals:number[];colors:number[];indices:number[];buildingCount:number;
};
export type DistantCityGeometry={tiles:DistantCityTile[];buildingCount:number;triangleCount:number;skippedBuildingCount:number;skippedRoofCount:number};

const TILE_SIZE=640,EPSILON=1e-7;
const palettes:Record<string,number[][]>={
 office:[[.49,.57,.64],[.43,.55,.59],[.64,.64,.61],[.59,.55,.51]],
 residential:[[.67,.63,.55],[.56,.61,.60],[.65,.57,.51],[.60,.63,.62]],
 stone:[[.63,.60,.54],[.52,.57,.63],[.64,.53,.48]],
};
const cross=(a:V2,b:V2,c:V2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const same=(a:V2,b:V2)=>Math.abs(a[0]-b[0])<EPSILON&&Math.abs(a[1]-b[1])<EPSILON;

function ringArea(ring:V2[]){
 let area=0;const origin=ring[0];
 for(let i=1;i<ring.length-1;i++)area+=cross(origin,ring[i],ring[i+1]);
 return area*.5;
}

function onSegment(a:V2,b:V2,p:V2){
 return Math.abs(cross(a,b,p))<=EPSILON&&p[0]>=Math.min(a[0],b[0])-EPSILON&&p[0]<=Math.max(a[0],b[0])+EPSILON&&p[1]>=Math.min(a[1],b[1])-EPSILON&&p[1]<=Math.max(a[1],b[1])+EPSILON;
}

function selfIntersects(ring:V2[]){
 for(let i=0;i<ring.length;i++)for(let j=i+2;j<ring.length;j++){
  if(i===0&&j===ring.length-1)continue;
  const a=ring[i],b=ring[(i+1)%ring.length],c=ring[j],d=ring[(j+1)%ring.length];
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))continue;
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(((abC>EPSILON&&abD<-EPSILON)||(abC<-EPSILON&&abD>EPSILON))&&((cdA>EPSILON&&cdB<-EPSILON)||(cdA<-EPSILON&&cdB>EPSILON)))return true;
  if(onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b))return true;
 }
 return false;
}

/** Ear clipping keeps concave roofs inside their footprint; failure never falls back to a fan. */
function triangulate(ring:V2[]):number[]|null{
 const remaining=ring.map((_,i)=>i),triangles:number[]=[];
 // Collinear wall vertices stay in the wall mesh, but do not need roof triangles.
 for(let changed=true;changed&&remaining.length>3;){
  changed=false;
  for(let i=0;i<remaining.length&&remaining.length>3;i++){
   const a=ring[remaining[(i+remaining.length-1)%remaining.length]],b=ring[remaining[i]],c=ring[remaining[(i+1)%remaining.length]];
   if(Math.abs(cross(a,b,c))<=EPSILON){remaining.splice(i,1);changed=true;i--;}
  }
 }
 while(remaining.length>3){
  let clipped=false;
  for(let i=0;i<remaining.length;i++){
   const ia=remaining[(i+remaining.length-1)%remaining.length],ib=remaining[i],ic=remaining[(i+1)%remaining.length];
   const a=ring[ia],b=ring[ib],c=ring[ic];
   if(cross(a,b,c)<=EPSILON)continue;
   let occupied=false;
   for(const index of remaining){
    if(index===ia||index===ib||index===ic)continue;
    const p=ring[index];
    if(cross(a,b,p)>=-EPSILON&&cross(b,c,p)>=-EPSILON&&cross(c,a,p)>=-EPSILON){occupied=true;break;}
   }
   if(occupied)continue;
   triangles.push(ia,ib,ic);remaining.splice(i,1);clipped=true;break;
  }
  if(!clipped)return null;
 }
 if(remaining.length!==3||cross(ring[remaining[0]],ring[remaining[1]],ring[remaining[2]])<=EPSILON)return null;
 triangles.push(...remaining);
 let area=0;
 for(let i=0;i<triangles.length;i+=3)area+=cross(ring[triangles[i]],ring[triangles[i+1]],ring[triangles[i+2]])*.5;
 return Math.abs(area-ringArea(ring))<=Math.max(EPSILON,area*1e-7)?triangles:null;
}

function buildingSeed(building:CityData['buildings'][number],ring:V2[]){
 const source=building as typeof building&{seed?:number;id?:string};
 const identity=Number.isFinite(source.seed)?String(source.seed):source.id??`${ring.map(p=>p.join(',')).join(';')}:${building.height}`;
 let hash=2166136261;
 for(let i=0;i<identity.length;i++)hash=Math.imul(hash^identity.charCodeAt(i),16777619);
 return hash>>>0;
}

/**
 * One wall shell and flat roof per existing exterior, with no bottom, props or collision meshes.
 * Positions are world-space x/height/z; x/z are 640 m tile centres and key is "ix_iz".
 * Winding/normals match Babylon's left-handed scene. RGB is a stable facade tint;
 * alpha stores a stable 0..1 building seed, NOT opacity (set mesh.hasVertexAlpha=false).
 * As with the base facade asset, only the first ring is used; landmark replacement rows are excluded.
 */
export function buildDistantCityGeometry(data:CityData):DistantCityGeometry{
 const tiles=new Map<string,DistantCityTile>();let buildingCount=0,skippedBuildingCount=0,skippedRoofCount=0;
 for(const building of data.buildings){
  if(building.style==='landmark-detail')continue;
  const source=building.rings?.[0];
  if(!Number.isFinite(building.height)||building.height<=0||!source||source.length<3||source.some(p=>!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))){skippedBuildingCount++;continue;}
  let length=source.length;while(length>1&&same(source[0],source[length-1]))length--;
  // Match build_city_facades.py's vertex average, excluding its repeated closing vertex.
  let cx=0,cz=0;for(let i=0;i<length;i++){cx+=source[i][0];cz+=source[i][1];}cx/=length;cz/=length;
  const ring:V2[]=[];for(let i=0;i<length;i++)if(!ring.length||!same(ring[ring.length-1],source[i]))ring.push(source[i]);
  const area=ring.length>=3?ringArea(ring):0;
  if(ring.length<3||Math.abs(area)<=EPSILON||selfIntersects(ring)){skippedBuildingCount++;continue;}
  if(area<0)ring.reverse();
  const ix=Math.floor(cx/TILE_SIZE),iz=Math.floor(cz/TILE_SIZE),key=`${ix}_${iz}`;
  let tile=tiles.get(key);if(!tile){tile={key,x:(ix+.5)*TILE_SIZE,z:(iz+.5)*TILE_SIZE,positions:[],normals:[],colors:[],indices:[],buildingCount:0};tiles.set(key,tile);}
  const seed=buildingSeed(building,ring),palette=palettes[building.style]??palettes.stone,base=palette[seed%palette.length],gain=.94+((seed>>>8)&255)/255*.12;
  const color=base.map(value=>Math.min(.70,value*gain)),alpha=(seed&65535)/65535,height=building.height;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],distance=Math.hypot(dx,dz),offset=tile.positions.length/3;
   tile.positions.push(a[0],0,a[1],b[0],0,b[1],b[0],height,b[1],a[0],height,a[1]);
   for(let j=0;j<4;j++){tile.normals.push(dz/distance,0,-dx/distance);tile.colors.push(color[0],color[1],color[2],alpha);}
   tile.indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  const roof=triangulate(ring);
  if(roof){
   const offset=tile.positions.length/3;
   for(const p of ring){tile.positions.push(p[0],height,p[1]);tile.normals.push(0,1,0);tile.colors.push(color[0]*.78,color[1]*.78,color[2]*.78,alpha);}
   for(const index of roof)tile.indices.push(offset+index);
  }else skippedRoofCount++;
  tile.buildingCount++;buildingCount++;
 }
 const result=[...tiles.values()].sort((a,b)=>a.x-b.x||a.z-b.z);
 return {tiles:result,buildingCount,triangleCount:result.reduce((sum,tile)=>sum+tile.indices.length/3,0),skippedBuildingCount,skippedRoofCount};
}
