import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const phase=process.env.REVIEW_PHASE??'after';
if(!['before','after'].includes(phase))throw Error('REVIEW_PHASE must be before or after');
const out=new URL('../output/playwright/cafe-character-scale/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
 await page.locator('#city-loading').waitFor({state:'detached',timeout:30000});
 await page.locator('#map-button').click();await page.locator('#map-search').fill('月白');
 await page.locator('#places [data-id="bamboo-cafe"]').click();await page.locator('#visit-interior').click();
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.performance.cafe?.characters.loaded,null,{timeout:60000});
 await page.waitForTimeout(1500);
 // Same actual game-camera positions in both runs. Only the review camera is
 // held fixed; models, materials, room, gameplay lighting and post-process stay live.
 await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/@babylonjs_core.js?')).name;
  const {EngineStore,Vector3}=await import(url);const scene=EngineStore.LastCreatedScene;
  if(!scene)throw Error('No active Babylon scene for the named camera review');
  for(const a of scene.animationGroups)if(a.name.includes('staff_')){a.goToFrame(1);a.pause();}
  const spec=window.__SHENCHENGJI_CITY__.performance.cafe.site,c=Math.cos(spec.heading),s=Math.sin(spec.heading);
  const world=p=>new Vector3(spec.x+p[0]*c+p[1]*s,p[2],spec.z-p[0]*s+p[1]*c);
  window.__CAFE_REVIEW_CAMERA__={eye:[-2.25,-6.7,1.92],target:[-2.25,-3.45,1.1]};
  scene.onBeforeRenderObservable.add(()=>{const v=window.__CAFE_REVIEW_CAMERA__;scene.activeCamera.position.copyFrom(world(v.eye));scene.activeCamera.setTarget(world(v.target));});
  window.__CAFE_REVIEW_MEASURE__=()=>scene.meshes.filter(m=>m.name.startsWith('staff_user_')&&m.getTotalVertices()).map(m=>{
   m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;
   return {name:m.name,parent:m.parent.name,height:b.maximumWorld.y-b.minimumWorld.y,feet:b.minimumWorld.y,head:b.maximumWorld.y,
    width:b.maximumWorld.x-b.minimumWorld.x,enabled:m.isEnabled(),position:m.getAbsolutePosition().asArray()};
  });
 });
 for(const [view,eye,target]of [['maid',[-2.25,-6.7,1.92],[-2.25,-3.45,1.1]],['jk',[3.9,-3.65,1.92],[4,-.2,1.1]],['barista',[3.65,.0,1.92],[5.65,5,1.4]]]){
  await page.evaluate(({eye,target})=>{window.__CAFE_REVIEW_CAMERA__={eye,target};},{eye,target});
  await page.waitForTimeout(900);
  await page.screenshot({path:fileURLToPath(new URL(`${phase}-${view}.png`,out))});
 }
 const measurements=await page.evaluate(()=>({models:window.__CAFE_REVIEW_MEASURE__(),characters:window.__SHENCHENGJI_CITY__.performance.cafe.characters,playerEye:1.92,floor:.24}));
 measurements.phase=phase;measurements.errors=errors;
 assert.equal(measurements.models.length,3);assert.equal(errors.length,0,errors.join('\n'));
 for(const model of measurements.models){
  assert(model.enabled);assert(Math.abs(model.feet-.245)<.015);
  if(phase==='after'){
   const id=model.name.split('_')[2],fit=measurements.characters.proportions[id];
   assert(fit&&Math.abs(model.height-fit.displayHeight)<.015,'Display height includes only the small existing idle tilt');
   assert(model.head>measurements.playerEye+.2,'Staff no longer stop at the player eye line');
  }
 }
 await fs.writeFile(new URL(`${phase}.json`,out),JSON.stringify(measurements,null,2)+'\n');
 console.log(JSON.stringify(measurements,null,2));
}finally{await browser.close();}
