import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url());});
const state=()=>page.evaluate(()=>window.__SHENCHENGJI__.state);
const shot=async name=>page.screenshot({path:`artifacts/game/${name}.png`});
async function moveTo(x,z){
  let last=await state(),stuck=0;
  for(let i=0;i<500;i++){
    const s=await state(),dx=x-s.x,dz=z-s.z;if(Math.hypot(dx,dz)<.43)break;
    if(Math.hypot(last.x-s.x,last.z-s.z)<.01)stuck++;else stuck=0;
    if(stuck>12)throw Error('Movement stuck '+JSON.stringify({x,z,current:s}));last=s;
    const keys=[];if(Math.abs(dx)>.22)keys.push(dx>0?'d':'a');if(Math.abs(dz)>.22)keys.push(dz>0?'w':'s');
    await page.keyboard.down('Shift');for(const k of keys)await page.keyboard.down(k);
    await page.waitForTimeout(90);
    for(const k of keys)await page.keyboard.up(k);await page.keyboard.up('Shift');
  }
  await page.waitForTimeout(180);
}
async function route(x,z){await moveTo(0,(await state()).z);await moveTo(0,z);await moveTo(x,z);}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__SHENCHENGJI__?.ready,null,{timeout:60000});
  await page.getByRole('button',{name:'走进这座城市'}).click();await page.getByRole('button',{name:'去看看这份活'}).click();
  await route(5.4,4);await page.keyboard.press('e');await page.getByRole('button',{name:'接下这班活'}).click();
  await shot('sorting');
  for(const n of [1,3,2,1,2,3,1,2,3]){await page.keyboard.press(String(n));await page.waitForTimeout(100);}
  await page.getByRole('button',{name:'推车出发'}).click();assert.equal((await state()).work,'hauling');
  console.log('Sorting passed; freight route started.');
  await moveTo(0,16);await moveTo(-2,25);await shot('delivery');await moveTo(2,49);await moveTo(-1,83);await moveTo(-1,85);
  assert.equal((await state()).work,'delivered');await page.keyboard.press('e');await page.getByRole('heading',{name:'钱到账了。'}).waitFor();
  assert.equal((await state()).cash,393);await shot('payout');await page.getByRole('button',{name:'把生活过好一点'}).click();
  await page.keyboard.press('e');assert.equal((await state()).cash,393);
  console.log('Delivery and one-time payout passed.');
  await route(-5.4,30);await page.keyboard.press('e');await page.locator('[data-action="buy"][data-item="mattress"]').click();
  assert.equal((await state()).cash,133);assert.deepEqual((await state()).inventory,['mattress']);await shot('shop');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await route(-4.6,8);await page.keyboard.press('e');await page.getByRole('button',{name:'一起吃。今天不说改天。'}).click();assert.equal((await state()).relationship,1);
  await shot('evening');await page.getByRole('button',{name:'沿着巷子回家'}).click();
  await route(-5.4,54);await page.keyboard.press('e');await page.waitForTimeout(600);assert.equal((await state()).location,'room');await shot('room-upgraded');
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SHENCHENGJI__?.ready);await page.getByRole('button',{name:'继续你的生活'}).click();
  assert.equal((await state()).location,'room');assert.equal((await state()).cash,133);assert.deepEqual((await state()).inventory,['mattress']);
  await page.keyboard.press('e');await page.getByRole('button',{name:'好好休息，开始明天'}).click();assert.equal((await state()).day,2);assert.equal((await state()).work,'available');assert.equal((await state()).relationship,1);
  const result={passed:true,errors,finalState:await state(),performance:await page.evaluate(()=>window.__SHENCHENGJI__.performance)};
  await fs.writeFile('artifacts/game/playthrough.json',JSON.stringify(result,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
}catch(error){await shot('playthrough-failure');console.error(error);await fs.writeFile('artifacts/game/playthrough.json',JSON.stringify({passed:false,error:String(error),state:await state(),errors},null,2));process.exitCode=1;}
finally{await browser.close();}
