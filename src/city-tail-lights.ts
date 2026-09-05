import {Color3,Matrix,PBRMaterial,SpotLight,Vector3,VertexBuffer,type AbstractMesh,type Scene,type TransformNode} from '@babylonjs/core';

/** Rear illumination has a physical light receiver, independently of emissive
 * lenses/bloom. One bounded cone covers both lamps; no extra shadow map or
 * full-screen reflection pass. Braking changes lenses and road light together. */
export function createCityTailLights(scene:Scene,car:TransformNode,carMeshes:readonly AbstractMesh[]){
 const tail=carMeshes.find(m=>/^car_redled(?:\.\d+)?$/.test(m.name));
 const inverse=Matrix.Invert(car.computeWorldMatrix(true));let rear=-1;
 if(tail){const positions=tail.getVerticesData(VertexBuffer.PositionKind);if(positions){const transform=tail.computeWorldMatrix(true).multiply(inverse);let z=0;for(let i=0;i<positions.length;i+=3)z+=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),transform).z;rear=Math.sign(z/(positions.length/3))||-1;}}
 const light=new SpotLight('vehicle-rear-road-light',new Vector3(0,.68,rear*2.25),new Vector3(0,-.52,rear).normalize(),2.35,2,scene);
 light.parent=car;light.diffuse=new Color3(1,.014,.004);light.specular=new Color3(1,.023,.008);light.range=8;light.intensity=0;light.renderPriority=14;
 const receivers=scene.meshes.filter(m=>m.getTotalVertices()>0&&/asphalt|roadline|sidewalk|kerb|puddle|rain_.*(?:water|film)|terrain_land|terrain_park/i.test(m.name+' '+(m.material?.name??''))&&!carMeshes.includes(m));
 light.includedOnlyMeshes=receivers;
 const budgets=new Map<PBRMaterial,number>();
 for(const mesh of receivers)if(mesh.material instanceof PBRMaterial&&!budgets.has(mesh.material)){budgets.set(mesh.material,mesh.material.maxSimultaneousLights);mesh.material.maxSimultaneousLights=Math.max(mesh.material.maxSimultaneousLights,5);}
 // Clone only the hero's lens material. NPC lights retain their own intensity.
 const source=tail?.material instanceof PBRMaterial?tail.material:null;
 const lens=source?.clone('hero-rear-lens')??null;
 const lenses=carMeshes.filter(m=>m.material===source);
 if(lens){lens.albedoColor=new Color3(.46,.006,.004);lens.roughness=.24;lens.metallic=.08;for(const mesh of lenses)mesh.material=lens;}
 let brake=false,night=false,intensity=0;
 return {
  update(input:{braking:boolean;night:boolean;speed:number;enabled?:boolean}){
   brake=input.braking;night=input.night;const enabled=input.enabled!==false;
   intensity=enabled?(brake?(night?92:64):(night?24:12)):0;
   light.intensity=intensity;
   lens?.emissiveColor.copyFromFloats(enabled?(brake?3.2:night?1.05:.5):0,enabled?(brake?.035:.008):0,enabled?(brake?.012:.003):0);
  },
  get stats(){return {lightCount:1,receiverCount:receivers.length,range:light.range,intensity,braking:brake,night,rearSign:rear,lensCount:lenses.length,castsOnRoad:receivers.length>0&&light.intensity>0,extraShadowMaps:0};},
  dispose(){light.dispose();for(const [material,budget]of budgets)material.maxSimultaneousLights=budget;if(source)for(const mesh of lenses)mesh.material=source;lens?.dispose(false,false);},
 };
}
