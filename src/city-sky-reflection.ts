import {Plane,type AbstractMesh} from '@babylonjs/core';

/** The camera-centred sky represents infinity, not geometry at its 4 km radius.
 * MirrorTexture clips geometry below water. At a reflected eye below sea level,
 * far-water rays hit the finite sky sphere below that plane: clipping it leaves
 * a circular patch of RTT clear colour instead of sky. Override only the sky's
 * material plane with an always-kept half-space (dot(worldPos, plane) = -1).
 * Null would inherit the scene plane again. Buildings retain the real clip.
 * Material changes include daylight, sunset, stars and the loading fallback.
 * Reuses each mirror's existing sky draw, resolution and refresh schedule.
 */
export function keepSkyInReflections(sky:AbstractMesh){
 const unclipped=new Plane(0,0,0,-1);
 const apply=()=>{if(sky.material)sky.material.clipPlane=unclipped;};
 apply();
 const observer=sky.onMaterialChangedObservable.add(apply);
 sky.onDisposeObservable.addOnce(()=>sky.onMaterialChangedObservable.remove(observer));
}
