import {registerGLTFExtension} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';
import type {Scene,Material} from '@babylonjs/core';
type LitMaterial=Material&{maxSimultaneousLights:number};
const lit=(m:Material):m is LitMaterial=>'maxSimultaneousLights' in m;
/** Babylon 8.56 promotes ALL scene materials to scene.lights.length when any
 * glTF becomes ready. Streaming a facade should not recompile the whole city.
 * Preserve the last render's existing budgets; new assets retain their normal
 * loader/material-owner setup. Observing each frame preserves day/night and
 * local-light changes made while an asynchronous decode is still pending. */
export function preserveStreamingLightBudgets(scene:Scene){
 const budgets=new Map<LitMaterial,number>();
 const capture=()=>{for(const m of scene.materials)if(lit(m))budgets.set(m,m.maxSimultaneousLights);};
 capture();const observer=scene.onBeforeRenderObservable.add(capture);let done=false;
 return ()=>{if(done)return;done=true;scene.onBeforeRenderObservable.remove(observer);
  if(scene.isDisposed)return;const count=scene.lights.length;
  for(const [m,budget] of budgets)if(scene.materials.includes(m)&&budget<count&&m.maxSimultaneousLights===count)m.maxSimultaneousLights=budget;
  budgets.clear();
 };
}
// Supported extension lifecycle: onReady runs synchronously immediately after
// the loader's global light promotion, before the next scene render. Applies
// to cafe/rider/tank/landscape as well as facade tiles; no node_modules patch.
registerGLTFExtension('SHENCHENGJI_preserve_scene_lights',false,loader=>{
 let restore:(()=>void)|null=null;
 return {name:'SHENCHENGJI_preserve_scene_lights',enabled:true,
  onLoading(){restore=preserveStreamingLightBudgets(loader.babylonScene);},
  onReady(){restore?.();restore=null;},
  dispose(){restore?.();restore=null;}};
});
