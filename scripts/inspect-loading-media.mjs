/** Verify the actual loader module and then the production game with the same media. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out=process.env.LOADING_REVIEW_OUT??'output/playwright/loading-media';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const checks=[],errors=[];
const check=(name,pass,details)=>{checks.push({name,pass,details});if(!pass)throw Error(name);};
const fixtureURL='http://127.0.0.1:4179/__loading-media-review';
async function fixture(options={}){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,...options.context});
 if(options.saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){},removeEventListener(){}}}));
 if(options.rejectPlay)await context.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('QA autoplay blocked','NotAllowedError'));};});
 const page=await context.newPage(),requests=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.url().includes('bamboo-clay-loop.mp4'))requests.push(r.url());});
 if(options.missing)await page.route('**/bamboo-clay-loop.mp4*',r=>r.fulfill({status:404,body:'QA missing clip'}));
 await page.route('**/__loading-media-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#102630"><script type="module">import {createCityLoading} from "/src/city-loading.ts";window.loader=createCityLoading();window.film=loader.element.querySelector("video");loader.update("buildings",.35);</script></body></html>'}));
 await page.goto(fixtureURL);await page.waitForFunction(()=>!!window.loader);
 return {context,page,requests};
}
const media=page=>page.evaluate(()=>({time:film.currentTime,duration:film.duration,paused:film.paused,src:film.getAttribute('src'),width:film.videoWidth,height:film.videoHeight,muted:film.muted,loop:film.loop,inline:film.playsInline,poster:document.querySelector('.city-loader-poster')?.naturalWidth,mode:loader.element.dataset.film,progress:loader.stats().progress}));
async function finish(page){await page.evaluate(async()=>{await loader.finish();await loader.reveal();});return page.evaluate(()=>({cover:!!document.querySelector('#city-loading'),video:!!document.querySelector('video'),src:film.getAttribute('src'),paused:film.paused,state:loader.stats().state}));}
try{
 let f=await fixture();
 await f.page.waitForFunction(()=>film.currentTime>.5&&loader.element.dataset.film==='playing',{},{timeout:30000});
 const before=await media(f.page);await f.page.waitForTimeout(1600);const after=await media(f.page);
 check('video advances while actual loading progress holds',after.time>before.time+.7&&after.progress===before.progress,{before,after});
 check('background is silent inline looping HD with poster',after.width===1920&&after.height===1080&&after.muted&&after.loop&&after.inline&&after.poster>0,after);
 check('no story chapter labels',!(/第.{1,4}章|CHAPTER/i.test(await f.page.locator('#city-loading').innerText())));
 await f.page.screenshot({path:`${out}/desktop.png`});
 // Test a real time wrap, not just a loop attribute.
 await f.page.evaluate(()=>{film.currentTime=film.duration-.35;});await f.page.waitForTimeout(900);
 const wrapped=await media(f.page);check('loop crosses the end without stopping',wrapped.time<2&&!wrapped.paused,wrapped);
 await f.page.evaluate(()=>{window.qaHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.qaHidden});document.dispatchEvent(new Event('visibilitychange'));});
 check('hidden page pauses its background decoder',(await media(f.page)).paused);
 await f.page.evaluate(()=>{window.qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await f.page.waitForFunction(()=>!film.paused);
 await f.page.emulateMedia({reducedMotion:'reduce'});await f.page.waitForFunction(()=>!film.hasAttribute('src'));
 check('changing reduced motion releases the video',(await media(f.page)).paused);
 await f.page.emulateMedia({reducedMotion:'no-preference'});await f.page.waitForFunction(()=>loader.element.dataset.film==='playing');
 const finished=await finish(f.page);check('ready removes the cover and unloads video',!finished.cover&&!finished.video&&!finished.src&&finished.paused&&finished.state==='disposed',finished);
 await f.context.close();
 for(const [name,options] of [
  ['mobile',{context:{viewport:{width:390,height:844}}}],
  ['reduced-motion',{context:{reducedMotion:'reduce'}}],
  ['save-data',{saveData:true}],
  ['missing-video',{missing:true}],
  ['autoplay-denied',{rejectPlay:true}],
 ]){
  f=await fixture(options);
  await f.page.waitForFunction(()=>document.querySelector('.city-loader-poster').naturalWidth>0);
  if(name==='mobile')await f.page.waitForFunction(()=>loader.element.dataset.film==='playing');
  if(name==='missing-video')await f.page.waitForFunction(()=>!film.hasAttribute('src'));
  await f.page.waitForTimeout(500);
  const state=await media(f.page);
  if(name==='reduced-motion'||name==='save-data')check(`${name} does not request the video`,f.requests.length===0&&state.paused&&!state.src,{requests:f.requests,state});
  if(name==='missing-video'||name==='autoplay-denied')check(`${name} retains the poster and loading state`,state.mode!=='playing'&&state.poster>0&&await f.page.evaluate(()=>loader.stats().state==='loading'),state);
  if(name==='mobile'){
   const layout=await f.page.evaluate(()=>{const title=document.querySelector('.city-loader-title').getBoundingClientRect(),progress=document.querySelector('.city-loader-bottom').getBoundingClientRect();return {titleBottom:title.bottom,progressTop:progress.top,width:innerWidth,scroll:document.documentElement.scrollWidth};});
   check('mobile text and progress remain separated',layout.titleBottom<layout.progressTop&&layout.scroll===layout.width,layout);
  }
  await f.page.screenshot({path:`${out}/${name}.png`});
  if(name==='mobile'){
   await f.page.evaluate(()=>loader.error(new Error('资源未能载入，请重试。')));const failed=await media(f.page);
   check('boot error releases media and exposes retry',failed.paused&&!failed.src&&await f.page.locator('.city-loader-failure button').isVisible(),failed);
   await f.page.screenshot({path:`${out}/mobile-error.png`});await f.page.evaluate(()=>loader.dispose());
  }else{const state=await finish(f.page);check(`${name} still completes boot`,!state.cover&&!state.src&&state.paused,state);}
  await f.context.close();
 }
 // Hold a production resource so we can inspect playback during real city boot.
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/city/buildings.glb',async r=>{await gate;await r.continue();});
 try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('.city-loader-film')?.currentTime>.5,null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector('.city-loader-status')?.textContent==='正在载入南山、福田、罗湖建筑',null,{timeout:180000});
  const state=await page.evaluate(()=>{const film=document.querySelector('.city-loader-film');window.qaProductionFilm=film;return {progress:document.querySelector('.city-loader-progress').getAttribute('aria-valuenow'),time:film.currentTime,paused:film.paused,width:film.videoWidth};});
  check('production game plays film while waiting for real assets',state.width===1920&&!state.paused&&Number(state.progress)<100,state);
  await page.screenshot({path:`${out}/production-loading.png`});release();
  await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
  await page.locator('#city-loading').waitFor({state:'detached',timeout:15000});
  const done=await page.evaluate(()=>({ready:window.__SHENCHENGJI_CITY__.ready,paused:qaProductionFilm.paused,src:qaProductionFilm.getAttribute('src'),chapters:/第.{1,4}章|CHAPTER/i.test(document.body.innerText)}));
  check('production game opens and releases film with no chapter labels',done.ready&&done.paused&&!done.src&&!done.chapters,done);
  await page.screenshot({path:`${out}/production-ready.png`});
 }finally{release();await context.close();}
}catch(error){errors.push(String(error));console.error(error);}
finally{await browser.close();await fs.writeFile(`${out}/report.json`,JSON.stringify({date:new Date().toISOString(),checks,errors,pass:!errors.length&&checks.every(c=>c.pass)},null,2));}
console.log(JSON.stringify({out,checks:checks.map(c=>({name:c.name,pass:c.pass})),errors},null,2));
if(errors.length||checks.some(c=>!c.pass))process.exitCode=1;
