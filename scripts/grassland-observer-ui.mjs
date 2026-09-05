/** Read-only feedback + ordinary pointer/keyboard input for grass visual review. */
export function observerUI(page){
 const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const read=()=>page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.observer);
 async function drag(dx,dy){const box=await page.locator('#game').boundingBox();const x=box.x+box.width*.5,y=box.y+box.height*.5;await page.mouse.move(x,y);await page.mouse.down({button:'right'});try{await page.mouse.move(x+dx,y+dy,{steps:8});}finally{await page.mouse.up({button:'right'});}await page.waitForTimeout(90);}
 async function pulse(key,ms){await page.keyboard.down(key);try{await page.waitForTimeout(ms);}finally{await page.keyboard.up(key);}await page.waitForTimeout(60);}
 async function enter(id){await page.keyboard.press('m');await page.locator('#map-panel').waitFor({state:'visible'});await page.locator('#map-search').fill('');await page.locator(`#places [data-id="${id}"]`).click();await page.locator('#photo-view').click();await page.locator('#map-panel').waitFor({state:'hidden'});await page.waitForTimeout(700);}
 async function pose(focus,position){
  const dx=focus.x-position.x,dy=position.y-focus.y,dz=focus.z-position.z;
  const distance=Math.hypot(dx,dy,dz),yaw=Math.atan2(dx,dz),pitch=Math.asin(dy/distance);
  // Move at overview speed before zooming in, so distant places do not require
  // long keyboard walks. Camera state is never assigned from the test harness.
  for(let i=0;i<14;i++){const s=await read(),a=angle(yaw-s.yaw),b=pitch-s.pitch;if(Math.abs(a)<.001&&Math.abs(b)<.001)break;await drag(Math.max(-280,Math.min(280,-a/.0045)),Math.max(-180,Math.min(180,b/.0035)));}
  for(let i=0;i<70;i++){
   const s=await read(),ex=focus.x-s.focus.x,ez=focus.z-s.focus.z;
   if(Math.hypot(ex,ez)<.15)break;
   const axes=[{e:ex*Math.sin(s.yaw)+ez*Math.cos(s.yaw),pos:'w',neg:'s'},{e:ex*Math.cos(s.yaw)-ez*Math.sin(s.yaw),pos:'d',neg:'a'}].sort((a,b)=>Math.abs(b.e)-Math.abs(a.e));
   const a=axes[0],speed=Math.max(4,Math.min(90,s.distance*.13));await pulse(a.e>0?a.pos:a.neg,Math.max(15,Math.min(1200,Math.abs(a.e)/speed*850)));
  }
  for(let i=0;i<4;i++){const s=await read();if(Math.abs(s.distance-distance)<.02)break;await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);await page.waitForTimeout(150);}
  for(let i=0;i<70;i++){
   const s=await read(),ex=focus.x-s.focus.x,ey=focus.y-s.focus.y,ez=focus.z-s.focus.z;if(Math.hypot(ex,ey,ez)<.16)break;
   const axes=[{e:ex*Math.sin(s.yaw)+ez*Math.cos(s.yaw),pos:'w',neg:'s'},{e:ex*Math.cos(s.yaw)-ez*Math.sin(s.yaw),pos:'d',neg:'a'},{e:ey,pos:'e',neg:'q'}].sort((a,b)=>Math.abs(b.e)-Math.abs(a.e));
   const a=axes[0],speed=Math.max(4,Math.min(90,s.distance*.13));await pulse(a.e>0?a.pos:a.neg,Math.max(15,Math.min(900,Math.abs(a.e)/speed*850)));
  }
  const s=await read(),error=Math.hypot(s.position.x-position.x,s.position.y-position.y,s.position.z-position.z);
  if(error>.45)throw Error('Grass camera positioning failed: '+error);
  return {target:{focus,position},actual:s,error};
 }
 return {read,enter,pose,pulse};
}
