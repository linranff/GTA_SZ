import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1920,height:1080}});const logs=[];
page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});
try{await page.goto('http://127.0.0.1:4173/');await page.waitForTimeout(10000);await fs.writeFile('artifacts/city/shader-errors.txt',logs.join('\n'));console.log('Captured '+logs.length+' shader log entries');}finally{await browser.close();}
