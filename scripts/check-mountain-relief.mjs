import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {observerUI} from './grassland-observer-ui.mjs';
const out=process.argv[2]??'output/playwright/mountain-relief';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),ui=observerUI(page),errors=[],shots=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {mountains:a.stats.mountains,groundRelief:a.stats.groundRelief,characterFeature:'playerCharacter' in a.stats,observer:a.stats.observer,performance:a.performance};});
async function shot(name){await page.waitForTimeout(1300);await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function pose(focus,position){try{await ui.pose(focus,position);}catch(e){const actual=(await read()).observer.position;if(Math.hypot(actual.x-position.x,actual.y-position.y,actual.z-position.z)>1.2)throw e;}}
async function aim(yaw,pitch,distance){for(let i=0;i<12;i++){const o=(await read()).observer,a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}const o=(await read()).observer;await page.mouse.wheel(0,Math.log(distance/o.distance)/.0012);}
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});await page.keyboard.press('l');await page.keyboard.press('l');
 const initial=await read();assert.equal(initial.characterFeature,false);assert.equal(initial.groundRelief.geometryEnabled,false);assert.equal(initial.groundRelief.triangles,0);assert.ok(initial.mountains.triangles>150000);
 await ui.enter('lianhua');await aim(0,.24,1800);await shot('day-northern-ridges');
 await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(6000);await fs.writeFile(`${out}/performance.json`,JSON.stringify(await read(),null,2));
 await pose({x:3456,y:60,z:2076},{x:3500,y:210,z:1700});await shot('day-bijia');
 await aim(0,.18,700);await shot('day-bijia-north');
 await ui.enter('xiangmi');await aim(0,.3,1800);await pose({x:-2088,y:60,z:1104},{x:-2240,y:220,z:700});await shot('day-antuo');
 await aim(0,.3,1000);await pose({x:-2760,y:25,z:600},{x:-2860,y:135,z:360});await shot('day-yanhan');
 await page.keyboard.press('l');await shot('sunset-hills');await page.keyboard.press('l');await shot('night-hills');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({errors,shots,scope:'Current terrain; 1080p Chrome Metal, normal UI movement and 6-second stationary northern panorama.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
