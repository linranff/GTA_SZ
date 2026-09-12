import {closest,inRing} from './driving.ts';
import type {CityData,Road,V2} from './city-types.ts';

export type RoadsidePlant=[number,number,number,number,number];
export type ExistingRoadsideTree={x:number;z:number;radius:number};
type Rings=V2[][];
type Bounds={minX:number;minZ:number;maxX:number;maxZ:number};
type Polygon={rings:Rings;bounds:Bounds};
type Segment={a:V2;b:V2;margin:number;roadId?:string};
export type RoadsidePlantingOptions={
 collisionFootprints?:ReadonlyArray<{rings:Rings}>;
 bridgeCrossings?:ReadonlyArray<{points:V2[];width:number;ramp?:number}>;
 heightAt?:(x:number,z:number)=>number;
 /** Additional props/landmark veto. Exact polygon clearance is supplied above;
  * this callback supplements it at the root and eight canopy perimeter points. */
 blocked?:(x:number,z:number)=>boolean;
 maxTrees?:number;
};
export type RoadsidePlantingPoint={plant:RoadsidePlant;roadId:string;roadName:string;side:-1|1;radius:number};
type Rejection='green'|'land'|'water'|'road'|'building'|'coast'|'bridge'|'junction'|'tree'|'slope'|'blocked'|'density';

/** Outward-rounded maximum horizontal vertex radius across BOTH shipped LODs.
 * Existing imported roots are reflected in Z; that preserves these circles.
 * Model-bound tests protect the envelope if an asset changes. */
export const ROADSIDE_TREE_RADII={banyan:5.141,palm:3.582,orchid:4.083,openBroadleaf:7.235,openPalm:2.106} as const;
export const ROADSIDE_PLANTING_BUDGET={
 // A denser verge canopy is still capped by cells and by the renderer's
 // shared near/far tree budgets. These are placement/visibility budgets, not
 // extra meshes: every plant reuses one of the three existing prototypes.
 total:3000,cellSize:200,perCell:16,near:18,far:120,aerial:240,
 crownMargin:.55,treeGap:.50,minimumTreeDistance:7.2,
 junctionClearance:13,coastPromenade:4.8,maxSlope:.30,
} as const;
const SPECIES_RADII=[ROADSIDE_TREE_RADII.banyan,ROADSIDE_TREE_RADII.palm,ROADSIDE_TREE_RADII.orchid];
const SPACING:Record<string,number>={trunk:22,primary:19,secondary:17,tertiary:17,residential:22,unclassified:23};
const TAU=Math.PI*2;
function hash(value:string){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function random(value:string){return hash(value)/4294967296;}
function bounds(rings:Rings):Bounds{
 let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
 for(const ring of rings)for(const [x,z] of ring){minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);}
 return {minX,minZ,maxX,maxZ};
}
class Grid<T>{
 private cells=new Map<string,T[]>();
 constructor(private size=96){}
 add(value:T,b:Bounds){
  for(let x=Math.floor(b.minX/this.size);x<=Math.floor(b.maxX/this.size);x++)for(let z=Math.floor(b.minZ/this.size);z<=Math.floor(b.maxZ/this.size);z++){
   const key=x+','+z,cell=this.cells.get(key)??[];cell.push(value);this.cells.set(key,cell);
  }
 }
 *near(x:number,z:number,r=0):Generator<T>{
  const seen=new Set<T>();
  for(let a=Math.floor((x-r)/this.size);a<=Math.floor((x+r)/this.size);a++)for(let b=Math.floor((z-r)/this.size);b<=Math.floor((z+r)/this.size);b++){
   for(const value of this.cells.get(a+','+b)??[])if(!seen.has(value)){seen.add(value);yield value;}
  }
 }
}
function polygonIndex(rings:ReadonlyArray<Rings>){const grid=new Grid<Polygon>();for(const r of rings){if(!r[0]?.length)continue;const b=bounds(r);grid.add({rings:r,bounds:b},b);}return grid;}
function inside(x:number,z:number,rings:Rings){return inRing(x,z,rings[0])&&!rings.slice(1).some(r=>inRing(x,z,r));}
function boundaryDistance(x:number,z:number,rings:Rings){
 let d=Infinity;
 for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++)d=Math.min(d,closest(x,z,ring[j],ring[i]).d);
 return d;
}
/** Exact circle containment in one mapped polygon is conservative relative to
 * its union: adjacent tiny green polygons are never treated as a larger verge. */
function containsDisk(grid:Grid<Polygon>,x:number,z:number,r:number){
 for(const p of grid.near(x,z)){
  const b=p.bounds;
  if(x-r<b.minX||z-r<b.minZ||x+r>b.maxX||z+r>b.maxZ)continue;
  if(inside(x,z,p.rings)&&boundaryDistance(x,z,p.rings)>r)return true;
 }
 return false;
}
function intersectsDisk(grid:Grid<Polygon>,x:number,z:number,r:number){
 for(const p of grid.near(x,z,r)){
  if(inside(x,z,p.rings)||boundaryDistance(x,z,p.rings)<=r)return true;
 }
 return false;
}
function addSegment(grid:Grid<Segment>,a:V2,b:V2,margin:number,roadId?:string){
 const segment={a,b,margin,roadId};grid.add(segment,{minX:Math.min(a[0],b[0])-margin,minZ:Math.min(a[1],b[1])-margin,maxX:Math.max(a[0],b[0])+margin,maxZ:Math.max(a[1],b[1])+margin});
}
function touchesSegment(grid:Grid<Segment>,x:number,z:number,r:number){for(const s of grid.near(x,z,r))if(closest(x,z,s.a,s.b).d<=s.margin+r)return true;return false;}
function cross(a:V2,b:V2){return a[0]*b[1]-a[1]*b[0];}
function segmentIntersection(a:V2,b:V2,c:V2,d:V2):V2|null{
 const r:[number,number]=[b[0]-a[0],b[1]-a[1]],s:[number,number]=[d[0]-c[0],d[1]-c[1]],den=cross(r,s);
 if(Math.abs(den)<1e-7)return null;
 const q:[number,number]=[c[0]-a[0],c[1]-a[1]],t=cross(q,s)/den,u=cross(q,r)/den;
 return t>=-1e-6&&t<=1.000001&&u>=-1e-6&&u<=1.000001?[a[0]+t*r[0],a[1]+t*r[1]]:null;
}
function sidewalk(road:Road){return ['trunk','primary','secondary','tertiary'].includes(road.kind)?2.4:1.2;}
function treeBounds(tree:ExistingRoadsideTree){return {minX:tree.x-tree.radius,minZ:tree.z-tree.radius,maxX:tree.x+tree.radius,maxZ:tree.z+tree.radius};}

/** Build once after the fixed city/landmark/terrain inputs are ready. This is
 * deterministic game planting in mapped green space, NOT observed vegetation.
 * No network, random seed, Babylon mesh, texture, light or per-frame work. */
export function planRoadsidePlanting(data:CityData,existing:ReadonlyArray<ExistingRoadsideTree>,options:RoadsidePlantingOptions={}){
 const budget=ROADSIDE_PLANTING_BUDGET;
 const maxTrees=Math.max(0,Math.min(budget.total,Math.floor(options.maxTrees??budget.total)));
 const green=polygonIndex(data.green.map(p=>p.rings)),land=polygonIndex(data.land),water=polygonIndex(data.water.map(p=>p.rings));
 const buildings=polygonIndex([...data.buildings,...(options.collisionFootprints??[])].map(p=>p.rings));
 const roads=new Grid<Segment>(),roadCrossings=new Grid<{x:number;z:number}>(),coast=new Grid<Segment>(),bridges=new Grid<Segment>(),trees=new Grid<ExistingRoadsideTree>();
 const nodeDirections=new Map<string,{x:number;z:number;directions:V2[]}>();
 for(const road of data.roads)for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i];
  // Index only the segments already inserted into `roads`; checking
  // true line intersections here handles OSM ways that cross without sharing
  // a node while keeping the per-candidate clearance query constant-time.
  const midX=(a[0]+b[0])*.5,midZ=(a[1]+b[1])*.5,half=Math.hypot(b[0]-a[0],b[1]-a[1])*.5+road.width/2+8;
  for(const previous of roads.near(midX,midZ,half))if(previous.roadId&&previous.roadId!==road.id){const point=segmentIntersection(a,b,previous.a,previous.b);if(point)roadCrossings.add({x:point[0],z:point[1]},{minX:point[0],minZ:point[1],maxX:point[0],maxZ:point[1]});}
  addSegment(roads,a,b,road.width/2+sidewalk(road),road.id);
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.1||Number(road.grade||0)!==0)continue;
  for(const [p,q] of [[a,b],[b,a]]){
   const key=Math.round(p[0]*2)+','+Math.round(p[1]*2),node=nodeDirections.get(key)??{x:p[0],z:p[1],directions:[]};
   const direction:V2=[(q[0]-p[0])/length,(q[1]-p[1])/length];
   if(!node.directions.some(d=>d[0]*direction[0]+d[1]*direction[1]>.94))node.directions.push(direction);
   nodeDirections.set(key,node);
  }
 }
 const junctions=new Grid<{x:number;z:number}>();
 for(const node of nodeDirections.values()){
  // Split ways continuing straight have two opposite directions, not a new
  // junction. Real branches and sharp corners retain a sightline opening.
  if(node.directions.length<2)continue;
  if(node.directions.length===2&&node.directions[0][0]*node.directions[1][0]+node.directions[0][1]*node.directions[1][1]<-.45)continue;
  junctions.add(node,{minX:node.x,minZ:node.z,maxX:node.x,maxZ:node.z});
 }
 for(const line of data.coast)for(let i=1;i<line.length;i++)addSegment(coast,line[i-1],line[i],budget.coastPromenade);
 for(const bridge of options.bridgeCrossings??[])for(let i=1;i<bridge.points.length;i++)addSegment(bridges,bridge.points[i-1],bridge.points[i],Math.max(bridge.width/2+5,bridge.ramp??70));
 for(const tree of existing)trees.add(tree,treeBounds(tree));
 const rejected:Record<Rejection,number>={green:0,land:0,water:0,road:0,building:0,coast:0,bridge:0,junction:0,tree:0,slope:0,blocked:0,density:0};
 const occupied=new Map<string,number>(),points:RoadsidePlantingPoint[]=[];
 const byKind:Record<string,number>={},bySpecies={banyan:0,palm:0,orchid:0};let candidates=0,eligibleRoads=0,tallTrees=0,minScale=Infinity,maxScale=0;
 function reason(x:number,z:number,r:number):Rejection|undefined{
  if(!containsDisk(green,x,z,r))return 'green';
  if(!containsDisk(land,x,z,r))return 'land';
  if(intersectsDisk(water,x,z,r+.65))return 'water';
  if(touchesSegment(roads,x,z,r+.35))return 'road';
  if(intersectsDisk(buildings,x,z,r+.6))return 'building';
  if(touchesSegment(coast,x,z,r))return 'coast';
  if(touchesSegment(bridges,x,z,r))return 'bridge';
  for(const j of junctions.near(x,z,budget.junctionClearance+r))if(Math.hypot(x-j.x,z-j.z)<budget.junctionClearance+r)return 'junction';
  for(const crossing of roadCrossings.near(x,z,budget.junctionClearance+r))if(Math.hypot(x-crossing.x,z-crossing.z)<budget.junctionClearance+r)return 'junction';
  for(const tree of trees.near(x,z,Math.max(budget.minimumTreeDistance,r+budget.treeGap)))if(Math.hypot(x-tree.x,z-tree.z)<Math.max(budget.minimumTreeDistance,r+tree.radius+budget.treeGap))return 'tree';
  if(options.heightAt){
   const sample=1.4,y=options.heightAt(x,z);
   if(!Number.isFinite(y))return 'slope';
   for(const [dx,dz] of [[sample,0],[-sample,0],[0,sample],[0,-sample]]){
    const next=options.heightAt(x+dx,z+dz);if(!Number.isFinite(next)||Math.abs(next-y)/sample>budget.maxSlope)return 'slope';
   }
  }
  if(options.blocked){
   if(options.blocked(x,z))return 'blocked';
   for(let i=0;i<8;i++)if(options.blocked(x+Math.cos(i*TAU/8)*r,z+Math.sin(i*TAU/8)*r))return 'blocked';
  }
  return undefined;
 }
 // Hash ordering spreads the finite global budget across the map rather than
 // exhausting it in the first district/OSM extraction order. A cell has its
 // own density ceiling; long ways are sampled along their entire length.
 const selected=data.roads.filter(r=>SPACING[r.kind]&&r.width>=4&&Number(r.grade||0)===0).slice().sort((a,b)=>hash(a.id)-hash(b.id)||a.id.localeCompare(b.id));
 for(const road of selected){
  if(points.length>=maxTrees)break;
  let total=0;const lengths=road.points.slice(1).map((p,i)=>{const n=Math.hypot(p[0]-road.points[i][0],p[1]-road.points[i][1]);total+=n;return n;});
  if(total<35)continue;eligibleRoads++;
  const seed=road.id+':roadside-v2',speciesSeed=random((road.name||road.id)+':species');
  const dominantSpecies=speciesSeed<.18?1:speciesSeed<.42?2:0;
  const spacing=SPACING[road.kind]+Math.max(0,road.width-9)*.25;
  let distance=12+random(seed)*spacing*.65,segment=0,before=0,ordinal=0;
  while(distance<total-12&&points.length<maxTrees){
   while(segment<lengths.length-1&&distance>before+lengths[segment])before+=lengths[segment++];
   const length=lengths[segment];if(length<.01){distance+=spacing;continue;}
   const a=road.points[segment],b=road.points[segment+1],t=(distance-before)/length;
   const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
   for(const side of [-1,1] as const){
    if(points.length>=maxTrees)break;
    const key=seed+':'+ordinal+':'+side;
    // Keep a road's dominant planting legible, then introduce occasional
    // companion species so long verges do not read as a single repeated row.
    const mixed=random(key+':species')<.26;
    const species=mixed?(dominantSpecies+1+(random(key+':species-alt')>.5?1:0))%3:dominantSpecies;
    // Keep the ordinary row close to the authored planting scale. Height is
    // concentrated in the tall tier so density can increase without making
    // every crown consume the clearance of a giant tree.
    const baseScale=species===1?.73+random(key+':scale')*.13:.61+random(key+':scale')*.16;
    // Roughly one in four accepted trees becomes a skyline tree. The height
    // comes from instance scale, so it costs no additional geometry or draw.
    const tall=random(key+':height')<.28;
    const scale=+(baseScale*(tall?1.42+random(key+':height-factor')*.28:1)).toFixed(3);
    const radius=SPECIES_RADII[species]*scale+budget.crownMargin;
    const base=road.width/2+sidewalk(road)+radius+.75;
    // Search only a narrow roadside band; the second/third offsets allow a
    // tree to sit in the adjacent green strip instead of the paved sidewalk.
    for(const extra of [0,2.5,5]){
     const x=+(a[0]+(b[0]-a[0])*t-dz*(base+extra)*side).toFixed(2);
     const z=+(a[1]+(b[1]-a[1])*t+dx*(base+extra)*side).toFixed(2);
     candidates++;
     const cell=Math.floor(x/budget.cellSize)+','+Math.floor(z/budget.cellSize);
     const failure=(occupied.get(cell)??0)>=budget.perCell?'density':reason(x,z,radius);
     if(failure){rejected[failure]++;continue;}
     const plant:RoadsidePlant=[x,z,species,scale,+(random(key+':yaw')*TAU).toFixed(3)];
     points.push({plant,roadId:road.id,roadName:road.name,side,radius});
     const tree={x,z,radius};trees.add(tree,treeBounds(tree));
     occupied.set(cell,(occupied.get(cell)??0)+1);byKind[road.kind]=(byKind[road.kind]??0)+1;
     bySpecies[(['banyan','palm','orchid'] as const)[species]]++;
     if(tall)tallTrees++;minScale=Math.min(minScale,scale);maxScale=Math.max(maxScale,scale);
     break;
    }
   }
   ordinal++;distance+=spacing;
  }
 }
 return {points,stats:{generated:points.length,candidates,eligibleRoads,rejected,byKind,bySpecies,tallTrees,
  tallRatio:points.length?tallTrees/points.length:0,scaleRange:{min:points.length?minScale:0,max:maxScale},
  cells:occupied.size,budget:{...budget,maxTrees},
  additionalModels:0,additionalTextures:0,additionalLights:0,
  placement:'deterministic art planting in existing mapped green verges; not surveyed vegetation',
  clearance:'full conservative crown circles against all road grades and sidewalks, buildings, land, water, coast, bridges and existing trees',
  heightValidation:!!options.heightAt,additionalCollisionVeto:!!options.blocked,
 }};
}
export type RoadsidePlantingPlan=ReturnType<typeof planRoadsidePlanting>;
