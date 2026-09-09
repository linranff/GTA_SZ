import {MeshBuilder,Mesh,ShaderMaterial,Vector3,Matrix,Color3,Color4,ParticleSystem,RawTexture,Texture,StandardMaterial,Constants,type Scene} from '@babylonjs/core';

// Birth times create a sequence of separate detonations, all inside the
// existing three-second recovery window. Offsets use impact-local axes.
export const FLIGHT_FIREBALLS=[
 {at:0,offset:[0,0,0],radius:5.8,seed:1.3},
 {at:.10,offset:[5.6,1,1.5],radius:5.5,seed:7.1},
 {at:.19,offset:[-6.2,1.8,-1],radius:6.1,seed:13.6},
 {at:.34,offset:[.5,5,-3.2],radius:7.2,seed:21.8},
 {at:.49,offset:[8,4.5,-.5],radius:6.3,seed:28.4},
 {at:.65,offset:[-6.8,7,2.2],radius:7.3,seed:35.1},
 {at:.84,offset:[1.2,10.5,.7],radius:8.0,seed:44.6},
 {at:1.06,offset:[-9,3.5,-.5],radius:5.1,seed:55.8},
 {at:1.21,offset:[7.7,9,1.1],radius:5.8,seed:63.2},
] as const;
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function fireballEnvelope(seconds:number,birth:number){
 const age=seconds-birth;return {age,visible:age>=0&&seconds<3,growth:age<0?0:.13+.87*(1-Math.exp(-age*9)),heat:clamp(1.22-age*.59,.06,1.2),opacity:clamp((3-seconds)/.35)};
}

const vertex=`precision highp float;
 attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vLocal;
 void main(){vLocal=position;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragment=`precision highp float;
 varying vec3 vLocal;uniform mat4 inverseWorld;uniform vec3 eye;
 uniform float age;uniform float seed;uniform float heat;uniform float opacity;
 float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fbm(vec3 p){float n=noise(p)*.56;n+=noise(p*2.07+8.3)*.28;n+=noise(p*4.13+19.1)*.16;return n;}
 vec3 fire(float h){
  vec3 c=mix(vec3(.038,.030,.029),vec3(.32,.047,.008),smoothstep(.12,.42,h));
  c=mix(c,vec3(1.9,.26,.012),smoothstep(.38,.74,h));
  c=mix(c,vec3(3.1,1.12,.075),smoothstep(.72,1.03,h));
  return mix(c,vec3(3.6,2.05,.58),smoothstep(1.08,1.34,h));
 }
 void main(){
  vec3 ro=(inverseWorld*vec4(eye,1.)).xyz,rd=normalize(vLocal-ro);
  float b=dot(ro,rd),disc=b*b-dot(ro,ro)+1.;if(disc<=0.)discard;
  float root=sqrt(disc),enter=max(0.,-b-root),leave=-b+root;if(leave<=enter)discard;
  float stride=(leave-enter)/28.;vec3 sum=vec3(0.);float alpha=0.;
  // March an actual noisy volume, rather than stack additive soft circles.
  // Each cloud is self-occluding, with soot pockets between hot folds.
  for(int i=0;i<28;i++){
   vec3 p=ro+rd*(enter+(float(i)+.45)*stride);
   vec3 q=p*3.35+vec3(seed,seed*.27,-seed*.43);
   q.y-=age*.88;q.x+=sin(q.y*1.7+age*1.9)*.23;
   float n=fbm(q),r=length(p),shell=1.-r;
   float density=smoothstep(.05,.40,shell+(n-.53)*.69)*2.9;
   float a=1.-exp(-density*stride*3.6);
   float temperature=heat+(n-.5)*1.95-shell*.06-r*.12;
   vec3 col=fire(temperature);
   float sootLight=.55+.45*clamp(p.y*.6-p.x*.25+.5,0.,1.);
   col=mix(vec3(.052,.057,.062)*sootLight,col,smoothstep(.12,.40,temperature));
   sum+=(1.-alpha)*col*a;alpha+=(1.-alpha)*a;
   if(alpha>.985)break;
  }
  if(alpha<.015)discard;
  gl_FragColor=vec4(sum/max(alpha,.001),alpha*opacity);
 }`;

type Lobe={mesh:Mesh;material:ShaderMaterial;inverse:Matrix};
type Debris={mesh:Mesh;velocity:Vector3;spin:Vector3;offset:Vector3};
/** Reused, precompiled volumes, particle pools and metal fragments. */
export class FlightExplosion{
 private lobes:Lobe[]=[];private debris:Debris[]=[];private particles:ParticleSystem[]=[];
 private texture:RawTexture;private smokeTexture:RawTexture;private metal:StandardMaterial;private hotMetal:StandardMaterial;
 private origin=Vector3.Zero();private right=Vector3.Right();private forward=Vector3.Forward();private active=false;private seconds=0;private lastWave=-1;private seed=8513;
 constructor(private scene:Scene){
  for(const [i,_spec]of FLIGHT_FIREBALLS.entries()){
   const mesh=MeshBuilder.CreateBox('flight-fireball-volume-'+i,{size:2},scene);
   const material=new ShaderMaterial('flight-fireball-'+i,scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position'],uniforms:['worldViewProjection','inverseWorld','eye','age','seed','heat','opacity'],needAlphaBlending:true});
   material.backFaceCulling=true;material.alphaMode=Constants.ALPHA_COMBINE;material.disableDepthWrite=true;mesh.material=material;mesh.isPickable=false;mesh.setEnabled(false);
   const inverse=Matrix.Identity();material.onBindObservable.add(()=>{mesh.computeWorldMatrix(true).invertToRef(inverse);const effect=material.getEffect();effect?.setMatrix('inverseWorld',inverse);effect?.setVector3('eye',scene.activeCamera!.globalPosition);});
   this.lobes.push({mesh,material,inverse});
  }
  this.texture=this.makeTexture(false);this.smokeTexture=this.makeTexture(true);
  const sparks=this.makeParticles('flight-impact-sparks',260,this.texture);
  sparks.minSize=.055;sparks.maxSize=.17;sparks.minLifeTime=.6;sparks.maxLifeTime=1.5;sparks.minEmitPower=20;sparks.maxEmitPower=42;sparks.gravity=new Vector3(0,-12,0);sparks.direction1=new Vector3(-1,.2,-1);sparks.direction2=new Vector3(1,1.5,1);sparks.color1=new Color4(3.2,1.2,.17,1);sparks.color2=new Color4(1.8,.27,.01,1);sparks.colorDead=new Color4(.15,.015,0,0);sparks.blendMode=ParticleSystem.BLENDMODE_ADD;sparks.minScaleX=.55;sparks.maxScaleX=.8;sparks.minScaleY=3;sparks.maxScaleY=9;sparks.billboardMode=ParticleSystem.BILLBOARDMODE_STRETCHED;
  const smoke=this.makeParticles('flight-rolling-smoke',95,this.smokeTexture);
  smoke.minSize=5;smoke.maxSize=11;smoke.minLifeTime=1.5;smoke.maxLifeTime=3;smoke.minEmitPower=2;smoke.maxEmitPower=8;smoke.gravity=new Vector3(0,2.2,0);smoke.direction1=new Vector3(-1,.8,-1);smoke.direction2=new Vector3(1,2,1);smoke.color1=new Color4(.12,.105,.095,.7);smoke.color2=new Color4(.035,.04,.045,.82);smoke.colorDead=new Color4(.065,.07,.075,0);smoke.blendMode=ParticleSystem.BLENDMODE_STANDARD;smoke.addSizeGradient(0,.45);smoke.addSizeGradient(1,1.8);smoke.minAngularSpeed=-.6;smoke.maxAngularSpeed=.6;
  const embers=this.makeParticles('flight-impact-embers',160,this.texture);
  embers.minSize=.09;embers.maxSize=.25;embers.minLifeTime=1.4;embers.maxLifeTime=2.8;embers.minEmitPower=5;embers.maxEmitPower=18;embers.gravity=new Vector3(0,-2,0);embers.color1=new Color4(3,.55,.025,1);embers.color2=new Color4(1.5,.13,.008,1);embers.colorDead=new Color4(.4,.025,0,0);embers.blendMode=ParticleSystem.BLENDMODE_ADD;
  this.metal=new StandardMaterial('flight-broken-alloy',scene);this.metal.diffuseColor=new Color3(.13,.14,.16);this.metal.specularColor=new Color3(.35,.3,.25);this.metal.emissiveColor=new Color3(.08,.018,.003);this.metal.backFaceCulling=false;
  this.hotMetal=new StandardMaterial('flight-burning-fragments',scene);this.hotMetal.diffuseColor=new Color3(.12,.07,.02);this.hotMetal.emissiveColor=new Color3(1.6,.23,.016);this.hotMetal.backFaceCulling=false;
  for(let i=0;i<24;i++){
   const mesh=MeshBuilder.CreateBox('flight-metal-fragment-'+i,{width:.3+this.random()*.8,height:.055,depth:.25+this.random()*1.2},scene);
   // Thin, bent pieces read as torn wing skin instead of intact aircraft parts.
   const positions=mesh.getVerticesData('position')!;for(let j=1;j<positions.length;j+=3)positions[j]+=positions[j-1]*positions[j+1]*(i%3-.8)*.28;mesh.updateVerticesData('position',positions);mesh.refreshBoundingInfo();
   mesh.material=i%5===0?this.hotMetal:this.metal;mesh.isPickable=false;mesh.setEnabled(false);
   this.debris.push({mesh,velocity:Vector3.Zero(),spin:Vector3.Zero(),offset:Vector3.Zero()});
  }
 }
 private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 private makeTexture(smoke:boolean){
  const size=128,rgba=new Uint8Array(size*size*4),hash=(x:number,y:number)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const noise=(x:number,y:number)=>{const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v);return (hash(ix,iy)*(1-s)+hash(ix+1,iy)*s)*(1-t)+(hash(ix,iy+1)*(1-s)+hash(ix+1,iy+1)*s)*t;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=x/size*2-1,v=y/size*2-1,r=Math.hypot(u,v),n=noise(u*4+8,v*4+8)*.65+noise(u*11+20,v*11+20)*.35;
   const edge=smoke?clamp((1-r+(n-.5)*.36)*3):Math.pow(clamp(1-r),2),shade=smoke?Math.round(150+n*105):255,k=(y*size+x)*4;
   rgba[k]=rgba[k+1]=rgba[k+2]=shade;rgba[k+3]=Math.round(edge*(smoke?(.35+n*.65):1)*255);
  }
  return RawTexture.CreateRGBATexture(rgba,size,size,this.scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 }
 private makeParticles(name:string,capacity:number,texture:RawTexture){
  const p=new ParticleSystem(name,capacity,this.scene);p.particleTexture=texture;p.emitter=Vector3.Zero();p.emitRate=0;p.manualEmitCount=0;p.updateSpeed=.01;p.minEmitBox=new Vector3(-1,-.5,-1);p.maxEmitBox=new Vector3(1,.5,1);p.direction1=new Vector3(-1,.4,-1);p.direction2=new Vector3(1,1.6,1);this.particles.push(p);return p;
 }
 isReady(){return this.lobes.every(l=>l.material.isReady(l.mesh))&&this.particles.every(p=>p.isReady())&&this.debris.every(d=>d.mesh.material!.isReady(d.mesh));}
 burst(point:Vector3,yaw:number){
  this.reset();this.active=true;this.origin.copyFrom(point);this.right.set(Math.cos(yaw),0,-Math.sin(yaw));this.forward.set(Math.sin(yaw),0,Math.cos(yaw));
  for(const [i,d]of this.debris.entries()){
   d.offset.copyFrom(this.right.scale((this.random()-.5)*8));d.offset.y=(this.random()-.5)*2;
   d.velocity.set((this.random()-.5)*30,7+this.random()*18,(this.random()-.5)*30);d.spin.set((this.random()-.5)*15,(this.random()-.5)*15,(this.random()-.5)*15);d.mesh.position.copyFrom(this.origin).addInPlace(d.offset);d.mesh.rotation.setAll(0);d.mesh.scaling.setAll(1);d.mesh.setEnabled(i<24);
  }
  this.step(0);
 }
 step(seconds:number){
  if(!this.active)return;this.seconds=seconds;
  for(const [i,spec]of FLIGHT_FIREBALLS.entries()){
   const l=this.lobes[i],e=fireballEnvelope(seconds,spec.at);l.mesh.setEnabled(e.visible);if(!e.visible)continue;
   const drift=Math.max(0,e.age),offset=this.right.scale(spec.offset[0]*(.65+e.growth*.35)).add(this.forward.scale(spec.offset[2]-drift*.6));
   offset.y=spec.offset[1]+drift*2.6;l.mesh.position.copyFrom(this.origin).addInPlace(offset);l.mesh.scaling.set(spec.radius*e.growth,spec.radius*e.growth*(1+drift*.14),spec.radius*e.growth*.91);l.mesh.rotation.y=spec.seed*.3;
   l.material.setFloat('age',e.age);l.material.setFloat('seed',spec.seed);l.material.setFloat('heat',e.heat);l.material.setFloat('opacity',e.opacity);
  }
  // Three secondary sprays reinforce the separate detonation timings.
  const wave=seconds<.30?0:seconds<.72?1:seconds<1.2?2:3;
  if(wave>this.lastWave){this.lastWave=wave;for(const [i,p]of this.particles.entries()){p.emitter=this.origin.add(this.right.scale((wave%2?1:-1)*wave*2)).addInPlaceFromFloats(0,wave*2.8,0);p.manualEmitCount=i===0?(wave===0?120:45):i===1?(wave===0?12:22):wave===0?50:30;if(!p.isStarted())p.start();}}
  for(const d of this.debris){d.mesh.position.copyFrom(this.origin).addInPlace(d.offset).addInPlace(d.velocity.scale(seconds));d.mesh.position.y-=5.5*seconds*seconds;d.mesh.rotation.copyFrom(d.spin.scale(seconds));d.mesh.scaling.setAll(clamp((3-seconds)/.6));}
 }
 get stats(){return {active:this.active,seconds:this.seconds,fireballs:this.lobes.filter(l=>l.mesh.isEnabled()).length,particles:this.particles.reduce((n,p)=>n+p.getActiveCount(),0),fragments:this.debris.filter(d=>d.mesh.isEnabled()).length,waves:this.lastWave+1};}
 reset(){this.active=false;this.seconds=0;this.lastWave=-1;for(const l of this.lobes)l.mesh.setEnabled(false);for(const d of this.debris)d.mesh.setEnabled(false);for(const p of this.particles){p.stop();p.reset();p.manualEmitCount=0;}}
 dispose(){this.reset();for(const l of this.lobes){l.mesh.dispose();l.material.dispose();}for(const d of this.debris)d.mesh.dispose();for(const p of this.particles)p.dispose(false);this.texture.dispose();this.smokeTexture.dispose();this.metal.dispose();this.hotMetal.dispose();}
}
