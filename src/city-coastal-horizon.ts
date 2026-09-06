import {Matrix,Mesh,Vector3,VertexBuffer,VertexData,type AbstractMesh,type Scene} from '@babylonjs/core';

export type CoastalHorizonStats={
 sourceVertices:number;weldedVertices:number;sourceTriangles:number;boundaryEdges:number;skirtEdges:number;triangles:number;
 nonManifoldEdges:number;skippedTriangles:number;waterHeight:number;bottomHeight:number;weldTolerance:number;
};
export type CoastalHorizonGeometry={positions:number[];normals:number[];indices:number[];stats:CoastalHorizonStats};
type BoundaryEdge={a:number;b:number;interior:number;count:number};

/**
 * Extract the true open outline after GLB transforms, then close it vertically below water.
 * Position welding ignores normal/UV seams without moving any original upper edge vertices.
 * Output positions are world-space and faces use Babylon's LH outward winding.
 */
export function buildCoastalHorizonGeometry(sourcePositions:ArrayLike<number>,sourceIndices:ArrayLike<number>,world:Matrix,waterHeight=-.25,weldTolerance=.001):CoastalHorizonGeometry{
 if(!Number.isFinite(waterHeight)||!Number.isFinite(weldTolerance)||weldTolerance<=0)throw new Error('Coastal horizon requires finite water height and positive weld tolerance');
 const positions:number[]=[],normals:number[]=[],indices:number[]=[],points:Vector3[]=[],canonical:Vector3[]=[];
 const vertexIds=new Int32Array(Math.floor(sourcePositions.length/3)),cells=new Map<string,number[]>(),toleranceSquared=weldTolerance*weldTolerance;
 const stats:CoastalHorizonStats={sourceVertices:vertexIds.length,weldedVertices:0,sourceTriangles:Math.floor(sourceIndices.length/3),boundaryEdges:0,skirtEdges:0,triangles:0,nonManifoldEdges:0,skippedTriangles:0,waterHeight,bottomHeight:waterHeight-1,weldTolerance};
 for(let i=0;i<vertexIds.length;i++){
  const p=Vector3.TransformCoordinates(Vector3.FromArray(sourcePositions,i*3),world);points.push(p);
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)){vertexIds[i]=-1;continue;}
  const x=Math.floor(p.x/weldTolerance),y=Math.floor(p.y/weldTolerance),z=Math.floor(p.z/weldTolerance);let id=-1;
  for(let dx=-1;dx<=1&&id<0;dx++)for(let dy=-1;dy<=1&&id<0;dy++)for(let dz=-1;dz<=1&&id<0;dz++){
   const candidates=cells.get(`${x+dx},${y+dy},${z+dz}`);if(!candidates)continue;
   for(const candidate of candidates)if(Vector3.DistanceSquared(p,canonical[candidate])<=toleranceSquared){id=candidate;break;}
  }
  if(id<0){id=canonical.length;canonical.push(p);const key=`${x},${y},${z}`,cell=cells.get(key);if(cell)cell.push(id);else cells.set(key,[id]);}
  vertexIds[i]=id;
 }
 stats.weldedVertices=canonical.length;
 const edges=new Map<string,BoundaryEdge>();
 for(let i=0;i+2<sourceIndices.length;i+=3){
  const a=sourceIndices[i],b=sourceIndices[i+1],c=sourceIndices[i+2];
  if(![a,b,c].every(index=>Number.isInteger(index)&&index>=0&&index<vertexIds.length&&vertexIds[index]>=0)||vertexIds[a]===vertexIds[b]||vertexIds[b]===vertexIds[c]||vertexIds[c]===vertexIds[a]){stats.skippedTriangles++;continue;}
  const ab=points[b].subtract(points[a]),ac=points[c].subtract(points[a]);
  if(Vector3.Cross(ab,ac).lengthSquared()<1e-16){stats.skippedTriangles++;continue;}
  for(const [u,v,interior] of [[a,b,c],[b,c,a],[c,a,b]]){
   const iu=vertexIds[u],iv=vertexIds[v],key=iu<iv?`${iu}_${iv}`:`${iv}_${iu}`,edge=edges.get(key);
   if(edge)edge.count++;else edges.set(key,{a:u,b:v,interior,count:1});
  }
 }
 for(const edge of edges.values()){
  if(edge.count>2){stats.nonManifoldEdges++;continue;}
  if(edge.count!==1)continue;stats.boundaryEdges++;
  const a=points[edge.a],b=points[edge.b],interior=points[edge.interior],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  // Already submerged borders and vertical/zero-length top edges need no visible closure.
  if(Math.max(a.y,b.y)<=waterHeight||length<1e-8)continue;
  const bottomA=Math.min(a.y,stats.bottomHeight),bottomB=Math.min(b.y,stats.bottomHeight),offset=positions.length/3;
  let nx=dz/length,nz=-dx/length;
  const reverse=nx*(interior.x-a.x)+nz*(interior.z-a.z)>0;
  if(reverse){nx=-nx;nz=-nz;}
  positions.push(a.x,bottomA,a.z,b.x,bottomB,b.z,b.x,b.y,b.z,a.x,a.y,a.z);
  for(let j=0;j<4;j++)normals.push(nx,0,nz);
  if(b.y-bottomB>1e-8)indices.push(offset,offset+(reverse?2:1),offset+(reverse?1:2));
  if(a.y-bottomA>1e-8)indices.push(offset,offset+(reverse?3:2),offset+(reverse?2:3));
  stats.skirtEdges++;
 }
 stats.triangles=indices.length/3;return {positions,normals,indices,stats};
}

/** One static, non-colliding mesh; reuse the source terrain material and existing lighting. */
export function createCoastalHorizon(scene:Scene,source:AbstractMesh,waterHeight=-.25){
 const positions=source.getVerticesData(VertexBuffer.PositionKind),indices=source.getIndices();
 if(!positions||!indices)return {mesh:null,stats:null};
 const geometry=buildCoastalHorizonGeometry(positions,indices,source.computeWorldMatrix(true),waterHeight);
 if(!geometry.indices.length)return {mesh:null,stats:geometry.stats};
 const mesh=new Mesh(`${source.name}_coastal_horizon`,scene),data=new VertexData();
 data.positions=geometry.positions;data.normals=geometry.normals;data.indices=geometry.indices;data.applyToMesh(mesh,false);
 mesh.material=source.material;mesh.receiveShadows=false;mesh.isPickable=false;mesh.checkCollisions=false;
 mesh.applyFog=source.applyFog;mesh.layerMask=source.layerMask;mesh.renderingGroupId=source.renderingGroupId;
 mesh.metadata={coastalHorizon:true,sourceMesh:source.name,castsShadows:false};mesh.freezeWorldMatrix();
 source.onDisposeObservable.addOnce(()=>mesh.dispose(false,false));
 return {mesh,stats:geometry.stats};
}
