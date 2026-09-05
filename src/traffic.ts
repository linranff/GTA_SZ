import {DynamicInstances} from './dynamic-instances.ts';
import {Mesh,Matrix,Vector3,Quaternion,PBRMaterial,Color3,type AbstractMesh,type Scene} from '@babylonjs/core';
import type {RoadGraph} from './navigation.ts';
export class CityTraffic{
 private instances=new DynamicInstances();
 cars:{from:number;to:number;t:number;speed:number;x:number;z:number;yaw:number;group:number}[]=[];meshes:Mesh[][]=[];seed=77;
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 constructor(public graph:RoadGraph,source:AbstractMesh[],public scene:Scene,public heightAt:(x:number,z:number)=>number=()=>0,public directionAllowed:(a:number,b:number)=>boolean=()=>true){
  const colors=[new Color3(.52,.56,.53),new Color3(.28,.06,.038),new Color3(.028,.25,.18)];
  for(let i=0;i<3;i++){const group:Mesh[]=[];for(const src of source){if(!(src instanceof Mesh))continue;const m=src.clone('traffic-'+i+'-'+src.name,null,true)!;m.parent=null;m.unfreezeWorldMatrix();m.makeGeometryUnique();m.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));m.position.setAll(0);m.scaling.setAll(1);m.rotationQuaternion=Quaternion.Identity();m.alwaysSelectAsActiveMesh=true;m.receiveShadows=true;m.isPickable=false;if(src.material instanceof PBRMaterial&&src.material.name==='carpaint'){const mat=src.material.clone('traffic-paint-'+i)!;mat.albedoColor=colors[i];m.material=mat;}m.setEnabled(false);group.push(m);}this.meshes.push(group);}
 }
 place(x:number,z:number){this.cars=[];const candidates:number[]=[];for(let i=0;i<this.graph.nodes.length;i++){const p=this.graph.nodes[i],d=Math.hypot(p[0]-x,p[1]-z);if(d>40&&d<600&&this.graph.edges[i].size>1)candidates.push(i);}
  candidates.sort((a,b)=>Math.hypot(this.graph.nodes[a][0]-x,this.graph.nodes[a][1]-z)-Math.hypot(this.graph.nodes[b][0]-x,this.graph.nodes[b][1]-z));
  for(let i=0;i<40&&candidates.length;i++){const from=candidates[Math.floor(this.random()*Math.min(candidates.length,i<10?45:candidates.length))],next=[...this.graph.edges[from].keys()].filter(to=>this.directionAllowed(from,to));if(!next.length)continue;const to=next[Math.floor(this.random()*next.length)],p=this.graph.nodes[from];if(this.cars.some(c=>Math.hypot(c.x-p[0],c.z-p[1])<12))continue;this.cars.push({from,to,t:0,speed:7+this.random()*6,x:p[0],z:p[1],yaw:0,group:i%3});}this.origin=[x,z];this.update(.001,x,z);
 }
 origin=[0,0];
 update(dt:number,px:number,pz:number){if(Math.hypot(px-this.origin[0],pz-this.origin[1])>450){this.place(px,pz);return;}const buffers:number[][]=[[],[],[]];for(const c of this.cars){let a=this.graph.nodes[c.from],b=this.graph.nodes[c.to],len=Math.hypot(a[0]-b[0],a[1]-b[1]);const blocked=this.cars.some(o=>o!==c&&Math.hypot(o.x-c.x,o.z-c.z)<8&&(o.x-c.x)*Math.sin(c.yaw)+(o.z-c.z)*Math.cos(c.yaw)>0);c.t+=dt*(blocked?0:c.speed)/Math.max(.1,len);let limit=0;
   while(c.t>=1&&limit++<12){c.t=(c.t-1)*len;const old=c.from;c.from=c.to;a=this.graph.nodes[c.from];const options=[...this.graph.edges[c.from].keys()].filter(i=>i!==old&&this.directionAllowed(c.from,i));const dx=a[0]-this.graph.nodes[old][0],dz=a[1]-this.graph.nodes[old][1];let best=-Infinity,next=old;for(const i of options){const p=this.graph.nodes[i],l=Math.hypot(p[0]-a[0],p[1]-a[1]);const score=(dx*(p[0]-a[0])+dz*(p[1]-a[1]))/(Math.max(.1,len*l))+this.random()*.7;if(score>best){best=score;next=i;}}c.to=next;b=this.graph.nodes[next];len=Math.hypot(a[0]-b[0],a[1]-b[1]);c.t/=Math.max(.1,len);}
   const yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);c.x=a[0]+(b[0]-a[0])*c.t+Math.cos(yaw)*1.15;c.z=a[1]+(b[1]-a[1])*c.t-Math.sin(yaw)*1.15;c.yaw=yaw;
   if(Math.hypot(c.x-px,c.z-pz)>950)continue;buffers[c.group].push(...Matrix.Compose(Vector3.One(),Quaternion.RotationAxis(Vector3.Up(),yaw),new Vector3(c.x,this.heightAt(c.x,c.z)+.14,c.z)).asArray());}
  for(let i=0;i<3;i++)for(const m of this.meshes[i]){this.instances.update(m,buffers[i]);}
 }
}
