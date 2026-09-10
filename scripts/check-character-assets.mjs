import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Validate committed runtime assets before Vite clears dist. A Git LFS pointer
// or missing asset must fail the build, rather than silently lose the characters.
const root=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(root,'public/characters');
let manifest;
try{manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));}
catch{throw Error('缺少角色清单：请检查仓库 public/characters/');}
if(manifest.schemaVersion!==1||!Array.isArray(manifest.models)||!manifest.credit)throw Error('角色清单格式无效');
const assets=[];
for(const id of ['kuki','yelan']){
 const model=manifest.models.find(m=>m.id===id);
 if(!model||model.file!==id+'.glb')throw Error('缺少角色：'+id);
 const bytes=await readFile(resolve(source,model.file));
 if(bytes.subarray(0,42).toString().startsWith('version https://git-lfs.github.com/spec/'))throw Error('模型仍是 Git LFS 指针，请先运行 git lfs pull：'+model.file);
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB 文件损坏：'+model.file);
 if(model.bytes!==bytes.length||model.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('角色文件与清单不一致，请重新生成：'+model.file);
 for(const clip of ['walk','run'])if(!(model.gait?.[clip]?.authoredSpeed>0&&model.gait[clip].cycleSeconds>0))throw Error('缺少步态参数：'+model.file);
 assets.push({model,bytes});
}

console.log('角色资源校验通过：久岐忍 / 夜兰，'+(assets.reduce((n,a)=>n+a.bytes.length,0)/1048576).toFixed(1)+' MiB');
