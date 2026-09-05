import {ImportMeshAsync,Quaternion,PBRMaterial,type AbstractMesh,type Scene} from '@babylonjs/core';
type Tile={id:string;x:number;z:number;bytes:number};
type Resident={tile:Tile;meshes:AbstractMesh[]};
/** Keep original Blender geometry, but decode only nearby 640 m tiles. */
export class CityFacadeStream{
 tiles:Tile[]=[];resident=new Map<string,Resident>();pending=false;focus={x:0,z:0};visible=true;failed=new Set<string>();
 constructor(private scene:Scene,private changed:()=>void,private applyArchitecture?:(meshes:AbstractMesh[],assetName:string)=>void){}
 async init(x:number,z:number){const response=await fetch('/city/facade-tiles.json');if(!response.ok)throw Error('精细立面索引未能载入');this.tiles=(await response.json()).tiles;this.focus={x,z};
  for(const t of this.near(700))await this.load(t);
 }
 private near(radius:number){return this.tiles.filter(t=>Math.hypot(t.x-this.focus.x,t.z-this.focus.z)<radius).sort((a,b)=>Math.hypot(a.x-this.focus.x,a.z-this.focus.z)-Math.hypot(b.x-this.focus.x,b.z-this.focus.z));}
 private async load(tile:Tile){const result=await ImportMeshAsync('/city/facade-tiles/'+tile.id+'.glb',this.scene);result.meshes[0].rotationQuaternion=Quaternion.Identity();for(const mesh of result.meshes){mesh.isPickable=false;mesh.receiveShadows=true;if(mesh.material instanceof PBRMaterial){mesh.material.environmentIntensity=1;mesh.material.forceIrradianceInFragment=true;mesh.material.maxSimultaneousLights=8;}if(mesh.getTotalVertices())mesh.freezeWorldMatrix();}
  this.applyArchitecture?.(result.meshes,'facade-tiles/'+tile.id);this.resident.set(tile.id,{tile,meshes:result.meshes});
 }
 update(x:number,z:number,visible=true){this.focus={x,z};this.visible=visible;
  for(const [id,r] of this.resident){const distance=Math.hypot(r.tile.x-x,r.tile.z-z);if(distance>1500){for(const mesh of [...r.meshes].reverse())mesh.dispose(false,!this.applyArchitecture);this.resident.delete(id);}else r.meshes[0].setEnabled(visible&&distance<700);}
  if(!this.pending&&visible)void this.pump();
 }
 private async pump(){const tile=this.near(1050).find(t=>!this.resident.has(t.id)&&!this.failed.has(t.id));if(!tile)return;this.pending=true;
  try{await this.load(tile);}catch(error){this.failed.add(tile.id);console.warn('精细立面稍后可刷新重试',tile.id,error);}finally{this.pending=false;this.update(this.focus.x,this.focus.z,this.visible);this.changed();}
 }
 get meshes(){return [...this.resident.values()].flatMap(r=>r.meshes.filter(m=>m.getTotalVertices()>0&&m.isEnabled()));}
 get shadowMeshes(){return [...this.resident.values()].filter(r=>Math.hypot(r.tile.x-this.focus.x,r.tile.z-this.focus.z)<520).flatMap(r=>r.meshes.filter(m=>m.getTotalVertices()>0&&m.isEnabled()));}
 get stats(){return {residentTiles:this.resident.size,totalTiles:this.tiles.length,residentCompressedBytes:[...this.resident.values()].reduce((n,r)=>n+r.tile.bytes,0),pending:this.pending,failedTiles:[...this.failed]};}
}
