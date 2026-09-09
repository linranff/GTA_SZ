import './city-loading.css';

/** Each entry begins after the preceding awaited task has finished. Equal
 * stages describe boot completion, never pretend to measure downloaded bytes. */
export const CITY_LOADING_STAGES=[
 {id:'map',label:'正在展开深圳地图',group:'城市骨架'},
 {id:'ridges',label:'正在展开深圳山脊',group:'城市骨架'},
 {id:'relief',label:'正在铺设公园缓坡',group:'城市骨架'},
 {id:'bridges',label:'正在架设跨水桥梁',group:'城市骨架'},
 {id:'coast',label:'正在铺设海岸线和城市道路',group:'海岸与天际线'},
 {id:'buildings',label:'正在载入南山、福田、罗湖建筑',group:'海岸与天际线'},
 {id:'landmarks',label:'正在装配深圳地标',group:'海岸与天际线'},
 {id:'signage',label:'正在点亮城市招牌',group:'海岸与天际线'},
 {id:'vehicle',label:'正在启动你的车',group:'路上的生活'},
 {id:'landscape',label:'正在种植榕树、棕榈与花境',group:'路上的生活'},
 {id:'furniture',label:'正在布置城市座椅',group:'路上的生活'},
 {id:'lighting',label:'正在调试海湾的光与倒影',group:'光与倒影'},
 {id:'puddles',label:'雨停了，正在铺设路边积水',group:'光与倒影'},
 {id:'navigation',label:'正在连接城市导航',group:'准备出发'},
 {id:'life-sites',label:'正在打开沿途生活',group:'准备出发'},
 {id:'interface',label:'正在准备驾驶界面',group:'准备出发'},
 {id:'experience',label:'正在准备你的城市生活',group:'准备出发'},
] as const;
export type CityLoadingStage=typeof CITY_LOADING_STAGES[number]['id'];
export type CityLoadingOptions={onRetry?:()=>void};
type LoadingState='loading'|'ready'|'error'|'leaving'|'disposed';

const CITY_LOADING_MEDIA='/city/loading/bamboo-clay-loop.mp4?v=2';
const CITY_LOADING_POSTER='/city/loading/bamboo-clay-poster.jpg?v=2';

/** Mount on body, outside #ui: initUI replaces #ui.innerHTML during boot.
 * All progress changes require update()/finish(); the background film never
 * drives the progress bar or delays boot. finish() holds by default until the caller explicitly reveal()s. */
export function createCityLoading(host:HTMLElement=document.body,options:CityLoadingOptions={}){
 const element=document.createElement('section');element.className='city-loader';element.id='city-loading';
 element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');
 element.setAttribute('aria-label','深城纪正在载入');element.setAttribute('aria-busy','true');element.tabIndex=-1;
 element.innerHTML=`<img class="city-loader-poster" src="${CITY_LOADING_POSTER}" alt="" fetchpriority="low" decoding="async"><video class="city-loader-film" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" disablepictureinpicture></video><div class="city-loader-vignette" aria-hidden="true"></div>
  <div class="city-loader-topline"><span>SHENZHEN / OPEN ROADS</span><span>一座城市 · 无数种生活</span></div>
  <div class="city-loader-title"><span class="city-loader-edition">城市漫游</span><h1>深城纪</h1><div class="city-loader-title-rule" aria-hidden="true"></div><p>把下班后的时间，<br>还给这座城市。</p><span class="city-loader-districts">南山<span></span>福田<span></span>罗湖</span></div>
  <div class="city-loader-bottom"><div class="city-loader-progress-block"><div class="city-loader-progress-heading"><div><span class="city-loader-group">城市骨架</span><p class="city-loader-status" role="status" aria-live="polite">正在启动城市</p></div><div class="city-loader-percent"><b>0</b><span>%</span></div></div>
   <div class="city-loader-progress" role="progressbar" aria-label="城市载入阶段进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
   <div class="city-loader-progress-meta"><span class="city-loader-count">阶段 01 / 17</span><span class="city-loader-progress-basis">按已完成阶段推进</span></div>
   <div class="city-loader-failure" hidden><p></p><button type="button">重新载入 <span aria-hidden="true">↗</span></button></div>
  </div></div>`;
 const query=<T extends HTMLElement>(selector:string)=>element.querySelector<T>(selector)!;
 const status=query('.city-loader-status'),group=query('.city-loader-group'),percent=query('.city-loader-percent b'),bar=query('.city-loader-progress'),fill=query('.city-loader-progress i'),count=query('.city-loader-count'),basis=query('.city-loader-progress-basis'),failure=query('.city-loader-failure'),failureText=query('.city-loader-failure p'),retry=query<HTMLButtonElement>('.city-loader-failure button');
 let state:LoadingState='loading',stageIndex=0,stageFraction=0,completion=0,removeTimer:number|undefined,revealPromise:Promise<void>|null=null,resolveReveal:(()=>void)|null=null;
 // A small prerecorded film avoids rendering a second city during boot.
 // Keep the poster beneath it so decoding/autoplay failures never leave a blank cover.
 const film=query<HTMLVideoElement>('.city-loader-film');
 film.muted=true;film.defaultMuted=true;film.playsInline=true;
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const connection=(navigator as Navigator & {connection?:EventTarget & {saveData?:boolean}}).connection;
 let mediaFailed=false;
 function releaseFilm(){
  film.pause();delete element.dataset.film;
  if(film.hasAttribute('src')){film.removeAttribute('src');film.load();}
 }
 function syncFilm(){
  if(state==='disposed'||state==='error'||mediaFailed||reducedMotion.matches||connection?.saveData){releaseFilm();return;}
  if(document.hidden){film.pause();return;}
  if(!film.hasAttribute('src'))film.src=CITY_LOADING_MEDIA;
  void film.play().catch(()=>{if(film.paused)delete element.dataset.film;});
 }
 function filmPlaying(){
  if(state==='disposed'||state==='error'||reducedMotion.matches||connection?.saveData){releaseFilm();return;}
  if(document.hidden){film.pause();return;}
  element.dataset.film='playing';
 }
 function filmFailed(){mediaFailed=true;releaseFilm();}
 film.addEventListener('playing',filmPlaying);film.addEventListener('error',filmFailed);
 document.addEventListener('visibilitychange',syncFilm);reducedMotion.addEventListener('change',syncFilm);
 connection?.addEventListener('change',syncFilm);
 const retryAction=()=>options.onRetry?options.onRetry():location.reload();retry.addEventListener('click',retryAction);
 function blockGameInput(event:KeyboardEvent){
  if(state==='disposed')return;
  // Preserve browser shortcuts (reload, find, etc.) without sending their
  // letter keys to the game's global listener while the cover is mounted.
  if(event.metaKey||event.ctrlKey||event.altKey){event.stopImmediatePropagation();return;}
  if(event.code==='Tab'){event.preventDefault();event.stopImmediatePropagation();(state==='error'?retry:element).focus({preventScroll:true});return;}
  const retryActivation=event.target===retry&&(event.code==='Enter'||event.code==='Space');
  if(retryActivation){event.stopImmediatePropagation();return;}
  if(/^(Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Slash|Escape|ShiftLeft|ShiftRight)$/.test(event.code)){
   event.preventDefault();event.stopImmediatePropagation();
  }
 }
 window.addEventListener('keydown',blockGameInput,true);window.addEventListener('keyup',blockGameInput,true);
 host.append(element);element.focus({preventScroll:true});syncFilm();
 function paint(){
  const integer=Math.floor(completion*100);percent.textContent=String(integer);fill.style.transform=`scaleX(${completion})`;
  bar.setAttribute('aria-valuenow',String(integer));bar.setAttribute('aria-valuetext',state==='ready'?'全部阶段已完成':`${integer}%，阶段 ${stageIndex+1} / ${CITY_LOADING_STAGES.length}，${status.textContent}`);
  count.textContent=`阶段 ${String(stageIndex+1).padStart(2,'0')} / ${CITY_LOADING_STAGES.length}`;
 }
 function update(stage:CityLoadingStage|string,progress?:number){
  if(state!=='loading')return;
  const index=CITY_LOADING_STAGES.findIndex(entry=>entry.id===stage||entry.label===stage);
  // An unrecognised message is useful status text, not evidence of completion.
  if(index<0){status.textContent=stage;return;}
  if(index<stageIndex)return;
  const fraction=typeof progress==='number'&&Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
  stageFraction=index===stageIndex?Math.max(stageFraction,fraction):fraction;stageIndex=index;
  completion=Math.max(completion,(stageIndex+stageFraction)/CITY_LOADING_STAGES.length);
  status.textContent=CITY_LOADING_STAGES[index].label;group.textContent=CITY_LOADING_STAGES[index].group;
  basis.textContent=stageFraction>0&&stageFraction<1?'当前阶段含资源进度':'按已完成阶段推进';paint();
 }
 function finish({hold=true}:{hold?:boolean}={}){
  if(state==='disposed'||state==='error'||state==='leaving')return Promise.resolve();
  state='ready';stageIndex=CITY_LOADING_STAGES.length-1;stageFraction=1;completion=1;
  element.dataset.state='ready';element.setAttribute('aria-busy','false');status.textContent='城市已就绪';group.textContent='准备出发';basis.textContent='下一程，由你决定';paint();
  return hold?Promise.resolve():reveal();
 }
 function reveal():Promise<void>{
  if(state==='disposed')return Promise.resolve();if(revealPromise)return revealPromise;
  if(state!=='ready')return Promise.reject(new Error('Call loading.finish() after boot succeeds before reveal().'));
  state='leaving';element.classList.add('is-leaving');element.setAttribute('aria-hidden','true');
  revealPromise=new Promise<void>(resolve=>{resolveReveal=resolve;});
  // This timer only removes the completed fade. It never advances progress.
  removeTimer=window.setTimeout(dispose,matchMedia('(prefers-reduced-motion: reduce)').matches?0:760);
  return revealPromise;
 }
 function error(reason:unknown){
  if(state==='disposed'||state==='leaving')return;
  state='error';releaseFilm();element.dataset.state='error';element.setAttribute('aria-busy','false');
  group.textContent='载入中断';status.textContent='城市暂时没有载入';basis.textContent='已保留当前进度';
  failureText.textContent=reason instanceof Error?reason.message:typeof reason==='string'?reason:'请重新载入后再试。';failure.hidden=false;
  failure.setAttribute('role','alert');retry.focus({preventScroll:true});
 }
 function dispose(){
  if(state==='disposed')return;state='disposed';if(removeTimer!==undefined)window.clearTimeout(removeTimer);
  window.removeEventListener('keydown',blockGameInput,true);window.removeEventListener('keyup',blockGameInput,true);
  document.removeEventListener('visibilitychange',syncFilm);reducedMotion.removeEventListener('change',syncFilm);
  connection?.removeEventListener('change',syncFilm);film.removeEventListener('playing',filmPlaying);film.removeEventListener('error',filmFailed);releaseFilm();
  retry.removeEventListener('click',retryAction);element.remove();resolveReveal?.();resolveReveal=null;
 }
 return {element,update,finish,reveal,error,dispose,stats:()=>({state,stage:CITY_LOADING_STAGES[stageIndex].id,stageIndex,stages:CITY_LOADING_STAGES.length,stageFraction,progress:completion,basis:'completed stages plus explicitly reported current-stage fraction'})};
}
