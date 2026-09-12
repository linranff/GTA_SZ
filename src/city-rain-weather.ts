import {Mesh,ShaderMaterial,Vector3,VertexData,type DirectionalLight,type HemisphericLight,type Material,type Scene} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-daylight.ts';
import type {RainPool} from './city-rain-puddles.ts';

const DROP_COUNT=240;
const RIPPLE_COUNT=64;
const hash=(value:number)=>{const n=Math.sin(value*127.1+311.7)*43758.5453;return n-Math.floor(n);};

/** Camera-local rainfall and puddle impacts. Both effects share one mesh each;
 * only uniforms change per frame, and the impact vertices move every 8 m.
 * The existing road mirror provides all scene reflections. */
export function createCityRainWeather(scene:Scene,nearby:(x:number,z:number,radius?:number,limit?:number)=>RainPool[],sun:DirectionalLight,hemi:HemisphericLight){
 const sky=scene.getMeshByName('atmosphere');
 const overcast=new ShaderMaterial('city-rain-overcast-sky',scene,{
  vertexSource:`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDirection;
   void main(){vDirection=position;gl_Position=worldViewProjection*vec4(position,1.0);}`,
  fragmentSource:`precision highp float;varying vec3 vDirection;uniform float rainSkyMode;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.06,.72,d.y);
    vec2 p=d.xz/max(.25,d.y+.22)*1.25;
    float cloud=noise(p*1.6)*.50+noise(p*3.3+12.4)*.32+noise(p*6.6-8.1)*.18;
    float layers=smoothstep(.35,.75,cloud);
    vec3 day=mix(vec3(.39,.46,.53),vec3(.55,.63,.71),h)+vec3(.14,.15,.15)*(layers-.5);
    vec3 dusk=mix(vec3(.20,.23,.30),vec3(.30,.33,.41),h)+vec3(.10,.075,.07)*(layers-.5);
    vec3 night=mix(vec3(.019,.025,.042),vec3(.033,.041,.063),h)+vec3(.018,.020,.025)*(layers-.5);
    vec3 color=rainSkyMode<.5?dusk:rainSkyMode<1.5?night:day;
    gl_FragColor=vec4(color,1.0);
   }`,
 },{attributes:['position'],uniforms:['worldViewProjection','rainSkyMode']});
 overcast.backFaceCulling=false;overcast.disableDepthWrite=true;
 const streakMaterial=new ShaderMaterial('city-rain-streaks',scene,{
  vertexSource:`precision highp float;
   attribute vec3 position;attribute vec2 uv;attribute vec4 color;
   uniform mat4 worldViewProjection;uniform float rainTime;
   varying vec2 vUV;varying float vOpacity;
   void main(){
    float falling=mod(position.y-rainTime*(13.0+color.g*8.0)+40.0,20.0)-6.0;
    vec3 p=vec3(position.x+uv.y*.11,falling+uv.y*(.55+color.b*.42),position.z);
    vUV=uv;vOpacity=mix(.26,.52,color.b)*(1.0-smoothstep(10.0,15.0,length(position.xz)));
    gl_Position=worldViewProjection*vec4(p,1.0);
   }`,
  fragmentSource:`precision highp float;varying vec2 vUV;varying float vOpacity;uniform float rainBrightness;
   void main(){float tip=sin(vUV.y*3.14159265);float edge=1.0-abs(vUV.x*2.0-1.0);
    float alpha=vOpacity*rainBrightness*(.55+.45*tip)*(.62+.38*edge);
    gl_FragColor=vec4(.73,.84,.95,alpha);
   }`,
 },{attributes:['position','uv','color'],uniforms:['worldViewProjection','rainTime','rainBrightness'],needAlphaBlending:true});
 streakMaterial.backFaceCulling=false;streakMaterial.disableDepthWrite=true;
 const streaks=new Mesh('city-rain-falling',scene),drops=new VertexData();
 const positions:number[]=[],uvs:number[]=[],colors:number[]=[],indices:number[]=[];
 for(let i=0;i<DROP_COUNT;i++){
  const x=(hash(i*31+1)-.5)*28,z=(hash(i*31+2)-.5)*28,base=hash(i*31+3)*20;
  const width=.014+hash(i*31+4)*.018,phase=hash(i*31+5),speed=hash(i*31+6),brightness=hash(i*31+7);
  const offset=i*4;
  for(const [side,along] of [[-1,0],[1,0],[1,1],[-1,1]]){
   positions.push(x+side*width,base,z);uvs.push((side+1)*.5,along);colors.push(phase,speed,brightness,1);
  }
  indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
 }
 drops.positions=positions;drops.uvs=uvs;drops.colors=colors;drops.indices=indices;drops.applyToMesh(streaks);
 streaks.material=streakMaterial;streaks.isPickable=false;streaks.receiveShadows=false;streaks.alwaysSelectAsActiveMesh=true;streaks.applyFog=false;streaks.alphaIndex=4;streaks.setEnabled(false);

 const rippleMaterial=new ShaderMaterial('city-rain-impact-ripples',scene,{
  vertexSource:`precision highp float;attribute vec3 position;attribute vec2 uv;attribute vec4 color;
   uniform mat4 worldViewProjection;varying vec2 vUV;varying float vSeed;
   void main(){vUV=uv;vSeed=color.r;gl_Position=worldViewProjection*vec4(position,1.0);}`,
  fragmentSource:`precision highp float;varying vec2 vUV;varying float vSeed;
   uniform float rainTime;uniform float rainBrightness;
   void main(){
    vec2 q=vUV*2.0-1.0;float d=length(q);float phase=fract(rainTime*.92+vSeed);
    float radius=.08+phase*.82;
    float outer=exp(-pow((d-radius)*48.0,2.0));
    float inner=exp(-pow((d-max(.02,radius-.16))*58.0,2.0))*.38;
    float fade=(1.0-smoothstep(.48,1.0,phase))*(.68+.32*smoothstep(0.0,.12,phase));
    float alpha=(outer+inner)*fade*.82*rainBrightness;
    if(alpha<.008)discard;
    gl_FragColor=vec4(.72,.85,.94,alpha);
   }`,
 },{attributes:['position','uv','color'],uniforms:['worldViewProjection','rainTime','rainBrightness'],needAlphaBlending:true});
 rippleMaterial.backFaceCulling=false;rippleMaterial.disableDepthWrite=true;
 const ripples=new Mesh('city-rain-impact-ripples',scene);ripples.material=rippleMaterial;ripples.isPickable=false;ripples.receiveShadows=false;ripples.applyFog=false;ripples.alphaIndex=3;ripples.setEnabled(false);
 let enabled=false,disposed=false,mode:CinematicLightingMode='sunset',lastX=Infinity,lastZ=Infinity,rebuilds=0,visibleRipples=0,lastBuildMs=0;
 let underlyingSky:Material|null=null,baseSun=0,baseHemi=0,baseEnvironment=0;
 function applyAtmosphere(){
  if(!enabled)return;
  // The cinematic controller reinstalls the selected sky and light values on
  // every L press. Capture that new baseline before applying the rain grade.
  if(sky&&sky.material!==overcast){underlyingSky=sky.material;baseSun=sun.intensity;baseHemi=hemi.intensity;baseEnvironment=scene.environmentIntensity;}
  if(sky)sky.material=overcast;
  sun.intensity=baseSun*(mode==='night'?.78:.48);
  hemi.intensity=baseHemi*(mode==='night'?.92:.82);
  scene.environmentIntensity=baseEnvironment*.84;
 }
 function setMode(next:CinematicLightingMode){mode=next;const brightness=next==='day'?.78:next==='night'?1.1:.92;streakMaterial.setFloat('rainBrightness',brightness);rippleMaterial.setFloat('rainBrightness',brightness);overcast.setFloat('rainSkyMode',next==='day'?2:next==='night'?1:0);applyAtmosphere();}
 function setEnabled(next:boolean){
  if(disposed||enabled===next)return;enabled=next;streaks.setEnabled(next);ripples.setEnabled(next&&visibleRipples>0);lastX=Infinity;
  if(next)applyAtmosphere();
  else{if(sky&&sky.material===overcast)sky.material=underlyingSky;sun.intensity=baseSun;hemi.intensity=baseHemi;scene.environmentIntensity=baseEnvironment;}
 }
 function rebuild(x:number,z:number){
  const start=performance.now(),pools=nearby(x,z,34,40),points:{x:number;y:number;z:number;size:number;seed:number}[]=[];
  for(let i=0;i<pools.length&&points.length<RIPPLE_COUNT;i++){
   const pool=pools[i],count=Math.min(4,Math.max(2,Math.ceil(pool.length/11)));
   for(let j=0;j<count&&points.length<RIPPLE_COUNT;j++){
    const along=(hash(i*13+j*7+3)-.5)*pool.length*.60;
    const lateral=(hash(i*17+j*11+5)-.5)*pool.width*.35;
    points.push({x:pool.x+pool.dx*along-pool.dz*lateral,y:.113,z:pool.z+pool.dz*along+pool.dx*lateral,size:Math.min(.65,Math.max(.26,pool.width*.36)),seed:hash(i*71+j*97+17)});
   }
  }
  // Every impact comes from a prevalidated road pool. Arbitrary camera-local
  // points would put bright circles on the bay or over elevated terrain.
  const p:number[]=[],uv:number[]=[],c:number[]=[],idx:number[]=[];
  for(const hit of points){const base=p.length/3,s=hit.size;
   for(const [dx,dz,u,v] of [[-s,-s,0,0],[s,-s,1,0],[s,s,1,1],[-s,s,0,1]]){
    p.push(hit.x+dx,hit.y,hit.z+dz);uv.push(u,v);c.push(hit.seed,0,0,1);
   }
   idx.push(base,base+2,base+1,base,base+3,base+2);
  }
  const data=new VertexData();data.positions=p;data.uvs=uv;data.colors=c;data.indices=idx;data.applyToMesh(ripples,true);ripples.refreshBoundingInfo();
  visibleRipples=points.length;ripples.setEnabled(enabled&&visibleRipples>0);lastBuildMs=performance.now()-start;rebuilds++;lastX=x;lastZ=z;
 }
 function update(time:number,camera:Vector3,focusX:number,focusZ:number,cameraHeight:number){
  if(!enabled||disposed)return;
  const local=cameraHeight<120;streaks.setEnabled(local);ripples.setEnabled(local&&visibleRipples>0);
  if(!local)return;
  streaks.position.copyFrom(camera);streakMaterial.setFloat('rainTime',time);rippleMaterial.setFloat('rainTime',time);
  if(Math.hypot(focusX-lastX,focusZ-lastZ)>8)rebuild(focusX,focusZ);
 }
 function dispose(){if(disposed)return;setEnabled(false);disposed=true;streaks.dispose(false,false);ripples.dispose(false,false);streakMaterial.dispose(false,false);rippleMaterial.dispose(false,false);overcast.dispose(false,false);}
 setMode(mode);
 return {setEnabled,setMode,update,dispose,get stats(){return {enabled,mode,dropCount:DROP_COUNT,rippleCount:visibleRipples,drawCalls:enabled?(streaks.isEnabled()?1:0)+(ripples.isEnabled()?1:0):0,triangles:enabled?(streaks.isEnabled()?DROP_COUNT*2:0)+(ripples.isEnabled()?visibleRipples*2:0):0,rebuilds,lastBuildMs,extraRenderTargets:0,extraLights:0,disposed};}};
}
