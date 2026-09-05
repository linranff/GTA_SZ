import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve(process.env.COCKPIT_OUT??'output/playwright/cockpit-delivery');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],screenshots=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const snapshot=async name=>{
 const file=path.join(out,name+'.png');await page.screenshot({path:file});
 const state=await page.evaluate(()=>({car:window.__SHENCHENGJI_CITY__.state,cockpit:window.__SHENCHENGJI_CITY__.stats.cockpit,camera:window.__SHENCHENGJI_CITY__.stats.camera}));
 screenshots.push({name,file,state});
};
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
 await page.locator('#game').click({position:{x:900,y:500}});
 await page.keyboard.press('c');await page.waitForTimeout(1200);await snapshot('01-stationary');
 await page.keyboard.down('w');await page.waitForTimeout(1800);await page.keyboard.up('w');await snapshot('02-driving');
 await page.keyboard.down('Space');await page.waitForTimeout(1800);await page.keyboard.up('Space');
 await page.keyboard.press('l');await page.waitForTimeout(1200);await snapshot('03-night');
}catch(e){errors.push(String(e));}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({at:new Date().toISOString(),errors,screenshots,visualReview:'pending'},null,2));await browser.close();}
console.log(JSON.stringify({out,errors,screenshots:screenshots.map(s=>s.name)}));
if(errors.length)process.exitCode=1;
