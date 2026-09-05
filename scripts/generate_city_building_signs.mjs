/** Reproducible OSM-name/game-brand signage layer. Does not modify city geometry.
 * Default writes a candidate under artifacts; publishing is owned by integrator.
 */
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
export const hashText=text=>{let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const FICTIONAL=['湾岸夜航','深城日结','下班以后','南风合住','明日发薪','湾区咖啡','长夏便利','晚点回家','海风旅舍','周五见面','霓虹放映','城南夜食','长灯书店','同路青年','一日好工','余光音乐'];
const GENERIC=/^(?:[\dA-Za-z一二三四五六七八九十零甲乙丙丁\s#＃()（）\-—·.]+(?:栋|幢|座|号楼|楼|号|单元|区|层|室)?)+$/u;
const COMMON=/^(?:[东西南北中]?(?:楼|门|塔楼|裙楼|住宅|民房|住宅楼|宿舍|宿舍楼|教学楼|综合楼|办公楼|行政楼|实验楼|实训楼|食堂|专家楼|活动中心)|综合楼\d+栋)$/u;
export function usefulName(name){const s=String(name??'').trim();return s.length>=2&&[...s].length<=30&&!GENERIC.test(s)&&!COMMON.test(s)&&!/(?:收费站|地铁站|地铁.*车辆段|停车场|配电房|变电站|公厕|垃圾站|泵房|门卫室)$/.test(s);}
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
const centroid=ring=>ring.slice(0,-1).reduce((a,p)=>[a[0]+p[0]/(ring.length-1),a[1]+p[1]/(ring.length-1)],[0,0]);
export function choosePlacement(building,text,seed){
 const ring=building.rings?.[0];if(!ring||ring.length<4||!Number.isFinite(building.height)||building.height<9)return null;
 let signed=0;const edges=[];for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);signed+=a[0]*b[1]-b[0]*a[1];if(length>=7)edges.push({a,b,dx,dz,length,index:i});}if(!edges.length)return null;
 edges.sort((a,b)=>b.length-a.length);const edge=edges[(seed>>>9)%Math.min(3,edges.length)],out=signed>=0?1:-1,nx=edge.dz/edge.length*out,nz=-edge.dx/edge.length*out;
 const count=[...text].length,vertical=(seed%7<2)&&count<=10&&building.height>=22;
 const anchor=['left','center','right'][(seed>>>4)%3],font=['sans','serif','display'][(seed>>>2)%3];
 let width,height;
 if(vertical){height=Math.min(building.height*.25,15,Math.max(5,count*1.45));width=Math.min(3.0,Math.max(1.05,height/Math.max(2,count)*1.05));}
 else{width=Math.min(edge.length*.72,28,Math.max(5,count*1.7));height=Math.min(4.4,Math.max(1.35,width/(Math.max(3,count)*.91)));}
 if(width>edge.length-1.6)return null;
 const t=anchor==='left'?(width/2+.75)/edge.length:anchor==='right'?1-(width/2+.75)/edge.length:.5;
 const y=Math.min(building.height-height/2-1,building.height*(.76+(seed%13)/12*.16));if(y-height/2<3.8)return null;
 const setback=.45;return {position:[edge.a[0]+edge.dx*t+nx*setback,y,edge.a[1]+edge.dz*t+nz*setback],normal:[nx,0,nz],tangent:[edge.dx/edge.length,0,edge.dz/edge.length],width,height,orientation:vertical?'vertical':'horizontal',anchor,font,edgeIndex:edge.index,buildingHeight:building.height,letterHeight:vertical?height/count:height*.72};
}
export function generateSignage(city,rawFeatures=[],excludedIds=[]){
 const excluded=new Set(excludedIds),raw=new Map(rawFeatures.map(f=>[f.id,f.properties?.tags??{}])),unique=new Map();for(const b of city.buildings){const prev=unique.get(b.id);if(!prev||b.height>prev.height||(b.height===prev.height&&area(b.rings[0])>area(prev.rings[0])))unique.set(b.id,b);}
 const named=[...unique.values()].filter(b=>String(b.name??'').trim()),meaningful=named.filter(b=>usefulName(b.name));
 const landmarks=(city.landmarks??[]).filter(l=>l.height>0),eligible=[];
 for(const b of unique.values()){
  if(excluded.has(b.id))continue;const center=centroid(b.rings[0]);if(landmarks.some(l=>Math.hypot(center[0]-l.x,center[1]-l.z)<Math.max(35,l.excludeRadius??0)))continue;
  const tag=raw.get(b.id)??{},name=String(b.name??'').trim(),seed=hashText(b.id+'|upper-building-sign-v1');
  const isNamed=usefulName(name),institution=/^(?:school|hospital|church|temple|civic|religious|kindergarten|university)$/.test(tag.building??'')||Boolean(tag.amenity&&['school','hospital','police','fire_station','place_of_worship'].includes(tag.amenity));
  // Never turn unnamed institutions into fictional commercial premises.
  if(!isNamed&&institution)continue;const text=isNamed?name:FICTIONAL[(seed>>>16)%FICTIONAL.length],placement=choosePlacement(b,text,seed);if(!placement)continue;
  eligible.push({id:'upper-sign:'+b.id,buildingId:b.id,text,kind:isNamed?'osm-building-name':'fictional-game-business',source:isNamed?{provider:'OpenStreetMap',featureId:b.id,tag:tag['name:zh']===name?'name:zh':tag.name===name?'name':'processed-name',value:name}:null,fictionalDisclosure:isNamed?null:'深城纪·虚构品牌',seed,...placement,colorIndex:(seed>>>13)%8,radianceScale:.82+(seed%17)/16*.34});
 }
 const target=Math.ceil(unique.size*.20),real=eligible.filter(x=>x.kind==='osm-building-name').sort((a,b)=>a.seed-b.seed),fictional=eligible.filter(x=>x.kind==='fictional-game-business').sort((a,b)=>a.seed-b.seed);
 // All eligible true names are selected first, then stable fictional storefront
 // brands fill the city-wide target. This is a game art layer, not a map of signs.
 const signs=[...real.slice(0,target),...fictional.slice(0,Math.max(0,target-real.length))].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,'en'));
 const realCount=signs.filter(x=>x.kind==='osm-building-name').length;
 return {schemaVersion:1,attribution:'© OpenStreetMap contributors · ODbL 1.0. Upper-facade sign positions, fonts, colors and illumination are game art direction; not surveyed signage.',fictionalDisclosure:'Game brands are explicitly marked 深城纪·虚构品牌, never used as an asserted real building name.',noNewLights:true,stats:{buildingPieces:city.buildings.length,uniqueBuildingIds:unique.size,anyNameCount:named.length,anyNameCoverage:named.length/unique.size,meaningfulNameCount:meaningful.length,meaningfulNameCoverage:meaningful.length/unique.size,eligibleRealNames:real.length,eligibleFictionalSites:fictional.length,targetCount:target,selectedCount:signs.length,selectedCoverage:signs.length/unique.size,realNameSigns:realCount,fictionalBusinessSigns:signs.length-realCount,excludedIds:excluded.size,landmarkPolicy:'no auto-sign on authored landmark envelopes; existing landmark-signage remains authoritative',orientations:signs.reduce((a,s)=>(a[s.orientation]=(a[s.orientation]??0)+1,a),{}),fonts:signs.reduce((a,s)=>(a[s.font]=(a[s.font]??0)+1,a),{})},signs};
}
export async function run(output='artifacts/building-signs/building-signs.json'){
 const bytes=await fs.readFile('public/city/city.json'),city=JSON.parse(bytes),raw=JSON.parse(await fs.readFile('data/processed/shenzhen_study/buildings.geojson','utf8')),exclusions=JSON.parse(await fs.readFile('public/city/building-exclusions.json','utf8'));
 const manifest=generateSignage(city,raw.features,exclusions.excludedIds);manifest.sourceCitySha256=crypto.createHash('sha256').update(bytes).digest('hex');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(manifest)+'\n');await fs.writeFile(path.join(path.dirname(output),'name-coverage.json'),JSON.stringify(manifest.stats,null,2)+'\n');console.log(JSON.stringify({output,...manifest.stats},null,2));return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run(process.argv[2]);
