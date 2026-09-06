import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/restored-photographic-sunset',errors=[],shots=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>({camera:window.__SHENCHENGJI_CITY__.stats.camera,observer:window.__SHENCHENGJI_CITY__.stats.observer,cinematic:window.__SHENCHENGJI_CITY__.stats.cinematic}));
async function capture(name){await page.waitForTimeout(900);await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function orbit(yaw,pitch,distance){
 const s=(await read()).observer,dx=Math.atan2(Math.sin(s.yaw-yaw),Math.cos(s.yaw-yaw))/.0045,dy=(pitch-s.pitch)/.0035;
 await page.mouse.move(950,550);await page.mouse.down();await page.mouse.move(950+dx,550+dy,{steps:12});await page.mouse.up();
 await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);
 await page.waitForTimeout(600);
}
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
 await capture('spawn-sunset');
 await page.keyboard.press('g');await page.waitForTimeout(700);
 for(const [name,yaw] of [['north',0],['east',Math.PI/2],['south',Math.PI],['west',-Math.PI/2]]){await orbit(yaw,-.12,140);await capture(name);}
 await orbit(-Math.PI/2,-.95,30);await capture('overhead');
 await page.keyboard.press('g');
 await page.keyboard.press('l');await capture('night-unchanged');
 await page.keyboard.press('l');await capture('day-unchanged');
}finally{await browser.close();await fs.writeFile(`${out}/report.json`,JSON.stringify({errors,shots},null,2));}
if(errors.length)throw Error(errors.join('\n'));
