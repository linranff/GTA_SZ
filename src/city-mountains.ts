import {Mesh,PBRMaterial,VertexData,VertexBuffer,Vector3,Matrix,type Scene,type AbstractMesh} from '@babylonjs/core';
import {applyGrassMaterial} from './city-grass-material.ts';

type Grid={x0:number;z0:number;step:number;columns:number;rows:number};
type Tile={id:string;column:number;row:number;columns:number;rows:number;triangles:number};
type Manifest={schemaVersion:1;file:string;grid:Grid;tiles:Tile[];surfaceOffset:number;budgets:{triangles:number;tiles:number;bytes:number;maxHeight:number};places:{name:string;x:number;z:number;peakGameHeight:number}[];ridgeSamples:{name:string;x:number;z:number;peakGameHeight:number}[]};

/** Same b–d triangle diagonal as the render mesh, including boundary cells. */
export function mountainHeightAt(data:Float32Array,g:Grid,x:number,z:number){
 const u=(x-g.x0)/g.step,v=(z-g.z0)/g.step,i=Math.floor(u),j=Math.floor(v);
 if(!Number.isFinite(u)||!Number.isFinite(v)||i<0||j<0||i>=g.columns-1||j>=g.rows-1)return 0;
 const fx=u-i,fz=v-j,k=j*g.columns+i,a=data[k],b=data[k+1],d=data[k+g.columns],c=data[k+g.columns+1];
 return fx+fz<=1?a+(b-a)*fx+(d-a)*fz:c+(d-c)*(1-fx)+(b-c)*(1-fz);
}

async function loadMountainRegion(baseHeightAt:(x:number,z:number)=>number,manifestFile:string){
 const base='/city/mountain-relief/';
 const response=await fetch(base+manifestFile);if(!response.ok)throw Error('山地地形清单加载失败');
 const manifest=await response.json() as Manifest,g=manifest.grid;
 if(manifest.schemaVersion!==1||manifest.budgets.triangles>260000||manifest.tiles.length>180||g.columns*g.rows>600000)throw Error('山地地形预算或格式无效');
 const packed=await fetch(base+manifest.file);if(!packed.ok)throw Error('山地高程加载失败');const buffer=await packed.arrayBuffer();
 if(buffer.byteLength!==manifest.budgets.bytes||buffer.byteLength!==g.columns*g.rows*4)throw Error('山地高程长度无效');
 const heights=new Float32Array(buffer),meshes:Mesh[]=[];let material:PBRMaterial|null=null;
 const deltaAt=(x:number,z:number)=>mountainHeightAt(heights,g,x,z);
 function attachVisuals(scene:Scene){
  // Subtropical hill forest is a dark, low-chroma green, never lawn green.
  // applyGrassMaterial owns the albedo (it resets albedoColor to white and
  // replaces surfaceAlbedo in-shader); the forest flag adds the canopy tint
  // and crown clumps there, and the vertex colours below survive that hook.
  material=new PBRMaterial('mountain-landscape',scene);material.metallic=0;material.roughness=.98;material.environmentIntensity=.85;material.maxSimultaneousLights=3;
  applyGrassMaterial(scene,material,false,true);
  for(const tile of manifest.tiles){
   const positions:number[]=[],normals:number[]=[],uvs:number[]=[],colors:number[]=[],indices:number[]=[];
   for(let z=0;z<tile.rows;z++)for(let x=0;x<tile.columns;x++){
    const col=tile.column+x,row=tile.row+z,wx=g.x0+col*g.step,wz=g.z0+row*g.step,h=heights[row*g.columns+col];
    positions.push(wx,h+baseHeightAt(wx,wz)+manifest.surfaceOffset,wz);uvs.push(wx/8,wz/8);
    const slopeX=(heights[row*g.columns+Math.min(g.columns-1,col+1)]-heights[row*g.columns+Math.max(0,col-1)])/(2*g.step),slopeZ=(heights[Math.min(g.rows-1,row+1)*g.columns+col]-heights[Math.max(0,row-1)*g.columns+col])/(2*g.step),len=Math.hypot(slopeX,1,slopeZ);
    normals.push(-slopeX/len,1/len,-slopeZ/len);
    // Canopy clumps at two scales, darker forest on the higher ground, and
    // warm-grey rock where the DSM slope exceeds what trees hold. Vertex colour
    // only: no texture, light or draw call is added for this variation.
    const clumps=Math.sin(wx/91+wz/137)*Math.cos(wz/83-wx/211)*.5+.5,fine=.93+.07*Math.sin(wx/37+1.3)*Math.cos(wz/41);
    const highland=Math.min(1,Math.max(0,(h-30)/200)),stone=Math.min(.45,Math.max(0,Math.hypot(slopeX,slopeZ)-.40)*.75);
    const shade=(.78+.22*clumps)*fine*(1-.20*highland);
    colors.push(shade*(1+stone*.60),shade*(1-stone*.22),shade*(1+stone*.48),1);
   }
   for(let z=0;z<tile.rows-1;z++)for(let x=0;x<tile.columns-1;x++){
    const col=tile.column+x,row=tile.row+z,k=row*g.columns+col;
    if(Math.max(heights[k],heights[k+1],heights[k+g.columns],heights[k+g.columns+1])<=0)continue;
    const a=z*tile.columns+x,b=a+1,d=a+tile.columns,c=d+1;
    if(scene.useRightHandedSystem)indices.push(a,d,b,b,d,c);else indices.push(a,b,d,b,c,d);
   }
   const mesh=new Mesh('ground_relief_mountain_'+manifestFile+'_'+tile.id,scene),vd=new VertexData();vd.positions=positions;vd.normals=normals;vd.uvs=uvs;vd.colors=colors;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();meshes.push(mesh);
  }
  scene.onDisposeObservable.addOnce(()=>{for(const mesh of meshes)mesh.dispose(false,false);material?.dispose(false,false);});return meshes;
 }
 return {heightAt:(x:number,z:number)=>baseHeightAt(x,z)+deltaAt(x,z),deltaAt,attachVisuals,meshes,manifest,get stats(){return {...manifest.budgets,places:manifest.places,ridges:manifest.ridgeSamples,source:'Copernicus 30m DSM; filtered ridges and authored lawn transitions',extraTextures:0};}};
}

export async function loadCityMountains(baseHeightAt:(x:number,z:number)=>number){
 const regions=await Promise.all(['manifest.json','near-manifest.json'].map(file=>loadMountainRegion(baseHeightAt,file)));
 const deltaAt=(x:number,z:number)=>regions.reduce((h,r)=>h+r.deltaAt(x,z),0),meshes:Mesh[]=[];
 return {deltaAt,heightAt:(x:number,z:number)=>baseHeightAt(x,z)+deltaAt(x,z),meshes,
  drapePaths(sources:AbstractMesh[]){
   for(const mesh of sources){
    if(!(mesh instanceof Mesh)||!/_asphalt$|_pavement$|_roadline$/.test(mesh.name))continue;
    const raw=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();if(!raw||!indices)continue;
    const world=mesh.computeWorldMatrix(true),inverse=Matrix.Invert(world),positions=Float32Array.from(raw);let changed=false;
    for(let i=0;i<positions.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),world),raise=deltaAt(p.x,p.z);if(raise<.001)continue;p.y+=raise;Vector3.TransformCoordinatesToRef(p,inverse,p);p.toArray(positions,i);changed=true;}
    // These are imported glTF road primitives: their local indices retain RH
    // winding even in Babylon's LH scene (the loader flips the parent root).
    if(changed){mesh.makeGeometryUnique();mesh.setVerticesData(VertexBuffer.PositionKind,positions);const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});mesh.setVerticesData(VertexBuffer.NormalKind,normals);mesh.refreshBoundingInfo({});}
   }
  },
  attachVisuals(scene:Scene){for(const region of regions)meshes.push(...region.attachVisuals(scene));return meshes;},
  get stats(){return {triangles:regions.reduce((n,r)=>n+r.stats.triangles,0),bytes:regions.reduce((n,r)=>n+r.stats.bytes,0),tiles:meshes.length,regions:regions.map(r=>r.stats),extraTextures:0};}};
}
