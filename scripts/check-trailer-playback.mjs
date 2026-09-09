/** Real-time decode check in an isolated Chrome; the delivery player stays audible by default. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const aerial=process.argv.includes('--reel=aerial');
const out=process.cwd()+(aerial?'/output/aerial-film':'/output/trailer'),errors=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(pathToFileURL(out+'/播放宣传片.html').href);
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const result=await page.evaluate(async()=>{
  const v=document.querySelector('video');v.muted=true;
  const samples=[],started=performance.now();let frames=0,lastSample=-1;
  const observe=(_,meta)=>{frames++;if(Math.floor(meta.mediaTime/10)>lastSample){lastSample=Math.floor(meta.mediaTime/10);const q=v.getVideoPlaybackQuality();samples.push({mediaTime:meta.mediaTime,frames,quality:{total:q.totalVideoFrames,dropped:q.droppedVideoFrames,corrupted:q.corruptedVideoFrames}});}if(!v.ended)v.requestVideoFrameCallback(observe);};
  v.requestVideoFrameCallback(observe);
  const ended=new Promise((resolve,reject)=>{v.addEventListener('ended',resolve,{once:true});v.addEventListener('error',()=>reject(Error(v.error?.message||'Video error')),{once:true});setTimeout(()=>reject(Error('Playback did not finish')),150000);});
  await v.play();await ended;
  const q=v.getVideoPlaybackQuality();
  return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime,ended:v.ended,elapsedSeconds:(performance.now()-started)/1000,frameCallbacks:frames,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,corruptedVideoFrames:q.corruptedVideoFrames,samples};
 });
 await fs.writeFile(out+'/playback-qa.json',JSON.stringify({errors,...result},null,2)+'\n');
 if(errors.length||!result.ended||result.width!==1920||result.height!==1080||result.duration!==120||result.corruptedVideoFrames)throw Error('Playback failed');
 console.log(JSON.stringify(result));
}finally{await browser.close();}
