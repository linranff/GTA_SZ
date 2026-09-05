import type {Mesh} from '@babylonjs/core';
/** Reuse GPU buffers: thinInstanceSetBuffer destroys/recreates them. */
export class DynamicInstances{
 private matrices=new WeakMap<Mesh,Float32Array>();
 private colorCounts=new WeakMap<Mesh,number>();
 update(mesh:Mesh,values:number[]){mesh.setEnabled(values.length>0);if(!values.length)return;let data=this.matrices.get(mesh);
  if(!data||data.length!==values.length){data=new Float32Array(values);this.matrices.set(mesh,data);mesh.thinInstanceSetBuffer('matrix',data,16,false);}
  else{data.set(values);mesh.thinInstanceBufferUpdated('matrix');mesh.thinInstanceRefreshBoundingInfo();}
 }
 colors(mesh:Mesh,count:number,palette:number[][]){if(this.colorCounts.get(mesh)===count)return;this.colorCounts.set(mesh,count);mesh.thinInstanceSetBuffer('color',new Float32Array(Array.from({length:count},(_,i)=>palette[i%palette.length]).flat()),4,true);}
}
