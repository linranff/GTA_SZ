import {HDRCubeTexture,RawCubeTexture,Engine,Texture,type Scene} from '@babylonjs/core';
// Babylon can reuse an existing HDR internal texture without decoding again.
// Keep its display pixels available for another look using that cached texture.
const cachedDisplayFaces=new WeakMap<object,Uint8Array[]>();
// Restore the photographic cloud structure selected by the user. Colour is
// graded once below; the source HDR remains untouched on disk.
export const CITY_SUNSET_SOURCE={
 file:'/city/environment/belfast-sunset-4k.hdr',
 name:'Belfast Sunset (Pure Sky) / Poly Haven',
 bytes:17420114,
 cubeSize:1024,
 rotationY:2.80,
} as const;

const smooth=(lo:number,hi:number,value:number)=>{
 const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));
 return t*t*(3-2*t);
};

/** Source-space sun axis, before the shared environment rotation. */
export function sunsetFireWeight(x:number,y:number,z:number){
 const length=Math.hypot(x,y,z)||1;
 return smooth(-.48,.25,(.6*x+.8*z-.08*y)/length);
}

/** Graded scene radiance, before spherical harmonics and roughness filtering.
 * Preserve photographed dark cloud undersides and orange gaps, matching the
 * restored sunset. The display-only shoulder below must not cap PBR energy.
 */
export function gradeSunsetRadiance(data:Float32Array,face?:number,size=Math.sqrt(data.length/3)){
 for(let i=0;i<data.length;i+=3){
  const r=Math.max(0,data[i]),g=Math.max(0,data[i+1]),b=Math.max(0,data[i+2]);
  let hemisphere=1,solarGlare=1;
  if(face!==undefined){
   const pixel=i/3,u=(pixel%size)/size*2-1,v=Math.floor(pixel/size)/size*2-1;
   let x=0,y=0,z=0;
   // Raw cube upload order: +X, -X, +Y, -Y, +Z, -Z.
   if(face===0){x=1;y=-v;z=-u;}
   else if(face===1){x=-1;y=-v;z=u;}
   else if(face===2){x=u;y=1;z=v;}
   else if(face===3){x=u;y=-1;z=-v;}
   else if(face===4){x=u;y=-v;z=1;}
   else {x=-u;y=-v;z=-1;}
   const length=Math.hypot(x,y,z)||1;
   hemisphere=sunsetFireWeight(x,y,z);
   solarGlare=1+9*Math.max(0,(.6*x+.8*z)/length)**18*Math.exp(-Math.max(0,y/length)*6);
  }
  const luminance=r*.2126+g*.7152+b*.0722;
  const cloud=smooth(.56,1.03,r/(b+.0001));
  // Use local exposure only for the cloud mask; retain the original radiance.
  const lit=smooth(.50,1.45,luminance/solarGlare);
  const fire=hemisphere*cloud*(.06+.94*lit),contrast=.18+1.20*lit;
  data[i]=((r*.18+b*.09)*(1-fire)+(r*1.72+g*.25)*fire)*contrast;
  data[i+1]=((g*.22+b*.07)*(1-fire)+(g*.58+r*.10)*fire)*contrast;
  data[i+2]=((b*.56+r*.12)*(1-fire)+(b*.17+r*.022)*fire)*contrast;
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
  for(const [index,face] of (['right','left','up','down','front','back'] as const).entries()){
   const linear=gradeSunsetRadiance(cube[face] as Float32Array,index,size),display=new Uint8Array(linear.length);
   for(let i=0;i<linear.length;i+=3){
    const scale=sunsetDisplayScale(Math.max(linear[i],linear[i+1],linear[i+2]))*255/4.3;
    display[i]=Math.round(linear[i]*scale);display[i+1]=Math.round(linear[i+1]*scale);display[i+2]=Math.round(linear[i+2]*scale);
   }
   this.displayFaces.push(display);
  }
  return cube;
 }
}
