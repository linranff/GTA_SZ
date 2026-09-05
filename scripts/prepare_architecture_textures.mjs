// The user requested bounded-resolution game textures. Preserve generated source
// images; use macOS sips only for asset sizing, without repainting their content.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const entries=[
 ['curtain-glass','Blue-gray Shenzhen office curtain wall, silver mullions, neutral unlit glazing.'],
 ['warm-residential','Warm ivory Shenzhen housing, solid ceramic/render piers, recessed windows, balcony and AC details.'],
 ['light-stone','Pale warm-gray Shenzhen mid-rise stone cladding, narrow horizontal window ribbons.'],
];
const hash=b=>createHash('sha256').update(b).digest('hex');
const textures=[];
await fs.mkdir(new URL('public/city/textures/architecture/',root),{recursive:true});
for(const [id,brief] of entries){
 const sourcePath=`data/raw/materials/${id}-source.png`,path=`public/city/textures/architecture/${id}.png`;
 const source=await fs.readFile(new URL(sourcePath,root));
 execFileSync('/usr/bin/sips',['--resampleHeightWidth','512','512',fileURLToPath(new URL(sourcePath,root)),'--out',fileURLToPath(new URL(path,root))],{stdio:'pipe'});
 const output=await fs.readFile(new URL(path,root));
 if(output.readUInt32BE(16)!==512||output.readUInt32BE(20)!==512)throw Error('Texture exceeds fixed 512px budget: '+id);
 textures.push({id,path,url:`/city/textures/architecture/${id}.png`,width:512,height:512,bytes:output.length,sha256:hash(output),sourcePath,sourceSha256:hash(source),generationTool:'image_gen',generationBrief:brief,processing:'Uniform 512x512 resize with macOS sips. Original image retained.',use:'Artistic tileable base color; generated example of a material family, not a photographed/surveyed individual facade.'});
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),textures,totalBytes:textures.reduce((n,t)=>n+t.bytes,0),estimatedRGBA8WithMipmapsBytes:3*512*512*4*4/3,maxDimension:512,textureCount:3,scope:'Three shared albedo textures. Matching 256px sparse window masks are recorded separately in architecture-windows.json. No new normal/metallic textures, lights or postprocessing.',referencePalette:'data/materials/shenzhen-palette.json'};
await fs.writeFile(new URL('data/materials/architecture-textures.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({textures:textures.length,totalBytes:report.totalBytes,estimatedGPUWithMipmapsMiB:report.estimatedRGBA8WithMipmapsBytes/1048576},null,2));
