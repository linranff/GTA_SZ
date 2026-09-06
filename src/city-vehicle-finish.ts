import {Color3,DynamicTexture,Matrix,Mesh,PBRMaterial,Texture,Vector3,VertexBuffer,VertexData,type AbstractMesh,type Scene,type TransformNode} from '@babylonjs/core';

type Triangle = {points:number[];minX:number;maxX:number;minY:number;maxY:number};

/** A source-surface-fitted identity plate for the integrated CarConcept.
 * The original model, materials, wheels and CC BY attribution are untouched.
 * The enlarged lettering spans 3× the original physical width and height.
 * Its rear-panel surface is GLB Z 2.399–2.500 m at X ±.72, Y .34–.76.
 * Runtime projection below rechecks
 * the actual imported surface in carRoot space, including the existing Z flip.
 * The original taillights are retained: their surrounding surface has a deep
 * discontinuity, so a continuous added strip would not be reliably flush.
 */
export function applyCinematicVehicleFinish(scene:Scene,carRoot:TransformNode,carMeshes:readonly AbstractMesh[]) {
  const meshes:Mesh[] = [];
  let texture:DynamicTexture|null = null;
  let material:PBRMaterial|null = null;
  let disposed = false;
  let skippedReason:string|null = null;
  let surfaceRange:number[] = [];
  const width=1.44,height=.42,centreY=.55,offset=.006,columns=32,rows=12;
  const inverseRoot=Matrix.Invert(carRoot.computeWorldMatrix(true));
  const tail=carMeshes.find(mesh=>/^car_redled(?:\.\d+)?$/.test(mesh.name));
  let rearSign=-1;
  if(tail){
    const positions=tail.getVerticesData(VertexBuffer.PositionKind);
    if(positions?.length){
      const transform=tail.computeWorldMatrix(true).multiply(inverseRoot);
      const rear=Vector3.TransformCoordinates(Vector3.FromArray(positions),transform).z;
      if(Math.abs(rear)>1.5)rearSign=Math.sign(rear);
      else skippedReason='unexpected-tail-coordinate';
    }
  }else skippedReason='source-taillight-not-found';

  const triangles:Triangle[]=[];
  if(!skippedReason)for(const source of carMeshes){
    if(!/^car_(?:paint|trim)(?:\.\d+)?$/.test(source.name))continue;
    const raw=source.getVerticesData(VertexBuffer.PositionKind),indices=source.getIndices();
    if(!raw||!indices)continue;
    const transform=source.computeWorldMatrix(true).multiply(inverseRoot);
    const positions=new Float32Array(raw.length);
    for(let i=0;i<raw.length;i+=3)Vector3.TransformCoordinates(Vector3.FromArray(raw,i),transform).toArray(positions,i);
    for(let i=0;i<indices.length;i+=3){
      const p:number[]=[];
      for(let k=0;k<3;k++){const j=indices[i+k]*3;p.push(positions[j],positions[j+1],positions[j+2]);}
      const minX=Math.min(p[0],p[3],p[6]),maxX=Math.max(p[0],p[3],p[6]);
      const minY=Math.min(p[1],p[4],p[7]),maxY=Math.max(p[1],p[4],p[7]);
      if(maxX<-width/2-offset||minX>width/2+offset||maxY<centreY-height/2-offset||minY>centreY+height/2+offset||Math.max(p[2]*rearSign,p[5]*rearSign,p[8]*rearSign)<1.8)continue;
      triangles.push({points:p,minX,maxX,minY,maxY});
    }
  }

  function rearSurface(x:number,y:number){
    let furthest=-Infinity;
    for(const triangle of triangles){
      if(x<triangle.minX-1e-6||x>triangle.maxX+1e-6||y<triangle.minY-1e-6||y>triangle.maxY+1e-6)continue;
      const [ax,ay,az,bx,by,bz,cx,cy,cz]=triangle.points;
      const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
      if(Math.abs(den)<1e-10)continue;
      const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den;
      const v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den,w=1-u-v;
      if(Math.min(u,v,w)<-1e-5)continue;
      const distance=(u*az+v*bz+w*cz)*rearSign;
      if(distance>furthest)furthest=distance;
    }
    return furthest;
  }

  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],depths:number[]=[];
  if(!skippedReason){
    for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
      const u=column/columns,v=row/rows,x=(u-.5)*width,y=centreY+(v-.5)*height;
      const depth=rearSurface(x,y);
      depths.push(depth);positions.push(x,y,rearSign*(depth+offset));uvs.push(rearSign<0?u:1-u,v);
    }
    const min=Math.min(...depths),max=Math.max(...depths);
    if(!depths.every(Number.isFinite)||min<2.38||max>2.52||max-min>.12)skippedReason='rear-plate-surface-check-failed';
    else surfaceRange=[min,max];
  }

  if(!skippedReason){
    texture=new DynamicTexture('vehicle-finish:plate',{width:512,height:128},scene,true,Texture.TRILINEAR_SAMPLINGMODE);
    texture.gammaSpace=true;texture.anisotropicFilteringLevel=4;
    const context=texture.getContext() as CanvasRenderingContext2D;
    context.fillStyle='#111920';context.fillRect(0,0,512,128);
    context.strokeStyle='#65717c';context.lineWidth=3;context.strokeRect(10,10,492,108);
    context.fillStyle='#e3e7df';context.font='600 80px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign='center';context.textBaseline='middle';
    [...'深城纪'].forEach((character,i)=>context.fillText(character,144+i*112,66));
    texture.update(true);
    material=new PBRMaterial('vehicle-finish:plate',scene);
    material.albedoTexture=texture;material.albedoColor=Color3.White();
    material.emissiveTexture=texture;material.emissiveColor=new Color3(.12,.12,.12);
    material.metallic=.1;material.roughness=.64;material.maxSimultaneousLights=3;
    material.backFaceCulling=false;material.twoSidedLighting=true;
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
    const normals:number[]=[];
    VertexData.ComputeNormals(positions,indices,normals);
    for(let i=0;i<normals.length;i+=3)if(normals[i+2]*rearSign<0){normals[i]*=-1;normals[i+1]*=-1;normals[i+2]*=-1;}
    const vertexData=new VertexData();vertexData.positions=positions;vertexData.indices=indices;vertexData.normals=normals;vertexData.uvs=uvs;
    const plate=new Mesh('cinematic_vehicle_plate',scene);vertexData.applyToMesh(plate);
    plate.parent=carRoot;plate.material=material;plate.isPickable=false;plate.receiveShadows=true;
    meshes.push(plate);
  }

  return {
    meshes,
    get stats(){return {applied:meshes.length>0,skippedReason,meshCount:meshes.length,drawCalls:meshes.length,triangles:indices.length/3,plateText:'深城纪',width,height,surfaceRange,offset,rearSign,sourceGeometry:'unchanged',sourceMaterials:'unchanged',taillights:'original retained',textureSize:texture?[512,128]:null,disposed};},
    dispose(){if(disposed)return;disposed=true;for(const mesh of meshes)mesh.dispose(false,false);material?.dispose(false,false);texture?.dispose();},
  };
}
