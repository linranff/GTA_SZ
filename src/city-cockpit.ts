import {Color3,DynamicTexture,Matrix,Mesh,MeshBuilder,PBRMaterial,RawTexture,Texture,TransformNode,Vector3,VertexBuffer,VertexData,type AbstractMesh,type Scene} from '@babylonjs/core';

export const CITY_DRIVER_POSE={position:[0,1.12,.05] as const,lookAhead:[0,1.08,18] as const,nearZ:.04,fov:.90};
type CockpitState={night?:boolean;distanceMetres?:number;charge?:number};

/** Geometry and instruments for the source CarConcept's central driving seat.
 * This is a reversible runtime derivative: original mesh buffers/materials and
 * their CC BY 4.0 credits remain intact. Only the old steering-wheel volume is
 * cut from private copies of the two combined interior/trim meshes.
 * Source audit and budget: artifacts/vehicle-experience-candidate/manifest.json.
 */
export function createCityCockpit(scene:Scene,car:TransformNode,carMeshes:readonly AbstractMesh[]){
 const cockpitOnlyMeshes:Mesh[]=[],physicalMeshes:Mesh[]=[],materials:PBRMaterial[]=[];
 const originalStates=new Map<AbstractMesh,boolean>();
 const replacements:{source:Mesh;copy:Mesh;removedTriangles:number}[]=[];
 let active=false,disposed=false,lastPaint=-Infinity,lastDisplay='';
 const inverseCar=Matrix.Invert(car.computeWorldMatrix(true));
 const sourceGlass=carMeshes.filter(m=>/^car_glass(?:\.\d+)?$/.test(m.name));
 for(const source of carMeshes){
  if(!(source instanceof Mesh)||!/^car_(?:leather|trim)(?:\.\d+)?$/.test(source.name))continue;
  const p=source.getVerticesData(VertexBuffer.PositionKind),ix=source.getIndices();if(!p||!ix)continue;
  const transform=source.computeWorldMatrix(true).multiply(inverseCar),inside:boolean[]=[];
  for(let j=0;j<p.length;j+=3){const v=Vector3.TransformCoordinates(Vector3.FromArray(p,j),transform);inside.push(Math.abs(v.x)<.205&&v.y>.54&&v.y<.97&&v.z>.69&&v.z<.92);}
  const kept:number[]=[];let removed=0;
  for(let j=0;j<ix.length;j+=3){if(inside[ix[j]]&&inside[ix[j+1]]&&inside[ix[j+2]])removed++;else kept.push(ix[j],ix[j+1],ix[j+2]);}
  if(!removed)continue;
  const copy=source.clone('cockpit_preserved_'+source.name,source.parent,true);copy.makeGeometryUnique();copy.setIndices(kept);copy.unfreezeWorldMatrix();copy.isPickable=false;copy.setEnabled(false);
  replacements.push({source,copy,removedTriangles:removed});cockpitOnlyMeshes.push(copy);
 }
 for(const source of [...sourceGlass,...replacements.map(r=>r.source)])originalStates.set(source,source.isEnabled(false));

 function mat(name:string,color:[number,number,number],rough:number,metal=0){const m=new PBRMaterial('cockpit:'+name,scene);m.albedoColor=new Color3(...color);m.metallic=metal;m.roughness=rough;m.maxSimultaneousLights=3;materials.push(m);return m;}
 const graphite=mat('soft-graphite',[.024,.030,.038],.72),metal=mat('brushed-controls',[.22,.25,.28],.36,.72),rubber=mat('wheel-leather',[.015,.019,.025],.68);
 const lit=mat('ambient-seam',[.045,.15,.20],.45);lit.emissiveColor=new Color3(.025,.13,.19);
 // A tiny shared, periodic pebble-grain normal; no directional light is baked.
 const grainSize=128,grainHeight=new Float32Array(grainSize*grainSize),grainPixels=new Uint8Array(grainSize*grainSize*3);
 const grainHash=(x:number,y:number)=>{let n=((x+8)%8)*374761393+((y+8)%8)*668265263;n=(n^(n>>>13))*1274126177;return ((n^(n>>>16))>>>0)/4294967295;};
 for(let y=0;y<grainSize;y++)for(let x=0;x<grainSize;x++){const u=x/16,v=y/16,cx=Math.floor(u),cy=Math.floor(v);let distance=9;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const px=cx+dx+.16+.68*grainHash(cx+dx,cy+dy),py=cy+dy+.16+.68*grainHash(cy+dy,cx+dx+3);distance=Math.min(distance,(u-px)**2+(v-py)**2);}grainHeight[y*grainSize+x]=Math.sqrt(distance)*.17+.012*Math.sin(x*Math.PI/2)*Math.cos(y*Math.PI/2);}
 for(let y=0;y<grainSize;y++)for(let x=0;x<grainSize;x++){const sample=(dx:number,dy:number)=>grainHeight[((y+dy+grainSize)%grainSize)*grainSize+(x+dx+grainSize)%grainSize],nx=-(sample(1,0)-sample(-1,0))*2,ny=-(sample(0,1)-sample(0,-1))*2,length=Math.hypot(nx,ny,1),i=(y*grainSize+x)*3;grainPixels[i]=Math.round((nx/length*.5+.5)*255);grainPixels[i+1]=Math.round((ny/length*.5+.5)*255);grainPixels[i+2]=Math.round((1/length*.5+.5)*255);}
 const leatherGrain=RawTexture.CreateRGBTexture(grainPixels,grainSize,grainSize,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);leatherGrain.name='cockpit:leather-micrograin';leatherGrain.gammaSpace=false;leatherGrain.uScale=leatherGrain.vScale=32;leatherGrain.level=.22;leatherGrain.anisotropicFilteringLevel=4;rubber.bumpTexture=leatherGrain;graphite.bumpTexture=leatherGrain;
 for(const replacement of replacements)if(/^car_leather(?:\.\d+)?$/.test(replacement.source.name)&&replacement.source.material instanceof PBRMaterial){const leather=replacement.source.material.clone('cockpit:private-graphite-leather');leather.albedoColor=new Color3(.044,.052,.061);leather.metallic=0;leather.roughness=.84;leather.bumpTexture=leatherGrain;leather.emissiveColor=Color3.Black();replacement.copy.material=leather;materials.push(leather);}
 function box(name:string,size:[number,number,number],position:[number,number,number],material:PBRMaterial){const mesh=MeshBuilder.CreateBox('cockpit_'+name,{width:size[0],height:size[1],depth:size[2]},scene);mesh.position.set(...position);mesh.material=material;return mesh;}
 function merge(parts:Mesh[],name:string,parent:TransformNode){const mesh=Mesh.MergeMeshes(parts,true,true)!;mesh.name=name;mesh.parent=parent;mesh.isPickable=false;mesh.receiveShadows=true;physicalMeshes.push(mesh);return mesh;}
 const instrumentPosition=new Vector3(0,.94,1.026),instrumentTilt=.12;
 function contour(width:number,height:number,radius:number){const points:[number,number][]=[];for(let corner=0;corner<4;corner++){const cx=(corner===0||corner===3?1:-1)*(width/2-radius),cy=(corner<2?1:-1)*(height/2-radius);for(let step=0;step<=6;step++){const a=(corner+step/6)*Math.PI/2;points.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius]);}}return points;}
 // Match CreatePlane winding: Babylon LH front faces use +Z geometric cross
 // products and -Z shading normals. These meshes bypass the GLB Z reflection.
 function rounded(name:string,rings:{width:number;height:number;radius:number;z:number}[],material:PBRMaterial,closed=true,frontCap=true){const positions:number[]=[],uvs:number[]=[],indices:number[]=[];const count=28;for(const ring of rings)for(const [x,y] of contour(ring.width,ring.height,ring.radius)){positions.push(x,y,ring.z);uvs.push(x/ring.width+.5,y/ring.height+.5);}for(let ring=0;ring<rings.length-1;ring++)for(let i=0;i<count;i++){const a=ring*count+i,b=ring*count+(i+1)%count,c=a+count,d=b+count;indices.push(a,b,c,b,d,c);}if(closed){if(frontCap){positions.push(0,0,rings[0].z);uvs.push(.5,.5);const front=positions.length/3-1;for(let i=0;i<count;i++)indices.push(front,(i+1)%count,i);}if(rings.length>1){positions.push(0,0,rings.at(-1)!.z);uvs.push(.5,.5);const back=positions.length/3-1,start=(rings.length-1)*count;for(let i=0;i<count;i++)indices.push(back,start+i,start+(i+1)%count);}}if(!closed)for(let i=0;i<indices.length;i+=3){const next=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=next;}for(let i=0;i<indices.length;i+=3){const next=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=next;}const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=uvs;const mesh=new Mesh('cockpit_'+name,scene);data.applyToMesh(mesh);mesh.material=material;return mesh;}
 const shell=rounded('instrument-shell',[{width:.48,height:.166,radius:.017,z:.002},{width:.494,height:.18,radius:.024,z:.010},{width:.478,height:.158,radius:.021,z:.063}],graphite,true,false);shell.position.copyFrom(instrumentPosition);shell.rotation.x=instrumentTilt;
 // The shell has no filled front cap behind the screen. Keep the screen
 // 22mm ahead of the first shell ring and the bezel 7mm ahead of the screen,
 // avoiding nearly coincident opaque faces at kilometre-scale city positions.
 // A recessed pod on the source dash: no horizon-height rectangular hood.
 merge([shell,box('instrument-foot',[.22,.055,.11],[0,.836,1.104],graphite),box('centre-console',[.16,.035,.25],[.35,.647,.74],graphite)],'cockpit_dashboard_structure',car);
 const bezel=rounded('thin-bezel',[{width:.482,height:.168,radius:.018,z:-.027},{width:.462,height:.152,radius:.0105,z:-.027}],metal,false);bezel.position.copyFrom(instrumentPosition);bezel.rotation.x=instrumentTilt;
 merge([bezel,box('console-controller',[.055,.018,.055],[.35,.675,.72],metal)],'cockpit_brushed_details',car);
 merge([box('instrument-ambient-seam',[.24,.0025,.003],[0,.852,1.023],lit)],'cockpit_ambient_seams',car);

 const wheel=new TransformNode('cockpit_steering_pivot',scene);wheel.parent=car;wheel.position.set(0,.725,.79);wheel.rotation.x=-.13;
 const rotor=new TransformNode('cockpit_steering_rotation',scene);rotor.parent=wheel;
 const rim=MeshBuilder.CreateTorus('cockpit_wheel_rim',{diameter:.35,thickness:.034,tessellation:24},scene);rim.rotation.x=Math.PI/2;rim.material=rubber;
 const hub=box('wheel-airbag',[.14,.098,.043],[0,0,-.014],rubber);
 merge([rim,hub],'cockpit_steering_leather',rotor);
 const spokes=[box('spoke-left',[.13,.027,.022],[-.095,-.012,.006],metal),box('spoke-right',[.13,.027,.022],[.095,-.012,.006],metal),box('spoke-bottom',[.034,.12,.023],[0,-.082,.007],metal)];
 merge(spokes,'cockpit_steering_spokes',rotor);
 const shaft=MeshBuilder.CreateCylinder('cockpit_steering_column',{height:.25,diameter:.048,tessellation:16},scene);shaft.rotation.x=Math.PI/2;shaft.position.set(0,.72,.94);shaft.material=graphite;merge([shaft],'cockpit_column',car);

 const displayTexture=new DynamicTexture('cockpit:live-instruments',{width:1024,height:384},scene,false,Texture.BILINEAR_SAMPLINGMODE);displayTexture.gammaSpace=true;displayTexture.anisotropicFilteringLevel=4;
 const displayMaterial=mat('display',[1,1,1],.6);displayMaterial.albedoTexture=displayTexture;displayMaterial.emissiveTexture=displayTexture;displayMaterial.emissiveColor=Color3.White();displayMaterial.unlit=true;
 const display=rounded('live_instrument_screen',[{width:.46,height:.15,radius:.010,z:-.020}],displayMaterial);display.position.copyFrom(instrumentPosition);display.rotation.x=instrumentTilt;display.parent=car;display.isPickable=false;physicalMeshes.push(display);

 function paint(speed:number,steer:number,state:CockpitState,force=false){
  const now=performance.now(),kmh=Math.min(299,Math.round(Math.abs(speed)*3.6)),gear=Math.abs(speed)<.15?'P':speed<0?'R':'D';
  const charge=state.charge===undefined?null:Math.round(Math.max(0,Math.min(1,state.charge))*100);
  const trip=state.distanceMetres===undefined?null:(Math.max(0,state.distanceMetres)/1000).toFixed(1);
  const key=[kmh,gear,charge,trip,Boolean(state.night),Math.round(steer*12)].join('|');
  if(!force&&(!active||now-lastPaint<100||key===lastDisplay))return;
  lastPaint=now;lastDisplay=key;
  const ctx=displayTexture.getContext() as CanvasRenderingContext2D;ctx.fillStyle='#080f15';ctx.fillRect(0,0,1024,384);
  ctx.strokeStyle='#17363f';ctx.lineWidth=2;ctx.strokeRect(14,14,996,356);
  ctx.font='500 27px "PingFang SC", sans-serif';ctx.fillStyle='#9fafb4';ctx.textAlign='left';ctx.fillText('深城纪  /  海湾 GT',44,58);
  ctx.textAlign='center';ctx.fillStyle='#ecf4f1';ctx.font='500 148px ui-monospace, Menlo, monospace';ctx.fillText(String(kmh).padStart(3,'0'),512,215);
  ctx.font='26px ui-monospace, Menlo, monospace';ctx.fillStyle='#819ca4';ctx.fillText('KM/H',512,255);
  ctx.font='600 60px ui-monospace, Menlo, monospace';ctx.fillStyle=gear==='R'?'#e5b174':'#74d0bf';ctx.fillText(gear,134,196);
  ctx.font='25px "PingFang SC", sans-serif';ctx.fillStyle='#a9b9bd';ctx.fillText(state.night?'近光灯':'日间行车灯',834,177);
  ctx.fillText(charge===null?'电动驱动':charge+'% 电量',834,222);
  ctx.strokeStyle='#24444c';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(74,294);ctx.lineTo(950,294);ctx.stroke();
  ctx.strokeStyle='#63bfae';ctx.beginPath();ctx.moveTo(74,294);ctx.lineTo(74+876*Math.min(kmh/160,1),294);ctx.stroke();
  ctx.textAlign='left';ctx.fillStyle='#8fa5ac';ctx.font='22px ui-monospace, Menlo, sans-serif';ctx.fillText(trip===null?'READY':'TRIP  '+trip+' KM',44,345);
  ctx.textAlign='right';ctx.fillText(Math.abs(steer)<.04?'方向回正':steer<0?'转向 ◀':'转向 ▶',978,345);
  displayTexture.update(true);
 }
 paint(0,0,{},true);
 // New physical pieces can remain present in exterior views. Opaque source
 // glazing occludes them naturally; replacement shell copies are cockpit-only.
 for(const mesh of physicalMeshes)mesh.setEnabled(true);
 function setActive(value:boolean){if(disposed||value===active)return;active=value;for(const [source,wasEnabled] of originalStates)source.setEnabled(value?false:wasEnabled);for(const r of replacements)r.copy.setEnabled(value);if(value)lastDisplay='';}
 return {
  cockpitOnlyMeshes,physicalMeshes,meshes:[...cockpitOnlyMeshes,...physicalMeshes],driverPose:CITY_DRIVER_POSE,
  hiddenSourceMeshes:sourceGlass.map(m=>m.name),replacedSourceMeshes:replacements.map(r=>r.source.name),
  setActive,
  update(speed:number,steer:number,state:CockpitState={}){if(disposed)return;rotor.rotation.z=-Math.max(-1,Math.min(1,steer))*2.6;paint(speed,steer,state);},
  get stats(){return {active,driverPose:CITY_DRIVER_POSE,physicalDrawCalls:physicalMeshes.length,physicalTriangles:physicalMeshes.reduce((sum,m)=>sum+(m.getTotalIndices()/3),0),replacementDrawCalls:replacements.length,replacements:replacements.map(r=>({source:r.source.name,removedSteeringTriangles:r.removedTriangles,retainedTriangles:r.copy.getTotalIndices()/3})),displaySize:[.46,.15],displayLocalDepthOffset:-.020,screenToShellMinDepth:.022,shellFrontCap:false,displayPosition:instrumentPosition.asArray(),displayTextureSize:[1024,384],displayUploadHzLimit:10,privateLeatherFinish:'graphite with 128px shared linear micro-normal',sourceMeshBuffersUnchanged:true,disposed};},
  dispose(){if(disposed)return;setActive(false);disposed=true;for(const mesh of [...cockpitOnlyMeshes,...physicalMeshes])mesh.dispose(false,false);rotor.dispose();wheel.dispose();for(const m of materials)m.dispose(false,false);displayTexture.dispose();leatherGrain.dispose();},
 };
}
