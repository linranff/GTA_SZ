import {Engine,Mesh,MeshBuilder,ShaderMaterial,Vector3,type Scene,type Camera} from '@babylonjs/core';
import {BEACON_HOLD_MS,BEACON_LIMIT,BEACON_STORAGE_KEY,BeaconHoldGesture,beaconName,copyBeaconPoint,decodeBeaconFavorites,encodeBeaconFavorites,matchingBeacon,validBeaconPoint,type BeaconPoint,type BeaconFavorite} from './city-observer-beacon-state';
import './city-observer-beacons.css';
export type {BeaconPoint} from './city-observer-beacon-state';

type ObserverBeaconsOptions={scene:Scene;camera:Camera;canvas:HTMLCanvasElement;host:HTMLElement;active:()=>boolean;pick:(clientX:number,clientY:number)=>BeaconPoint|null;travel:(point:BeaconPoint)=>boolean;stopDrag:()=>void;toast:(message:string)=>void;focus?:(point:BeaconPoint)=>void};
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string)=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
const button=(className:string,text:string)=>{const node=element('button',className,text);node.type='button';return node;};

/** One lightweight destination beam, with local bookmarks. No lighting, shadow
 * casters, reflection draws, textures or additional render targets are added. */
export function createObserverBeacons(options:ObserverBeaconsOptions){
 const {scene,camera,canvas,host}=options,abort=new AbortController(),gesture=new BeaconHoldGesture();
 let favorites:BeaconFavorite[]=[],storageAvailable=true,selected:BeaconPoint|null=null,listOpen=false,enabled=false,time=0,holdTimer:ReturnType<typeof setTimeout>|null=null,disposed=false,holdPose:{position:Vector3;forward:Vector3}|null=null;
 try{favorites=decodeBeaconFavorites(localStorage.getItem(BEACON_STORAGE_KEY));}catch{storageAvailable=false;}
 const root=element('div','observer-beacons');root.hidden=true;
 const toggle=button('observer-beacons-toggle','收藏地点 0');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','observer-beacon-places');
 const panel=element('section','observer-beacon-panel');panel.hidden=true;panel.setAttribute('aria-label','光柱地点');
 const heading=element('div','observer-beacon-heading'),eyebrow=element('span','observer-beacon-eyebrow','城市坐标 / 留一个记号'),dismiss=button('observer-beacon-dismiss','×');dismiss.setAttribute('aria-label','关闭光柱');heading.append(eyebrow,dismiss);
 const title=element('h2','observer-beacon-title','此处风景'),label=element('label','observer-beacon-name-label','地点名称'),name=element('input','observer-beacon-name');name.type='text';name.maxLength=48;name.autocomplete='off';name.placeholder='给这处风景起个名字';name.setAttribute('aria-label','地点名称');label.append(name);
 const hint=element('p','observer-beacon-hint'),actions=element('div','observer-beacon-actions'),save=button('observer-beacon-save','收藏地点'),travel=button('observer-beacon-travel','移动到此地');actions.append(save,travel);
 const foot=element('p','observer-beacon-foot','再次长按画面可换一个落点 · Esc 关闭');panel.append(heading,title,label,hint,actions,foot);
 const list=element('section','observer-beacon-list');list.id='observer-beacon-places';list.hidden=true;list.setAttribute('aria-label','收藏地点列表');
 const progress=element('div','observer-beacon-hold');progress.hidden=true;progress.setAttribute('aria-hidden','true');progress.append(element('span','observer-beacon-hold-dot'));
 root.append(toggle,panel,list,progress);host.append(root);

 const makeMaterial=(name:string,opacity:number)=>{
  const material=new ShaderMaterial(name,scene,{
   vertexSource:`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vPosition;varying vec3 vNormal;varying vec2 vUV;
    void main(){vPosition=(world*vec4(position,1.)).xyz;vNormal=normalize(mat3(world)*normal);vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}`,
   fragmentSource:`precision highp float;varying vec3 vPosition;varying vec3 vNormal;varying vec2 vUV;uniform vec3 eyePosition;uniform float opacity;uniform float pulse;uniform float ring;
    void main(){float facing=abs(dot(normalize(vNormal),normalize(eyePosition-vPosition)));float edge=smoothstep(.02,.8,facing);float heightFade=(1.-smoothstep(.48,1.,vUV.y))*smoothstep(0.,.025,vUV.y);float ringDistance=abs(length(vUV-.5)-.45);float aa=max(fwidth(ringDistance),.002);float ringMask=1.-smoothstep(max(0.,.009-aa),.009+aa,ringDistance);float alpha=mix(edge*heightFade,ringMask,ring)*opacity*pulse;gl_FragColor=vec4(vec3(.55,4.8,3.10),alpha);}`,
  },{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','eyePosition','opacity','pulse','ring'],needAlphaBlending:true});
  material.alphaMode=Engine.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=true;material.setFloat('opacity',opacity);material.setFloat('pulse',1);material.setFloat('ring',0);return material;
 };
 const glowMaterial=makeMaterial('observer-beacon-glow-material',.20),coreMaterial=makeMaterial('observer-beacon-core-material',.82),ringMaterial=makeMaterial('observer-beacon-ring-material',.54);ringMaterial.setFloat('ring',1);
 const glow=MeshBuilder.CreateCylinder('observer-beacon-glow',{height:1,diameter:2,tessellation:16,cap:Mesh.NO_CAP},scene),core=MeshBuilder.CreateCylinder('observer-beacon-core',{height:1,diameter:2,tessellation:12,cap:Mesh.NO_CAP},scene),ring=MeshBuilder.CreateDisc('observer-beacon-ground-ring',{radius:6,tessellation:48,sideOrientation:Mesh.DOUBLESIDE},scene);ring.rotation.x=Math.PI/2;
 glow.material=glowMaterial;core.material=coreMaterial;ring.material=ringMaterial;
 const meshes=[glow,core,ring],materials=[glowMaterial,coreMaterial,ringMaterial];
 for(const mesh of meshes){mesh.isPickable=false;mesh.receiveShadows=false;mesh.applyFog=false;mesh.metadata={castsShadows:false,excludeFromReflection:true,observerBeacon:true};mesh.setEnabled(false);}
 const triangles=meshes.reduce((n,mesh)=>n+mesh.getTotalIndices()/3,0);
 function saveStorage(){try{localStorage.setItem(BEACON_STORAGE_KEY,encodeBeaconFavorites(favorites));storageAvailable=true;return true;}catch{storageAvailable=false;options.toast('收藏保留在本次游玩中；浏览器暂时无法保存');return false;}}
 function updateToggle(){toggle.textContent=`收藏地点 ${favorites.length}`;toggle.setAttribute('aria-expanded',String(listOpen));}
 function renderList(){
  list.replaceChildren();const top=element('div','observer-beacon-heading');top.append(element('h2','observer-beacon-list-title',`收藏地点 · ${favorites.length} / ${BEACON_LIMIT}`));const closeList=button('observer-beacon-dismiss','×');closeList.setAttribute('aria-label','关闭收藏列表');closeList.onclick=()=>{listOpen=false;sync();};top.append(closeList);list.append(top);
  if(!favorites.length){list.append(element('p','observer-beacon-empty','长按风景中的一点，让光柱记住这里。'));return;}
  const rows=element('div','observer-beacon-rows');
  for(const place of favorites){
   const row=element('div','observer-beacon-row'),view=button('observer-beacon-place',place.name);view.title='俯瞰这个地点';view.onclick=()=>{if(!options.active())return;options.stopDrag();options.focus?.(copyBeaconPoint(place));select(place);};
   const remove=button('observer-beacon-remove','移除');remove.setAttribute('aria-label',`移除收藏：${place.name}`);remove.onclick=()=>{favorites=favorites.filter(item=>item.id!==place.id);saveStorage();renderList();sync();};row.append(view,remove);rows.append(row);
  }list.append(rows);
 }
 function sync(){
  updateToggle();list.hidden=!enabled||!listOpen;panel.hidden=!enabled||!selected||listOpen;
  const existing=selected?matchingBeacon(favorites,selected):undefined;save.textContent=existing?'更新收藏':'收藏地点';save.disabled=!existing&&favorites.length>=BEACON_LIMIT;save.title=save.disabled?'收藏已满，请先移除一个地点':'';
  travel.disabled=!selected?.arrival;travel.title=travel.disabled?'附近没有适合车辆落地的道路':'';
  for(const mesh of meshes)mesh.setEnabled(enabled&&!!selected);
 }
 function select(point:BeaconPoint){
  if(!validBeaconPoint(point))return;selected=copyBeaconPoint(point);listOpen=false;name.value=selected.name;title.textContent=selected.name;hint.textContent=selected.arrival?'移动后将停在这个地点附近的道路上。':'这里附近没有可落地道路，仍可收藏这处风景。';sync();positionBeam();
 }
 function cancelHold(){if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null;}gesture.cancel();holdPose=null;progress.hidden=true;}
 function cameraMovedDuringHold(){return !!holdPose&&(Vector3.DistanceSquared(camera.globalPosition,holdPose.position)>.01||Vector3.Dot(camera.getForwardRay().direction,holdPose.forward)<.9999985);}
 function close(){cancelHold();selected=null;listOpen=false;if(root.contains(document.activeElement))(document.activeElement as HTMLElement).blur();sync();}
 function positionBeam(){
  if(!selected||!enabled)return;const distance=Vector3.Distance(camera.globalPosition,new Vector3(selected.x,selected.y,selected.z)),height=Math.max(100,Math.min(560,distance*.31)),width=Math.max(.65,Math.min(5.5,distance*.002));
  glow.position.set(selected.x,selected.y+.24+height/2,selected.z);glow.scaling.set(width,height,width);core.position.copyFrom(glow.position);core.scaling.set(width*.24,height,width*.24);
  ring.position.set(selected.x,selected.y+.26,selected.z);const ringScale=Math.max(.7,Math.min(2.8,distance/900));ring.scaling.setAll(ringScale);
  const pulse=.94+Math.sin(time*1.65)*.06;for(const material of materials){material.setVector3('eyePosition',camera.globalPosition);material.setFloat('pulse',pulse);}
 }
 function finishHold(){
  holdTimer=null;if(!options.active()||disposed||cameraMovedDuringHold()){cancelHold();return;}const location=gesture.fire(performance.now());if(!location)return;
  progress.hidden=true;options.stopDrag();const point=options.pick(location.x,location.y);
  if(point)select(point);else options.toast('长按地面或建筑选点，天空中无法放置光柱');
 }
 const capture={capture:true,signal:abort.signal};
 canvas.addEventListener('pointerdown',event=>{
  if(!options.active())return;if(gesture.pointer){cancelHold();return;}
  if(!gesture.begin({id:event.pointerId,x:event.clientX,y:event.clientY,button:event.button,primary:event.isPrimary,shift:event.shiftKey},performance.now()))return;
  holdPose={position:camera.globalPosition.clone(),forward:camera.getForwardRay().direction.clone()};
  progress.style.left=event.clientX+'px';progress.style.top=event.clientY+'px';progress.style.setProperty('--hold-progress','0turn');progress.hidden=false;holdTimer=setTimeout(finishHold,BEACON_HOLD_MS+2);
 },capture);
 canvas.addEventListener('pointermove',event=>{
  if(!gesture.pointer)return;if(!options.active()||!event.buttons){cancelHold();return;}
  if(gesture.move(event.pointerId,event.clientX,event.clientY,event.shiftKey,event.buttons)){event.stopImmediatePropagation();event.preventDefault();}
  else if(!gesture.pointer)cancelHold();
 },capture);
 window.addEventListener('pointerup',event=>{const held=gesture.end(event.pointerId);if(!gesture.pointer)cancelHold();if(held){event.stopImmediatePropagation();event.preventDefault();}},capture);
 window.addEventListener('pointercancel',cancelHold,capture);canvas.addEventListener('lostpointercapture',cancelHold,capture);
 canvas.addEventListener('wheel',cancelHold,{...capture,passive:true});
 canvas.addEventListener('touchstart',event=>{if(event.touches.length>1)cancelHold();},capture);
 canvas.addEventListener('touchmove',event=>{if(gesture.pointer){event.stopImmediatePropagation();event.preventDefault();}},{...capture,passive:false});
 window.addEventListener('blur',cancelHold,{signal:abort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelHold();},{signal:abort.signal});
 window.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&(selected||listOpen||gesture.pointer)){event.stopImmediatePropagation();event.preventDefault();close();return;}
  if(event.target instanceof HTMLElement&&root.contains(event.target)){
   // Preserve typing and native button activation/focus navigation. A button
   // retaining focus after a mouse click must not disable flight/game keys.
   if(event.target.closest('input,textarea,select,[contenteditable=true]')||['Space','Enter','NumpadEnter','Tab'].includes(event.code)){event.stopImmediatePropagation();return;}
  }
  if(gesture.pointer&&['ShiftLeft','ShiftRight','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))cancelHold();
 },capture);
 name.addEventListener('focus',()=>options.stopDrag(),{signal:abort.signal});
 toggle.onclick=()=>{if(!options.active())return;cancelHold();options.stopDrag();listOpen=!listOpen;if(listOpen)renderList();sync();};dismiss.onclick=close;
 save.onclick=()=>{
  if(!selected)return;const point={...copyBeaconPoint(selected),name:beaconName(name.value,selected.name)},existing=matchingBeacon(favorites,point);
  if(existing){favorites=favorites.map(place=>place.id===existing.id?{...point,id:place.id,createdAt:place.createdAt}:place);}
  else{if(favorites.length>=BEACON_LIMIT){options.toast('收藏已满，请先移除一个地点');return;}favorites.push({...point,id:globalThis.crypto?.randomUUID?.()??`place-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,createdAt:Date.now()});}
  selected=point;name.value=point.name;title.textContent=point.name;const persisted=saveStorage();sync();if(persisted)options.toast(`${existing?'已更新':'已收藏'} · ${point.name}`);
 };
 travel.onclick=()=>{if(selected?.arrival&&options.active()){options.stopDrag();if(options.travel({...copyBeaconPoint(selected),name:beaconName(name.value,selected.name)}))close();}};
 updateToggle();
 return {update(dt:number){
  if(disposed)return;const next=options.active();if(next!==enabled){enabled=next;root.hidden=!enabled;if(!enabled)close();else sync();}
  if(!enabled)return;time+=Math.min(.1,Math.max(0,dt));if(gesture.pointer?.phase==='pending'){if(cameraMovedDuringHold())cancelHold();else progress.style.setProperty('--hold-progress',gesture.progress(performance.now())+'turn');}positionBeam();
 },close,get stats(){return {active:enabled,selected:selected?copyBeaconPoint(selected):null,favorites:favorites.map(place=>({...copyBeaconPoint(place),id:place.id,createdAt:place.createdAt})),pending:gesture.pointer?.phase??null,meshCount:meshes.length,triangles,storageAvailable};},dispose(){disposed=true;cancelHold();abort.abort();for(const mesh of meshes)mesh.dispose();for(const material of materials)material.dispose();root.remove();}};
}
