import {Matrix,Vector3} from '@babylonjs/core';

export type CinematicLightingMode='sunset'|'night'|'day';

export const CITY_DAYLIGHT_SOURCE={
 file:'/city/environment/rustig-blue-sky-4k.hdr',
 name:'Poly Haven / Rustig Koppie (Pure Sky)',
 bytes:15257521,
 cubeSize:1024,
 rotationY:1.85,
} as const;

/** Direction sampled from the source HDR's solar disc in Babylon cube space.
 * A reflection matrix rotates lookup rays, so world illumination uses its
 * inverse. Sky, polished glass, paint highlights and cast shadows agree.
 * This is an authored afternoon, not a solar-position simulation of Shenzhen.
 */
const sourceSolarDirection=new Vector3(.504674,.473661,.721768).normalize();
export const CITY_DAYLIGHT_SUN_DIRECTION=Vector3.TransformNormal(
 sourceSolarDirection,Matrix.RotationY(-CITY_DAYLIGHT_SOURCE.rotationY),
).normalize();

export const CITY_LIGHTING_LABELS:Record<CinematicLightingMode,string>={
 sunset:'红霞日落',night:'月色夜景',day:'雨后晴昼',
};

export function nextCinematicLightingMode(mode:CinematicLightingMode):CinematicLightingMode{
 return mode==='sunset'?'night':mode==='night'?'day':'sunset';
}
