/** Rooftop plan for ordinary buildings → public/city/rooftops/plan.json (thin-instance props grouped
 * by kind) and public/city/rooftops/building-lookup.png (4 m/px roof finish + tint raster, R8 in a
 * grey PNG). Excluded/landmark buildings get neither. Run: node --experimental-transform-types
 * scripts/prepare_city_rooftops.mjs. Deterministic from each building's OSM seed.
 */
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {planRooftop,ROOFTOP_KINDS,ROOF_FINISHES,ROOF_LOOKUP,encodeRoofLookup,rasterizeRing,polygonArea} from '../src/city-rooftop-plan.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public/city/rooftops');fs.mkdirSync(out,{recursive:true});
const city=JSON.parse(fs.readFileSync(path.join(root,'public/city/city.json'),'utf8'));
const exclusions=fs.existsSync(path.join(root,'public/city/building-exclusions.json'))?new Set(JSON.parse(fs.readFileSync(path.join(root,'public/city/building-exclusions.json'),'utf8')).excludedIds):new Set();
const started=Date.now();
const groups=ROOFTOP_KINDS.map(()=>[]);const finishCounts=ROOF_FINISHES.map(()=>0);let planned=0,withProps=0,skipped=0,noRect=0;
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
for(const b of city.buildings)for(const [x,z] of b.rings[0]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
const cell=ROOF_LOOKUP.cell,pad=ROOF_LOOKUP.pad;minX=Math.floor(minX)-pad;minZ=Math.floor(minZ)-pad;maxX=Math.ceil(maxX)+pad;maxZ=Math.ceil(maxZ)+pad;
const width=Math.ceil((maxX-minX)/cell),height=Math.ceil((maxZ-minZ)/cell),grid=new Uint8Array(width*height);
const byStyle={};
// Low buildings first: where footprints overlap (tower on a podium) the taller roof owns the cells.
for(const b of [...city.buildings].sort((a,b)=>a.height-b.height)){
 if(exclusions.has(b.id)){skipped++;continue;}
 const plan=planRooftop(b);planned++;finishCounts[plan.finish]++;
 rasterizeRing(b.rings[0],encodeRoofLookup(plan.finish,plan.tint),grid,width,height,minX,minZ,cell);
 if(!plan.rect)noRect++;
 if(plan.props.length)withProps++;
 const s=byStyle[b.style]??={buildings:0,props:0};s.buildings++;s.props+=plan.props.length;
 for(const p of plan.props)groups[p[0]].push(p.slice(1));
}
const total=groups.reduce((s,g)=>s+g.length,0);
const plan={version:1,source:'Deterministic rooftop typology plan from OSM footprints (public/city/city.json); artistic, not surveyed',
 crown:{scale:.76,top:'height+max(1.2,height*.035)'},kinds:ROOFTOP_KINDS.map(k=>({id:k.id,box:k.box,footprint:k.footprint})),
 groups:ROOFTOP_KINDS.map((k,i)=>({kind:k.id,count:groups[i].length,instances:groups[i]})),
 lookup:{file:'building-lookup.png',cell,minX,minZ,width,height,encoding:'0 = none; 1+finish*16+tint',finishes:ROOF_FINISHES.map(f=>f.id)}};
fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(plan));
fs.writeFileSync(path.join(out,'building-lookup.png'),pngGrey(grid,width,height));
const report={generatedAt:new Date().toISOString(),ms:Date.now()-started,buildings:city.buildings.length,planned,skippedExcluded:skipped,withoutRect:noRect,withProps,instances:total,
 perKind:Object.fromEntries(ROOFTOP_KINDS.map((k,i)=>[k.id,groups[i].length])),finishes:Object.fromEntries(ROOF_FINISHES.map((f,i)=>[f.id,finishCounts[i]])),byStyle,
 lookup:{width,height,cell,coveredCells:grid.reduce((s,v)=>s+(v?1:0),0)},
 files:['plan.json','building-lookup.png'].map(f=>{const p=path.join(out,f);return {name:f,bytes:fs.statSync(p).size,sha256:createHash('sha256').update(fs.readFileSync(p)).digest('hex')};}),
 meanFootprintArea:Math.round(city.buildings.reduce((s,b)=>s+polygonArea(b.rings[0]),0)/city.buildings.length)};
fs.mkdirSync(path.join(root,'artifacts/city'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/city/rooftop-plan-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,1));

function pngGrey(data,w,h){
 const raw=Buffer.alloc((w+1)*h);for(let y=0;y<h;y++){raw[y*(w+1)]=0;raw.set(data.subarray(y*w,(y+1)*w),y*(w+1)+1);}
 const chunk=(type,body)=>{const len=Buffer.alloc(4);len.writeUInt32BE(body.length);const tb=Buffer.concat([Buffer.from(type,'ascii'),body]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(tb)>>>0);return Buffer.concat([len,tb,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=0;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return crc^0xffffffff;}
