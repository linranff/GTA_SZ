// Current-asset visual and interaction review; deliberately no FPS benchmark.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='output/playwright/civic-center';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],shots=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,observer:window.__SHENCHENGJI_CITY__.stats.observer,cinematic:window.__SHENCHENGJI_CITY__.stats.cinematic}));
async function shot(name){await page.waitForTimeout(700);await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function select(){await page.keyboard.press('m');await page.locator('#map-search').fill('市民中心');await page.locator('#places [data-id="civic"]').click();}
async function orbit(yaw,pitch,distance){
 const s=(await read()).observer,dx=Math.atan2(Math.sin(s.yaw-yaw),Math.cos(s.yaw-yaw))/.0045,dy=(pitch-s.pitch)/.0035;
 await page.mouse.move(960,540);await page.mouse.down();await page.mouse.move(960+dx,540+dy,{steps:20});await page.mouse.up();
 await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);await page.waitForTimeout(500);
}
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
 await shot('restored-sunset-spawn');
 await select();await page.locator('#photo-view').click();
 await page.keyboard.press('l');await page.keyboard.press('l');
 await orbit(Math.PI,.36,260);await shot('day-north');
 await orbit(0,.24,290);await shot('day-south');
 await orbit(.8,.65,300);await shot('day-aerial');
 await page.keyboard.press('l');await shot('sunset-aerial');
 await page.keyboard.press('l');await orbit(0,-.065,290);await shot('night-south');
 await orbit(Math.PI,.35,260);await shot('night-north');
 await select();await page.locator('#quick-travel').click();await page.waitForTimeout(400);
 const before=(await read()).state;
 await page.keyboard.down('w');await page.waitForTimeout(950);await page.keyboard.up('w');
 const after=(await read()).state;
 if(Math.hypot(after.x-before.x,after.z-before.z)<.2)errors.push('Civic arrival cannot drive away');
 await shot('road-arrival');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`});}
finally{await browser.close();}
const bytes=await fs.readFile('public/city/landmark-detail.glb');
await fs.writeFile(`${out}/report.json`,JSON.stringify({assetSha256:createHash('sha256').update(bytes).digest('hex'),errors,shots},null,2)+'\n');
if(errors.length)throw Error(errors.join('\n'));
