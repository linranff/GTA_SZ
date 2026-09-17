// Real Chrome smoke test + in-game photo views for the merged candidate landmarks.
// Requires a running dev server (npm run dev) and public/city/landmark-candidates.*.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='output/playwright/landmark-candidates';await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile('public/city/landmark-candidates.json','utf8'));
const asset=await fs.readFile('public/city/landmark-candidates.glb');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const streetIds=new Set((process.env.STREET_IDS??'pingan,guomao,seg,bay-sports,library-center').split(','));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],results=[],responses=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,300));});
page.on('response',r=>{if(/landmark-candidates|landmark-detail\.glb|landmarks\.glb/.test(r.url()))responses.push({url:r.url(),status:r.status()});});
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.waitForTimeout(2500);
 const live=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.landmarks);
 const sceneNames=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.scene.meshes.map(m=>m.name));
 for(const prefix of manifest.replacedMeshPrefixes){
  // Legacy silhouettes with this prefix must be gone; the candidate meshes carry the same prefix, so count instead of asserting absence.
  const count=sceneNames.filter(n=>n.startsWith(prefix)).length;
  const expected=manifest.sources.find(s=>prefix===`landmark_${s.id}_`)?.meshes;
  if(expected!==undefined&&count!==expected)errors.push(`prefix ${prefix}: ${count} meshes in scene, candidate has ${expected}`);
 }
 for(const landmark of manifest.landmarks){
  if(only.length&&!only.includes(landmark.id))continue;
  const record=live.find(m=>m.id===landmark.id);
  if(!record){errors.push('Missing live landmark '+landmark.id);continue;}
  if(Math.abs(record.x-landmark.x)>.01||Math.abs(record.z-landmark.z)>.01)errors.push('Wrong live location '+landmark.id);
  await page.evaluate(id=>{const w=window.__SHENCHENGJI_CITY__.world;w.enterPhoto(w.data.landmarks.find(m=>m.id===id));},landmark.id);
  await page.waitForTimeout(1400);
  await page.screenshot({path:`${out}/${landmark.id}-photo.png`});
  await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.exitPhoto());
  const entry={id:landmark.id,name:landmark.name,photo:`${landmark.id}-photo.png`};
  if(streetIds.has(landmark.id)){
   await page.evaluate(id=>{const w=window.__SHENCHENGJI_CITY__.world;w.travel(w.data.landmarks.find(m=>m.id===id));},landmark.id);
   await page.waitForTimeout(2600);
   await page.screenshot({path:`${out}/${landmark.id}-street.png`});
   entry.street=`${landmark.id}-street.png`;
  }
  results.push(entry);
 }
 if(!responses.some(r=>r.url.includes('landmark-candidates.glb')&&r.status===200))errors.push('Candidate GLB not loaded');
 const perf=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.performance);
 results.push({performanceSample:perf});
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`});}
finally{await browser.close();}
const report={assetSha256:createHash('sha256').update(asset).digest('hex'),manifestAssetSha256:manifest.assetStats.sha256,gameUrl:process.env.GAME_URL??'http://127.0.0.1:5173/',viewport:[1920,1080],errors,results,responses,
 note:'Photo/street screenshots require visual review; a headless Mac Chrome sample is not an RTX 3060 performance result.'};
await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({errors,count:results.length,responses},null,2));
if(errors.length)process.exitCode=1;
