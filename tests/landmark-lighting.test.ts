import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,MeshBuilder} from '@babylonjs/core';
import {createArchitectureMaterials} from '../src/city-architecture-materials.ts';
import {TencentWindowLighting,attachTencentWindowData} from '../src/city-landmark-lighting.ts';
import {curvedSignGeometry} from '../src/landmark-signage.ts';

test('landmark lighting survives day/night cycles and only Bamboo ribs gain line emission',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),architecture=createArchitectureMaterials(scene);
 const ribs=MeshBuilder.CreateBox('landmark_bamboo_silver',{},scene),metal=MeshBuilder.CreateBox('landmark_pingan_silver',{},scene);
 ribs.material=new PBRMaterial('silver',scene);metal.material=ribs.material;
 architecture.applyMeshes([ribs,metal],'landmarks');
 const windows=MeshBuilder.CreatePlane('detail_tencent_landmarkglass',{},scene);windows.material=new PBRMaterial('landmarkglass',scene);
 architecture.applyMeshes([windows],'landmark-detail');
 const plugin=(windows.material as PBRMaterial).pluginManager!.getPlugin('TencentWindowLighting') as TencentWindowLighting;
 assert(plugin);let hdr=0;
 const buffer={updateFloat:(_name:string,value:number)=>hdr=value};
 for(const mode of ['night','day','sunset','day','night'] as const){
  architecture.setMode(mode);plugin.bindForSubMesh(buffer as never);
  assert.equal((ribs.material as PBRMaterial).emissiveIntensity>1,mode!=='day');
  assert.equal(hdr>0,mode!=='day');
  assert.equal((metal.material as PBRMaterial).emissiveIntensity,0);
 }
 scene.dispose();engine.dispose();
});

test('UV-free Tencent panes receive local light coordinates but backing walls do not',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const pane=MeshBuilder.CreatePlane('pane',{width:1.9,height:2.9},scene);
 pane.removeVerticesData('uv');pane.position.set(-5830,37,-710);attachTencentWindowData(pane);
 assert.equal(pane.metadata.tencentLightPanes,1);assert.equal(pane.isVerticesDataPresent('uv'),false);
 const values=pane.getVerticesData('tencentWindow')!;assert.equal(values.length,pane.getTotalVertices()*4);
 assert.equal(new Set(Array.from(values).filter((_,i)=>i%4===3)).size,1,'one stable on/off state across each pane');
 const backing=MeshBuilder.CreatePlane('backing',{width:50,height:140},scene);attachTencentWindowData(backing);
 assert.equal(backing.metadata.tencentLightPanes,0);assert(backing.getVerticesData('tencentWindow')!.every(v=>v===0));
 scene.dispose();engine.dispose();
});

test('concave rooftop lettering follows its facade without flipped normals or UVs',()=>{
 const radius=28.305249306,data=curvedSignGeometry(14.4,3,radius,32);
 for(let i=0;i<data.positions!.length;i+=3){
  const [x,,z]=Array.from(data.positions!).slice(i,i+3),[nx,,nz]=Array.from(data.normals!).slice(i,i+3);
  assert(Math.abs(Math.hypot(x,z+radius)-radius)<1e-6);
  assert(nx*x+nz*(z+radius)<0,'front normal faces into the courtyard');
 }
 assert.equal(data.uvs![0],0);assert.equal(data.uvs![data.uvs!.length-2],1);
 assert.equal(data.indices!.length/3,64);
});
