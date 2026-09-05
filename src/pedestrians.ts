import {DynamicInstances} from './dynamic-instances.ts';
import {ImportMeshAsync,Mesh,Matrix,Quaternion,Vector3,type Scene,type AbstractMesh} from '@babylonjs/core';
type Walker={path:number[];t:number;speed:number;phase:number;x:number;z:number;dir:number};
/** Fixed sidewalk intervals are cut against the union of all carriageways offline. */
export class CityPedestrians{
 private instances=new DynamicInstances();
 paths:number[][]=[];people:Walker[]=[];meshes:Mesh[]=[];origin=[1e9,1e9];time=0;
 constructor(public scene:Scene,public heightAt:(x:number,z:number)=>number=()=>0){}
 async init(){this.paths=await(await fetch('/city/pedestrian-paths.json')).json();const r=await ImportMeshAsync('/city/pedestrian.glb',this.scene);
  for(const src of r.meshes){if(!(src instanceof Mesh)||!src.getTotalVertices())continue;src.parent=null;src.makeGeometryUnique();src.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));src.position.setAll(0);src.scaling.setAll(1);src.rotationQuaternion=Quaternion.Identity();src.alwaysSelectAsActiveMesh=true;src.isPickable=false;src.receiveShadows=true;src.setEnabled(false);this.meshes.push(src);}
 }
 place(x:number,z:number){this.origin=[x,z];const near=this.paths.map((p,i)=>({p,i,d:Math.hypot((p[0]+p[2])/2-x,(p[1]+p[3])/2-z)})).filter(p=>p.d<330).sort((a,b)=>a.d-b.d);this.people=[];
  for(let i=0;i<Math.min(56,near.length);i++){const index=Math.floor(i*near.length/Math.min(56,near.length));const {p}=near[index];this.people.push({path:p,t:(i*.618)%1,speed:.8+(i%7)*.1,phase:i*1.31,x:p[0],z:p[1],dir:i%2?1:-1});}this.update(0,x,z);
 }
 update(dt:number,x:number,z:number){this.time+=dt;if(Math.hypot(x-this.origin[0],z-this.origin[1])>220){this.place(x,z);return;}
  const matrices:Record<string,number[]>={body:[],leftLeg:[],rightLeg:[],leftArm:[],rightArm:[]};
  for(const [i,p] of this.people.entries()){const [ax,az,bx,bz]=p.path,len=Math.hypot(bx-ax,bz-az);p.t+=p.dir*p.speed*dt/len;if(p.t>=1){p.t=1;p.dir=-1;}if(p.t<=0){p.t=0;p.dir=1;}p.x=ax+(bx-ax)*p.t;p.z=az+(bz-az)*p.t;
   const yaw=Math.atan2((bx-ax)*p.dir,(bz-az)*p.dir),gait=Math.sin(this.time*p.speed*6+p.phase)*.38,scale=.94+(i%5)*.025;
   const root=Matrix.Compose(new Vector3(scale,scale,scale),Quaternion.RotationAxis(Vector3.Up(),yaw),new Vector3(p.x,this.heightAt(p.x,p.z)+.10+Math.abs(Math.sin(this.time*6+p.phase))*.018,p.z));
   matrices.body.push(...root.asArray());
   for(const [key,angle,pivot] of [['leftLeg',gait,.89],['rightLeg',-gait,.89],['leftArm',-gait*.8,1.36],['rightArm',gait*.8,1.36]] as const){const m=Matrix.Translation(0,-pivot,0).multiply(Matrix.RotationX(angle)).multiply(Matrix.Translation(0,pivot,0)).multiply(root);matrices[key].push(...m.asArray());}
  }
  for(const m of this.meshes){const key=m.name.includes('leg_-1')?'leftLeg':m.name.includes('leg_1')?'rightLeg':m.name.includes('arm_-1')?'leftArm':m.name.includes('arm_1')?'rightArm':'body';const data=matrices[key];this.instances.update(m,data);if(data.length){if(m.name.includes('shirt')){const palette=[[1,1,1,1],[2.8,2.2,1.7,1],[2.7,.6,.25,1],[.45,.55,.7,1]];this.instances.colors(m,this.people.length,palette);}}}
 }
 get casters():AbstractMesh[]{return this.meshes;}
}
