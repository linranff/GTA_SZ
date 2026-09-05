/**
 * Read-only game validation through existing UI / __SHENCHENGJI_CITY__ getters.
 * node scripts/check-cinematic-upgrade.mjs                       # 20 s smoke
 * node scripts/check-cinematic-upgrade.mjs --duration 300         # sustained run
 * node scripts/check-cinematic-upgrade.mjs --url http://127.0.0.1:4173/ --headed
 *
 * Requires Node 24+ (native TypeScript stripping) and an already running server.
 * Does not build assets, start a server, change game source, or declare visual approval.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {RoadGraph} from '../src/navigation.ts';

const args = process.argv.slice(2);
const options = {url:process.env.GAME_URL ?? 'http://127.0.0.1:4173/', duration:20, warmup:8,cruiseSpeed:18,
  headed:false, route:['bamboo','tencent','talent','baypark'], out:null,
  chrome:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'};
for (let i=0;i<args.length;i++) {
  const flag=args[i];
  if (flag==='--help') {
    console.log('Usage: node scripts/check-cinematic-upgrade.mjs [--duration 300] [--cruise-speed 18] [--warmup 8] [--url URL] [--route bamboo,tencent,talent,baypark] [--out DIRECTORY] [--chrome PATH] [--headed]\nDefault: 20-second smoke. Cruise speed is game-world units/second. Only runs >=300 seconds can pass the sustained performance gate. Exit 0 means smoke completed or sustained gates passed; 2 means sustained/validity failure; 1 means execution failure. Visual approval always remains pending.');
    process.exit(0);
  }
  if (flag==='--headed') {options.headed=true;continue;}
  if (!['--url','--duration','--warmup','--cruise-speed','--route','--out','--chrome'].includes(flag) || !args[i+1] || args[i+1].startsWith('--')) throw Error(`Invalid option: ${flag}`);
  const value=args[++i], key=flag==='--cruise-speed'?'cruiseSpeed':flag.slice(2);
  options[key]=['duration','warmup','cruiseSpeed'].includes(key)?Number(value):key==='route'?value.split(',').filter(Boolean):value;
}
if (!Number.isFinite(options.duration)||options.duration<5||options.duration>1800) throw Error('--duration must be 5–1800 seconds');
if (!Number.isFinite(options.warmup)||options.warmup<5||options.warmup>60) throw Error('--warmup must be 5–60 seconds');
if (!Number.isFinite(options.cruiseSpeed)||options.cruiseSpeed<6||options.cruiseSpeed>25) throw Error('--cruise-speed must be 6–25 game-world units/second');
if (!options.route.length) throw Error('--route must include at least one landmark ID');
if (!/^https?:$/.test(new URL(options.url).protocol)) throw Error('--url must use http or https');
const root=fileURLToPath(new URL('../',import.meta.url));
const startedAt=new Date().toISOString(), sustained=options.duration>=300;
const out=path.resolve(options.out ?? path.join(root,'output/playwright/visual-upgrade',`${startedAt.replace(/[:.]/g,'-')}-${sustained?'sustained':'smoke'}`));
await fs.mkdir(out,{recursive:true});
const sha256=body=>createHash('sha256').update(body).digest('hex');
const seriousGraphicsWarning=/(?:GL_)?INVALID_(?:FRAMEBUFFER_)?OPERATION|GL_OUT_OF_MEMORY|CONTEXT_LOST_WEBGL|context.{0,30}lost|lost.{0,20}context|feedback\s*loop|(?:shader|program).{0,60}(?:fail|error|invalid|compil|link)|(?:compil|link).{0,60}(?:shader|program)|ERROR:\s*\d+:\d+/i;
const round=n=>Number.isFinite(n)?Number(n.toFixed(3)):null;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const events=[],errors=[],consoleWarnings=[],responses=[],networkFailures=[],motion=[],diagnostics=[],checks=[],screenshots=[];
let phase='launch', browser, page, context, networkSession, held=new Set(), runStart=0, frameData=null;
const report={schemaVersion:1,startedAt,url:options.url,mode:sustained?'sustained':'smoke',options,
  environment:{os:os.type(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,totalSystemMemoryBytes:os.totalmem(),node:process.version},
  measurement:{frameClock:'Independent requestAnimationFrame observer; browser callback intervals, not GPU presentation timestamps. rAF, public engine summary and end state are frozen in one evaluate before exporting frame arrays. Both frame summaries are checked.',
    diagnostics:'1 Hz samples: gpuMs is the engine last-second GPU mean; CPU values are smoothed diagnostics, not per-frame CPU/GPU percentiles.',
    coldLoad:'Fresh browser/context with no user profile or service workers. Time to public ready is measured separately; OS file and GPU shader caches are not cleared.',
    resourceHashes:'SHA256 of actual browser response bodies, read after the timed driving interval through the same dedicated CDP Network session that captured requestIds. No validation-only re-fetches. Evicted/unavailable bodies are listed as incomplete.',
    networkCaptureBuffers:{totalBytes:268435456,perResourceBytes:67108864,note:'Dedicated CDP Network.enable before navigation; these limits do not assume or modify Playwright response.body() session caching.'},
    geometry:'getActiveIndices is intentionally omitted; it must not be interpreted as unique asset triangle count.',
    limitations:['No source/debug-interface mutation. The independent rAF observer and 10 Hz control polling add small measurement overhead.','Drone movement is checked from public stats.observer or performance.observer position/focus when available; otherwise movement verification stays pending. Screenshot changes alone never prove camera movement.','Generated runtime textures have no HTTP body; their creation code is bound through JavaScript hashes.','JS heap samples, if exposed by Chrome, do not measure total process/GPU memory.','The controller is a test driver; stalled/recovered runs cannot establish uninterrupted real-user driving.']},
  proposedGates:{minimumDurationSeconds:300,meanFpsAtLeast:59,p95MsAtMost:18,p99MsAtMost:25,over50msAtMost:0,
    stoppedTimeFractionAtMost:0.15,stoppedThresholdWorldUnitsPerSecond:0.5,minimumDistanceWorldUnitsPerSecond:4,
    maxRecoveries:0,minimumRenderedFramesPerSecond:50,internalRenderSize:[1920,1080],gpuMsHeadroomAdvisory:12,
    note:'Proposed near-60Hz acceptance, not a claim that every frame is <=16.67 ms. Movement thresholds prevent a parked/blocked run from passing. Distances are game-world units; do not silently label them surveyed real-world metres.'},
  checks,events,screenshots,errors,consoleWarnings,networkFailures,visualReview:{status:'pending',note:'Review HUD/no-HUD and drone screenshots against the supplied reference; performance passing never implies visual approval.'}};

async function input(keys) {
  const wanted=new Set(keys);
  for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key);
  for (const key of wanted) if (!held.has(key)) await page.keyboard.down(key);
  held=wanted;
}
async function snapshot(name,{hideHUD=false}={}) {
  const file=path.join(out,`${name}.png`);
  let style;
  try {
    if (hideHUD) style=await page.locator('#ui').evaluate(el=>{const previous=el.getAttribute('style');el.style.setProperty('visibility','hidden','important');return previous;});
    const bytes=await page.screenshot({path:file,animations:'disabled'});
    screenshots.push({name,path:file,sha256:sha256(bytes),hideHUD,phase});
  } finally {
    if (hideHUD) await page.locator('#ui').evaluate((el,previous)=>{if(previous===null)el.removeAttribute('style');else el.setAttribute('style',previous);},style);
  }
}
async function check(name,fn) {
  try {checks.push({name,status:'pass',details:await fn()});}
  catch(error) {checks.push({name,status:'fail',error:String(error)});throw error;}
}
async function publicState(withDiagnostics=false) {
  return page.evaluate(withDiagnostics=>{
    const api=window.__SHENCHENGJI_CITY__, state=api.state,stats=api.stats,traffic=stats.traffic??[];
    if (!withDiagnostics) return {state,traffic};
    const p=api.performance;
    return {state,traffic,diagnostics:{gpuMs:p.gpuMs,updateMs:p.updateMs,renderSubmitMs:p.renderSubmitMs,
      activeEvaluationMs:p.activeEvaluationMs,renderTargetsMs:p.renderTargetsMs,drawCalls:p.drawCalls,
      renderFrames:p.renderFrames,hidden:p.hidden,aerial:p.aerial,resolution:p.resolution,
      loadedMeshes:p.loadedMeshes,enabledMeshes:p.enabledMeshes,facades:p.facades,
      requiredVisuals:{cinematic:stats.cinematic,roadSurface:stats.roadSurface,facadeDiversity:stats.facadeDiversity},
      jsHeapBytes:performance.memory?.usedJSHeapSize??null}};
  },withDiagnostics);
}
async function publicObserver() {
  return page.evaluate(()=>{
    const api=window.__SHENCHENGJI_CITY__;
    return api.stats.observer??api.performance.observer??null;
  });
}
function nearestOnRoute(state,route,previous) {
  let result={index:previous,d:Infinity,t:0,x:state.x,z:state.z};
  for(let i=Math.max(0,previous-2);i<Math.min(route.length-1,previous+25);i++) {
    const a=route[i],b=route[i+1],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((state.x-a[0])*dx+(state.z-a[1])*dz)/(dx*dx+dz*dz||1)));
    const x=a[0]+dx*t,z=a[1]+dz*t,d=Math.hypot(state.x-x,state.z-z);
    if(d<result.d)result={index:i,d,t,x,z};
  }
  return result;
}
function lookAhead(route,near,distance) {
  let from=[near.x,near.z];
  for(let i=near.index+1;i<route.length;i++) {
    const to=route[i],length=Math.hypot(to[0]-from[0],to[1]-from[1]);
    if(length>=distance)return [from[0]+(to[0]-from[0])*distance/(length||1),from[1]+(to[1]-from[1])*distance/(length||1)];
    distance-=length;from=to;
  }
  return route.at(-1);
}
function routeRoadWidths(roads,route) {
  const segments=roads.flatMap(road=>road.points.slice(1).map((b,i)=>({a:road.points[i],b,width:road.width})));
  return route.map(([x,z])=>{
    let best=Infinity,width=4;
    for(const segment of segments) {
      const {a,b}=segment,dx=b[0]-a[0],dz=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
      const d=(x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
      if(d<best){best=d;width=segment.width;}
    }
    return width;
  });
}
function lanePoint(route,near,ahead,offset) {
  const center=lookAhead(route,near,ahead),next=lookAhead(route,near,ahead+3),previous=lookAhead(route,near,Math.max(0,ahead-3));
  const from=Math.hypot(next[0]-center[0],next[1]-center[1])>.01?center:previous;
  const to=from===center?next:center,heading=Math.atan2(to[0]-from[0],to[1]-from[1]);
  return [center[0]+Math.cos(heading)*offset,center[1]-Math.sin(heading)*offset];
}
function drivingCommand(state,route,near,traffic,laneOffset,cruiseSpeed=18) {
  const ahead=laneOffset>=4.2?Math.max(9,Math.min(15,7+Math.abs(state.speed)*.4)):Math.max(10,Math.min(26,10+Math.abs(state.speed)*.8));
  const target=lanePoint(route,near,ahead,laneOffset),far=lanePoint(route,near,ahead+20,laneOffset);
  const bearing=Math.atan2(target[0]-state.x,target[1]-state.z),error=wrap(bearing-state.yaw);
  const heading=Math.atan2(far[0]-target[0],far[1]-target[1]),bend=Math.abs(wrap(heading-bearing));
  let speedTarget=Math.abs(error)>1?4:Math.abs(error)>.5||bend>.7?7:Math.abs(error)>.25||bend>.35?11:18;
  speedTarget=Math.min(speedTarget,cruiseSpeed);
  let trafficGap=Infinity;
  for(const car of traffic) {
    const dx=car.x-state.x,dz=car.z-state.z,along=dx*Math.sin(state.yaw)+dz*Math.cos(state.yaw),lateral=dx*Math.cos(state.yaw)-dz*Math.sin(state.yaw);
    if(along>0&&Math.abs(lateral)<3.15)trafficGap=Math.min(trafficGap,along);
  }
  // Brake for the actual public traffic positions before the game's 2.7-unit collision radius.
  // Treat an untracked car as stationary; a moving lead vehicle naturally opens the following gap.
  speedTarget=Math.min(speedTarget,Math.sqrt(16*Math.max(0,trafficGap-6)));
  const steeringLimit=.48/(1+Math.abs(state.speed)*.026);
  const targetSteer=Math.max(-steeringLimit,Math.min(steeringLimit,Math.atan(6.4*Math.sin(error)/Math.max(6,Math.hypot(target[0]-state.x,target[1]-state.z)))));
  const keys=[];
  if(state.speed<speedTarget-.6)keys.push('w');else if(state.speed>speedTarget+1.0)keys.push('s');
  if(speedTarget<.5)keys.push('Space');
  if(targetSteer>.012&&state.steer<targetSteer+.015)keys.push('d');
  if(targetSteer<-.012&&state.steer>targetSteer-.015)keys.push('a');
  return {keys,speedTarget,trafficGap,laneOffset,steeringLimit,targetSteer,heading,error};
}
function summarize(values) {
  if(!values.length)return {samples:0,meanFps:0,p50:null,p95:null,p99:null,maxMs:null,over50ms:0};
  const sorted=[...values].sort((a,b)=>a-b),pct=p=>round(sorted[Math.floor((sorted.length-1)*p)]);
  return {samples:values.length,meanFps:round(1000/(values.reduce((a,b)=>a+b,0)/values.length)),p50:pct(.5),p95:pct(.95),p99:pct(.99),maxMs:round(sorted.at(-1)),over50ms:values.filter(x=>x>50).length};
}
function displacement(before,after) {
  const vector=value=>Array.isArray(value)?value:[value?.x,value?.y,value?.z];
  const a=vector(before),b=vector(after);
  if(a.length<3||b.length<3||!a.slice(0,3).every(Number.isFinite)||!b.slice(0,3).every(Number.isFinite))return null;
  return Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
}
async function writeTimingChart() {
  if(!frameData?.frames.length)return;
  const seconds=Math.max(1,frameData.endedMs/1000),buckets=new Map();
  for(const [t,dt] of frameData.frames) {const second=Math.floor(t/1000),list=buckets.get(second)??[];list.push(dt);buckets.set(second,list);}
  const frameCurve=[...buckets].map(([second,list])=>[second+.5,summarize(list).p95]);
  const gpuCurve=diagnostics.filter(d=>Number.isFinite(d.gpuMs)&&d.gpuMs>0).map(d=>[d.tSeconds,d.gpuMs]);
  const maxMs=Math.max(35,...frameCurve.map(x=>x[1]),...gpuCurve.map(x=>x[1]));
  const x=t=>70+Math.min(seconds,t)/seconds*850,y=ms=>340-Math.min(maxMs,ms)/maxMs*270;
  const poly=curve=>curve.map(([t,ms])=>`${x(t).toFixed(2)},${y(ms).toFixed(2)}`).join(' ');
  const ticks=[0,16.67,Math.ceil(maxMs)];
  const grid=ticks.map(ms=>`<line x1="70" y1="${y(ms)}" x2="920" y2="${y(ms)}" stroke="#425066" stroke-dasharray="4 4"/><text x="59" y="${y(ms)+4}" text-anchor="end">${ms} ms</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="430" viewBox="0 0 1000 430"><rect width="1000" height="430" fill="#111a27"/><g fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="12"><text x="70" y="30" font-size="18">Driving timing: 1-second frame P95 and sampled GPU mean</text><text x="70" y="51">Blue: rAF P95 per second. Orange: engine GPU last-second mean. These are different statistics.</text>${grid}<polyline points="${poly(frameCurve)}" fill="none" stroke="#60a5fa" stroke-width="2"/><polyline points="${poly(gpuCurve)}" fill="none" stroke="#fb923c" stroke-width="2"/><text x="70" y="366">0 s</text><text x="920" y="366" text-anchor="end">${seconds.toFixed(1)} s</text><text x="70" y="399">Full intervals: frame-times.csv. CPU, GPU, resolution and loading samples: diagnostics.json.</text></g></svg>`;
  await fs.writeFile(path.join(out,'timing.svg'),svg);
  report.timingChart=path.join(out,'timing.svg');
}
async function collectResourceManifest() {
  const manifest=[];
  // Hash only after measurement: CDP response-body copies and hashing must not run in the timed interval.
  for(let start=0;start<responses.length;start+=3) {
    const batch=await Promise.all(responses.slice(start,start+3).map(async item=>{
      try {
        const result=await networkSession.send('Network.getResponseBody',{requestId:item.requestId});
        const body=Buffer.from(result.body,result.base64Encoded?'base64':'utf8');
        return {...item,bytes:body.byteLength,sha256:sha256(body)};
      } catch(error) {return {...item,sha256:null,error:String(error)};}
    }));
    manifest.push(...batch);
  }
  await fs.writeFile(path.join(out,'resource-manifest.json'),JSON.stringify({note:report.measurement.resourceHashes,resources:manifest},null,2));
  return {path:path.join(out,'resource-manifest.json'),count:manifest.length,missingBodyCount:manifest.filter(r=>!r.sha256).length,
    jsCount:manifest.filter(r=>r.kind==='script').length,glbCount:manifest.filter(r=>/\.glb(?:\?|$)/i.test(r.url)).length,
    textureCount:manifest.filter(r=>/\.(png|jpe?g|webp|avif|ktx2?|basis|dds|env|hdr)(?:\?|$)/i.test(r.url)).length};
}

try {
  browser=await chromium.launch({headless:!options.headed,executablePath:options.chrome,args:['--use-angle=metal']});
  context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
  page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push({phase,source:'pageerror',message:error.message.slice(0,2000)}));
  page.on('console',message=>{
    const type=message.type();
    if(type!=='error'&&type!=='warning')return;
    const text=message.text(),graphicsFailure=type==='warning'&&seriousGraphicsWarning.test(text);
    const entry={phase,source:'console',type,message:text.slice(0,2000),location:message.location(),graphicsFailure};
    if(type==='error'||graphicsFailure)errors.push(entry);else consoleWarnings.push(entry);
  });
  page.on('requestfailed',request=>networkFailures.push({phase,url:request.url(),error:request.failure()?.errorText}));
  page.on('response',response=>{
    const url=response.url();
    if(response.status()>=400)networkFailures.push({phase,url,status:response.status()});
  });
  networkSession=await context.newCDPSession(page);
  await networkSession.send('Network.enable',{maxTotalBufferSize:256*1024*1024,maxResourceBufferSize:64*1024*1024});
  networkSession.on('Network.responseReceived',event=>{
    const response=event.response,url=response.url,kind=event.type.toLowerCase();
    const headers=Object.fromEntries(Object.entries(response.headers).map(([name,value])=>[name.toLowerCase(),String(value)]));
    if(!/^https?:/.test(url))return;
    if(['script','stylesheet','image','document'].includes(kind)||/\.(glb|gltf|bin|json|wasm|png|jpe?g|webp|avif|ktx2?|basis|dds|env|hdr)(?:\?|$)/i.test(url)) {
      responses.push({requestId:event.requestId,url,kind,status:response.status,phase,timeSinceLaunchMs:Date.now()-loadStart,
        captureSource:'dedicated-cdp-network',contentType:headers['content-type']??response.mimeType??null,contentEncoding:headers['content-encoding']??null,
        fromServiceWorker:response.fromServiceWorker??false,fromDiskCache:response.fromDiskCache??false});
    }
  });
  await page.addInitScript(()=>{
    const probe={active:false,start:0,previous:0,frames:[],visibilityChanges:[]};
    Object.defineProperty(window,'__CINEMATIC_FRAME_PROBE__',{value:probe});
    document.addEventListener('visibilitychange',()=>{if(probe.active)probe.visibilityChanges.push({tMs:performance.now()-probe.start,hidden:document.hidden});});
    function tick(now) {
      if(probe.active) {
        if(probe.previous)probe.frames.push([now-probe.start,now-probe.previous]);
        probe.previous=now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const loadStart=Date.now();phase='cold-load';
  await page.goto(options.url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
  report.coldLoad={readySeconds:round((Date.now()-loadStart)/1000),responseCountAtReady:responses.length,
    pageTiming:await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.toJSON())};
  report.environment.browser=await browser.version();
  report.environment.browserMode=options.headed?'headed Chrome':'headless Chrome';
  report.environment.graphics=await page.evaluate(()=>{
    const canvas=document.querySelector('#game'),gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
    const extension=gl?.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,devicePixelRatio,canvas:[canvas.width,canvas.height],
      version:gl?.getParameter(gl.VERSION)??null,vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):null,
      renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):null};
  });
  phase='warmup';const warmStart=Date.now();
  await page.waitForTimeout(options.warmup*1000);
  await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.performance.facades?.pending,null,{timeout:30000});
  await check('Required cinematic assets are ready, without fallback',async()=>{
    await page.waitForFunction(()=>{
      const s=window.__SHENCHENGJI_CITY__.stats;
      return s.cinematic?.status==='failed'||s.roadSurface?.errors?.length||s.facadeDiversity?.failures?.length||
        (s.cinematic?.status==='ready'&&s.roadSurface?.ready&&s.facadeDiversity?.ready);
    },null,{timeout:60000});
    const required=await page.evaluate(()=>{const s=window.__SHENCHENGJI_CITY__.stats;return {cinematic:s.cinematic,roadSurface:s.roadSurface,facadeDiversity:s.facadeDiversity};});
    report.requiredVisuals=required;
    if(required.cinematic?.status!=='ready'||required.cinematic.cubeSize!==1024)throw Error('Expected the ready 1024px HDR cube; fallback or wrong resolution is not accepted');
    if(!required.roadSurface?.ready||!required.roadSurface.applied||required.roadSurface.errors?.length)throw Error('Road surface maps are not applied successfully');
    if(!required.facadeDiversity?.ready||required.facadeDiversity.failures?.length)throw Error('Facade diversity maps are not ready successfully');
    return required;
  });
  report.warmup={seconds:round((Date.now()-warmStart)/1000),facadesSettled:true};
  phase='visual-and-controls';
  await snapshot('opening-hud');await snapshot('opening-no-hud',{hideHUD:true});
  await check('M opens map; Escape returns to driving',async()=>{
    await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await snapshot('map');
    await page.keyboard.press('Escape');await page.locator('#map-panel').waitFor({state:'hidden'});return {mapClosed:true};
  });
  await check('Escape pause and resume',async()=>{
    await page.keyboard.press('Escape');await page.locator('#pause').waitFor({state:'visible'});
    await page.keyboard.press('Escape');await page.locator('#pause').waitFor({state:'hidden'});return {pauseClosed:true};
  });
  await check('G drone, movement input, G exit and actual driving',async()=>{
    const before=(await publicState()).state;
    await page.keyboard.press('g');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.performance.aerial);
    await page.waitForTimeout(500);await snapshot('drone-before');
    const observerBefore=await publicObserver();
    await input(['w','d']);await page.waitForTimeout(1200);await input([]);await snapshot('drone-after');
    const observerAfter=await publicObserver();
    const positionShift=displacement(observerBefore?.position,observerAfter?.position),focusShift=displacement(observerBefore?.focus,observerAfter?.focus);
    const measurable=positionShift!==null||focusShift!==null;
    if(measurable&&Math.max(positionShift??0,focusShift??0)<.5)throw Error('Drone position/focus did not translate after movement input');
    if(observerAfter?.active===false)throw Error('Public observer became inactive during drone movement');
    const during=(await publicState()).state;
    if(Math.hypot(during.x-before.x,during.z-before.z)>.1)throw Error('Vehicle moved during drone mode');
    await page.keyboard.press('g');await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.performance.aerial);
    const observerReturned=await publicObserver();
    if(observerReturned?.active===true)throw Error('Public observer remained active after G returned to driving');
    await input(['w']);await page.waitForTimeout(1500);await input([]);
    const after=(await publicState()).state,travelled=after.distance-during.distance;
    if(travelled<1)throw Error('Driving did not resume after leaving drone');
    await input(['Space']);await page.waitForTimeout(1800);await input([]);
    return {movementKeys:['w','d'],movementSeconds:1.2,vehicleStationaryDuringDrone:true,drivingDistanceWorldUnits:round(travelled),
      cameraMovement:{status:measurable?'pass':'pending',source:measurable?'public stats.observer ?? performance.observer':'No usable public position/focus vectors',
        positionShiftWorldUnits:round(positionShift),focusShiftWorldUnits:round(focusShift),before:observerBefore,after:observerAfter,returned:observerReturned,
        note:'Screenshot hashes bind visual evidence only; image differences do not establish camera translation.'},cameraMovementVisualReview:'pending'};
  });

  // Reuse the same JSON bodies that the game requested; do not warm other routes by fetching assets.
  const responseJSON=async suffix=>{
    const item=responses.findLast(r=>new URL(r.url).pathname.endsWith(suffix));
    if(!item)throw Error(`The game did not request ${suffix}; cannot bind the controller to its road graph`);
    const result=await networkSession.send('Network.getResponseBody',{requestId:item.requestId});
    return JSON.parse(Buffer.from(result.body,result.base64Encoded?'base64':'utf8').toString('utf8'));
  };
  const city=await responseJSON('/city/city.json'),navigation=await responseJSON('/city/navigation.json');
  const graph=new RoadGraph(city.roads,navigation);
  const liveLandmarks=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.landmarks);
  const destinations=options.route.map(id=>{const landmark=liveLandmarks.find(x=>x.id===id);if(!landmark)throw Error(`Unknown route landmark: ${id}`);return landmark;});
  report.controller={type:'Keyboard-only pure pursuit with width-bounded right lane and public-traffic following',sourceSha256:sha256(await fs.readFile(new URL('../src/navigation.ts',import.meta.url))),
    waypointIds:options.route,cruiseWorldUnitsPerSecond:options.cruiseSpeed,pollIntervalMs:100,stallSecondsBeforeRecovery:8,
    wheelbaseWorldUnits:3.2,steeringLimitFormula:'.48 / (1 + abs(speed) * .026)',normalRightOffset:2.7,passingRightOffset:5.2,roadEdgeClearance:1.5,followingGapWorldUnits:6,
    note:'No teleporting in the timed route. Nearby traffic is read through public stats; right-side passing is attempted only where road width and observed lateral clearance allow it. Stops/conflicts remain recorded. At most two R recoveries; any recovery fails sustained validity. A third stall aborts early and records a failed run.'};
  phase='pre-drive-warmup';await page.waitForTimeout(2000);
  let state=(await publicState()).state,route=[],widths=[],routeIndex=0,destinationIndex=0,completedWaypoints=0,passUntilDistance=-1,passing=false,following=false;
  const plan=()=>{
    route=graph.route([state.x,state.z],destinations[destinationIndex].arrival);routeIndex=0;widths=routeRoadWidths(city.roads,route);
    if(route.length<2)throw Error(`No usable route to ${destinations[destinationIndex].id}`);
    events.push({type:'route',elapsedSeconds:runStart?round((Date.now()-runStart)/1000):0,destination:destinations[destinationIndex].id,points:route});
  };
  plan();const startState={...state},beforePerformance=(await publicState(true)).diagnostics;
  await page.evaluate(()=>{
    window.__SHENCHENGJI_CITY__.resetPerformance();
    const probe=window.__CINEMATIC_FRAME_PROBE__;probe.frames=[];probe.visibilityChanges=[];probe.previous=0;probe.start=performance.now();probe.active=true;
  });
  phase='driving';runStart=Date.now();let lastTime=runStart,lastDistance=state.distance,stalledSeconds=0,recoveries=0,stoppedSeconds=0,movingSeconds=0,nextDiagnostic=0,nextProgress=30,abortedReason=null;
  while(Date.now()-runStart<options.duration*1000) {
    const now=Date.now(),t=(now-runStart)/1000,dt=(now-lastTime)/1000,wantDiagnostics=t>=nextDiagnostic;
    const sample=await publicState(wantDiagnostics);state=sample.state;
    if(wantDiagnostics){diagnostics.push({tSeconds:round(t),...sample.diagnostics});nextDiagnostic=t+1;}
    const moved=state.distance-lastDistance;
    if(Math.abs(state.speed)<.5)stoppedSeconds+=dt;else movingSeconds+=dt;
    if(moved<.08&&t>3)stalledSeconds+=dt;else stalledSeconds=0;
    motion.push({tSeconds:round(t),x:round(state.x),z:round(state.z),yaw:round(state.yaw),speed:round(state.speed),distance:round(state.distance),road:state.road});
    lastTime=now;lastDistance=state.distance;
    if(t>=nextProgress){console.log(JSON.stringify({phase:'driving',seconds:round(t),distanceWorldUnits:round(state.distance-startState.distance),stoppedTimeFraction:round(stoppedSeconds/Math.max(.001,stoppedSeconds+movingSeconds)),recoveries,speed:round(state.speed)}));nextProgress+=30;}
    if(stalledSeconds>8) {
      if(recoveries>=2){abortedReason='Third prolonged stall; route is invalid for sustained-driving acceptance';break;}
      await input([]);await page.keyboard.press('r');recoveries++;
      events.push({type:'recovery',method:'R',elapsedSeconds:round(t),state:{...state}});
      state=(await publicState()).state;plan();stalledSeconds=0;lastDistance=state.distance;continue;
    }
    const near=nearestOnRoute(state,route,routeIndex);routeIndex=near.index;
    if(near.index>=route.length-4&&Math.hypot(state.x-route.at(-1)[0],state.z-route.at(-1)[1])<16) {
      completedWaypoints++;events.push({type:'waypoint-reached',id:destinations[destinationIndex].id,elapsedSeconds:round(t)});
      destinationIndex=(destinationIndex+1)%destinations.length;plan();continue;
    }
    const traffic=sample.traffic,roadWidth=Math.min(...widths.slice(near.index,near.index+5)),availableOffset=Math.max(0,roadWidth/2-1.5);
    let laneOffset=Math.min(2.7,availableOffset),command=drivingCommand(state,route,near,traffic,laneOffset,options.cruiseSpeed);
    const candidateOffset=Math.min(5.2,availableOffset),routeHeading=Math.atan2(route[near.index+1][0]-route[near.index][0],route[near.index+1][1]-route[near.index][1]);
    const passingClear=traffic.every(car=>{
      const dx=car.x-near.x,dz=car.z-near.z,along=dx*Math.sin(routeHeading)+dz*Math.cos(routeHeading),lateral=dx*Math.cos(routeHeading)-dz*Math.sin(routeHeading);
      return along< -8||along>40||Math.abs(lateral-candidateOffset)>3.2;
    });
    if(command.trafficGap<60&&candidateOffset>=4.2&&passingClear)passUntilDistance=state.distance+75;
    const shouldPass=state.distance<passUntilDistance&&candidateOffset>=4.2&&passingClear;
    if(shouldPass){laneOffset=candidateOffset;command=drivingCommand(state,route,near,traffic,laneOffset,options.cruiseSpeed);}
    if(shouldPass!==passing){events.push({type:'keyboard-lane-change',action:shouldPass?'pass-right':'return-to-cruise-lane',elapsedSeconds:round(t),laneOffset,roadWidth});passing=shouldPass;}
    const isFollowing=command.trafficGap<35;
    if(isFollowing!==following){events.push({type:'traffic-conflict',action:isFollowing?'brake-or-follow':'clear',elapsedSeconds:round(t),trafficGapWorldUnits:round(command.trafficGap),speed:round(state.speed)});following=isFollowing;}
    Object.assign(motion.at(-1),{laneOffset:round(laneOffset),trafficGapWorldUnits:round(command.trafficGap),targetSpeed:round(command.speedTarget),targetSteer:round(command.targetSteer),keys:command.keys});
    await input(command.keys);await page.waitForTimeout(100);
  }
  await input([]);
  frameData=await page.evaluate(()=>{
    const probe=window.__CINEMATIC_FRAME_PROBE__;probe.active=false;
    const endedMs=performance.now()-probe.start,api=window.__SHENCHENGJI_CITY__;
    const {triangles,...engineSummary}=api.performance,stats=api.stats;
    return {frames:probe.frames,visibilityChanges:probe.visibilityChanges,endedMs,engineSummary,endState:api.state,
      requiredVisuals:{cinematic:stats.cinematic,roadSurface:stats.roadSurface,facadeDiversity:stats.facadeDiversity}};
  });
  const after={state:frameData.endState,diagnostics:{...frameData.engineSummary,requiredVisuals:frameData.requiredVisuals}};
  diagnostics.push({tSeconds:round(frameData.endedMs/1000),...after.diagnostics});
  const actualSeconds=frameData.endedMs/1000,frameStats=summarize(frameData.frames.map(frame=>frame[1]));
  const distance=after.state.distance-startState.distance,renderedFrames=after.diagnostics.renderFrames-beforePerformance.renderFrames;
  report.driving={requestedSeconds:options.duration,actualSeconds:round(actualSeconds),abortedReason,startState,endState:after.state,
    distanceWorldUnits:round(distance),completedWaypoints,recoveries,stoppedSeconds:round(stoppedSeconds),movingSeconds:round(movingSeconds),
    stoppedTimeFraction:round(stoppedSeconds/Math.max(.001,stoppedSeconds+movingSeconds)),renderedFrames,renderedFramesPerSecond:round(renderedFrames/actualSeconds),
    frameStats,visibilityChanges:frameData.visibilityChanges,publicEngineSummary:frameData.engineSummary};
  phase='post-drive-visual';await snapshot('driving-end-hud');await snapshot('driving-end-no-hud',{hideHUD:true});
  // Stop simulation through its existing UI while response bodies are copied for hashing.
  await page.keyboard.press('Escape');await page.locator('#pause').waitFor({state:'visible'});
  const gate=report.proposedGates, failReasons=[];
  if(!sustained)failReasons.push('Smoke duration is below 300 seconds; sustained performance is not evaluated');
  if(abortedReason||actualSeconds<options.duration-.5)failReasons.push('The requested route duration was not completed');
  if(frameStats.meanFps<gate.meanFpsAtLeast)failReasons.push('Mean rAF FPS below 59');
  if(frameStats.p95>gate.p95MsAtMost)failReasons.push('P95 frame interval above 18 ms');
  if(frameStats.p99>gate.p99MsAtMost)failReasons.push('P99 frame interval above 25 ms');
  if(frameStats.over50ms>gate.over50msAtMost)failReasons.push('At least one frame interval above 50 ms');
  const engineStats=frameData.engineSummary;
  if(engineStats.meanFps<gate.meanFpsAtLeast)failReasons.push('Engine mean FPS below 59');
  if(engineStats.p95>gate.p95MsAtMost)failReasons.push('Engine P95 raw frame interval above 18 ms');
  if(engineStats.p99>gate.p99MsAtMost)failReasons.push('Engine P99 raw frame interval above 25 ms');
  if(engineStats.over50ms>gate.over50msAtMost)failReasons.push('At least one engine raw frame interval above 50 ms');
  if(recoveries>0)failReasons.push('Recovery was required; uninterrupted driving was not established');
  if(report.driving.stoppedTimeFraction>gate.stoppedTimeFractionAtMost)failReasons.push('Vehicle was stopped for more than 15% of the route');
  if(distance<actualSeconds*gate.minimumDistanceWorldUnitsPerSecond)failReasons.push('Insufficient actual driving distance');
  if(renderedFrames/actualSeconds<gate.minimumRenderedFramesPerSecond)failReasons.push('Too few actual engine renders');
  if(frameData.visibilityChanges.some(x=>x.hidden)||diagnostics.some(x=>x.hidden||x.aerial))failReasons.push('Hidden tab or drone mode occurred during the driving interval');
  if(diagnostics.some(x=>x.resolution?.[0]!==1920||x.resolution?.[1]!==1080))failReasons.push('Internal render resolution differs from 1920 x 1080');
  if(diagnostics.some(x=>x.facades?.failedTiles?.length))failReasons.push('Facade tiles failed to load');
  if(diagnostics.some(x=>{const v=x.requiredVisuals;return v?.cinematic?.status!=='ready'||v.cinematic.cubeSize!==1024||!v.roadSurface?.ready||!v.roadSurface.applied||v.roadSurface.errors?.length||!v.facadeDiversity?.ready||v.facadeDiversity.failures?.length;}))failReasons.push('A required HDR/road/facade visual asset was unavailable or in fallback during driving');
  report.acceptance={status:sustained?(failReasons.length?'fail':'pass'):'not-evaluated-smoke',failReasons,
    visualStatus:'pending',scope:'Only this recorded route, asset manifest, browser and settings. Not whole-city or other-browser certification.'};
} catch(error) {
  report.executionFailure=String(error);errors.push({phase,message:String(error)});process.exitCode=1;
} finally {
  phase='finalize';
  try {
    if(page&&!page.isClosed()) {
      await input([]);
      if(!frameData)frameData=await page.evaluate(()=>{const p=window.__CINEMATIC_FRAME_PROBE__;if(!p)return null;p.active=false;return {frames:p.frames,visibilityChanges:p.visibilityChanges,endedMs:performance.now()-p.start};}).catch(()=>null);
      report.resources=await collectResourceManifest();
      report.resourceTiming=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,initiatorType:r.initiatorType,startMs:r.startTime,durationMs:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize}))).catch(()=>[]);
    }
    const runtimeFailures=errors.length+networkFailures.length;
    if(report.acceptance&&runtimeFailures) {report.acceptance.failReasons.push('Browser script or network failures occurred');if(sustained)report.acceptance.status='fail';}
    if(report.acceptance&&(!report.resources?.jsCount||!report.resources?.glbCount||report.resources?.missingBodyCount)) {
      report.acceptance.failReasons.push('Actual JS/GLB response binding is incomplete; inspect resource-manifest.json');
      if(sustained)report.acceptance.status='fail';
    }
    if(!process.exitCode&&(runtimeFailures||checks.some(c=>c.status==='fail')))process.exitCode=1;
    if(!process.exitCode&&report.acceptance?.status==='fail')process.exitCode=2;
    if(frameData)await fs.writeFile(path.join(out,'frame-times.csv'),'tMs,intervalMs\n'+frameData.frames.map(([t,dt])=>`${round(t)},${round(dt)}`).join('\n')+'\n');
    await writeTimingChart();
    await fs.writeFile(path.join(out,'motion.json'),JSON.stringify(motion));
    await fs.writeFile(path.join(out,'diagnostics.json'),JSON.stringify(diagnostics,null,2));
    report.endedAt=new Date().toISOString();report.outputDirectory=out;
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({report:path.join(out,'report.json'),mode:report.mode,acceptance:report.acceptance?.status??'execution-failed',frames:report.driving?.frameStats,distanceWorldUnits:report.driving?.distanceWorldUnits,recoveries:report.driving?.recoveries,visualReview:'pending',exitCode:process.exitCode??0},null,2));
  } catch(error) {console.error(`Could not finalize cinematic report: ${error}`);process.exitCode=1;}
  await browser?.close();
}
