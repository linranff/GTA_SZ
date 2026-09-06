/** Browser interaction regression: genuine presses/picking, persistence, and safe travel. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/water-beacons/interaction';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],checks=[],shots=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {beacons:a.stats.observerBeacons,observer:a.stats.observer,state:a.state,mode:a.stats.lightMode,performance:a.performance};});
const ready=()=>page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
const selected=()=>page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.observerBeacons.selected!==null,null,{timeout:5000});
async function hold(x,y,ms=900,button='left'){await page.mouse.move(x,y);await page.mouse.down({button});await page.waitForTimeout(ms);await page.mouse.up({button});await page.waitForTimeout(150);}
async function aim(yaw,pitch){for(let i=0;i<12;i++){const o=(await read()).observer,a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}await page.waitForTimeout(800);}
async function shot(name){if(name==='night-beacon'||name==='saved-beacon-after-refresh'){await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(4500);}await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await ready();const initial=await read();
 await hold(960,650);assert.equal((await read()).beacons.selected,null);checks.push('driving hold does not mark');
 await page.keyboard.press('g');await page.waitForTimeout(800);
 await hold(960,650,150);assert.equal((await read()).beacons.selected,null);
 const o=(await read()).observer;await page.mouse.move(960,540);await page.mouse.down();await page.mouse.move(1000,560,{steps:5});await page.waitForTimeout(750);await page.mouse.up();
 assert.equal((await read()).beacons.selected,null);assert.ok(Math.abs((await read()).observer.yaw-o.yaw)>.1);checks.push('short click and orbit do not mark');
 const f=(await read()).observer.focus;await page.keyboard.down('Shift');await page.mouse.move(900,500);await page.mouse.down();await page.mouse.move(960,540,{steps:5});await page.waitForTimeout(700);await page.mouse.up();await page.keyboard.up('Shift');
 assert.equal((await read()).beacons.selected,null);assert.ok(Math.hypot((await read()).observer.focus.x-f.x,(await read()).observer.focus.z-f.z)>10);checks.push('Shift drag still pans');
 await hold(960,650,850,'right');assert.equal((await read()).beacons.selected,null);
 await page.mouse.move(960,650);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.wheel(0,30);await page.waitForTimeout(700);await page.mouse.up();assert.equal((await read()).beacons.selected,null);checks.push('right hold and wheel do not mark');
 await page.mouse.move(960,650);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.down({button:'right'});await page.waitForTimeout(750);await page.mouse.up();await page.mouse.up({button:'right'});assert.equal((await read()).beacons.selected,null);checks.push('mixed mouse buttons cancel hold');
 await page.keyboard.down('w');await hold(960,650);await page.keyboard.up('w');assert.equal((await read()).beacons.selected,null);checks.push('moving camera cancels hold');
 await page.keyboard.press('g');await page.keyboard.press('g');await page.waitForTimeout(700);await aim(1.84,.35);
 for(const [x,y] of [[960,720],[1060,760],[880,500],[680,420]]){await hold(x,y);if((await read()).beacons.selected?.arrival)break;await page.keyboard.press('Escape');}
 await selected();const pick=(await read()).beacons.selected;assert.ok(pick.arrival,'must select a real road-supported point');
 assert.equal((await read()).state.distance,initial.state.distance);assert.equal((await read()).state.x,initial.state.x);checks.push('long hold picks rendered surface without moving car');
 await page.locator('.observer-beacon-name').fill('');await page.locator('.observer-beacon-name').pressSequentially('海湾夜航 · gWSE 日本語');await page.locator('.observer-beacon-save').click();
 assert.equal((await read()).beacons.favorites.length,1);assert.equal((await read()).beacons.favorites[0].name,'海湾夜航 · gWSE 日本語');
 await page.keyboard.press('l');await page.waitForTimeout(500);assert.equal((await read()).mode,'night');await shot('night-beacon');
 await page.keyboard.press('Escape');assert.equal((await read()).beacons.selected,null);assert.ok((await read()).observer.active);checks.push('Escape closes beacon before exiting drone');
 await page.locator('.observer-beacons-toggle').click();await page.locator('.observer-beacon-place').click();await page.waitForTimeout(600);await selected();
 const recalled=await read();assert.ok(Math.abs(recalled.observer.focus.x-pick.x)<.01);assert.ok(Math.abs(recalled.observer.focus.z-pick.z)<.01);checks.push('favorite recalls viewpoint');
 await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal((await read()).beacons.favorites.length,1);
 await page.keyboard.press('g');await page.waitForTimeout(700);await page.locator('.observer-beacons-toggle').click();await page.locator('.observer-beacon-place').click();await selected();await page.waitForTimeout(900);await page.keyboard.press('l');await page.keyboard.press('l');await page.waitForTimeout(600);assert.equal((await read()).mode,'day');await shot('saved-beacon-after-refresh');checks.push('favorites persist across reload');
 const destination=(await read()).beacons.selected;await page.locator('.observer-beacon-travel').click();await page.waitForTimeout(900);const arrived=await read();
 assert.equal(arrived.observer.active,false);assert.equal(arrived.state.speed,0);assert.ok(Math.hypot(arrived.state.x-destination.arrival[0],arrived.state.z-destination.arrival[1])<.1);assert.equal(arrived.state.distance,0);assert.ok(arrived.state.height>-.2);await shot('arrived-on-road');checks.push('travel lands stopped on nearby road, without adding driven distance');
 await page.reload({waitUntil:'domcontentloaded'});await ready();await page.keyboard.press('g');await page.waitForTimeout(700);await aim(1.84,.35);await hold(1340,400);await selected();
 assert.equal((await read()).beacons.selected.arrival,undefined);assert.ok(await page.locator('.observer-beacon-travel').isDisabled());await shot('water-bookmark-only');checks.push('water can be bookmarked but cannot receive car');
 await page.keyboard.press('Escape');await aim(1.84,-.35);await hold(960,200);assert.equal((await read()).beacons.selected,null);checks.push('sky cannot be marked');
 await page.locator('.observer-beacons-toggle').click();await page.locator('.observer-beacon-remove').click();assert.equal((await read()).beacons.favorites.length,0);checks.push('favorites can be removed');
 await page.keyboard.press('Escape');await aim(1.84,.35);
 const touch=await page.context().newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:960,y:720,id:1}]});await page.waitForTimeout(900);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await selected();checks.push('single-finger hold selects a point');await page.keyboard.press('Escape');
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:960,y:720,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:995,y:740,id:1}]});await page.waitForTimeout(750);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await read()).beacons.selected,null);checks.push('touch drag cancels hold');
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:960,y:720,id:1}]});await page.waitForTimeout(100);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:960,y:720,id:1},{x:1040,y:720,id:2}]});await page.waitForTimeout(750);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await read()).beacons.selected,null);checks.push('multiple touches cancel hold');await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
 await page.keyboard.press('g');await page.keyboard.press('v');await page.waitForTimeout(700);await hold(960,650);assert.equal((await read()).beacons.selected,null);assert.equal((await read()).beacons.active,false);checks.push('vehicle inspection does not mark');
}catch(error){errors.push(String(error));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({url,createdAt:new Date().toISOString(),errors,checks,shots},null,2));await browser.close();console.log(JSON.stringify({errors,checks}));}
if(errors.length)throw Error(errors.join('\n'));
