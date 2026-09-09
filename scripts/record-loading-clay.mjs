import {chromium} from 'playwright';import fs from 'node:fs/promises';
const out='output/playwright/loading-clay';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/__clay-film',r=>r.fulfill({contentType:'text/html',body:'<style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;display:block}</style><canvas id="render"></canvas><script type="module">import {createLoadingClayScene} from "/scripts/loading-clay-scene.ts";createLoadingClayScene(document.querySelector("canvas")).then(api=>window.clay=api).catch(e=>window.error=String(e));</script>'}));
try{
 await page.goto('http://127.0.0.1:4179/__clay-film');await page.waitForFunction(()=>window.clay?.ready||window.error,null,{timeout:240000});
 const info=await page.evaluate(()=>window.error?{error:window.error}:{total:clay.total,fps:clay.fps,duration:clay.duration,seam:clay.seam,waterNames:clay.waterNames,opacityAudit:clay.opacityAudit,inheritedAlpha:clay.inheritedAlpha,occlusionChecks:clay.occlusionChecks,visible:clay.visible,casters:clay.casters});if(info.error)throw Error(info.error);
 for(const f of [0,180,360,540,720]){const img=await page.evaluate(f=>clay.still(f),f);await fs.writeFile(`${out}/frame-${f}.png`,Buffer.from(img.split(',')[1],'base64'));}
 console.log(JSON.stringify(info));
 if(!process.argv.includes('--stills')){const fd=await fs.open(`${out}/orbit.h264`,'w');try{let frame=0;while(frame<info.total){const b=await page.evaluate(()=>clay.batch(30));await fd.write(Buffer.from(b.data,'base64'));frame=b.frame;console.log(`frames ${frame}/${info.total}`);}}finally{await fd.close();}}
 await fs.writeFile(`${out}/capture.json`,JSON.stringify({info,errors},null,2));
}finally{await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
