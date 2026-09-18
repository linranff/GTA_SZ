/** City-scale ambient occlusion bake → public/city/ambient/occlusion.png (RGB8, 4 m/px: sky visibility at
 * 0 / 12 / 40 m above ground, horizon-scanned over OSM footprints) and occlusion.json (raster meta).
 * Every building occludes, including landmark-replaced ones; excluded ids only lose their props/roof
 * finish elsewhere. Run: node --experimental-transform-types scripts/prepare_city_ambient.mjs
 */
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {CITY_AMBIENT,rasterizeHeights,bakeAmbient} from '../src/city-ambient-bake.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public/city/ambient');fs.mkdirSync(out,{recursive:true});
const city=JSON.parse(fs.readFileSync(path.join(root,'public/city/city.json'),'utf8'));
const started=Date.now();
const grid=rasterizeHeights(city.buildings);
const rasterMs=Date.now()-started;
const baked=bakeAmbient(grid);
const {width,height,minX,minZ,cell}=grid;
// 32 visibility levels per channel: bilinear sampling smooths them in space and the shader applies them
// at ≤ .8 strength into lighting, where a 3 % step is invisible; the Paeth+deflate stream halves.
const LEVELS=Number(process.env.AMBIENT_LEVELS)||32;
for(let i=0;i<baked.data.length;i++)baked.data[i]=Math.round(Math.round(baked.data[i]/255*(LEVELS-1))/(LEVELS-1)*255);
const meta={version:1,file:'occlusion.png',cell,minX,minZ,width,height,channels:'sky visibility 0–255 at heights[i] metres above the ground plane; 255 = open sky',
 heights:[...CITY_AMBIENT.heights],fadeTop:CITY_AMBIENT.fadeTop,directions:CITY_AMBIENT.directions,reachMetres:CITY_AMBIENT.reach*cell,
 source:'Horizon-scan sky visibility over OSM building footprints and heights (public/city/city.json); Lambertian cos² per direction; not a light simulation'};
fs.writeFileSync(path.join(out,'occlusion.png'),pngRGB(baked.data,width,height));
fs.writeFileSync(path.join(out,'occlusion.json'),JSON.stringify(meta,null,1)+'\n');
const report={generatedAt:new Date().toISOString(),rasterMs,ms:Date.now()-started,buildings:city.buildings.length,raster:{width,height,cell,footprintCells:grid.ids.reduce((s,v)=>s+(v?1:0),0)},
 activeCells:baked.active,occludedCells:baked.occluded,meanVisibility:Object.fromEntries(CITY_AMBIENT.heights.map((h,i)=>[h+'m',baked.mean[i]])),
 files:['occlusion.png','occlusion.json'].map(f=>{const p=path.join(out,f);return {name:f,bytes:fs.statSync(p).size,sha256:createHash('sha256').update(fs.readFileSync(p)).digest('hex')};})};
fs.mkdirSync(path.join(root,'artifacts/city'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/city/ambient-occlusion-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,1));

/** 8-bit RGB PNG with the Paeth predictor on every scanline: the field is smooth, so predicted residuals
 * deflate to roughly a third of the unfiltered stream. */
function pngRGB(data,w,h){
 const stride=w*3,raw=Buffer.alloc((stride+1)*h);
 for(let y=0;y<h;y++){
  const o=y*(stride+1);raw[o]=4;
  for(let i=0;i<stride;i++){
   const x=data[y*stride+i],a=i>=3?data[y*stride+i-3]:0,b=y>0?data[(y-1)*stride+i]:0,c=(i>=3&&y>0)?data[(y-1)*stride+i-3]:0;
   const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
   raw[o+1+i]=(x-(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;
  }
 }
 const chunk=(type,body)=>{const len=Buffer.alloc(4);len.writeUInt32BE(body.length);const tb=Buffer.concat([Buffer.from(type,'ascii'),body]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(tb)>>>0);return Buffer.concat([len,tb,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return crc^0xffffffff;}
