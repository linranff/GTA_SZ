import './city-flight-hud.css';
import type {DrivingWorld} from './city-world.ts';
import {FLIGHT_RECOVERY_MS} from './city-flight-simulation.ts';

export function createFlightHud(host:HTMLElement,world:DrivingWorld){
 const panel=document.createElement('section');panel.id='flight-hud';panel.hidden=true;panel.setAttribute('aria-label','空中探索');
 panel.innerHTML=`<div class="flight-instruments" hidden><div class="flight-title"><small>BAY WINGS / 湾翼</small><strong>海湾自由飞行</strong><span class="flight-phase"></span></div><dl><div><dt>空速</dt><dd data-flight-value="speed">0<small>KM/H</small></dd></div><div><dt>离地高度</dt><dd data-flight-value="altitude">0<small>M</small></dd></div><div><dt>航向</dt><dd data-flight-value="heading">000°</dd></div><div><dt>油门</dt><dd data-flight-value="throttle">55<small>%</small></dd></div></dl><div class="flight-throttle"><i></i></div></div>
 <div class="flight-crash" role="status" hidden><small>FLIGHT ENDED</small><strong>飞机撞毁</strong><span>3 秒后返回无人机</span></div>
 <div class="flight-help" hidden><strong>W / S · 抬头 / 俯冲　 A / D · 左右侧倾</strong><span>方向键亦可操纵 · Q / E 方向舵 · Shift 加速 · X 减速 · 空格发射导弹</span><span class="flight-missile-status"></span><span><button type="button" data-flight-mode="drone"><kbd>B</kbd> 无人机</button> · G / F 返回驾驶 · L 切换光照</span></div>`;
 const missileStatus=panel.querySelector<HTMLElement>('.flight-missile-status')!;
 const drone=panel.querySelector<HTMLButtonElement>('[data-flight-mode="drone"]')!;
 drone.onclick=()=>{drone.blur();world.canvas.focus();world.returnFromFlight();};
 host.append(panel);
 const instruments=panel.querySelector<HTMLElement>('.flight-instruments')!,help=panel.querySelector<HTMLElement>('.flight-help')!,crash=panel.querySelector<HTMLElement>('.flight-crash')!,phase=panel.querySelector<HTMLElement>('.flight-phase')!;
 const value=(name:string,text:string)=>{panel.querySelector('[data-flight-value="'+name+'"]')!.innerHTML=text;};
 return {update(menuOpen:boolean){
  panel.hidden=menuOpen||!world.observer.active||world.photoTarget?.id==='car';if(panel.hidden)return;
  const flight=world.flight,active=!!flight?.active;
  instruments.hidden=help.hidden=!active;const s=flight?.stats;crash.hidden=s?.phase!=='exploding';
  if(s&&active){
   const cooldown=s.missiles?.cooldown??0;missileStatus.textContent=s.phase==='exploding'?'':cooldown>.05?'导弹装填 '+cooldown.toFixed(1)+' 秒':'导弹就绪 · 按住空格连续发射';
   value('speed',Math.round(s.speed*3.6)+'<small>KM/H</small>');value('altitude',Math.round(s.altitude)+'<small>M</small>');value('heading',String(Math.round((s.yaw*180/Math.PI%360+360)%360)).padStart(3,'0')+'°');value('throttle',Math.round(s.throttle*100)+'<small>%</small>');(panel.querySelector('.flight-throttle i') as HTMLElement).style.width=s.throttle*100+'%';phase.textContent=s.phase==='exploding'?'飞行中断':'辅助平飞 · 松开按键自动回正';if(!crash.hidden)crash.querySelector('span')!.textContent=Math.max(1,Math.ceil((FLIGHT_RECOVERY_MS-(performance.now()-s.crashedAt))/1000))+' 秒后返回无人机';}
 },dispose(){panel.remove();}};
}
