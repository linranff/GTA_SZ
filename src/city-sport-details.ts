import {Color3,Matrix,Mesh,MeshBuilder,PBRMaterial,Vector3,VertexBuffer,VertexData,type AbstractMesh,type Scene,type TransformNode} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-cinematic.ts';

export type SportCarSource={name:string;positions:number[];indices:ArrayLike<number>};
type SurfaceTriangle={p:number[];minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number};
const sourceName=(name:string)=>name.replace(/\.\d+$/,'');

/** All inspection and attachment geometry is in car-root coordinates, after the existing GLB reflection. */
export function inspectCitySportMounts(sources:SportCarSource[]){
 const tail=sources.find(m=>sourceName(m.name)==='car_redled'),head=sources.find(m=>sourceName(m.name)==='car_led');
 if(!tail||!head)throw new Error('sport-details: original front/rear lenses are required');
 const meanZ=(p:number[])=>p.filter((_,i)=>i%3===2).reduce((s,v)=>s+v,0)/(p.length/3),rearSign=Math.sign(meanZ(tail.positions)),frontSign=Math.sign(meanZ(head.positions));
 if(!rearSign||frontSign!==-rearSign||Math.abs(meanZ(head.positions))<1.8||Math.abs(meanZ(tail.positions))<1.8)throw new Error('sport-details: source front/rear coordinates failed verification');
 const triangles:SurfaceTriangle[]=[],body=sources.filter(m=>/^car_(?:paint|trim)$/.test(sourceName(m.name)));
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(const source of body){
  for(let i=0;i<source.positions.length;i++) {const axis=i%3;bounds.min[axis]=Math.min(bounds.min[axis],source.positions[i]);bounds.max[axis]=Math.max(bounds.max[axis],source.positions[i]);}
  for(let i=0;i<source.indices.length;i+=3){
   const p:number[]=[];for(let j=0;j<3;j++){const index=source.indices[i+j]*3;p.push(...source.positions.slice(index,index+3));}
   triangles.push({p,minX:Math.min(p[0],p[3],p[6]),maxX:Math.max(p[0],p[3],p[6]),minY:Math.min(p[1],p[4],p[7]),maxY:Math.max(p[1],p[4],p[7]),minZ:Math.min(p[2],p[5],p[8]),maxZ:Math.max(p[2],p[5],p[8])});
  }
 }
 if(bounds.max[0]-bounds.min[0]<1.8||bounds.max[2]-bounds.min[2]<4.7)throw new Error('sport-details: body dimensions do not match the integrated GT');
 function surface(x:number,other:number,vertical:boolean,faceSign=rearSign){
  let furthest=-Infinity;
  for(const t of triangles){
   if(x<t.minX-1e-6||x>t.maxX+1e-6||other<(vertical?t.minZ:t.minY)-1e-6||other>(vertical?t.maxZ:t.maxY)+1e-6)continue;
   const p=t.p,j=vertical?2:1,k=vertical?1:2,den=(p[3+j]-p[6+j])*(p[0]-p[6])+(p[6]-p[3])*(p[j]-p[6+j]);
   if(Math.abs(den)<1e-10)continue;
   const u=((p[3+j]-p[6+j])*(x-p[6])+(p[6]-p[3])*(other-p[6+j]))/den,v=((p[6+j]-p[j])*(x-p[6])+(p[0]-p[6])*(other-p[6+j]))/den,w=1-u-v;
   if(Math.min(u,v,w)<-1e-5)continue;
   furthest=Math.max(furthest,(u*p[k]+v*p[3+k]+w*p[6+k])*(vertical?1:faceSign));
  }
  return furthest;
 }
 const supports=[-.58,.58].map(x=>({x,y:surface(x,rearSign*2.23,true),z:rearSign*2.23}));
 if(supports.some(p=>!Number.isFinite(p.y)||p.y<.9||p.y>1.2))throw new Error('sport-details: rear deck mounting surface is missing');
 const exhaust=[-.715,-.575,.575,.715].map(x=>({x,y:.27,z:rearSign*surface(x,.27,false)}));
 if(exhaust.some(p=>!Number.isFinite(p.z)||Math.abs(p.z)<2.3||Math.abs(p.z)>2.49))throw new Error('sport-details: rear bumper mounting surface is missing');
 const headPaths:Vector3[][]=[];
 for(const side of [-1,1]){
  const points:Vector3[]=[];for(let i=0;i<head.positions.length;i+=3)if(head.positions[i]*side>0)points.push(Vector3.FromArray(head.positions,i));
  const min=Math.min(...points.map(p=>p.x*side)),max=Math.max(...points.map(p=>p.x*side)),path:Vector3[]=[];
  for(let bin=0;bin<10;bin++){
   const candidates=points.filter(p=>Math.min(9,Math.floor((p.x*side-min)/(max-min)*10))===bin).sort((a,b)=>b.y-a.y||b.z*frontSign-a.z*frontSign);
   if(candidates[0])path.push(candidates[0].clone());
  }
  if(path.length<5)throw new Error('sport-details: headlight outline is not usable');
  headPaths.push(path);
 }
 return {rearSign,frontSign,bounds,supports,exhaust,headPaths,topAt:(x:number,z:number)=>surface(x,z,true),frontAt:(x:number,y:number)=>frontSign*surface(x,y,false,frontSign),wing:{width:1.78,depth:.35,height:1.385,centreZ:rearSign*2.22},exhaustOuterRadius:.059,exhaustInnerRadius:.044,exhaustTipZ:rearSign*2.487};
}

export function createCitySportDetails(scene:Scene,car:TransformNode){
 const meshes:Mesh[]=[],materials:PBRMaterial[]=[],originalLenses=new Map<AbstractMesh,PBRMaterial>(),sourceMeshes=car.getChildMeshes(false);
 const inverse=Matrix.Invert(car.computeWorldMatrix(true)),sources:SportCarSource[]=[];
 for(const mesh of sourceMeshes){
  if(!/^car_(?:paint|trim|redled|led)(?:\.\d+)?$/.test(mesh.name))continue;
  const raw=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();if(!raw||!indices)continue;
  const transform=mesh.computeWorldMatrix(true).multiply(inverse),positions:number[]=[];
  for(let i=0;i<raw.length;i+=3)Vector3.TransformCoordinates(Vector3.FromArray(raw,i),transform).toArray(positions,i);
  sources.push({name:mesh.name,positions,indices});
 }
 let mount:ReturnType<typeof inspectCitySportMounts>|null=null,skippedReason:string|null=null,mode:CinematicLightingMode='sunset',disposed=false;
 try{mount=inspectCitySportMounts(sources);}catch(error){skippedReason=error instanceof Error?error.message:String(error);}
 const groups=new Map<PBRMaterial,Mesh[]>();
 function material(name:string,color:Color3,metallic:number,roughness:number){
  const m=new PBRMaterial(`city-sport:${name}`,scene);m.albedoColor=color;m.metallic=metallic;m.roughness=roughness;m.maxSimultaneousLights=4;m.environmentIntensity=.95;m.enableSpecularAntiAliasing=true;materials.push(m);groups.set(m,[]);return m;
 }
 function keep(mesh:Mesh,m:PBRMaterial){mesh.material=m;mesh.removeVerticesData(VertexBuffer.UVKind);groups.get(m)!.push(mesh);return mesh;}
 function box(name:string,size:Vector3,position:Vector3,m:PBRMaterial){const mesh=MeshBuilder.CreateBox(name,{width:size.x,height:size.y,depth:size.z},scene);mesh.position.copyFrom(position);return keep(mesh,m);}
 function polyhedron(name:string,vertices:Vector3[],faces:number[][],m:PBRMaterial){
  const positions:number[]=[],indices:number[]=[],centre=vertices.reduce((sum,p)=>sum.add(p),Vector3.Zero()).scale(1/vertices.length);
  for(const face of faces){
   const points=face.map(i=>vertices[i]),mid=points.reduce((sum,p)=>sum.add(p),Vector3.Zero()).scale(1/points.length),normal=Vector3.Cross(points[0].subtract(points[1]),points[2].subtract(points[1]));
   if(Vector3.Dot(normal,mid.subtract(centre))<0)points.reverse();
   const offset=positions.length/3;for(const point of points)positions.push(...point.asArray());
   for(let i=1;i<points.length-1;i++)indices.push(offset,offset+i,offset+i+1);
  }
  const data=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.positions=positions;data.normals=normals;data.indices=indices;
  const mesh=new Mesh(name,scene);data.applyToMesh(mesh);return keep(mesh,m);
 }
 let drl:PBRMaterial|null=null,lens:PBRMaterial|null=null,headlightProjectionLift=0;
 if(mount){
  const {rearSign,frontSign,wing}=mount,carbon=material('satin-carbon',new Color3(.027,.034,.045),.38,.32),metal=material('brushed-titanium',new Color3(.52,.58,.65),.94,.23),cavity=material('lamp-and-exhaust-cavity',new Color3(.008,.012,.018),.12,.42);
  carbon.clearCoat.isEnabled=true;carbon.clearCoat.intensity=.35;carbon.clearCoat.roughness=.18;
  drl=material('daytime-running-light',new Color3(.69,.83,.94),.05,.24);
  const profile=[[-.175,-.008],[-.135,.019],[.12,.019],[.175,-.006],[.13,-.029],[-.135,-.026]],vertices:Vector3[]=[];
  for(const side of [-1,1])for(const [depth,height] of profile)vertices.push(new Vector3(side*wing.width*.5,wing.height+height,wing.centreZ+rearSign*depth));
  const faces:number[][]=[profile.map((_,i)=>i),profile.map((_,i)=>profile.length+i)];for(let i=0;i<profile.length;i++)faces.push([i,(i+1)%profile.length,(i+1)%profile.length+profile.length,i+profile.length]);
  polyhedron('sport-wing-airfoil',vertices,faces,carbon);
  const padFaces=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  for(const support of mount.supports){
   const pad:Vector3[]=[];for(const offset of [-.005,.013])for(const [dx,dz] of [[-.055,-.075],[.055,-.075],[.055,.075],[-.055,.075]])pad.push(new Vector3(support.x+dx,mount.topAt(support.x+dx,support.z+dz)+offset,support.z+dz));
   polyhedron('sport-wing-deck-foot',pad,padFaces,carbon);
   const bottom=new Vector3(support.x,support.y+.006,support.z),top=new Vector3(support.x,wing.height-.025,wing.centreZ+rearSign*.045),span=top.subtract(bottom),strut=box('sport-wing-upright',new Vector3(.042,span.length(),.092),Vector3.Center(bottom,top),metal);strut.rotation.x=Math.atan2(span.z,span.y);
   for(const dz of [-.044,.044]){const bolt=MeshBuilder.CreateSphere('sport-wing-mount-bolt',{diameter:.018,segments:4},scene);bolt.position.set(support.x,mount.topAt(support.x,support.z+dz)+.018,support.z+dz);keep(bolt,metal);}
  }
  for(const side of [-1,1]){
   const plate=box('sport-wing-endplate',new Vector3(.022,.13,.365),new Vector3(side*(wing.width*.5-.011),wing.height+.016,wing.centreZ),carbon);plate.rotation.x=rearSign*.045;
   const highlight=box('sport-wing-endplate-inlay',new Vector3(.024,.016,.22),new Vector3(side*(wing.width*.5-.011),wing.height+.064,wing.centreZ+rearSign*.015),metal);highlight.rotation.x=rearSign*.045;
  }
  // Four open metal rings. The dark inner discs sit in front of the original bumper,
  // so no transparent fake hole, boolean cut, exhaust particle or extra light is needed.
  for(const exhaust of mount.exhaust){
   const segments=16,outer=mount.exhaustOuterRadius,inner=mount.exhaustInnerRadius,back=Math.abs(exhaust.z)-.018,tip=Math.abs(mount.exhaustTipZ),positions:number[]=[],indices:number[]=[],normals:number[]=[];
   function ring(radius:number,depth:number){for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(exhaust.x+Math.cos(a)*radius,exhaust.y+Math.sin(a)*radius,rearSign*depth);}}
   ring(outer,back);ring(outer,tip);ring(inner,tip);ring(inner,tip-.035);
   for(let band=0;band<3;band++)for(let i=0;i<segments;i++){const a=band*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;if(rearSign<0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);}
   VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;const pipe=new Mesh('sport-quad-exhaust-ring',scene);data.applyToMesh(pipe);keep(pipe,metal);
   const cap=MeshBuilder.CreateDisc('sport-exhaust-dark-bore',{radius:inner,tessellation:16,sideOrientation:Mesh.DOUBLESIDE},scene);cap.position.set(exhaust.x,exhaust.y,rearSign*(tip-.034));keep(cap,cavity);
  }
  for(const path of mount.headPaths){
   // The source LED is recessed: fitting only to its top vertices left the brow
   // partly behind the paint. Lift against the actual outer body at each sample.
   const lightPath=path.map(p=>{
    const x=p.x+Math.sign(p.x)*.010,y=p.y+.012,body=mount!.frontAt(x,y)*frontSign,depth=Math.max(p.z*frontSign+.025,Number.isFinite(body)?body+.022:-Infinity);
    headlightProjectionLift=Math.max(headlightProjectionLift,depth-p.z*frontSign);
    return new Vector3(x,y,frontSign*depth);
   // Recess the complete dark tube by its own radius, leaving the luminous
   // front semicircle exposed instead of enclosing it inside the housing.
   }),framePath=lightPath.map(p=>p.add(new Vector3(0,-.001,-frontSign*.022)));
   keep(MeshBuilder.CreateTube('sport-headlamp-brow-housing',{path:framePath,radius:.022,tessellation:6,cap:Mesh.CAP_ALL},scene),cavity);
   keep(MeshBuilder.CreateTube('sport-headlamp-brow-drl',{path:lightPath,radius:.015,tessellation:6,cap:Mesh.CAP_ALL},scene),drl);
  }
  const sourceLens=sourceMeshes.find(m=>sourceName(m.name)==='car_led')?.material;
  if(sourceLens instanceof PBRMaterial){
   lens=sourceLens.clone('city-sport:original-headlamp-core');lens.emissiveIntensity=1;lens.albedoColor.set(.58,.73,.88);lens.roughness=.21;lens.metallic=.06;materials.push(lens);
   for(const source of sourceMeshes)if(sourceName(source.name)==='car_led'&&source.material instanceof PBRMaterial){originalLenses.set(source,source.material);source.material=lens;}
  }
  for(const [m,parts] of groups){
   if(!parts.length)continue;const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,false)!;mesh.name=`sport-details:${m.name.slice(11)}`;mesh.parent=car;mesh.material=m;mesh.isPickable=false;mesh.checkCollisions=false;mesh.receiveShadows=m!==drl;mesh.metadata={sportDetails:true,castsShadows:m!==drl};meshes.push(mesh);
  }
 }
 function setMode(next:CinematicLightingMode){mode=next;const factor=next==='night'?4.2:next==='sunset'?2.9:1.55;drl?.emissiveColor.copyFromFloats(.78*factor,.9*factor,factor);const core=next==='night'?2.8:next==='sunset'?1.9:.9;lens?.emissiveColor.copyFromFloats(.75*core,.86*core,core);}
 setMode(mode);
 return {meshes,setMode,get stats(){return {applied:meshes.length>0,skippedReason,mode,meshCount:meshes.length,triangles:meshes.reduce((sum,m)=>sum+m.getTotalIndices()/3,0),rearSign:mount?.rearSign,frontSign:mount?.frontSign,sourceBounds:mount?.bounds,wing:mount?.wing,wingMounts:mount?.supports,exhaustCount:mount?.exhaust.length??0,exhaustMounts:mount?.exhaust,exhaustTipZ:mount?.exhaustTipZ,exhaustDiameter:mount?mount.exhaustOuterRadius*2:0,headlightOutlinePoints:mount?.headPaths.map(p=>p.length),headlightCoreMeshes:originalLenses.size,headlightDrlDiameter:.03,headlightProjectionLift,headlightDrlPeak:drl?.emissiveColor.b??0,headlightCorePeak:lens?.emissiveColor.b??0,additionalLights:0,additionalTextures:0,additionalReflectionPasses:0,collisionChanged:false,disposed};},dispose(){if(disposed)return;disposed=true;for(const [source,original] of originalLenses)if(!source.isDisposed())source.material=original;for(const mesh of meshes)mesh.dispose(false,false);for(const m of materials)m.dispose(false,false);}};
}
