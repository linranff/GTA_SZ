export type DrivingAudioState={speed:number;throttle:number;steer:number;braking:boolean;paused:boolean;cockpit:boolean;offroad?:boolean};
type AudioPreferences={muted:boolean;effects:number;music:number};
const STORAGE='shenchengji.audio.v1';
const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const defaults:AudioPreferences={muted:false,effects:.65,music:.32};

/** Original, locally synthesized electric drivetrain and ambient score. Audio
 * starts only after a trusted interaction; no remote streams or autoplay loop.
 * A fixed oscillator/noise graph serves driving. The score is scheduled ahead
 * of audio time so rendering frame rate does not affect musical timing. */
export class CityAudio {
 private context:AudioContext|null=null;
 private master:GainNode|null=null;private effects:GainNode|null=null;private music:GainNode|null=null;
 private motor:OscillatorNode|null=null;private harmonic:OscillatorNode|null=null;
 private motorGain:GainNode|null=null;private harmonicGain:GainNode|null=null;
 private rolling:GainNode|null=null;private wind:GainNode|null=null;private skid:GainNode|null=null;
 private rollingFilter:BiquadFilterNode|null=null;private windFilter:BiquadFilterNode|null=null;
 private meter:AnalyserNode|null=null;private meterSamples=new Float32Array(256);
 private sources:AudioScheduledSourceNode[]=[];private notes=new Set<AudioScheduledSourceNode>();
 private prefs:AudioPreferences={...defaults};private timer=0;private step=0;private nextNote=0;
 private scoreNotes=0;private lastSpeed=0;private lastPaused=false;private panel:HTMLElement|null=null;
 private lastImpact=-Infinity;private impactCount=0;
 private destroyed=false;private unlockError:string|null=null;private suspendedByVisibility=false;
 private unlock=()=>{void this.start();};
 private visibility=()=>{if(!this.context)return;if(document.hidden){this.suspendedByVisibility=true;void this.context.suspend();}else if(this.suspendedByVisibility){this.suspendedByVisibility=false;void this.context.resume().catch(()=>{});}};
 constructor(){
  try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved){this.prefs={muted:saved.muted===true,effects:Number.isFinite(saved.effects)?clamp(saved.effects):defaults.effects,music:Number.isFinite(saved.music)?clamp(saved.music):defaults.music};}}catch{}
  window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);
  document.addEventListener('visibilitychange',this.visibility);
 }
 async start(){
  if(this.destroyed)return;
  try{
   if(!this.context)this.createGraph();
   await this.context!.resume();this.unlockError=null;
   if(this.context!.state==='running'){window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);}
   this.refreshControls();
  }catch(error){this.unlockError=String(error);this.refreshControls();}
 }
 private createGraph(){
  const c=this.context=new AudioContext({latencyHint:'interactive'});
  this.master=c.createGain();this.effects=c.createGain();this.music=c.createGain();
  const compressor=c.createDynamicsCompressor();compressor.threshold.value=-17;compressor.knee.value=16;compressor.ratio.value=3;compressor.attack.value=.01;compressor.release.value=.2;
  this.meter=c.createAnalyser();this.meter.fftSize=256;
  this.effects.connect(this.master);this.music.connect(this.master);this.master.connect(compressor);compressor.connect(this.meter);this.meter.connect(c.destination);
  this.motor=c.createOscillator();this.motor.type='sine';this.motor.frequency.value=48;
  this.harmonic=c.createOscillator();this.harmonic.type='triangle';this.harmonic.frequency.value=98;
  this.motorGain=c.createGain();this.harmonicGain=c.createGain();this.motorGain.gain.value=0;this.harmonicGain.gain.value=0;
  this.motor.connect(this.motorGain).connect(this.effects);this.harmonic.connect(this.harmonicGain).connect(this.effects);
  this.motor.start();this.harmonic.start();this.sources.push(this.motor,this.harmonic);
  const noise=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const samples=noise.getChannelData(0);let seed=17321;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/4294967296)*2-1;}
  const makeNoise=(kind:BiquadFilterType,hz:number,q:number)=>{const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=noise;source.loop=true;filter.type=kind;filter.frequency.value=hz;filter.Q.value=q;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.effects!);source.start();this.sources.push(source);return {filter,gain};};
  const road=makeNoise('lowpass',680,.5);this.rolling=road.gain;this.rollingFilter=road.filter;
  const wind=makeNoise('bandpass',480,.6);this.wind=wind.gain;this.windFilter=wind.filter;
  this.skid=makeNoise('bandpass',1750,2.7).gain;
  this.nextNote=c.currentTime+.12;this.applyPreferences();
  this.timer=window.setInterval(()=>this.scheduleMusic(),100);this.scheduleMusic();
 }
 private tone(midi:number,at:number,duration:number,volume:number,type:OscillatorType='sine',bus:GainNode|null=this.music){
  const c=this.context;if(!c||!bus)return;
  const osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.value=440*2**((midi-69)/12);
  gain.gain.setValueAtTime(.00001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.075);gain.gain.exponentialRampToValueAtTime(.00001,at+duration);
  osc.connect(gain).connect(bus);osc.start(at);osc.stop(at+duration+.02);this.notes.add(osc);
  osc.onended=()=>{this.notes.delete(osc);osc.disconnect();gain.disconnect();};
 }
 private scheduleMusic(){
  const c=this.context;if(!c||c.state!=='running')return;
  // 海湾晚风 — an original 16-bar arrangement, 72 BPM; warm extended chords,
  // alternating upper melody and soft bass. Quiet gaps keep the road audible.
  const beat=60/72,chords=[[50,57,60,64],[46,53,57,60],[53,60,64,67],[48,55,58,62]];
  if(this.nextNote<c.currentTime-.25)this.nextNote=c.currentTime+.1;
  while(this.nextNote<c.currentTime+.35){
   const chord=chords[Math.floor(this.step/16)%4],slot=this.step%16,at=this.nextNote;
   if(!this.prefs.muted&&this.prefs.music>0){
    if(slot%8===0){for(const note of chord)this.tone(note,at,beat*5,.021);this.tone(chord[0]-12,at,beat*3,.053);}
    const melody=[0,2,3,1,2,1,3,2];if(slot%2===0&&slot!==14)this.tone(chord[melody[slot/2]]+12,at,beat*1.7,.042,'triangle');
    this.scoreNotes++;
   }
   this.step++;this.nextNote+=beat/2;
  }
 }
 update(state:DrivingAudioState){
  this.lastSpeed=state.speed;const pauseChanged=this.lastPaused!==state.paused;this.lastPaused=state.paused;if(pauseChanged)this.applyPreferences();
  const c=this.context;if(!c||c.state!=='running')return;
  const speed=Math.abs(state.speed),motion=clamp(speed/32),load=clamp(state.throttle),attenuation=state.cockpit?.52:1,active=state.paused?0:1,at=c.currentTime;
  const set=(param:AudioParam,value:number,time=.1)=>param.setTargetAtTime(value,at,time);
  set(this.motor!.frequency,48+speed*8+load*14);set(this.harmonic!.frequency,98+speed*15+load*24);
  set(this.motorGain!.gain,active*(speed>.12?.025+.06*motion+.022*load:0)*attenuation);
  set(this.harmonicGain!.gain,active*(.012*motion+.022*load)*attenuation);
  set(this.rolling!.gain,active*Math.pow(motion,.65)*(state.offroad?.21:.12)*attenuation);
  set(this.rollingFilter!.frequency,state.offroad?450:600+speed*18);
  set(this.wind!.gain,active*motion*motion*.19*attenuation);set(this.windFilter!.frequency,340+speed*12);
  const slipping=state.braking&&speed>8?clamp((speed-8)/26)*.055:Math.max(0,Math.abs(state.steer)*speed-6)*.004;
  set(this.skid!.gain,active*clamp(slipping,0,.09)*attenuation,.06);
 }
 /** Short speed-dependent bodywork thud, on the existing effects/mute bus. */
 impact(speed:number){
  const c=this.context;if(!c||c.state!=='running'||c.currentTime-this.lastImpact<.09)return;
  this.lastImpact=c.currentTime;this.impactCount++;
  const at=c.currentTime,osc=c.createOscillator(),gain=c.createGain();osc.type='triangle';
  osc.frequency.setValueAtTime(135+clamp(speed/45)*65,at);osc.frequency.exponentialRampToValueAtTime(38,at+.16);
  gain.gain.setValueAtTime(.00001,at);gain.gain.exponentialRampToValueAtTime(.035+clamp(speed/40)*.09,at+.006);gain.gain.exponentialRampToValueAtTime(.00001,at+.2);
  osc.connect(gain).connect(this.effects!);osc.start(at);osc.stop(at+.22);this.notes.add(osc);
  osc.onended=()=>{this.notes.delete(osc);osc.disconnect();gain.disconnect();};
 }
 /** Synthesized blast uses the same effects gain and mute preferences. */
 explosion(){
  const c=this.context;if(!c||c.state!=='running'||!this.effects)return;
  const at=c.currentTime,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*2.2),c.sampleRate),samples=buffer.getChannelData(0);let seed=7151;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
  source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(2900,at);filter.frequency.exponentialRampToValueAtTime(350,at+.30);filter.frequency.setValueAtTime(1700,at+.34);filter.frequency.exponentialRampToValueAtTime(250,at+.8);filter.frequency.setValueAtTime(1100,at+.85);filter.frequency.exponentialRampToValueAtTime(100,at+2.15);
  gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.75,at+.012);gain.gain.exponentialRampToValueAtTime(.08,at+.30);gain.gain.exponentialRampToValueAtTime(.50,at+.36);gain.gain.exponentialRampToValueAtTime(.04,at+.80);gain.gain.exponentialRampToValueAtTime(.38,at+.87);gain.gain.exponentialRampToValueAtTime(.0001,at+2.18);
  source.connect(filter).connect(gain).connect(this.effects);source.start(at);source.stop(at+2.2);this.notes.add(source);
  source.onended=()=>{this.notes.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
  this.tone(28,at,.8,.26,'sine',this.effects);this.tone(25,at+.34,1.1,.20,'sine',this.effects);this.tone(23,at+.85,1.2,.16,'sine',this.effects);
 }
 cue(kind:'arrival'|'engage'|'cancel'|'horn'){
  const c=this.context;if(!c||c.state!=='running')return;
  const notes=kind==='arrival'?[69,73,76]:kind==='engage'?[64,71]:kind==='cancel'?[67,62]:[55,59];
  notes.forEach((note,i)=>this.tone(note,c.currentTime+(kind==='horn'?0:i*.14),kind==='horn'?.45:.7,kind==='horn'?.1:.07,kind==='horn'?'triangle':'sine',this.effects));
 }
 private applyPreferences(){const c=this.context;if(!c)return;const at=c.currentTime;this.master!.gain.setTargetAtTime(this.prefs.muted?0:.75,at,.08);this.effects!.gain.setTargetAtTime(this.prefs.effects,at,.08);this.music!.gain.setTargetAtTime(this.prefs.music*(this.lastPaused?.7:1),at,.3);}
 setPreferences(patch:Partial<AudioPreferences>){this.prefs={...this.prefs,...patch};this.prefs.effects=clamp(this.prefs.effects);this.prefs.music=clamp(this.prefs.music);try{localStorage.setItem(STORAGE,JSON.stringify(this.prefs));}catch{}this.applyPreferences();this.refreshControls();}
 mountControls(host:HTMLElement){
  this.panel?.remove();const panel=this.panel=document.createElement('section');panel.className='city-audio-controls';panel.setAttribute('aria-label','声音设置');
  panel.innerHTML='<div class="audio-heading"><span>声音与音乐</span><button type="button" class="audio-toggle"></button></div><label>车辆 / 环境<input type="range" min="0" max="100" step="1" data-audio="effects" aria-label="车辆和环境音量"></label><label>海湾晚风 · BGM<input type="range" min="0" max="100" step="1" data-audio="music" aria-label="背景音乐音量"></label><small class="audio-state"></small>';
  panel.querySelector('button')!.addEventListener('click',()=>{void this.start();this.setPreferences({muted:!this.prefs.muted});});
  for(const input of Array.from(panel.querySelectorAll<HTMLInputElement>('input')))input.addEventListener('input',()=>{void this.start();this.setPreferences({[input.dataset.audio!]:Number(input.value)/100});});
  // Controls are part of the pause menu: adjusting a slider cannot steer or
  // inadvertently dismiss the menu through global driving shortcuts.
  panel.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});host.append(panel);this.refreshControls();
 }
 private refreshControls(){if(!this.panel)return;const button=this.panel.querySelector('button')!;button.textContent=this.prefs.muted?'开启声音':'静音';button.setAttribute('aria-pressed',String(this.prefs.muted));for(const input of Array.from(this.panel.querySelectorAll<HTMLInputElement>('input')))input.value=String(this.prefs[input.dataset.audio as 'effects'|'music']*100);this.panel.querySelector('small')!.textContent=this.unlockError?'点击开启声音重试':this.context?.state==='running'?'原创氛围音乐 · 电驱 / 胎噪 / 风噪 · H 鸣笛':'点击游戏后启用声音';}
 get stats(){let rms=0;if(this.meter){this.meter.getFloatTimeDomainData(this.meterSamples);for(const n of this.meterSamples)rms+=n*n;rms=Math.sqrt(rms/this.meterSamples.length);}return {state:this.context?.state??'locked',impactCount:this.impactCount,...this.prefs,score:'海湾晚风',scoreNotes:this.scoreNotes,activeNotes:this.notes.size,continuousSources:this.sources.length,speed:this.lastSpeed,rms,unlockError:this.unlockError};}
 dispose(){this.destroyed=true;window.clearInterval(this.timer);window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);document.removeEventListener('visibilitychange',this.visibility);for(const source of [...this.sources,...this.notes]){try{source.stop();}catch{}source.disconnect();}void this.context?.close();this.panel?.remove();}
}
