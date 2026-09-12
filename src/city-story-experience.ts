import './city-story.css';
import type {CityStoryContent,StoryHooks} from './city-story-contract.ts';
import {
  createStoryRuntime,storyHotkeysOpen,STORY_ARRIVE_RADIUS,
  type StoryRuntime,type StoryStorage,type StoryView,
} from './city-story.ts';

export {
  StoryGame,createStoryRuntime,readStorySave,newStorySave,validateStoryContent,storyGraph,storyHotkeysOpen,
  STORY_SAVE_KEY,STORY_SAVE_VERSION,STORY_ARRIVE_RADIUS,
} from './city-story.ts';
export type {StoryGame as StoryGameType,StoryRuntime,StorySave,StoryView,StoryPhase,StoryStorage} from './city-story.ts';

export type StoryExperience={
  tick(dt:number):void;
  interact():boolean;
  prompt():string|null;
  dispose():void;
  readonly active:boolean;
  readonly view:StoryView;
};
export type StoryExperienceOptions={host?:ParentNode|null;storage?:StoryStorage|null;document?:Document|null};

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const ACTION={talk:'交谈',collect:'领取',deliver:'交付'} as const;

function resolveHost(options?:StoryExperienceOptions){
  if(options?.host===null)return null;
  if(options?.host instanceof HTMLElement)return options.host;
  const doc=options?.document??(typeof document==='undefined'?null:document);
  if(!doc)return null;
  return doc.querySelector<HTMLElement>('#ui')??doc.body;
}

function emptyView(content:CityStoryContent):StoryView{
  return {
    id:'bay-last-delivery',title:content.title||'城市故事',synopsis:content.synopsis||'',phase:'idle',
    active:false,completed:false,step:null,path:[],choices:{},debugFlagged:false,mustLeave:false,payout:'none',
    destination:null,
  };
}

export function createStoryExperience(content:CityStoryContent,hooks:StoryHooks,options?:StoryExperienceOptions):StoryExperience{
  let runtime:StoryRuntime|null=null;
  try{runtime=createStoryRuntime(content,hooks,options?.storage);}
  catch(error){
    hooks.toast(error instanceof Error?error.message:'城市故事内容尚未就绪');
    const view=emptyView(content);
    return {tick(){},interact:()=>false,prompt:()=>null,dispose(){},get active(){return false;},get view(){return view;}};
  }

  const host=resolveHost(options);
  const root=host&&'ownerDocument' in host?host.ownerDocument:options?.document??(typeof document==='undefined'?null:document);
  const win=root?.defaultView??(typeof window==='undefined'?null:window);
  let disposed=false,collapsed=false,signature='',renderAt=0;

  const entry=root?.createElement('button')??null;
  const hud=root?.createElement('section')??null;
  const dialog=root?.createElement('section')??null;
  if(entry&&hud&&dialog&&host){
    entry.type='button';entry.className='story-entry';entry.setAttribute('aria-label','打开城市故事');
    hud.className='story-hud';hud.hidden=true;
    dialog.className='story-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','城市故事对白');
    host.append(entry,hud,dialog);
    entry.addEventListener('click',()=>{if(disposed)return;if(runtime!.active){collapsed=false;paint(true);return;}runtime!.start();collapsed=false;paint(true);});
    hud.addEventListener('click',onHudClick);
    dialog.addEventListener('click',onDialogClick);
  }
  if(win)win.addEventListener('keydown',onKeyDown,true);

  function onHudClick(event:Event){
    const button=(event.target as HTMLElement|null)?.closest?.('button[data-story]');
    if(!(button instanceof HTMLButtonElement)||disposed)return;
    act(button.dataset.story??'');
  }
  function onDialogClick(event:Event){
    const button=(event.target as HTMLElement|null)?.closest?.('button[data-story],button[data-choice]');
    if(!(button instanceof HTMLButtonElement)||disposed)return;
    if(button.dataset.choice){runtime!.choose(button.dataset.choice);collapsed=false;paint(true);return;}
    act(button.dataset.story??'');
  }
  function act(name:string){
    if(name==='continue'){if(runtime!.view.phase==='payout')runtime!.tryPayout();else runtime!.interact();}
    else if(name==='skip')runtime!.skip();
    else if(name==='cancel')runtime!.cancel();
    else if(name==='retry')runtime!.retryStep();
    else if(name==='payout')runtime!.tryPayout();
    else if(name==='open'){
      const gate=runtime!.game.readyToTalk(hooks.frame());
      if(!gate.ok){hooks.toast(gate.message);return;}
      collapsed=false;runtime!.setPanelOpen(true);paint(true);return;
    }
    collapsed=name==='cancel';
    if(name==='cancel')runtime!.setPanelOpen(false);
    paint(true);
  }
  function consume(event:KeyboardEvent){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  }
  function atStep(){
    const step=runtime!.view.step,frame=hooks.frame();
    return !!step&&Number.isFinite(frame.x)&&Math.hypot(frame.x-step.point[0],frame.z-step.point[1])<STORY_ARRIVE_RADIUS+7;
  }
  function dialogInteractive(){
    return storyHotkeysOpen({
      phase:runtime!.view.phase,collapsed,blocked:hooks.frame().blocked,dialogHidden:!dialog||dialog.hidden,
    });
  }
  function onKeyDown(event:KeyboardEvent){
    if(disposed||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;
    if(!dialogInteractive())return;
    const view=runtime!.view;
    if(event.code==='Escape'){
      collapsed=true;runtime!.setPanelOpen(false);paint(true);consume(event);return;
    }
    if(view.phase==='choice'){
      const index=Number(event.key)-1;
      const choice=view.step?.choices[index];
      if(choice){runtime!.choose(choice.id);collapsed=false;paint(true);consume(event);}
      return;
    }
    if(event.code==='Enter'||event.code==='Space'){
      if(view.phase==='payout')runtime!.tryPayout();
      else runtime!.interact();
      paint(true);consume(event);
    }
  }

  function paint(force=false){
    if(!entry||!hud||!dialog||disposed)return;
    const view=runtime!.view;
    const frame=hooks.frame();
    const next=[view.phase,view.step?.id??'',String(view.step?.lineIndex??0),view.payout,String(view.debugFlagged),String(view.mustLeave),String(collapsed),String(frame.blocked),String(frame.paused)].join('|');
    if(!force&&next===signature)return;
    signature=next;

    const hideChrome=frame.blocked&&!view.active;
    const talking=view.phase==='dialogue'||view.phase==='choice';
    const showDialog=!collapsed&&talking&&!frame.blocked;
    if(host instanceof HTMLElement)host.classList.toggle('story-modal-open',showDialog);
    entry.hidden=hideChrome||view.active||showDialog||collapsed&&view.phase!=='idle';
    entry.innerHTML=`<small>城市故事</small><strong>${esc(view.title)}</strong><span>${view.completed?'已完成 · 奖励不会重复发放':esc(view.synopsis)}</span>`;

    const showHud=(view.active||view.payout==='pending')&&!hideChrome&&!showDialog;
    hud.hidden=!showHud;
    if(showHud&&view.step){
      hud.innerHTML=`<small>城市故事</small><strong>${esc(view.step.title)}</strong><span>${esc(view.step.objective)}</span>
        ${view.debugFlagged||view.mustLeave?'<p class="story-warning">调试跳转已记录，不能当作送达。</p>':''}
        <div class="story-hud-actions">
          ${talking?'<button type="button" data-story="open">'+(collapsed?'打开对白':'看对白')+'</button>':''}
          ${view.payout==='pending'?'<button type="button" data-story="payout">领取结算</button>':''}
          ${view.debugFlagged||view.mustLeave?'<button type="button" data-story="retry">重试本段</button>':''}
          <button type="button" data-story="cancel" class="quiet">取消重来</button>
        </div>`;
    }

    dialog.hidden=!showDialog;
    if(showDialog&&view.step){
      const person=view.step.line?content.people[view.step.line.speaker]:null;
      const choices=view.phase==='choice'?view.step.choices:[];
      dialog.innerHTML=`<small>城市故事 · ${esc(ACTION[view.step.action])}</small>
        <strong>${esc(person?.name??view.step.title)}</strong>
        <p class="story-role">${esc(person?.role??view.step.objective)}</p>
        <blockquote>${esc(view.step.line?.text??view.step.objective)}</blockquote>
        <div class="story-choices">${choices.map((choice,index)=>`<button type="button" data-choice="${esc(choice.id)}"><strong><kbd>${index+1}</kbd> ${esc(choice.label)}</strong><span>${esc(choice.consequence)}</span></button>`).join('')}</div>
        <div class="story-actions">
          ${view.phase==='dialogue'?'<button type="button" data-story="skip">跳过本段</button><button type="button" data-story="continue">继续</button>':''}
          ${view.debugFlagged||view.mustLeave?'<button type="button" data-story="retry">重试本段</button>':''}
          <button type="button" data-story="cancel" class="quiet">取消本单</button>
        </div>`;
    }
  }

  paint(true);

  return {
    tick(dt:number){
      if(disposed||!runtime)return;
      runtime.tick();
      renderAt+=dt;
      if(renderAt<0.12&&signature)return;
      renderAt=0;
      paint();
    },
    interact(){
      if(disposed||!runtime)return false;
      const view=runtime.view;
      if(collapsed&&(view.phase==='dialogue'||view.phase==='choice')){
        const frame=hooks.frame();
        if(frame.blocked||!atStep())return false;
        const gate=runtime.game.readyToTalk(frame);
        if(!gate.ok)return runtime.interact();
        collapsed=false;runtime.setPanelOpen(true);paint(true);return true;
      }
      const handled=runtime.interact();
      paint(true);
      return handled;
    },
    prompt(){return disposed||!runtime?null:runtime.prompt();},
    dispose(){
      if(disposed)return;disposed=true;runtime?.dispose();
      if(host instanceof HTMLElement)host.classList.remove('story-modal-open');
      if(win)win.removeEventListener('keydown',onKeyDown,true);
      entry?.remove();hud?.remove();dialog?.remove();
    },
    get active(){return !!runtime?.active;},
    get view(){return runtime?.view??emptyView(content);},
  };
}
