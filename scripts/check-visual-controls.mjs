/**
 * Visual/control checks using UI input and read-only observer state only.
 * node scripts/check-visual-controls.mjs --only qijie  # west-side sign first
 * node scripts/check-visual-controls.mjs --only opening # dusk/night A/B only
 * node scripts/check-visual-controls.mjs               # full controls + views
 * Requires an already-running production preview. Does not build/start servers.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const options={url:process.env.GAME_URL??'http://127.0.0.1:4173/',only:'all',headed:false,out:null,
  chrome:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++) {
  const flag=args[i];
  if(flag==='--help') {
    console.log('Usage: node scripts/check-visual-controls.mjs [--only opening|qijie|all] [--url URL] [--out DIR] [--chrome PATH] [--headed]\nopening: same-camera dusk/night HUD/no-HUD PNGs only. qijie: map photo -> exact west sign camera -> HUD/no-HUD PNG + signage JSON. all: opening, Qijie, observer controls, Tencent/car dusk/night, and sequential Retina capture. Exit 0 requires runtime/control checks; visual approval remains pending.');
    process.exit(0);
  }
  if(flag==='--headed'){options.headed=true;continue;}
  if(!['--url','--only','--out','--chrome'].includes(flag)||!args[i+1]||args[i+1].startsWith('--'))throw Error(`Invalid option: ${flag}`);
  options[flag.slice(2)]=args[++i];
}
if(!['opening','qijie','all'].includes(options.only))throw Error('--only must be opening, qijie or all');
const root=fileURLToPath(new URL('../',import.meta.url)),startedAt=new Date().toISOString();
const out=path.resolve(options.out??path.join(root,'output/playwright/visual-controls',startedAt.replace(/[:.]/g,'-')));
await fs.mkdir(out,{recursive:true});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const seriousGraphicsWarning=/(?:GL_)?INVALID_(?:FRAMEBUFFER_)?OPERATION|GL_OUT_OF_MEMORY|CONTEXT_LOST_WEBGL|context.{0,30}lost|lost.{0,20}context|feedback\s*loop|(?:shader|program).{0,60}(?:fail|error|invalid|compil|link)|(?:compil|link).{0,60}(?:shader|program)|ERROR:\s*\d+:\d+/i;
const vector=v=>Array.isArray(v)?{x:v[0],y:v[1],z:v[2]}:v;
const distance=(a,b)=>{a=vector(a);b=vector(b);return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);};
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const errors=[],warnings=[],checks=[],screenshots=[],resourceResponses=[],poseCorrections=[],resources=[];
const report={schemaVersion:1,startedAt,options,outputDirectory:out,errors,warnings,checks,screenshots,poseCorrections,resources,
  controlContract:{leftDrag:'Orbit with ordinary held drag; Shift + held drag pans. Release and subsequent motion must stop movement.',arrows:'Turn the viewing direction while camera position stays fixed.',rightDrag:'Orbit around an unchanged focus.',
    inputCalibration:{rightDragYawPerPixel:-.0045,rightDragPitchPerPixel:.0035,wheelExponent:.0012},
    poseMethod:'Right-button drag, wheel and WASD/QE only; each correction reads the public observer getter. No game object/property mutations.'},
  scope:'Visual and controls only; not a frame-rate acceptance run.',visualReview:{status:'pending',note:'Review actual sign support, readable text, facade rendering, day/night and vehicle finish. Screenshot hashes identify files; they do not prove camera motion.'}};
let browser,page,phase='launch';
function attachListeners(target) {
  target.setDefaultTimeout(15000);
  target.on('pageerror',error=>errors.push({phase,source:'pageerror',message:error.message.slice(0,2000)}));
  target.on('console',message=>{
    const type=message.type(),text=message.text();if(type!=='error'&&type!=='warning')return;
    const graphicsFailure=type==='warning'&&seriousGraphicsWarning.test(text),entry={phase,type,message:text.slice(0,2000),graphicsFailure,location:message.location()};
    if(type==='error'||graphicsFailure)errors.push(entry);else warnings.push(entry);
  });
  target.on('requestfailed',request=>errors.push({phase,source:'network',url:request.url(),message:request.failure()?.errorText}));
  target.on('response',response=>{
    const url=response.url();if(response.status()>=400)errors.push({phase,source:'network',url,status:response.status()});
    if(response.request().resourceType()==='script'||/\/(?:landmark-detail\.glb|landmark-signage\.json|textures\/signage\/[^/]+\.png)(?:\?|$)/.test(url))resourceResponses.push({response,phase});
  });
}
async function hashResources() {
  for(const {response,phase:resourcePhase} of resourceResponses.splice(0)) {
    try{const body=await response.body();resources.push({url:response.url(),phase:resourcePhase,bytes:body.byteLength,sha256:sha256(body)});}
    catch(error){resources.push({url:response.url(),phase:resourcePhase,sha256:null,error:String(error)});}
  }
}
async function read() {
  return page.evaluate(()=>{
    const api=window.__SHENCHENGJI_CITY__,stats=api.stats,p=api.performance;
    return {observer:stats.observer??p.observer,state:api.state,signage:stats.signage,cinematic:stats.cinematic,
      vehicleFinish:stats.vehicleFinish,photo:stats.photo,resolution:p.resolution,aerial:p.aerial};
  });
}
async function observer() {
  const result=(await read()).observer;
  if(!result?.position||!result?.focus||![result.yaw,result.pitch,result.distance].every(Number.isFinite))throw Error('Usable read-only observer position/focus/yaw/pitch/distance is unavailable');
  return {...result,position:vector(result.position),focus:vector(result.focus)};
}
async function check(name,fn,{fatal=false}={}) {
  try {const details=await fn();checks.push({name,status:'pass',details});return details;}
  catch(error){checks.push({name,status:'fail',error:String(error)});if(fatal)throw error;return null;}
}
async function capture(name,{hideHUD=false}={}) {
  const file=path.join(out,`${name}.png`);let previous;
  try {
    if(hideHUD)previous=await page.locator('#ui').evaluate(el=>{const old=el.getAttribute('style');el.style.setProperty('visibility','hidden','important');return old;});
    const state=await read(),bytes=await page.screenshot({path:file,animations:'disabled'});
    screenshots.push({name,path:file,sha256:sha256(bytes),hideHUD,phase,...state});
  }finally{if(hideHUD)await page.locator('#ui').evaluate((el,old)=>{if(old===null)el.removeAttribute('style');else el.setAttribute('style',old);},previous);}
}
async function drag(button,dx,dy) {
  const box=await page.locator('#game').boundingBox();if(!box)throw Error('Game canvas not visible');
  const x=box.x+box.width*.5,y=box.y+box.height*.5;
  await page.mouse.move(x,y);await page.mouse.down({button});
  try{await page.mouse.move(x+dx,y+dy,{steps:8});}finally{await page.mouse.up({button});}
  await page.waitForTimeout(100);
}
async function keyPulse(key,milliseconds) {
  await page.keyboard.down(key);
  try{await page.waitForTimeout(milliseconds);}finally{await page.keyboard.up(key);}
  await page.waitForTimeout(70);
}
async function enterPhoto(id) {
  await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});
  const place=page.locator(`[data-id="${id}"]`);await place.waitFor({state:'visible'});await place.click();
  await page.locator('#photo-view').click();await page.locator('#map-panel').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.performance.aerial);
  await page.waitForTimeout(650);
}
async function setNight(night) {
  const state=await read(),current=state.signage?.night;
  if(typeof current!=='boolean')throw Error('signage.night is unavailable; cannot verify the lighting toggle');
  if(current!==night)await page.keyboard.press('l');
  await page.waitForFunction(expected=>window.__SHENCHENGJI_CITY__.stats.signage?.night===expected,night);
  await page.waitForTimeout(550);
}
async function matchPose(name,targetFocus,targetPosition) {
  const focus=vector(targetFocus),position=vector(targetPosition);
  const dx=focus.x-position.x,dy=position.y-focus.y,dz=focus.z-position.z;
  const targetDistance=Math.hypot(dx,dy,dz),targetYaw=Math.atan2(dx,dz),targetPitch=Math.asin(dy/targetDistance);
  const corrections={name,target:{focus,position,distance:targetDistance,yaw:targetYaw,pitch:targetPitch},steps:[]};poseCorrections.push(corrections);
  // Orbit/zoom use the documented pointer scale, then feedback corrects any clamping/rounding.
  for(let i=0;i<12;i++) {
    const s=await observer(),yawError=angle(targetYaw-s.yaw),pitchError=targetPitch-s.pitch;
    if(Math.abs(yawError)<.001&&Math.abs(pitchError)<.001)break;
    const px=Math.max(-280,Math.min(280,-yawError/.0045)),py=Math.max(-180,Math.min(180,pitchError/.0035));
    await drag('right',px,py);corrections.steps.push({input:'right-drag',dx:px,dy:py});
  }
  for(let i=0;i<4;i++) {
    const s=await observer();if(Math.abs(s.distance-targetDistance)<.02)break;
    const wheel=Math.log(targetDistance/s.distance)/.0012;
    await page.mouse.wheel(0,wheel);await page.waitForTimeout(140);corrections.steps.push({input:'wheel',dy:wheel});
  }
  // Translation speed is distance-dependent. Bounded keyboard pulses close the world-space error.
  for(let i=0;i<80;i++) {
    const s=await observer(),ex=focus.x-s.focus.x,ey=focus.y-s.focus.y,ez=focus.z-s.focus.z;
    if(Math.hypot(ex,ey,ez)<.16)break;
    const forward=ex*Math.sin(s.yaw)+ez*Math.cos(s.yaw),right=ex*Math.cos(s.yaw)-ez*Math.sin(s.yaw);
    const axis=[{error:forward,positive:'w',negative:'s'},{error:right,positive:'d',negative:'a'},{error:ey,positive:'e',negative:'q'}].sort((a,b)=>Math.abs(b.error)-Math.abs(a.error))[0];
    const speed=Math.max(4,Math.min(90,s.distance*.13));
    const milliseconds=Math.max(15,Math.min(1100,Math.abs(axis.error)/speed*850));
    const key=axis.error>0?axis.positive:axis.negative;
    await keyPulse(key,milliseconds);corrections.steps.push({input:'key',key,milliseconds,remainingWorldUnits:Math.hypot(ex,ey,ez)});
  }
  const final=await observer(),focusError=distance(final.focus,focus),positionError=distance(final.position,position);
  corrections.final=final;corrections.focusErrorWorldUnits=focusError;corrections.positionErrorWorldUnits=positionError;
  if(focusError>.25||positionError>.35)throw Error(`${name}: UI solver did not reach target; focus error ${focusError.toFixed(3)}, camera error ${positionError.toFixed(3)}`);
  return {target:corrections.target,actual:final,focusErrorWorldUnits:focusError,positionErrorWorldUnits:positionError};
}
async function verifyControls() {
  phase='observer-controls';
  await check('Shift + left drag pans while held and stops after release',async()=>{
    const before=await observer(),box=await page.locator('#game').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.5;
    await page.mouse.move(x,y);await page.keyboard.down('Shift');await page.mouse.down({button:'left'});
    let held;
    try{await page.mouse.move(x+100,y+35,{steps:8});await page.waitForTimeout(120);held=await observer();}finally{await page.mouse.up({button:'left'});await page.keyboard.up('Shift');}
    await page.waitForTimeout(400);const released=await observer();
    await page.mouse.move(x-100,y-30,{steps:5});await page.waitForTimeout(250);const after=await observer();
    const moved=distance(before.focus,held.focus),releaseDrift=distance(held.position,released.position),hoverDrift=distance(released.position,after.position);
    if(moved<.5||distance(before.position,held.position)<.5)throw Error('Left drag did not translate both camera and focus');
    if(Math.abs(angle(held.yaw-before.yaw))>.002||Math.abs(held.pitch-before.pitch)>.002)throw Error('Left drag rotated instead of panning');
    if(releaseDrift>.03||hoverDrift>.03)throw Error('Camera kept moving after left-button release');
    return {before,held,released,after,movedWorldUnits:moved,releaseDriftWorldUnits:releaseDrift,hoverDriftWorldUnits:hoverDrift};
  });
  for(const key of ['ArrowRight','ArrowUp'])await check(`${key} turns view with camera position fixed`,async()=>{
    const before=await observer();await keyPulse(key,450);const after=await observer();
    const cameraShift=distance(before.position,after.position),focusShift=distance(before.focus,after.focus);
    if(cameraShift>.06)throw Error(`${key} moved camera by ${cameraShift.toFixed(3)} world units`);
    if(focusShift<.1||Math.abs(angle(after.yaw-before.yaw))+Math.abs(after.pitch-before.pitch)<.01)throw Error(`${key} did not turn the viewing direction`);
    return {before,after,cameraShiftWorldUnits:cameraShift,focusShiftWorldUnits:focusShift};
  });
  for(const button of ['left','right'])await check(`${button} drag orbits around fixed focus`,async()=>{
    const before=await observer();await drag(button,80,25);const after=await observer();
    const cameraShift=distance(before.position,after.position),focusShift=distance(before.focus,after.focus);
    if(cameraShift<.5||focusShift>.03)throw Error('Right drag did not orbit around an unchanged focus');
    return {before,after,cameraShiftWorldUnits:cameraShift,focusShiftWorldUnits:focusShift};
  });
}

try {
  browser=await chromium.launch({headless:!options.headed,executablePath:options.chrome,args:['--use-angle=metal']});
  page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});attachListeners(page);
  phase='load';await page.goto(options.url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
  await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.signage?.state!=='loading',null,{timeout:30000});
  await page.waitForTimeout(1500);report.browser=await browser.version();
  if(options.only==='all'||options.only==='opening') {
    phase='opening-day-night';await setNight(false);
    await capture('opening-dusk-hud');await capture('opening-dusk-no-hud',{hideHUD:true});
    await setNight(true);await capture('opening-night-hud');await capture('opening-night-no-hud',{hideHUD:true});
    await setNight(false);
  }
  if(options.only!=='opening') {
  phase='qijie-west-sign';await enterPhoto('qijie-gongguan');await setNight(false);
  // Supplied west-side camera, in current game-world coordinates.
  await check('Reach the specified Qijie west-side sign camera',()=>matchPose('qijie-west-sign',[146.9067401,3.84,1633.7079134],[132.2,5.8,1630.64]),{fatal:true});
  await page.waitForTimeout(700);
  const qijie=await read();
  await fs.writeFile(path.join(out,'qijie-signage.json'),JSON.stringify({observer:qijie.observer,signage:qijie.signage},null,2));
  await check('Qijie signage is ready and has its prepared placement',async()=>{
    if(qijie.signage?.state!=='ready'||qijie.signage.errors?.length)throw Error('Signage layer is not ready or reports errors');
    const placement=qijie.signage.placements?.find(p=>p.id==='qijie-entry-bilingual');
    if(!placement)throw Error('Qijie prepared sign placement is missing');
    return {placement,signageState:qijie.signage.state};
  });
  await capture('qijie-west-sign-hud');await capture('qijie-west-sign-no-hud',{hideHUD:true});
  console.log(JSON.stringify({qijieImage:path.join(out,'qijie-west-sign-no-hud.png'),signage:path.join(out,'qijie-signage.json')}));
  }
  if(options.only==='all') {
    await verifyControls();
    phase='tencent';await enterPhoto('tencent');await setNight(false);await capture('tencent-overview-dusk',{hideHUD:true});
    const tencent=(await read()).signage?.placements?.find(p=>p.id==='tencent-south-roof');
    if(tencent) {
      const p=vector(tencent.position),n=vector(tencent.surfaceNormal);
      await check('Reach Tencent sign from its outward normal',()=>matchPose('tencent-roof-sign',p,{x:p.x+n.x*45,y:p.y+6,z:p.z+n.z*45}));
    }
    await capture('tencent-sign-dusk',{hideHUD:true});await setNight(true);await capture('tencent-sign-night',{hideHUD:true});
    phase='car';await page.keyboard.press('g');await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.performance.aerial);
    await page.keyboard.press('v');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.photo==='car');
    await setNight(false);await capture('car-dusk',{hideHUD:true});await setNight(true);await capture('car-night',{hideHUD:true});
    await setNight(false);await page.keyboard.press('g');await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.performance.aerial);
    // Release the first renderer before opening the Retina context; never keep two GPU pages alive.
    report.primaryFinalState=await read();await hashResources();
    const previousContext=page.context();await page.close();await previousContext.close();
    phase='retina-load';
    const retinaContext=await browser.newContext({viewport:{width:1115,height:874},deviceScaleFactor:2});
    page=await retinaContext.newPage();attachListeners(page);
    await page.goto(options.url,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
    await page.waitForTimeout(2000);
    report.retina=await page.evaluate(()=>{
      const canvas=document.querySelector('#game'),rect=canvas.getBoundingClientRect(),budgetScale=Math.min(devicePixelRatio,1.5,Math.sqrt(1920*1080/(rect.width*rect.height)));
      return {cssSize:[rect.width,rect.height],devicePixelRatio,canvasSize:[canvas.width,canvas.height],internalRenderSize:window.__SHENCHENGJI_CITY__.performance.resolution,
        budgetScale,expectedCanvasSize:[Math.round(rect.width*budgetScale),Math.round(rect.height*budgetScale)],screenshotPhysicalSize:[innerWidth*devicePixelRatio,innerHeight*devicePixelRatio],
        note:'Fresh sequential context: CSS 1115x874 at DPR 2. Screenshot pixels and internal render pixels are recorded separately.'};
    });
    await check('Retina internal render follows the 1080p pixel budget',async()=>{
      const r=report.retina;
      if(r.canvasSize.some((value,index)=>Math.abs(value-r.expectedCanvasSize[index])>2))throw Error(`Unexpected Retina canvas ${r.canvasSize}; expected approximately ${r.expectedCanvasSize}`);
      if(r.internalRenderSize.some((value,index)=>value!==r.canvasSize[index]))throw Error('Retina engine and canvas dimensions disagree');
      return r;
    });
    phase='retina-opening';await capture('retina-opening-hud');await capture('retina-opening-no-hud',{hideHUD:true});
  }
}catch(error){errors.push({phase,source:'execution',message:String(error).slice(0,2000)});}
finally {
  try {
    if(page&&!page.isClosed()) {
      for(const key of ['w','a','s','d','q','e','Shift','ArrowRight','ArrowUp'])await page.keyboard.up(key).catch(()=>{});
      await page.mouse.up({button:'left'}).catch(()=>{});await page.mouse.up({button:'right'}).catch(()=>{});
      report.finalState=await read().catch(()=>null);
      await hashResources();
    }
    report.status=errors.length||checks.some(c=>c.status==='fail')?'fail':'pass';report.endedAt=new Date().toISOString();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({report:path.join(out,'report.json'),status:report.status,errors:errors.length,warnings:warnings.length,failedChecks:checks.filter(c=>c.status==='fail').map(c=>c.name),visualReview:'pending'},null,2));
    if(report.status==='fail')process.exitCode=1;
  }catch(error){console.error(`Visual report finalization failed: ${error}`);process.exitCode=1;}
  await browser?.close();
}
