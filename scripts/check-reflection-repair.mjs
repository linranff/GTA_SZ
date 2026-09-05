import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]??'output/playwright/reflection-repair');await fs.mkdir(out,{recursive:true});
const errors=[],shots=[],checks=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});page.setDefaultTimeout(20000);
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|shader.{0,40}error|feedback loop/i.test(m.text()))errors.push(m.text().slice(0,1800));});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,stats:window.__SHENCHENGJI_CITY__.stats,performance:window.__SHENCHENGJI_CITY__.performance}));
const pose=()=>page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.observer);
const shot=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});shots.push({name,file,...await read()});};
async function drag(dx,dy,shift=false){await page.mouse.move(950,530);if(shift)await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(950+dx,530+dy,{steps:12});await page.mouse.up();if(shift)await page.keyboard.up('Shift');await page.waitForTimeout(180);}
async function pointAt(yaw,pitch){for(let n=0;n<8;n++){const o=await pose(),dyaw=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),dp=pitch-o.pitch;if(Math.abs(dyaw)+Math.abs(dp)<.015)return;await drag(-dyaw/.0045,dp/.0035);}}
async function place(search,id,action){await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await page.locator('#map-search').fill(search);await page.locator(`#places [data-id="${id}"]`).click();await page.locator(action).click();await page.waitForTimeout(1800);}
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});await page.waitForTimeout(2500);
 const initial=await read();if(initial.stats.buildingSigns?.state!=='ready'||initial.stats.rainPuddles?.status!=='ready')throw Error('Signs or rain layout did not load');checks.push({name:'New signs and offline rain layout loaded',pass:true,signs:initial.stats.buildingSigns.totalPlaced,rainFraction:initial.stats.rainPuddles.coverageEvidence?.fraction});await shot('01-dusk-driving');await page.keyboard.press('v');await page.waitForTimeout(800);await shot('02-indigo-car-dusk');await drag(160,0);await shot('03-car-highlight-angle');await page.keyboard.press('l');await page.waitForTimeout(1200);await shot('04-indigo-car-night');
 await page.keyboard.press('g');await page.keyboard.press('g');await pointAt(Math.atan2(.72,-.5),-Math.asin(.48/Math.hypot(.72,.48,.5)));await page.waitForTimeout(700);await shot('05-moon-stars');
 await page.keyboard.press('l');await place('腾讯','tencent','#photo-view');await shot('06-tencent-glass-day');await drag(130,0);await shot('07-tencent-reflection-angle');await page.keyboard.press('l');await page.waitForTimeout(900);await shot('08-tencent-glass-night');
 await page.keyboard.press('l');await page.mouse.move(930,530);await page.mouse.wheel(4000,4000);await pointAt(.2,.72);await page.keyboard.down('e');await page.keyboard.down('Shift');await page.waitForTimeout(2200);await page.keyboard.up('e');await page.keyboard.up('Shift');await page.waitForTimeout(900);await shot('09-high-aerial-edge');
 await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await shot('10-local-blue-map');await page.locator('[data-map-command="all"]').click();await shot('11-entire-city-map');
 checks.push({name:'Sky radiance loaded independently of display',pass:(await read()).stats.cinematic.status==='ready'});
}catch(e){errors.push(String(e));}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({errors,checks,shots,pass:!errors.length,visualReview:'pending',note:'UI input only. Not a sustained performance test.'},null,2));await browser.close();}
console.log(JSON.stringify({out,errors,checks,shots:shots.map(s=>s.name)}));if(errors.length)process.exitCode=1;
