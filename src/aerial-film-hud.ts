import {drawCinematicMinimap} from './city-hud.ts';
import type {CityData} from './city-types.ts';
import type {FilmPose,FilmShot} from './trailer-shots.ts';

/** Canvas export of the game's observer HUD. The minimap uses its actual game renderer. */
export function createAerialFilmHud(city:CityData){
 const map=document.createElement('canvas');
 const white='#f4f3ef';
 function text(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,font:string,align:CanvasTextAlign='left'){
  ctx.font=font;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=white;ctx.shadowColor='#0008';ctx.shadowBlur=3;ctx.shadowOffsetY=1;ctx.fillText(value,x,y);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 }
 function key(ctx:CanvasRenderingContext2D,label:string,shortcut:string,y:number){
  ctx.save();ctx.globalAlpha=.60;text(ctx,label,1842,y,'400 12px "PingFang SC",sans-serif','right');ctx.strokeStyle='#ffffff35';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(1856,y-16,29,24,3);ctx.stroke();text(ctx,shortcut,1870.5,y+1,'400 12px sans-serif','center');ctx.restore();
 }
 return (ctx:CanvasRenderingContext2D,shot:FilmShot,pose:FilmPose)=>{
  const yaw=Math.atan2(pose.target[0]-pose.eye[0],pose.target[2]-pose.eye[2]);
  drawCinematicMinimap(map,city,{x:pose.target[0],z:pose.target[2],yaw,route:[],speed:0,observer:true});
  ctx.save();ctx.globalAlpha=1;
  ['深','城','纪'].forEach((glyph,i)=>text(ctx,glyph,33+i*57,71,'500 45px "Songti SC",serif'));
  ctx.globalAlpha=.86;text(ctx,shot.location+' · 无人机观景',33,104,'400 17px "PingFang SC",sans-serif');
  key(ctx,'城市地图','M',49);key(ctx,'城市生活','J',85);
  const x=23,y=765,size=266;ctx.globalAlpha=.62;ctx.drawImage(map,x,y,size,size);ctx.strokeStyle='#f0f2ed66';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.stroke();
  text(ctx,'N',x+size*(.5-Math.sin(yaw)*.45),y+size*(.5-Math.cos(yaw)*.45)+3,'500 10px sans-serif','center');
  ctx.globalAlpha=.83;text(ctx,shot.location,x+size/2,1055,'400 14px "PingFang SC",sans-serif','center');
  ctx.globalAlpha=1;ctx.fillStyle='#101b26a8';ctx.strokeStyle='#f4f4e924';ctx.beginPath();ctx.roundRect(711,943,498,103,3);ctx.fill();ctx.stroke();
  ctx.globalAlpha=.82;text(ctx,'无 人 机 观 景',960,965,'500 12px "PingFang SC",sans-serif','center');
  text(ctx,'WASD 平移 · 方向键转头 · QE 升降 · Shift 加速',960,985,'400 11px "PingFang SC",sans-serif','center');
  text(ctx,'拖动环绕 · Shift + 拖动平移 · 滚轮远近 · G / F 返回驾驶',960,1004,'400 11px "PingFang SC",sans-serif','center');
  text(ctx,'长按地点 · 光柱标记 / 收藏 / 移动    K 显隐鼠标',960,1023,'400 11px "PingFang SC",sans-serif','center');
  ctx.globalAlpha=.5;text(ctx,'© OpenStreetMap contributors · ODbL',1886,1065,'400 10px sans-serif','right');ctx.restore();
 };
}
