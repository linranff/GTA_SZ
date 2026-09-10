import {characterJobs,LOCAL_CHARACTERS} from './city-local-characters.ts';
import type {DrivingWorld} from './city-world.ts';
import './city-character-hud.css';
export function createCharacterHud(host:HTMLElement,world:DrivingWorld){
 const panel=document.createElement('section');panel.id='character-loading';panel.setAttribute('aria-label','本地角色加载');
 panel.innerHTML='<span role="status" aria-live="polite"></span><progress max="1"></progress><button type="button">重试角色</button><small>本地非商业验证 · 模型 miHoYo / MMD 改造 观海</small>';
 const text=panel.querySelector('span')!,bar=panel.querySelector('progress')!,retry=panel.querySelector('button')!;
 retry.onclick=()=>{world.canvas.focus();void world.ensureRider();void world.bambooCafe?.retryCharacters();};
 const credit=document.createElement('small');credit.id='character-credit';credit.textContent='模型 miHoYo · MMD 改造 观海 · 本地非商业验证';credit.hidden=true;host.append(panel,credit);
 return {update(menuOpen:boolean){
  credit.hidden=!LOCAL_CHARACTERS||menuOpen||(!world.walk?.active&&!document.body.classList.contains('inside-bamboo-cafe'));
  const jobs=Object.values(characterJobs),errors=jobs.filter(j=>j.phase==='error'),pending=jobs.filter(j=>j.phase==='loading');
  panel.hidden=!LOCAL_CHARACTERS||menuOpen||(!errors.length&&!pending.length);
  if(panel.hidden)return;
  text.textContent=errors.length?errors.map(j=>j.message).join('；'):pending.map(j=>j.message).join(' · ');
  retry.hidden=!errors.length;bar.hidden=!pending.length;bar.value=pending.length?pending.reduce((s,j)=>s+j.progress,0)/pending.length:1;
 },dispose(){retry.onclick=null;panel.remove();credit.remove();}};
}
