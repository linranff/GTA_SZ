/** Fixed-time engine footage. Dedicated trailer.html; never controls the user's game tab. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),args=process.argv.slice(2),sample=args.includes('--sample'),stills=args.includes('--stills');
const wanted=args.find(a=>a.startsWith('--shots='))?.slice(8).split(',');
const aerial=args.includes('--reel=aerial');
const root=process.cwd(),out=root+(aerial?'/output/aerial-film':'/output/trailer'),takeDir=out+(sample?'/sample':'/takes');
await fs.mkdir(takeDir,{recursive:true});await fs.mkdir(out+'/review',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[],reports=[],resources=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||/Error compiling|INVALID_OPERATION/i.test(m.text()))errors.push(m.text().slice(0,1800));});
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());if(r.request().resourceType()==='script')resources.push(r);});
let failed;
try{
 await page.goto(aerial?'http://127.0.0.1:4188/trailer.html?reel=aerial':'http://127.0.0.1:4187/trailer.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__TRAILER__?.ready||window.__TRAILER_ERROR__,null,{timeout:240000});
 const info=await page.evaluate(()=>({error:window.__TRAILER_ERROR__,codec:window.__TRAILER__?.codec,shots:window.__TRAILER__?.shots}));
 if(info.error)throw Error(info.error);if(!info.codec?.supported&&!stills)throw Error('1080p60 H.264 encoder not supported');
 console.log('READY '+JSON.stringify({codec:info.codec}));
 const shots=info.shots.filter(s=>wanted?wanted.includes(s.id):sample?(aerial?['01','05','07']:['01','04','10']).includes(s.id):true);
 for(const s of shots){
  if(stills){for(const t of [0,s.seconds/2,s.seconds-1/60]){const data=await page.evaluate(({id,t})=>window.__TRAILER__.still(id,t),{id:s.id,t});const p=`${out}/review/${s.id}-${t.toFixed(2)}.png`;await fs.writeFile(p,Buffer.from(data.split(',')[1],'base64'));console.log('STILL '+s.id+' '+t);}continue;}
  const selected=await page.evaluate(id=>window.__TRAILER__.select(id),s.id);console.log('SELECT '+JSON.stringify({id:s.id,pose:selected.pose,resolution:selected.resolution,materials:selected.materials}));
  const raw=`${takeDir}/${s.id}.h264`,fd=await fs.open(raw,'w'),poses=[];let n=0,encoded=0;const total=sample?240:s.seconds*60,begin=Date.now();
  try{while(n<total){const b=await page.evaluate(count=>window.__TRAILER__.batch(count),Math.min(30,total-n));await fd.write(Buffer.from(b.data,'base64'));n=b.frame;encoded=b.encodedFrames;poses.push(...b.poses);if(n%120===0||n===total)console.log('FRAME '+JSON.stringify({id:s.id,frames:n,total,renderFps:+(n/((Date.now()-begin)/1000)).toFixed(2)}));}}finally{await fd.close();}
  if(n!==total||encoded!==total)throw Error(`Frame count mismatch ${s.id}: ${n}/${encoded}/${total}`);
  const mp4=`${takeDir}/${s.id}.mp4`;
  await exec('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-fflags','+genpts','-r','60','-i',raw,'-c:v','copy','-video_track_timescale','60000','-movflags','+faststart',mp4]);
  const probe=JSON.parse((await exec('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',mp4])).stdout);
  const v=probe.streams.find(s=>s.codec_type==='video');if(Number(v.nb_frames)!==total||v.width!==1920||v.height!==1080||v.avg_frame_rate!=='60/1')throw Error('Encoded format mismatch '+s.id);
  const report={id:s.id,title:s.title,lighting:s.mode,frames:total,encodedFrames:encoded,elapsedSeconds:(Date.now()-begin)/1000,selected,poses,probe};reports.push(report);
  await fs.writeFile(`${takeDir}/${s.id}.json`,JSON.stringify(report,null,2)+'\n');await fs.rm(raw);
  for(const [label,t] of [['start',Math.min(.75,total/60/2)],['middle',total/120],['end',total/60-.25]])await exec('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(t),'-i',mp4,'-frames:v','1',`${out}/review/${sample?'sample-':''}${s.id}-${label}.png`]);
  console.log('COMPLETE '+JSON.stringify({id:s.id,seconds:total/60,bytes:probe.format.size,elapsedSeconds:report.elapsedSeconds}));
 }
}catch(e){failed=String(e);errors.push(failed);console.error(failed);await page.screenshot({path:out+'/review/failure.png'}).catch(()=>{});}
finally{
 const hashes=[];for(const r of resources)try{hashes.push({url:r.url(),sha256:createHash('sha256').update(await r.body()).digest('hex')});}catch{}
 await fs.writeFile(`${takeDir}/${stills?'stills-':''}run-report.json`,JSON.stringify({date:new Date().toISOString(),errors,reports,hashes},null,2)+'\n');await browser.close();
}
if(failed||errors.length)process.exitCode=1;
