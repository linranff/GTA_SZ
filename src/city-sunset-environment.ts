import {HDRCubeTexture,RawCubeTexture,Engine,Texture,type Scene} from '@babylonjs/core';
// Babylon can reuse an existing HDR internal texture without decoding again.
// Keep its display pixels available for another look using that cached texture.
const cachedDisplayFaces=new WeakMap<object,Uint8Array[]>();
// Cloud colour, horizon alignment, wrap seam and linear radiance are authored
// once by Blender. This HDR is reconstructed artwork, not measured exposure.
export const CITY_SUNSET_SOURCE={
 file:'/city/environment/shenzhen-fire-sky.hdr',
 name:'Shenzhen Fire Sky / AI panorama + Blender radiance bake',
 bytes:14668816,
 cubeSize:1024,
 rotationY:1.74651,
} as const;

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
  for(const face of (['right','left','up','down','front','back'] as const)){
   const linear=cube[face] as Float32Array,display=new Uint8Array(linear.length);
   for(let i=0;i<linear.length;i+=3){
    const scale=sunsetDisplayScale(Math.max(linear[i],linear[i+1],linear[i+2]))*255/4.3;
    display[i]=Math.round(linear[i]*scale);display[i+1]=Math.round(linear[i+1]*scale);display[i+2]=Math.round(linear[i+2]*scale);
   }
   this.displayFaces.push(display);
  }
  return cube;
 }
}
