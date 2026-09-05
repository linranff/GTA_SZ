import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {generateRainPuddleLayout,rainPoolProfile} from '../src/city-rain-puddles.ts';
import {terrainHeight} from '../src/landmark-details.ts';
const out='artifacts/city/rain-puddles-candidate';await fs.mkdir(out,{recursive:true});
const paths=['public/city/city.json','public/city/terrain-detail.json','public/city/landmark-detail.json'];
const raw=await Promise.all(paths.map(p=>fs.readFile(p,'utf8')));const [city,terrain,detail]=raw.map(s=>JSON.parse(s));
const excluded=new Set(detail.baseBuildingIds);city.buildings=city.buildings.filter(b=>!excluded.has(b.id));for(const p of detail.collisionFootprints)city.buildings.push({...p,height:1,style:'landmark-detail'});
const started=performance.now();const layout=generateRainPuddleLayout(city,(x,z)=>terrainHeight(terrain.grid,x,z));
const point=(p,t,v,apron)=>{const q=rainPoolProfile(p,t,apron),offset=q.centre+(v<0?v*q.left:v*q.right);return[p.x+p.dx*q.along-p.dz*offset,p.z+p.dz*q.along+p.dx*offset];};
for(const p of layout.pools){p.waterOutline=[];for(let i=0;i<=12;i++)p.waterOutline.push(point(p,i/12,-1,1));for(let i=12;i>=0;i--)p.waterOutline.push(point(p,i/12,1,1));}
await fs.writeFile(out+'/unverified-layout.json',JSON.stringify(layout));
await fs.writeFile(out+'/generation.json',JSON.stringify({seconds:(performance.now()-started)/1000,sources:paths.map((path,i)=>({path,sha256:crypto.createHash('sha256').update(raw[i]).digest('hex')})),stats:layout.stats},null,2));
console.log(JSON.stringify({candidate:out+'/unverified-layout.json',stats:layout.stats,seconds:(performance.now()-started)/1000}));
// Final asset is written only after scripts/validate_rain_puddle_coverage.py
// performs exact Shapely containment, union coverage and local visibility checks.
