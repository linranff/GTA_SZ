import {registerGLTFExtension} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';
import {BackgroundMaterial,Material,PBRMaterial,StandardMaterial,type Scene} from '@babylonjs/core';
type LitMaterial=Material&{maxSimultaneousLights:number};
type DirtyGuard={_blockDirtyMechanism:boolean};
const lit=(m:Material):m is LitMaterial=>'maxSimultaneousLights' in m;

/** Babylon 8.56's glTF loader promotes EVERY scene material to
 * `scene.lights.length` light slots when any glTF becomes ready. On this city
 * that touches ~300 materials and marks every submesh lights-dirty, so the
 * next frame re-derives defines and looks up effects for ~2500 submeshes:
 * a 150–300 ms stall for each streamed facade tile, vehicle, cafe part or
 * character. Two measures make a stream cost only its own new materials:
 *
 * 1. While any glTF load is in flight, `maxSimultaneousLights` setters store
 *    the value without dirtying (`suppressed` below), and remember the
 *    material. Nothing renders between the loader's promotion and `onReady`.
 * 2. `onReady` restores the pre-load budgets, then explicitly dirties only
 *    materials whose budget actually changed against the baseline captured
 *    when the load started (a legitimate raise by another owner mid-stream).
 *
 * New materials from the GLB are dirty from creation and are unaffected. */
let suppressed=0;const touched=new Set<LitMaterial>();
for(const proto of [PBRMaterial.prototype,StandardMaterial.prototype,BackgroundMaterial.prototype]){
 const descriptor=Object.getOwnPropertyDescriptor(proto,'maxSimultaneousLights');
 if(!descriptor?.set||!descriptor.get)continue;
 const set=descriptor.set;
 Object.defineProperty(proto,'maxSimultaneousLights',{...descriptor,set(this:LitMaterial,value:number){
  if(suppressed===0||this.maxSimultaneousLights===value){set.call(this,value);return;}
  const guard=this as unknown as DirtyGuard;touched.add(this);const blocked=guard._blockDirtyMechanism;guard._blockDirtyMechanism=true;
  try{set.call(this,value);}finally{guard._blockDirtyMechanism=blocked;}
 }});
}

export function preserveStreamingLightBudgets(scene:Scene){
 const baseline=new Map<LitMaterial,number>(),budgets=new Map<LitMaterial,number>();
 // Baseline: budgets when this load started (plus materials appearing later,
 // at their first seen value). Budgets: the value as of the last rendered
 // frame, which is what the loader's promotion is about to overwrite.
 const capture=()=>{for(const m of scene.materials)if(lit(m)){if(!baseline.has(m))baseline.set(m,m.maxSimultaneousLights);budgets.set(m,m.maxSimultaneousLights);}};
 capture();suppressed++;const observer=scene.onBeforeRenderObservable.add(capture);let done=false;
 return ()=>{if(done)return;done=true;scene.onBeforeRenderObservable.remove(observer);
  if(scene.isDisposed){suppressed=Math.max(0,suppressed-1);baseline.clear();budgets.clear();return;}
  const count=scene.lights.length;
  // Still suppressed: undoing the promotion must not dirty either.
  for(const [m,budget] of budgets)if(scene.materials.includes(m)&&budget<count&&m.maxSimultaneousLights===count)m.maxSimultaneousLights=budget;
  suppressed=Math.max(0,suppressed-1);
  // Reconcile suppressed setters: only a net change needs new shaders.
  for(const m of touched){const start=baseline.get(m);if(start!==undefined&&start!==m.maxSimultaneousLights&&scene.materials.includes(m))m.markAsDirty(Material.LightDirtyFlag);}
  if(suppressed===0)touched.clear();
  baseline.clear();budgets.clear();
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
