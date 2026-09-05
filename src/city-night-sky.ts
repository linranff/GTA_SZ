import {Engine,RawCubeTexture,ShaderMaterial,Texture,Vector3,type Scene} from '@babylonjs/core';
export const CITY_MOON_DIRECTION=new Vector3(.72,.48,-.5).normalize();

/** A fixed celestial background replaces the sunset on the existing sky mesh.
 * Stars are directional, so camera translation produces no star parallax.
 * One sky draw, no particles, bloom sprites or additional render targets.
 */
export function createCityNightSky(scene:Scene){
 const material=new ShaderMaterial('city-night-stars',scene,{
  vertexSource:`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;
   varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=worldViewProjection*vec4(position,1.);}`,
  fragmentSource:`precision highp float;varying vec3 skyDirection;uniform vec3 moonDirection;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   void main(){
    vec3 d=normalize(skyDirection);float elevation=max(d.y,0.);
    vec3 color=mix(vec3(.036,.030,.040),vec3(.006,.011,.024),smoothstep(0.,.65,elevation));
    vec2 uv=vec2(atan(d.z,d.x)/6.283185307+.5,asin(clamp(d.y,-1.,1.))/3.141592654+.5);
    float cloud=noise(uv*vec2(18.,11.)+vec2(2.3,7.4))*.67+noise(uv*vec2(43.,29.))*.33;
    float veil=smoothstep(.48,.76,cloud)*.48;
    color+=vec3(.008,.009,.014)*veil;
    vec2 grid=uv*vec2(420.,210.),cell=floor(grid);
    float chance=hash(cell),magnitude=hash(cell+71.3);
    vec2 center=vec2(hash(cell+13.7),hash(cell+97.1))*.64+.18;
    vec2 delta=fract(grid)-center;delta.x*=max(.25,sqrt(max(0.,1.-d.y*d.y)));
    float radius=mix(.045,.080,pow(magnitude,5.));
    float aa=max(length(fwidth(grid))*.45,.018);
    float core=1.-smoothstep(max(0.,radius-aa),radius+aa,length(delta));
    float stars=step(.980,chance)*core*smoothstep(.055,.28,elevation)*(1.-veil)*min(1.,radius/aa);
    vec3 tint=mix(vec3(.76,.84,1.),vec3(1.,.87,.72),hash(cell+4.8));
    color+=stars*tint*mix(.48,1.9,pow(magnitude,4.));
    // A small directional disc, with maria and a restrained atmospheric halo.
    // The same direction drives city moonlight; translating the camera cannot
    // move the moon relative to the stars.
    vec3 mx=normalize(cross(moonDirection,vec3(0.,1.,0.))),my=cross(mx,moonDirection);
    vec2 lunar=vec2(dot(d,mx),dot(d,my))/.0082;
    float mr=length(lunar),maa=max(fwidth(mr),.025);
    float disc=(1.-smoothstep(1.-maa,1.+maa,mr))*step(.0,dot(d,moonDirection));
    float maria=noise(lunar*4.2+7.)*.7+noise(lunar*10.+1.7)*.3;
    float relief=mix(.56,1.,smoothstep(.25,.70,maria))*(.7+.3*sqrt(max(0.,1.-mr*mr)));
    color=mix(color,vec3(1.8,1.86,1.96)*relief,disc);
    float angle=length(d-moonDirection);
    color+=vec3(.022,.032,.049)*exp(-angle*angle/.00075)*(1.-disc);
    gl_FragColor=vec4(color,1.);
   }`,
 },{attributes:['position'],uniforms:['worldViewProjection','moonDirection']});
 material.setVector3('moonDirection',CITY_MOON_DIRECTION);
 material.backFaceCulling=false;material.disableDepthWrite=true;
 // Night reflections must not keep the red sunset/white sun from the day cube.
 // A tiny smooth linear-radiance cube supplies neutral ambient reflections;
 // the existing planar mirrors still reflect actual lamps, buildings and sky.
 const size=32,faces:Uint8Array[]=[];
 for(let face=0;face<6;face++){
  const data=new Uint8Array(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=x/(size-1)*2-1,v=y/(size-1)*2-1;
   const d=face===0?new Vector3(1,-v,-u):face===1?new Vector3(-1,-v,u):face===2?new Vector3(u,1,v):face===3?new Vector3(u,-1,-v):face===4?new Vector3(u,-v,1):new Vector3(-u,-v,-1);
   d.normalize();const h=Math.max(0,d.y),horizon=Math.exp(-Math.abs(d.y)*5);
   const color=d.y<0?[.040,.037,.038]:[.043-.018*h+.012*horizon,.051-.017*h+.006*horizon,.078-.021*h];
   for(let c=0;c<3;c++)data[(y*size+x)*3+c]=Math.round(color[c]*255);
  }faces.push(data);
 }
 const environment=new RawCubeTexture(scene,faces,size,Engine.TEXTUREFORMAT_RGB,Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 environment.name='city-neutral-night-environment';environment.gammaSpace=false;
 return {material,environment,dispose(){material.dispose();environment.dispose();}};
}
