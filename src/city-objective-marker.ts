import {Color3,MeshBuilder,StandardMaterial,Vector3,type Scene,type Camera,Matrix} from '@babylonjs/core';
/** A single readable destination mark, tied to the actual ground height. */
export function createObjectiveMarker(scene:Scene,host:HTMLElement,heightAt:(x:number,z:number)=>number){
 const ring=MeshBuilder.CreateTorus('career-parking-guide',{diameter:13,thickness:.07,tessellation:64},scene);
 const material=new StandardMaterial('career-parking-guide-mat',scene);material.diffuseColor=new Color3(.35,.73,.62);material.emissiveColor=new Color3(.22,.65,.49);material.specularColor=Color3.Black();material.disableLighting=true;material.alpha=.74;ring.material=material;ring.isPickable=false;ring.setEnabled(false);
 const dot=document.createElement('div');dot.className='career-world-label';dot.hidden=true;host.append(dot);
 let target:{position:readonly number[];label:string}|null=null;
 function set(value:typeof target){target=value;ring.setEnabled(!!value);if(value){ring.position.set(value.position[0],heightAt(value.position[0],value.position[1])+.22,value.position[1]);dot.textContent=value.label;}}
 function update(camera:Camera,x:number,z:number,hide:boolean){
  if(!target||hide){dot.hidden=true;ring.setEnabled(false);return;}
  const distance=Math.hypot(target.position[0]-x,target.position[1]-z);ring.setEnabled(distance<180);
  const engine=scene.getEngine(),viewport=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
  const p=new Vector3(target.position[0],heightAt(target.position[0],target.position[1])+3.1,target.position[1]);
  const facing=Vector3.Dot(p.subtract(camera.globalPosition),camera.getForwardRay().direction)>0;
  const projected=Vector3.Project(p,Matrix.IdentityReadOnly,scene.getTransformMatrix(),viewport);
  dot.hidden=!facing||distance>650||projected.z<0||projected.z>1;
  if(!dot.hidden){dot.style.left=(projected.x/engine.getRenderWidth()*100)+'%';dot.style.top=(projected.y/engine.getRenderHeight()*100)+'%';dot.textContent=target.label+' · '+Math.round(distance)+' m';}
 }
 return {set,update,dispose(){ring.dispose();material.dispose();dot.remove();}};
}
