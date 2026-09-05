import {ImportMeshAsync,Matrix,Mesh,PBRMaterial,Quaternion,Vector3,type Scene} from '@babylonjs/core';
type Placement={id:string;x:number;z:number;yaw:number};
/** Photographic CC0 wood/metal street furniture at OSM bench points. The
 * material kit is shared by all visible benches through three instance draws. */
export class CityStreetFurniture {
 private meshes:Mesh[]=[];private placements:Placement[]=[];private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;private count=0;private sourceTriangles=0;
 constructor(private scene:Scene,private heightAt:(x:number,z:number)=>number){}
 async init(){
  const manifest=await fetch('/city/street/manifest.json').then(r=>{if(!r.ok)throw Error('Street furniture manifest unavailable');return r.json();});this.placements=manifest.placements;this.sourceTriangles=manifest.triangles;
  const asset=await ImportMeshAsync('/city/street/'+manifest.file,this.scene);
  for(const mesh of asset.meshes){if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
   const transform=mesh.computeWorldMatrix(true).clone();mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(transform);mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
   if(mesh.material instanceof PBRMaterial){mesh.material.maxSimultaneousLights=3;mesh.material.environmentIntensity=.8;mesh.material.enableSpecularAntiAliasing=true;for(const texture of mesh.material.getActiveTextures())texture.anisotropicFilteringLevel=4;}
   mesh.setEnabled(false);this.meshes.push(mesh);
  }
  asset.meshes[0]?.dispose(false,false);
 }
 update(x:number,z:number,aerial=false){
  if(aerial===this.lastAerial&&Math.hypot(x-this.lastX,z-this.lastZ)<18)return;this.lastX=x;this.lastZ=z;this.lastAerial=aerial;
  const nearby=aerial?[]:this.placements.filter(p=>Math.hypot(p.x-x,p.z-z)<150).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,12);this.count=nearby.length;
  if(!nearby.length){for(const mesh of this.meshes)mesh.setEnabled(false);return;}
  const matrices=new Float32Array(nearby.length*16);nearby.forEach((p,i)=>Matrix.Compose(Vector3.One(),Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,this.heightAt(p.x,p.z)+.045,p.z)).copyToArray(matrices,i*16));
  for(const mesh of this.meshes){mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo();}
 }
 get stats(){return {source:'Poly Haven Modular Street Seating',license:'CC0-1.0',placementSource:'OpenStreetMap',sourceCount:this.placements.length,visible:this.count,triangles:this.count*this.sourceTriangles,drawCalls:this.count?this.meshes.length:0,maxInstances:12};}
 dispose(){for(const mesh of this.meshes)mesh.dispose(false,true);this.meshes=[];}
}
