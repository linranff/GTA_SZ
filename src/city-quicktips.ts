import './city-quicktips.css';

export type CityQuickTipsMode='driving'|'walking'|'observer'|'tank';
export type CityQuickTipsState={mode:CityQuickTipsMode;menuOpen?:boolean;hidden?:boolean;carView?:boolean;flightLoading?:boolean};
type KeyTip={key:string;label:string;secondary?:boolean;action?:'flight'};
const QUICK:Record<CityQuickTipsMode,readonly KeyTip[]>={
 tank:[{key:'WASD',label:'驾驶'},{key:'Q E',label:'炮塔'},{key:'空格',label:'开炮'},{key:'T',label:'轿车'},{key:'F',label:'下车'},{key:'C',label:'镜头',secondary:true}],
 driving:[{key:'WASD',label:'驾驶'},{key:'T',label:'坦克'},{key:'空格',label:'手刹'},{key:'C',label:'镜头',secondary:true},{key:'F',label:'下车'},{key:'G',label:'观景',secondary:true}],
 walking:[{key:'WASD',label:'行走'},{key:'C',label:'人称',secondary:true},{key:'Shift',label:'跑步'},{key:'拖动',label:'看向',secondary:true},{key:'F',label:'上车'},{key:'E',label:'互动',secondary:true}],
 observer:[{key:'WASD',label:'平移'},{key:'Q E',label:'升降'},{key:'拖动',label:'环绕',secondary:true},{key:'B',label:'飞机',action:'flight'},{key:'G / F',label:'返回'},{key:'滚轮',label:'远近',secondary:true}],
};
const HELP:Record<CityQuickTipsMode,readonly KeyTip[]>={
 tank:[{key:'W / S',label:'前进 / 后退'},{key:'A / D',label:'转向 / 原地转向'},{key:'Q / E',label:'旋转炮塔'},{key:'PageUp / PageDown',label:'抬高 / 压低炮管'},{key:'空格 / Enter',label:'开炮；按住空格连续发射，装填 1.8 秒'},{key:'X',label:'刹车'},{key:'T',label:'切换回轿车'},{key:'F',label:'停稳后下车'},{key:'G',label:'无人机观景'}],
 driving:[{key:'W / S',label:'油门 / 刹车与倒车'},{key:'A / D',label:'转向；方向键也可驾驶'},{key:'空格',label:'手刹'},{key:'C',label:'追踪 / 驾驶舱 / 远景镜头'},{key:'拖动',label:'环顾车外'},{key:'F',label:'停稳后下车'},{key:'H',label:'鸣笛'},{key:'R',label:'回到附近道路'},{key:'V',label:'近距离看车'},{key:'T',label:'切换坦克 / 轿车'},{key:'G',label:'进入无人机观景'}],
 walking:[{key:'WASD',label:'前后左右行走'},{key:'C',label:'第一人称 / 第三人称'},{key:'Shift',label:'按住跑步'},{key:'拖动 / 方向键',label:'转头看向'},{key:'F',label:'回到车旁 5 米内上车'},{key:'E',label:'在互动地点交谈 / 接活'},{key:'G',label:'进入无人机观景'}],
 observer:[{key:'WASD',label:'平移观察位置'},{key:'Q / E',label:'降低 / 升高'},{key:'方向键',label:'原地转头'},{key:'Shift',label:'按住加速移动'},{key:'拖动',label:'围绕目标环绕'},{key:'Shift + 拖动',label:'平移视点'},{key:'滚轮',label:'拉近 / 拉远'},{key:'长按地点',label:'标记 / 收藏 / 移动'},{key:'B',label:'切换飞机',action:'flight'},{key:'G / F',label:'退出观景，返回原位置'}],
};
const COMMON:readonly KeyTip[]=[{key:'M / Tab',label:'城市地图'},{key:'J',label:'城市生活'},{key:'L',label:'日落 / 夜色 / 晴日'},{key:'K',label:'隐藏 / 显示鼠标'},{key:'Esc',label:'返回 / 暂停'},{key:'?',label:'展开 / 收起操作说明'}];
const LABELS:Record<CityQuickTipsMode,string>={driving:'驾驶',walking:'步行',observer:'观景',tank:'坦克'};
let serial=0;

/** Mount inside #ui so existing visibility/opacity/display recording switches
 * hide this entire component too. Call update from the existing HUD tick.
 * This module never changes game keys or pause state and has no render loop. */
export function createCityQuickTips(host:HTMLElement,options:{onOpenChange?:(open:boolean)=>void;onFlight?:()=>void}={}){
 const element=document.createElement('section');element.className='city-quicktips';element.setAttribute('aria-label','当前模式快捷操作');
 element.innerHTML=`<div class="city-quicktips-line"><span class="city-quicktips-mode"></span><ul></ul><button class="city-quicktips-toggle" type="button" aria-expanded="false"><kbd>?</kbd><span>操作</span></button></div><div class="city-quicktips-help" hidden><div class="city-quicktips-help-heading"><div><small>OPEN ROADS / CONTROLS</small><h2></h2></div><button type="button" class="city-quicktips-close" aria-label="收起操作说明">收起 <span aria-hidden="true">×</span></button></div><div class="city-quicktips-help-grid"></div><div class="city-quicktips-common"></div><p class="city-quicktips-footnote">按 ? 或 Esc 收起</p></div>`;
 const query=<T extends HTMLElement>(selector:string)=>element.querySelector<T>(selector)!;
 const modeLabel=query('.city-quicktips-mode'),list=query('ul'),toggle=query<HTMLButtonElement>('.city-quicktips-toggle'),panel=query('.city-quicktips-help'),title=query('h2'),help=query('.city-quicktips-help-grid'),common=query('.city-quicktips-common'),close=query<HTMLButtonElement>('.city-quicktips-close');
 panel.id=`city-quicktips-help-${++serial}`;toggle.setAttribute('aria-controls',panel.id);
 let state:CityQuickTipsState={mode:'driving'},open=false,disposed=false,lastMode='',lastHidden=false;
 const tips=(entries:readonly KeyTip[],tag='div')=>entries.filter(entry=>!state.carView||entry.action!=='flight').map(entry=>`<${tag}${entry.secondary?' data-secondary="true"':''}>${entry.action&&tag==='li'?'<button type="button" class="city-quicktips-action" data-flight-mode="plane">':''}<kbd>${entry.key}</kbd><span>${entry.label}</span>${entry.action&&tag==='li'?'</button>':''}</${tag}>`).join('');
 common.innerHTML=tips(COMMON);host.append(element);host.classList.add('has-city-quicktips');
 function setOpen(value:boolean,returnFocus=false){
  if(disposed||value&&(state.menuOpen||state.hidden))return;
  if(open===value)return;open=value;panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));element.classList.toggle('is-expanded',value);options.onOpenChange?.(value);
  if(!value&&returnFocus)toggle.focus({preventScroll:true});
 }
 function update(next:CityQuickTipsState){
  if(disposed)return;state={...next};const hidden=!!(state.menuOpen||state.hidden);
  if(lastHidden!==hidden){element.hidden=hidden;lastHidden=hidden;}if(hidden)setOpen(false);
  const flightButton=list.querySelector<HTMLButtonElement>('[data-flight-mode="plane"]');if(flightButton)flightButton.disabled=!!next.flightLoading;
  const modeKey=next.mode+':'+!!next.carView;if(modeKey===lastMode)return;lastMode=modeKey;
  modeLabel.textContent=next.carView?'看车':LABELS[next.mode];title.textContent=next.carView?'停下来，看看你的车。':{driving:'沿着这座城市，慢慢开。',walking:'走近街角，再看一眼。',observer:'换个角度，看看深圳。',tank:'装甲巡游，自由试驾。'}[next.mode];
  list.innerHTML=tips(QUICK[next.mode],'li');help.innerHTML=tips(HELP[next.mode]);element.dataset.mode=next.mode;
  const button=list.querySelector<HTMLButtonElement>('[data-flight-mode="plane"]');if(button){button.disabled=!!next.flightLoading;button.onclick=()=>{if(state.menuOpen||state.hidden||state.flightLoading||state.carView)return;setOpen(false);button.blur();options.onFlight?.();};}
 }
 const toggleHelp=()=>setOpen(!open),closeHelp=()=>setOpen(false,true);
 function onKeyDown(event:KeyboardEvent){
  if(disposed||state.hidden||state.menuOpen||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;
  const shortcut=event.key==='?'||(event.code==='Slash'&&event.shiftKey);
  if(!shortcut&&!(open&&event.code==='Escape'))return;
  // Inherit external recording visibility, including #ui {visibility:hidden}.
  const styles=getComputedStyle(element),hostStyles=getComputedStyle(host);
  if(styles.visibility==='hidden'||styles.display==='none'||hostStyles.display==='none'||hostStyles.opacity==='0')return;
  event.preventDefault();event.stopImmediatePropagation();setOpen(shortcut?!open:false);
 }
 toggle.addEventListener('click',toggleHelp);close.addEventListener('click',closeHelp);window.addEventListener('keydown',onKeyDown,true);
 update(state);
 function dispose(){if(disposed)return;setOpen(false);disposed=true;window.removeEventListener('keydown',onKeyDown,true);toggle.removeEventListener('click',toggleHelp);close.removeEventListener('click',closeHelp);element.remove();if(!host.querySelector('.city-quicktips'))host.classList.remove('has-city-quicktips');}
 return {element,update,setExpanded:(value:boolean)=>setOpen(value),dispose,stats:()=>({mode:state.mode,open,hidden:!!(state.hidden||state.menuOpen),disposed})};
}
