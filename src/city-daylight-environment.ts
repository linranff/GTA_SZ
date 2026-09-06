import {HDRCubeTexture} from '@babylonjs/core';

/** The photographed sun exceeds 370,000 in linear RGB. A compact shoulder
 * keeps it from dominating rough reflections and diffuse irradiance when the
 * authored directional light already supplies the sun. Clouds remain HDR.
 * One shared cube feeds the visible sky, SH and roughness-prefiltered PBR.
 */
export function daylightHighlightLuminance(luminance:number){
 const excess=Math.max(0,luminance-8);
 return luminance<=8?luminance:8+24*excess/(24+excess);
}

export function gradeDaylightRadiance(data:Float32Array){
 for(let i=0;i<data.length;i+=3){
  const r=Math.max(0,data[i]),g=Math.max(0,data[i+1]),b=Math.max(0,data[i+2]);
  const luminance=.2126*r+.7152*g+.0722*b;
  if(luminance<=8)continue;
  // Warm only the solar core/glare, preserving the photographed blue sky and
  // ordinary white clouds. Re-normalize after tinting to keep luminance stable.
  const t=Math.min(1,(luminance-8)/16),warm=t*t*(3-2*t);
  const green=g*(1-.06*warm),blue=b*(1-.16*warm);
  const scale=daylightHighlightLuminance(luminance)/(.2126*r+.7152*green+.0722*blue);
  data[i]=r*scale;data[i+1]=green*scale;data[i+2]=blue*scale;
 }
 return data;
}

export class ShenzhenDaylightEnvironment extends HDRCubeTexture{
 protected override async _getCubeMapTextureDataAsync(buffer:ArrayBuffer,size:number,supersample:boolean){
  const cube=await super._getCubeMapTextureDataAsync(buffer,size,supersample);
  for(const face of ['right','left','up','down','front','back'] as const)gradeDaylightRadiance(cube[face] as Float32Array);
  return cube;
 }
}
