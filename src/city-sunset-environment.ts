import {HDRCubeTexture,RawCubeTexture,Engine,Texture,type Scene} from '@babylonjs/core';
// Babylon can reuse an existing HDR internal texture without decoding again.
// Keep its display pixels available for another look using that cached texture.
const cachedDisplayFaces=new WeakMap<object,Uint8Array[]>();

/** Scene radiance grading, before spherical harmonics and roughness prefiltering.
 * The source photo is untouched. Clouds retain their photographed structure;
 * the same graded HDR energy lights glass, car paint and the visible sky.
 * Executed once on load, with no additional render target or frame cost.
 */
export function gradeSunsetRadiance(data:Float32Array){
 for(let i=0;i<data.length;i+=3){
  const r=Math.max(0,data[i]),g=Math.max(0,data[i+1]),b=Math.max(0,data[i+2]);
  // Blue gaps remain lavender; neutral and already warm clouds become coral,
  // copper and amber. Radiance is not clipped to the display's 0–1 interval.
  const t=Math.max(0,Math.min(1,(r/(b+.0001)-.48)*1.6));
  const cloud=t*t*(3-2*t);
  const red=(r*.88+b*.31)*(1-cloud)+(r*1.38+g*.12)*cloud;
  const green=(g*.55+r*.04)*(1-cloud)+(g*.64+r*.07)*cloud;
  const blue=(b*.77+r*.06)*(1-cloud)+(b*.40+r*.08)*cloud;
  // Reflection radiance must retain the original dynamic range. Compressing
  // this data before prefiltering turns clear glass and car paint into matte.
  data[i]=red;data[i+1]=green;data[i+2]=blue;
 }
 return data;
}

/** Display-only highlight roll-off. Never feed this into PBR lighting. */
export function sunsetDisplayScale(peak:number){
 const knee=1.8;
 return peak<=knee?1:(knee+2.5*(peak-knee)/(2.5+peak-knee))/peak;
}

export class ShenzhenSunsetEnvironment extends HDRCubeTexture{
 private displayFaces:Uint8Array[]|null=null;
 createDisplayTexture(scene:Scene){
  const internal=this.getInternalTexture();
  const faces=this.displayFaces??(internal?cachedDisplayFaces.get(internal):null);
  if(!faces)throw Error('Sunset display faces are not ready');
  if(internal)cachedDisplayFaces.set(internal,faces);
  // The bounded display cube needs only RGB8; it keeps the 1024px cloud detail
  // with 18 MiB, no second download, reflection probe or per-frame render pass.
  const texture=new RawCubeTexture(scene,faces,this.getSize().width,Engine.TEXTUREFORMAT_RGB,Engine.TEXTURETYPE_UNSIGNED_BYTE,false,false,Texture.BILINEAR_SAMPLINGMODE);
  texture.name='sunset-display-only';texture.gammaSpace=false;texture.level=4.3;
  texture.coordinatesMode=Texture.SKYBOX_MODE;texture.rotationY=this.rotationY;
  this.displayFaces=null;
  return texture;
 }
 protected override async _getCubeMapTextureDataAsync(buffer:ArrayBuffer,size:number,supersample:boolean){
  const cube=await super._getCubeMapTextureDataAsync(buffer,size,supersample);
  this.displayFaces=[];
  for(const face of ['right','left','up','down','front','back'] as const){
   const linear=gradeSunsetRadiance(cube[face] as Float32Array),display=new Uint8Array(linear.length);
   for(let i=0;i<linear.length;i+=3){
    const scale=sunsetDisplayScale(Math.max(linear[i],linear[i+1],linear[i+2]))*255/4.3;
    display[i]=Math.round(linear[i]*scale);display[i+1]=Math.round(linear[i+1]*scale);display[i+2]=Math.round(linear[i+2]*scale);
   }
   this.displayFaces.push(display);
  }
  return cube;
 }
}
