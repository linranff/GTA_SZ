import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Prepare a complete local deployment artifact. This command never uploads files.
// Keep the original PMX/ZIP and .blend files out of the runtime distribution.
const root=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(root,'local-only/characters');
let manifest;
try{manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));}
catch{throw Error('缺少角色清单。请先执行本地模型准备步骤：docs/characters/local-mmd.md');}
if(manifest.schemaVersion!==1||!Array.isArray(manifest.models)||!manifest.credit)throw Error('角色清单格式无效');
const assets=[];
for(const id of ['kuki','yelan']){
 const model=manifest.models.find(m=>m.id===id);
 if(!model||model.file!==id+'.glb')throw Error('缺少角色：'+id);
 const bytes=await readFile(resolve(source,model.file));
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB 文件损坏：'+model.file);
 if(model.bytes!==bytes.length||model.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('角色文件与清单不一致，请重新生成：'+model.file);
 for(const clip of ['walk','run'])if(!(model.gait?.[clip]?.authoredSpeed>0&&model.gait[clip].cycleSeconds>0))throw Error('缺少步态参数：'+model.file);
 assets.push({model,bytes});
}

// Set the same-origin runtime path explicitly; a production build must not fall
// back to the legacy rider because DEV is false. Verify inputs before Vite clears dist.
const build=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{
 cwd:root,stdio:'inherit',env:{...process.env,VITE_CHARACTER_ASSET_BASE:'/characters'},
});
if(build.status!==0)throw Error('游戏构建失败：'+(build.error?.message??build.status));
const destination=resolve(root,'dist/characters');await mkdir(destination,{recursive:true});
for(const {model,bytes} of assets)await writeFile(resolve(destination,model.file),bytes);
// Provenance is retained separately from the transport path. Packaging locally
// does not establish commercial use or redistribution rights.
const runtimeManifest={schemaVersion:1,credit:manifest.credit,physics:manifest.physics,
 usage:{preparedFor:'non-commercial validation',publicReleaseAuthorization:'not verified',
  source:'https://www.bilibili.com/blackboard/activity-FEYTyCHYZo.html'},
 models:assets.map(({model})=>{
  const {id,name,file,displayHeight,bytes,triangles,bones,morphs,textures,sha256,sourceZipSha256,gait}=model;
  return {id,name,file,displayHeight,bytes,triangles,bones,morphs,textures,sha256,sourceZipSha256,gait};
 })};
await writeFile(resolve(destination,'manifest.json'),JSON.stringify(runtimeManifest,null,2)+'\n');
await writeFile(resolve(destination,'CREDITS.txt'),`${manifest.credit}\n\n配布来源：https://www.bilibili.com/blackboard/activity-FEYTyCHYZo.html\n原包说明禁止商业用途、二次配布等。本次转换与本地打包不授予公开游戏使用或商业发行授权。\n本目录只包含运行时角色资源；原始 ZIP、PMX 和 Blender 工程未打包。\n公开部署前需要核实相应用途及发布方式的授权。\n`);
console.log(`\n带角色的完整构建已生成：dist/（角色 ${((assets.reduce((n,a)=>n+a.bytes.length,0))/1048576).toFixed(1)} MiB）`);
console.log('本地验收：npm run preview -- --port 4173 --strictPort。未上传任何资源。');
