import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/character-gaits';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}}});
const page=await context.newPage(),errors=[],checks=[];
const check=(name,pass,data)=>{checks.push({name,pass,data});console.log(JSON.stringify(checks.at(-1)));if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/src/main.ts*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+'window.__GAIT_WORLD__=world;')});});
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});
 await page.evaluate(()=>window.__GAIT_WORLD__.setLightMode('day'));
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__GAIT_WORLD__.walk.active&&window.__GAIT_WORLD__.rider,null,{timeout:90000});
 await page.evaluate(()=>{
  const w=window.__GAIT_WORLD__;window.__GAIT_SAMPLES__=[];
  w.scene.onBeforeRenderObservable.add(()=>{if(!w.walk.active||!w.rider.meshes[0].isEnabled())return;const {x,z,yaw}=w.walk,y=w.groundHeight(x,z);w.camera.position.set(x+Math.cos(yaw)*3.5-Math.sin(yaw)*.7,y+1.0,z-Math.sin(yaw)*3.5-Math.cos(yaw)*.7);w.camera.setTarget(w.camera.position.clone().set(x,y+.85,z));});
  w.scene.onAfterRenderObservable.add(()=>{
   if(!w.walk.active||w.walk.speed<1)return;
   const skeleton=w.rider.meshes.find(m=>m.skeleton)?.skeleton;if(!skeleton)return;
   const point=n=>{const t=skeleton.bones.find(b=>b.name===n).getTransformNode();t.computeWorldMatrix(true);return t.getAbsolutePosition();};
   const flex=['L','R'].map(side=>{const h=point('thigh_'+side),k=point('calf_'+side),a=point('foot_'+side),u=k.subtract(h).normalize(),v=a.subtract(k).normalize();return Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y+u.z*v.z)))*180/Math.PI;});
   const groups=w.scene.animationGroups.filter(a=>a.name.startsWith('Rider_')).map(a=>({name:a.name,phase:(a.getCurrentFrame()-a.from)/(a.to-a.from),weight:a.animatables[0]?.weight}));
   window.__GAIT_SAMPLES__.push({speed:w.walk.speed,flex,groups});
  });
 });
 for(const mode of ['walk','run']){
  if(mode==='run')await page.keyboard.down('Shift');
  await page.keyboard.down('w');await page.waitForTimeout(600);await page.evaluate(()=>{window.__GAIT_SAMPLES__=[];});
  await page.waitForTimeout(2400);await page.screenshot({path:`${out}/rider-${mode}.png`});
  const samples=await page.evaluate(()=>window.__GAIT_SAMPLES__);
  await page.keyboard.up('w');await page.keyboard.up('Shift');
  const flex=samples.flatMap(s=>s.flex),data={frames:samples.length,min:Math.min(...flex),max:Math.max(...flex),speed:samples.at(-1)?.speed};
  check(`${mode}: actual game knees flex and support leg extends`,samples.length>20&&data.max>(mode==='run'?80:45)&&data.min<27,data);
  const mismatch=samples.filter(s=>{const a=s.groups.find(g=>g.name==='Rider_Walk'),b=s.groups.find(g=>g.name==='Rider_Run');if(!a||!b||a.weight<.01||b.weight<.01)return false;const d=Math.abs(a.phase-b.phase);return Math.min(d,1-d)>.025;});
  check(`${mode}: walking and running keep the same contact phase`,mismatch.length===0,{mismatch:mismatch.slice(0,3)});
  await page.waitForTimeout(600);
 }
 await page.evaluate(async()=>{const w=window.__GAIT_WORLD__;await w.bambooCafe.enter(w);});await page.waitForTimeout(9500);
 const activity=await page.evaluate(()=>window.__GAIT_WORLD__.bambooCafe.stats.characters.activity);
 check('cafe still patrols with the new clips',activity.some(a=>a.walk>.7&&a.speed>.3),activity);
 await page.evaluate(()=>{
  const w=window.__GAIT_WORLD__;window.__CAFE_FLEX__=[];
  w.scene.onBeforeRenderObservable.add(()=>{const c=w.bambooCafe,p=c.stats.staff.find(s=>s.id==='zhixia').position;w.camera.position.set(p.x+3.3,p.y+1.1,p.z-.6);w.camera.setTarget(w.camera.position.clone().set(p.x,p.y+.9,p.z));});
  w.scene.onAfterRenderObservable.add(()=>{
   const activity=w.bambooCafe.stats.characters.activity.find(a=>a.id==='zhixia');if(activity.walk<.9)return;
   const mesh=w.scene.meshes.find(m=>m.name==='staff_user_zhixia_maid'),s=mesh.skeleton;
   const point=name=>{const n=s.bones.find(b=>b.name===name).getTransformNode();n.computeWorldMatrix(true);return n.getAbsolutePosition();};
   for(const side of ['L','R']){const h=point('thigh_'+side),k=point('shin_'+side),a=point('foot_'+side),u=k.subtract(h).normalize(),v=a.subtract(k).normalize();window.__CAFE_FLEX__.push(Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y+u.z*v.z)))*180/Math.PI);}
  });
 });
 await page.waitForTimeout(2600);await page.screenshot({path:`${out}/cafe-walking.png`});
 const cafeFlex=await page.evaluate(()=>window.__CAFE_FLEX__);
 check('maid knee articulation survives game animation blending',cafeFlex.length>30&&Math.max(...cafeFlex)>45&&Math.min(...cafeFlex)<27,{samples:cafeFlex.length,min:Math.min(...cafeFlex),max:Math.max(...cafeFlex)});
}catch(e){errors.push(String(e));console.error(e);}
finally{await context.close();await browser.close();await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors},null,2));}
if(errors.length)process.exitCode=1;
