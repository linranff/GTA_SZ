/** Current car screenshots through V/L and ordinary mouse orbiting only.
 * Usage: node scripts/check-city-sport-details.mjs [url] [out]
 * Also accepts --url URL --out DIRECTORY. No scene state or assets are changed.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const options={url:'http://127.0.0.1:5173/',out:'output/playwright/city-sport-details'};
let positional=0;
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i];
 if(arg==='--help'){
  console.log('Usage: node scripts/check-city-sport-details.mjs [url] [out]\n       node scripts/check-city-sport-details.mjs --url URL --out DIRECTORY');
  process.exit(0);
 }
 if(arg==='--url'||arg==='--out'){
  const value=process.argv[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+arg);
  options[arg.slice(2)]=value;
 }else if(arg.startsWith('--'))throw Error('Unknown option: '+arg);
 else if(positional<2)options[positional++===0?'url':'out']=arg;
 else throw Error('Too many positional arguments');
}
const out=path.resolve(options.out),errors=[],shots=[],timings=[];
await fs.mkdir(out,{recursive:true});
let browser=null,page=null;
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const readRig=()=>page.evaluate(()=>{
 const app=window.__SHENCHENGJI_CITY__,s=app.stats;
 return {state:app.state,observer:s.observer,camera:s.camera,mode:s.lightMode,photo:s.photo};
});
const read=()=>page.evaluate(()=>{
 const app=window.__SHENCHENGJI_CITY__;
 return {state:app.state,stats:app.stats,performance:app.performance};
});

async function setMode(value){
 for(let i=0;i<4;i++){
  if((await readRig()).mode===value){await page.waitForTimeout(700);return;}
  await page.keyboard.press('l');await page.waitForTimeout(500);
 }
 throw Error('Light mode did not reach '+value);
}
async function inspection(active){
 if(Boolean((await readRig()).observer.active)!==active)await page.keyboard.press('v');
 await page.waitForFunction(expected=>{
  const s=window.__SHENCHENGJI_CITY__.stats;
  return s.observer.active===expected&&(!expected||s.photo==='car');
 },active,{timeout:10000});
 await page.waitForTimeout(700);
}
async function orbit(relativeYaw,pitch){
 let rig=await readRig();
 if(!rig.observer.active||rig.photo!=='car')throw Error('Vehicle inspection must be active before orbiting');
 const yaw=rig.state.yaw+relativeYaw;
 for(let i=0;i<16;i++){
  rig=await readRig();const yawError=angle(yaw-rig.observer.yaw),pitchError=pitch-rig.observer.pitch;
  if(Math.abs(yawError)<.002&&Math.abs(pitchError)<.002)break;
  const box=await page.locator('#game').boundingBox();if(!box)throw Error('Game canvas is not visible');
  const x=box.x+box.width*.5,y=box.y+box.height*.5;
  const dx=Math.max(-260,Math.min(260,-yawError/.0045)),dy=Math.max(-150,Math.min(150,pitchError/.0035));
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});
  try{await page.mouse.move(x+dx,y+dy,{steps:8});}finally{await page.mouse.up({button:'right'});}
  await page.waitForTimeout(100);
 }
 rig=await readRig();
 if(Math.abs(angle(yaw-rig.observer.yaw))>.012||Math.abs(pitch-rig.observer.pitch)>.012)throw Error('Vehicle orbit did not reach the requested angle');
 return {relativeYaw,pitch,yaw};
}
async function capture(name,expectedFeatures,view=null){
 await page.waitForTimeout(1200);
 const hidden=await page.addStyleTag({content:'#ui,#ui *{visibility:hidden !important}'});
 const file=path.join(out,name+'.png');
 try{await page.screenshot({path:file});}finally{await hidden.evaluate(element=>element.remove());}
 const snapshot=await read(),camera=snapshot.stats.camera.position,state=snapshot.state;
 const dx=camera[0]-state.x,dz=camera[2]-state.z,distance=Math.hypot(dx,dz);
 const eyeSide=distance?(dx*Math.sin(state.yaw)+dz*Math.cos(state.yaw))/distance:0;
 // The car's local +Z is its nose. Record and verify the actual camera side,
 // rather than inferring a front/rear view from the screenshot filename.
 if(view?.side==='front'&&eyeSide<.35)throw Error(name+': camera is not in front of the car');
 if(view?.side==='rear'&&eyeSide>-.35)throw Error(name+': camera is not behind the car');
 shots.push({name,file,expectedFeatures,requestedView:view,eyeForwardDot:eyeSide,...snapshot});
 console.log('CAPTURE '+name+' '+file);
}
async function measure(name){
 await page.waitForTimeout(1800);
 // Diagnostic reads only: keep the application's cumulative performance
 // history intact, and sample a separate local requestAnimationFrame window.
 const sample=await page.evaluate(async duration=>{
  const start=performance.now(),first=window.__SHENCHENGJI_CITY__.performance.renderFrames,frames=[];
  let previous=start;
  await new Promise(resolve=>{
   function frame(now){frames.push(now-previous);previous=now;if(now-start>=duration)resolve();else requestAnimationFrame(frame);}
   requestAnimationFrame(frame);
  });
  const end=performance.now(),rendered=window.__SHENCHENGJI_CITY__.performance.renderFrames-first;
  const sorted=frames.slice(1).sort((a,b)=>a-b),pct=p=>sorted[Math.floor((sorted.length-1)*p)]??0;
  return {elapsedMs:end-start,renderedFrames:rendered,measuredFps:rendered*1000/(end-start),animationFrameIntervals:{samples:sorted.length,p50:pct(.5),p95:pct(.95),p99:pct(.99),over50ms:sorted.filter(value=>value>50).length}};
 },8000);
 const snapshot=await read();timings.push({name,...sample,...snapshot});
 console.log('PERFORMANCE '+JSON.stringify({name,...sample,gpuMs:snapshot.performance.gpuMs,drawCalls:snapshot.performance.drawCalls}));
}

try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
 page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
 page.on('requestfailed',request=>errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText??'request failed'}`));
 await page.goto(options.url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 for(const mode of ['day','night']){
  await setMode(mode);await inspection(true);
  const front=await orbit(Math.PI+.62,.17);
  await capture(mode+'-front-three-quarter',['headlamp shape and light output','front bodywork and wheels'],{...front,side:'front'});
  if(mode==='day')await measure(mode+'-front-three-quarter');
  const rear=await orbit(-.62,.15);
  await capture(mode+'-rear-three-quarter',['rear wing profile and mounts','two exhaust outlets on each side','rear lamp shape'],{...rear,side:'rear'});
  const straight=await orbit(0,.11);
  await capture(mode+'-rear-straight',['all four exhaust outlets','rear wing symmetry and clearance','rear lamps and plate'],{...straight,side:'rear'});
  await inspection(false);
  await capture(mode+'-driving-rear',['rear wing in the normal chase camera','rear lamps and exhaust visibility'],{side:'rear'});
  if(mode==='night')await measure(mode+'-driving-rear');
 }
}catch(error){
 errors.push(String(error));
 if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
}finally{
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({
  url:options.url,createdAt:new Date().toISOString(),errors:[...new Set(errors)],shots,timings,
  scope:'Chrome / ANGLE Metal, 1920x1080. Scene controls use V, L and mouse orbit only; diagnostics are read-only. Two independent 8-second performance samples.',
  visualReview:{status:'pending',requirement:'Inspect the actual PNGs to confirm the rear wing, four exhaust outlets and headlamps. Successful capture or telemetry alone does not establish visual acceptance.'},
 },null,2)+'\n');
 if(browser)await browser.close();
}
if(errors.length)throw Error([...new Set(errors)].join('\n'));
