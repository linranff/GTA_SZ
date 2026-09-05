import type {CityData,Landmark,V2} from './city-types.ts';

export type DetailLandmark=Landmark & {
 photoDistance?:number;photoTargetHeight?:number;photoElevation?:number;photoAngle?:number;
 detailCollision?:boolean;sourceStatus?:string;
};
export type TerrainGrid={x0:number;z0:number;dx:number;dz:number;columns:number;rows:number;heights:number[]};
export type TerrainDetail={schemaVersion:1;id:string;grid:TerrainGrid};
export type LandmarkDetailManifest={
 schemaVersion:1;asset:string;replacedMeshPrefixes:string[];baseBuildingIds:string[];
 landmarks:DetailLandmark[];collisionFootprints:{id:string;rings:V2[][]}[];
 terrain:{url:string};
};

/** Returns the exact same triangulated height as the exported terrain surface.
 * Grid rows increase north (+z); Blender east/north/up becomes game east/up/north.
 * Outside the detail patch the established city ground plane remains zero.
 */
export function terrainHeight(grid:TerrainGrid|undefined,x:number,z:number):number {
 if(!grid||!Number.isFinite(x)||!Number.isFinite(z))return 0;
 const c=(x-grid.x0)/grid.dx,r=(z-grid.z0)/grid.dz;
 if(c<0||r<0||c>grid.columns-1||r>grid.rows-1)return 0;
 const i=Math.min(Math.floor(c),grid.columns-2),j=Math.min(Math.floor(r),grid.rows-2);
 const u=c-i,v=r-j,k=j*grid.columns+i,h=grid.heights;
 // Each cell is split SW->NE, matching build_landmark_details.py.
 return u>=v?h[k]*(1-u)+h[k+1]*(u-v)+h[k+grid.columns+1]*v
             :h[k]*(1-v)+h[k+grid.columns+1]*u+h[k+grid.columns]*(v-u);
}

export async function loadLandmarkDetails(data:CityData):Promise<{
 manifest:LandmarkDetailManifest;terrain:TerrainDetail;heightAt:(x:number,z:number)=>number;
}|null>{
 const response=await fetch('/city/landmark-detail.json');
 if(response.status===404||(response.ok&&response.headers.get('content-type')?.includes('text/html')))return null;
 if(!response.ok)throw new Error('重点地标清单加载失败');
 const manifest=await response.json() as LandmarkDetailManifest;
 if(manifest.schemaVersion!==1||!manifest.asset||!Array.isArray(manifest.landmarks))throw new Error('重点地标清单格式不受支持');
 const demResponse=await fetch(manifest.terrain.url);
 if(!demResponse.ok)throw new Error('莲花山高程加载失败');
 const terrain=await demResponse.json() as TerrainDetail,grid=terrain.grid;
 if(terrain.schemaVersion!==1||!grid||grid.columns<2||grid.rows<2||grid.dx<=0||grid.dz<=0||
    grid.heights.length!==grid.columns*grid.rows||!grid.heights.every(Number.isFinite))throw new Error('莲花山高程网格无效');
 const replaced=new Set(manifest.baseBuildingIds);
 data.buildings=data.buildings.filter(b=>!replaced.has((b as typeof b&{id?:string}).id??''));
 for(const footprint of manifest.collisionFootprints)data.buildings.push({...footprint,height:1,style:'landmark-detail'});
 for(const landmark of manifest.landmarks){
  const index=data.landmarks.findIndex(m=>m.id===landmark.id);
  if(index>=0)data.landmarks[index]={...data.landmarks[index],...landmark};else data.landmarks.push(landmark);
 }
 data.meta.counts.landmarks=data.landmarks.length;
 return {manifest,terrain,heightAt:(x,z)=>terrainHeight(grid,x,z)};
}
