import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/local-characters';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
let rejectPlayer=true,rejectCafe=true,playerLoads=0;
await page.route('**/__local-characters/kuki.glb',route=>{playerLoads++;return rejectPlayer?route.fulfill({status:503,body:'Injected model failure'}):route.continue();});
await page.route('**/__local-characters/yelan.glb',route=>rejectCafe?route.fulfill({status:503,body:'Injected cafe failure'}):route.continue());
const check=(name,pass,data)=>{checks.push({name,pass,data});console.log(JSON.stringify(checks.at(-1)));if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&/character|local_|rider|cafe|GLTF/.test(m.text()))console.log('CONSOLE',m.text());});
try{
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});
 await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.world.riderLoading);
 check('city is usable when model download fails',await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return w.ready&&!w.rider&&w.controlMode==='car';}));
 await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
 check('failed character does not disable driving',await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.state.speed>0));
 await page.evaluate(()=>{window.__SHENCHENGJI_CITY__.world.state.speed=0;});
 check('failed load offers visible retry',await page.locator('#character-loading button').isVisible());
 rejectPlayer=false;await page.locator('#character-loading button').click();
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.rider,null,{timeout:100000});
 console.log('CITY_READY');
 await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;w.setLightMode('day');w.state.speed=0;});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.walk.active);
 const first=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return {mode:w.controlMode,name:w.rider.name,meshes:w.rider.meshes.length,bones:w.rider.meshes.find(m=>m.skeleton)?.skeleton.bones.length,textures:[...new Set(w.rider.meshes.flatMap(m=>m.material?.getActiveTextures().map(t=>({name:t.name,ready:t.isReady()}))??[]))]};});
 check('Kuki is controlled, textured and rigged',first.mode==='walking'&&first.name==='久岐忍'&&first.textures.every(t=>t.ready),first);
 await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;window.__localView='front';window.__localSamples=[];w.scene.onBeforeRenderObservable.add(()=>{
  if(!window.__localView)return;const p=w.walk,cam=w.camera,side=window.__localView==='side';const yaw=p.yaw;cam.position.set(p.x+Math.sin(yaw+(side?Math.PI/2:0))*2.5,w.walkingSurfaceHeight(p.x,p.z)+1.03,p.z+Math.cos(yaw+(side?Math.PI/2:0))*2.5);cam.setTarget(cam.position.clone().set(p.x,w.walkingSurfaceHeight(p.x,p.z)+.9,p.z));
 });w.scene.onAfterRenderObservable.add(()=>{if(!w.walk.active||w.walk.speed<.1)return;const sk=w.rider.meshes.find(m=>m.skeleton)?.skeleton;if(!sk)return;const point=n=>{const t=sk.bones.find(b=>b.name===n).getTransformNode();t.computeWorldMatrix(true);return t.getAbsolutePosition();};const flex=['L','R'].map(s=>{const a=point('thigh_'+s),b=point('calf_'+s),c=point('foot_'+s),u=b.subtract(a).normalize(),v=c.subtract(b).normalize();return Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y+u.z*v.z)))*180/Math.PI;});const sample={speed:w.walk.speed,flex};
 if(window.__localSamples.length%12===0){let min=Infinity;for(const mesh of w.rider.meshes){const a=mesh.getPositionData(true,true),m=mesh.computeWorldMatrix(true).m;if(!a)continue;for(let i=0;i<a.length;i+=3){const y=a[i]*m[1]+a[i+1]*m[5]+a[i+2]*m[9]+m[13];min=Math.min(min,y);}}sample.sole=min-w.walkingSurfaceHeight(w.walk.x,w.walk.z);}
 window.__localSamples.push(sample);});});
 await page.waitForTimeout(1000);await page.screenshot({path:out+'/01-kuki-front.png'});
 for(const mode of ['walk','run']){
  await page.evaluate(()=>{window.__localView='side';window.__localSamples=[];});
  if(mode==='run')await page.keyboard.down('Shift');await page.keyboard.down('w');await page.waitForTimeout(2300);await page.screenshot({path:out+'/02-kuki-'+mode+'.png'});await page.keyboard.up('w');await page.keyboard.up('Shift');
  const samples=await page.evaluate(()=>window.__localSamples),flex=samples.flatMap(s=>s.flex);
  const soles=samples.filter(s=>s.sole!==undefined).map(s=>s.sole);check(mode+' feet maintain contact, no ground penetration',soles.length>4&&Math.min(...soles)>-.07&&Math.min(...soles)<.12,{min:Math.min(...soles),max:Math.max(...soles),soles});
  check(mode+' actual knee articulation',samples.length>15&&Math.max(...flex)>(mode==='run'?70:40)&&Math.min(...flex)<30,{frames:samples.length,min:Math.min(...flex),max:Math.max(...flex),speed:samples.at(-1)?.speed});
 }
 await page.evaluate(()=>{window.__localView=null;});
 const cameraBefore=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.walk.cameraDistance);await page.mouse.move(720,600);await page.mouse.wheel(0,-350);await page.waitForTimeout(150);
 check('wheel zooms third-person camera',await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.walk.cameraDistance)<cameraBefore);
 check('map actor follows walker, not parked car',await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return w.actor.x===w.walk.x&&w.actor.z===w.walk.z&&Math.hypot(w.actor.x-w.state.x,w.actor.z-w.state.z)>3;}));
 await page.screenshot({path:out+'/03-third-person.png'});
 await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;w.resetRoad();});
 await page.keyboard.press('t');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.tank?.active,null,{timeout:90000});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.walk.active);
 const before=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return {state:{...w.state},tank:w.tank.stats};});
 await page.keyboard.press('Space');await page.waitForTimeout(200);const after=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.tank.stats);
 check('walking cannot fire parked tank',after.shots===before.tank.shots,{before:before.tank,after});
 await page.keyboard.press('f');await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.world.walk.active);
 check('tank entry hides player',await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return w.controlMode==='tank'&&w.rider.meshes.every(m=>!m.isEnabled());}));
 const beforeLoops=await page.evaluate(()=>{const s=window.__SHENCHENGJI_CITY__.world.scene;return {meshes:s.meshes.filter(m=>m.name.includes('kuki')).length,skeletons:s.skeletons.length,groups:s.animationGroups.filter(g=>g.name.startsWith('Rider')).length};}),loadsBefore=playerLoads;
 for(let i=0;i<8;i++){await page.keyboard.press('f');await page.waitForTimeout(50);await page.keyboard.press('f');await page.waitForTimeout(50);}
 const afterLoops=await page.evaluate(()=>{const s=window.__SHENCHENGJI_CITY__.world.scene;return {meshes:s.meshes.filter(m=>m.name.includes('kuki')).length,skeletons:s.skeletons.length,groups:s.animationGroups.filter(g=>g.name.startsWith('Rider')).length};});
 check('16 switches reuse avatar and animation resources',JSON.stringify(beforeLoops)===JSON.stringify(afterLoops)&&loadsBefore===playerLoads,{beforeLoops,afterLoops,playerLoads});
 await page.keyboard.press('Space');await page.waitForTimeout(500);check('tank cannon still works',await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.tank.stats.shots)>after.shots);
 await page.evaluate(async()=>{const w=window.__SHENCHENGJI_CITY__.world;await w.toggleTank();await w.bambooCafe.enter(w);});
 check('cafe download failure retains original visible staff',await page.evaluate(()=>{const c=window.__SHENCHENGJI_CITY__.world.bambooCafe.stats;return !c.characters.loaded&&!!c.characters.error&&c.visibleInteriorMeshes>0;}));
 rejectCafe=false;await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.bambooCafe.retryCharacters());
 await page.waitForTimeout(3000);
 const cafe=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.bambooCafe.stats.characters);
 check('two Yelans have separate skeletons; JK preserved',cafe.assignments.zhixia==='yelan'&&cafe.assignments.wangshu==='yelan'&&cafe.assignments.xiaolan==='jk'&&cafe.animation.independentSkeletons===3,{assignments:cafe.assignments,animation:cafe.animation,proportions:cafe.proportions});
 await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;w.scene.onBeforeRenderObservable.add(()=>{const c=w.bambooCafe.stats.staff.find(s=>s.id==='zhixia'),m=w.scene.getTransformNodeByName('staff_zhixia'),p=m.getAbsolutePosition();w.camera.position.set(p.x+1.4,p.y+.9,p.z-2.4);w.camera.setTarget(p.add(w.camera.position.clone().set(0,.9,0)));});});
 await page.waitForTimeout(1500);await page.screenshot({path:out+'/04-yelan-cafe.png'});
 await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world,p=w.scene.getTransformNodeByName('staff_zhixia').getAbsolutePosition();w.walk.x=p.x+1.5;w.walk.z=p.z;});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.bambooCafe.stats.characters.activity.find(a=>a.id==='zhixia').wave>.8,null,{timeout:10000});
 await page.waitForTimeout(350);await page.screenshot({path:out+'/05-yelan-wave.png'});
 check('Yelan raises hand in a proximity greeting',await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world,s=w.scene.meshes.find(m=>m.name==='staff_user_zhixia_yelan'&&m.skeleton).skeleton;const p=n=>s.bones.find(b=>b.name===n).getTransformNode().getAbsolutePosition();return p('hand_R').y>p('upper_arm_R').y+.08;}));
 check('no uncaught browser errors',errors.length===0,errors);
}catch(e){console.error(e);errors.push(String(e));try{await page.screenshot({path:out+'/failure.png'});}catch{}}
finally{await browser.close();await fs.writeFile(out+'/report.json',JSON.stringify({checks,errors},null,2));}
if(errors.length)process.exitCode=1;
