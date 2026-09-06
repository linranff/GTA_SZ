import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {generateRainPuddleLayout,rainPoolOutline,RAIN_LAYOUT_VERSION,RAIN_PROFILE_COUNT} from '../src/city-rain-puddles.ts';
import {terrainHeight} from '../src/landmark-details.ts';
const out='artifacts/city/rain-puddles-candidate';await fs.mkdir(out,{recursive:true});
const paths=['public/city/city.json','public/city/terrain-detail.json','public/city/landmark-detail.json'];
const raw=await Promise.all(paths.map(p=>fs.readFile(p,'utf8')));const [city,terrain,detail]=raw.map(s=>JSON.parse(s));
const excluded=new Set(detail.baseBuildingIds);city.buildings=city.buildings.filter(b=>!excluded.has(b.id));for(const p of detail.collisionFootprints)city.buildings.push({...p,height:1,style:'landmark-detail'});
const started=performance.now();const layout=generateRainPuddleLayout(city,(x,z)=>terrainHeight(terrain.grid,x,z));
// Round the packed values first, then obtain every rendered LOD from the
// runtime function. Python validates these exact silhouettes without copying
// JavaScript's seeded trigonometric profile into a second implementation.
const fields=['x','z','dx','dz','length','width','lateral','roadWidth','seed','alpha'],precision=[2,2,6,6,2,2,2,2,0,3];
for(const p of layout.pools){
 for(let i=0;i<fields.length;i++)p[fields[i]]=Number(p[fields[i]].toFixed(precision[i]));
 p.outlines={water:{},apron:{}};
 for(const steps of [12,6,4]){p.outlines.water[steps]=rainPoolOutline(p,1,steps);p.outlines.apron[steps]=rainPoolOutline(p,1.08,steps);}
 p.outline=p.outlines.apron[12];
}
await fs.writeFile(out+'/unverified-layout.json',JSON.stringify({...layout,version:RAIN_LAYOUT_VERSION,profileVariants:RAIN_PROFILE_COUNT}));
await fs.writeFile(out+'/generation.json',JSON.stringify({seconds:(performance.now()-started)/1000,sources:paths.map((path,i)=>({path,sha256:crypto.createHash('sha256').update(raw[i]).digest('hex')})),stats:layout.stats},null,2));
console.log(JSON.stringify({candidate:out+'/unverified-layout.json',stats:layout.stats,seconds:(performance.now()-started)/1000}));
// Final asset is written only after scripts/validate_rain_puddle_coverage.py
// performs exact Shapely containment, union coverage and local visibility checks.
