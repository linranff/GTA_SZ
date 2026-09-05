/** Serial 1080p Chrome/Metal visual and frame-time A/B using real UI camera input.
 * node --experimental-transform-types scripts/check-grassland-upgrade.mjs enhanced
 * node --experimental-transform-types scripts/check-grassland-upgrade.mjs baseline
 * Requires production preview; never builds, writes game state or opens a second renderer.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {observerUI} from './grassland-observer-ui.mjs';
import {createReliefHeightSampler} from '../src/city-ground-relief.ts';
import {terrainHeight} from '../src/landmark-details.ts';
import {decodeMeadowTile} from '../src/city-meadow.ts';
import {installGpuDrawDiagnostics} from './gpu-draw-diagnostics.mjs';

const mode=process.argv[2]??'enhanced',out=path.resolve(process.env.GRASS_OUT??`output/playwright/grassland-v2/${mode}`);
if(!['baseline','enhanced'].includes(mode))throw Error('Use baseline or enhanced');
await fs.mkdir(out,{recursive:true});
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const city=await json('public/city/city.json'),terrain=await json('public/city/terrain-detail.json');
async function sampler(folder){const m=await json(folder+'/manifest.json'),bytes=await fs.readFile(folder+'/'+m.mesh);const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);return createReliefHeightSampler(m.tiles.map(tile=>({tile,positions:new Float32Array(buffer,tile.positions.offset,tile.positions.bytes/4),normals:new Float32Array(buffer,tile.normals.offset,tile.normals.bytes/4),indices:new Uint32Array(buffer,tile.indices.offset,tile.indices.bytes/4)})),(x,z)=>terrainHeight(terrain.grid,x,z),m.preservedTerrainBounds,m.lookupCellSize);}
const height=await sampler('public/city/ground-relief'),oldHeight=await sampler('artifacts/grassland-v2/baseline');
const meadow=await json('public/city/grassland-v2/meadow.json');
const visualCases=(await json('artifacts/city/grassland-v2-candidate/visual-cases.json')).cases;
const sites=[];
for(const id of (process.env.GRASS_SITES??'baypark,xiangmi,talent').split(',')){
 const landmark=city.landmarks.find(l=>l.id===id);if(!landmark)throw Error('Missing landmark '+id);
 const authored=visualCases.find(c=>c.id===id),anchor=authored?.safeGrass??landmark;
 const candidates=[];
 for(const tile of meadow.tiles){if(Math.hypot((tile.ix+.5)*128-anchor.x,(tile.iz+.5)*128-anchor.z)>420)continue;
  const patches=decodeMeadowTile(meadow,tile,new Uint8Array(await fs.readFile('public/city/grassland-v2/'+tile.url)));
  for(const p of patches){const d=Math.hypot(p.x-anchor.x,p.z-anchor.z);if(d<300)candidates.push({...p,d,h:height.heightAt(p.x,p.z),relief:height.deltaAt(p.x,p.z)});}
 }
 candidates.sort((a,b)=>authored?Math.hypot(a.x-authored.safeGrass.x,a.z-authored.safeGrass.z)-Math.hypot(b.x-authored.safeGrass.x,b.z-authored.safeGrass.z):(b.relief*65-b.d)-(a.relief*65-a.d));const p=candidates[0];if(!p)throw Error('No safe grass at '+id);
 const ex=authored?.roadEdge[0]??p.x,ez=authored?.roadEdge[2]??p.z-12;
 const ey=Math.max(height.heightAt(ex,ez),oldHeight.heightAt(ex,ez))+1.8;
 sites.push({id,name:landmark.name,patch:p,focus:{x:p.x,y:p.h+.18,z:p.z},eye:{x:ex,y:ey,z:ez},overview:{x:p.x+35,y:Math.max(70,p.h+70),z:p.z-75}});
}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
if(process.env.GPU_DIAG==='1')await page.addInitScript(installGpuDrawDiagnostics);
const errors=[],captures=[],samples=[],resources=[];let phase='load';
page.on('pageerror',e=>errors.push({phase,message:String(e)}));
page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|feedback loop|CONTEXT_LOST|ERROR:\s*\d+:\d+/i.test(m.text()))errors.push({phase,message:m.text().slice(0,3000)});});
page.on('response',r=>{if(r.status()>=400)errors.push({phase,message:r.status()+' '+r.url()});if(r.request().resourceType()==='script')resources.push(r);});
if(mode==='baseline')await page.route('**/city/ground-relief/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(['manifest.json','ground-cover.png','relief-mesh.bin'].includes(name))await route.fulfill({path:'artifacts/grassland-v2/baseline/'+name});else await route.continue();});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {state:a.state,observer:s.observer,grass:s.groundRelief,landscape:s.landscape,render:a.telemetry.render,resolution:a.performance.resolution};});
async function capture(name){await page.waitForTimeout(1500);const p=path.join(out,name+'.png');await page.screenshot({path:p});captures.push({name,path:p,state:await read()});}
async function sample(name,seconds=20){await page.waitForTimeout(1000);await page.evaluate(()=>{const d={active:true,last:performance.now(),frames:[]};window.__grassFrames=d;function tick(t){if(!d.active)return;d.frames.push(t-d.last);d.last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});await page.waitForTimeout(seconds*1000);const f=await page.evaluate(()=>{window.__grassFrames.active=false;return window.__grassFrames.frames;});const frames=f.slice(30).sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);samples.push({name,seconds:sum/1000,frames:frames.length,meanFps:frames.length*1000/sum,p95:frames[Math.floor(frames.length*.95)],p99:frames[Math.floor(frames.length*.99)],over50ms:frames.filter(x=>x>50).length,state:await read()});}
const ui=observerUI(page);let hashes=[],gpuDiagnostics=null;
try{
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:4173/')+(mode==='baseline'?'?grass=baseline':''),{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
 if(mode==='enhanced')await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.groundRelief.grassMaterial.ready,null,{timeout:30000});
 await page.locator('#game').click({position:{x:960,y:400}});
 await capture('opening');await sample('opening',20);
 for(const site of (process.env.GRASS_LOAD_ONLY==='1'?[]:sites)){phase=site.id;await ui.enter(site.id);await ui.pose(site.focus,site.overview);await capture(site.id+'-overview');
  if(mode==='enhanced'&&(await read()).landscape.meadow.instances!==0)throw Error('Grass geometry active at aerial height');
  await ui.pose(site.focus,site.eye);await capture(site.id+'-low');await sample(site.id+'-low',20);
  if(mode==='enhanced'){const s=await read();if(!s.landscape.meadow.ready||s.landscape.meadow.error)throw Error('Meadow unavailable: '+JSON.stringify(s.landscape.meadow));}
  if(site.id===sites[0].id){const p=site.patch,ey=Math.max(height.heightAt(p.x,p.z-3),oldHeight.heightAt(p.x,p.z-3))+1.65;await ui.pose({x:p.x,y:p.h+.03,z:p.z+1},{x:p.x,y:ey,z:p.z-3});await capture(site.id+'-grass-close');await sample('grass-close',20);}
 }
 if(process.env.GRASS_LOAD_ONLY!=='1'){phase='night';await page.keyboard.press('l');await capture(sites.at(-1).id+'-night');await sample('near-grass-night',20);}
}catch(e){errors.push({phase,message:String(e)});await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 gpuDiagnostics=await page.evaluate(()=>window.__cityGpuDiagnostics??null).catch(()=>null);
 for(const response of resources){try{const b=await response.body();hashes.push({url:response.url(),sha256:createHash('sha256').update(b).digest('hex')});}catch{}}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({mode,browser:await browser.version(),sites,errors,captures,samples,hashes,gpuDiagnostics,diagnosticMode:process.env.GPU_DIAG==='1',pass:!errors.length,scope:'Real UI camera movement; same absolute camera targets for baseline/enhanced; stationary frames are not a sustained driving guarantee. Baseline retains current other-task changes and replaces only grass materials/meadow/relief with saved pre-upgrade assets.'},null,2)+'\n');await browser.close();height.dispose();oldHeight.dispose();
 console.log(JSON.stringify({out,errors,samples:samples.map(({name,meanFps,p95,p99})=>({name,meanFps,p95,p99}))}));
}
if(errors.length)process.exitCode=1;
