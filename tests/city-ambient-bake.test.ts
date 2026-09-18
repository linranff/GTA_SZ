import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_AMBIENT,rasterizeHeights,skyVisibility,activeMask,bakeAmbient,ambientAt,directionFan} from '../src/city-ambient-bake.ts';

const square=(cx:number,cz:number,half:number,height:number)=>({rings:[[[cx-half,cz-half],[cx+half,cz-half],[cx+half,cz+half],[cx-half,cz+half],[cx-half,cz-half]]],height});

test('rasterizeHeights fills footprints and lets the taller building own overlapping cells',()=>{
 const grid=rasterizeHeights([square(0,0,20,30),square(0,0,6,120)],4,8);
 assert.equal(grid.cell,4);
 const at=(x:number,z:number)=>{const c=Math.floor((x-grid.minX)/4),r=Math.floor((z-grid.minZ)/4);return {h:grid.heights[r*grid.width+c],id:grid.ids[r*grid.width+c]};};
 assert.equal(at(0,0).h,120);assert.equal(at(0,0).id,2);
 assert.equal(at(15,15).h,30);assert.equal(at(15,15).id,1);
 assert.equal(at(26,26).h,0);assert.equal(at(26,26).id,0);
});

test('skyVisibility: open ground is 1, a wall blocks its own half-plane by cos² of the elevation, self is ignored',()=>{
 const grid=rasterizeHeights([square(100,0,10,40)],4,8);
 const cell=(x:number,z:number)=>[Math.round((x-grid.minX)/4),Math.round((z-grid.minZ)/4)] as const;
 const fan=directionFan(CITY_AMBIENT.directions);
 const [fx,fz]=cell(-100,0);
 assert.ok(skyVisibility(grid,fx,fz,0,0,fan)>.97,'far from the wall almost full sky');
 const [nx,nz]=cell(80,0);
 const near=skyVisibility(grid,nx,nz,0,0,fan);
 assert.ok(near<.85&&near>.45,`kerb next to a 40 m wall sees a good part of the sky blocked (${near.toFixed(3)})`);
 const [ix,iz]=cell(100,0);
 assert.equal(skyVisibility(grid,ix,iz,0,grid.ids[iz*grid.width+ix],fan),1,'inside its own footprint the building does not occlude itself');
 assert.ok(skyVisibility(grid,nx,nz,30,0,fan)>near,'a higher receiver sees more sky');
});

test('activeMask covers footprints and their reach and nothing beyond',()=>{
 const grid=rasterizeHeights([square(0,0,8,20)],4,40);
 const mask=activeMask(grid,2);
 const on=(x:number,z:number)=>mask[Math.floor((z-grid.minZ)/4)*grid.width+Math.floor((x-grid.minX)/4)];
 assert.equal(on(0,0),1);assert.equal(on(12,0),1);assert.equal(on(15,0),1);
 assert.equal(on(30,0),0);assert.equal(on(-30,-30),0);
 assert.equal(mask.length,grid.width*grid.height);
 const total=mask.reduce((s,v)=>s+v,0);
 assert.ok(total<mask.length,'corners of the padded raster stay inactive');
});

test('bakeAmbient writes three channels, darker low and brighter high, full sky where inactive',()=>{
 const grid=rasterizeHeights([square(0,0,10,60),square(40,0,10,60)],4,40);
 const baked=bakeAmbient(grid,CITY_AMBIENT.heights,3);
 assert.equal(baked.data.length,grid.width*grid.height*3);
 const c=Math.round((20-grid.minX)/4),r=Math.round((0-grid.minZ)/4),k=(r*grid.width+c)*3;
 assert.ok(baked.data[k]<baked.data[k+1]&&baked.data[k+1]<=baked.data[k+2],'alley between towers: ground < mid ≤ upper');
 assert.ok(baked.data[k]<200,'alley floor is clearly occluded');
 assert.equal(baked.data[0],255);assert.equal(baked.data[1],255);assert.equal(baked.data[2],255);
 assert.ok(baked.mean[0]<baked.mean[2]);
});

test('ambientAt mirrors the shader height blend and fades to open sky by fadeTop',()=>{
 const rgb=[.4,.7,.9] as const;
 assert.equal(ambientAt(rgb,0),.4);
 assert.ok(Math.abs(ambientAt(rgb,6)-.55)<1e-9);
 assert.ok(Math.abs(ambientAt(rgb,12)-.7)<1e-9);
 assert.ok(Math.abs(ambientAt(rgb,40)-.9)<1e-9);
 assert.equal(ambientAt(rgb,150),1);
 assert.ok(ambientAt(rgb,95)>.9&&ambientAt(rgb,95)<1);
});
