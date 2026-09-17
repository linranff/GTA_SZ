import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {cycleLength,signalAspects,signalHold,signalCell,type SignalArm,type SignalCycle,type SignalJunction} from '../src/city-traffic-signals.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(root+'public/city/signals/manifest.json','utf8'));
const data=JSON.parse(readFileSync(root+'public/city/signals/traffic-signals.json','utf8')) as {cycle:SignalCycle;junctions:SignalJunction[]};
const city=JSON.parse(readFileSync(root+'public/city/city.json','utf8')) as {meta:{extent:number[]};roads:{kind:string;grade:string;width:number;points:[number,number][]}[]};

test('two-group cycle: A and B are never green together and every group gets a green',()=>{
 const c=data.cycle,total=cycleLength(c);
 assert.equal(total,c.greenA+c.greenB+2*(c.amber+c.allRed));
 let greenA=0,greenB=0;
 for(let t=0;t<total;t+=.1){const [a,b]=signalAspects(c,t);assert.ok(!(a!=='red'&&b!=='red'),`both groups moving at t=${t}`);if(a==='green')greenA+=.1;if(b==='green')greenB+=.1;}
 assert.ok(Math.abs(greenA-c.greenA)<.2&&Math.abs(greenB-c.greenB)<.2);
 assert.deepEqual(signalAspects(c,-1),signalAspects(c,total-1));
 assert.deepEqual(signalAspects(c,c.greenA+.5),['amber','red']);
 assert.deepEqual(signalAspects(c,c.greenA+c.amber+.5),['red','red']);
});

test('signalHold stops approaching traffic at a red stop line and releases it past the line or on green',()=>{
 // Arm controlling traffic that travels north (+z): heads face south, stop line at z=100.
 const arm:SignalArm={x:6,z:100,yaw:Math.PI,arm:8,side:1,group:0,lanes:6,road:'t',stop:[0,100]};
 const red=()=>'red' as const,green=()=>'green' as const,amber=()=>'amber' as const;
 assert.equal(signalHold([arm],0,80,0,red),20);
 assert.equal(signalHold([arm],1.5,95,0,red),5);
 assert.equal(signalHold([arm],0,80,0,green),null);
 assert.equal(signalHold([arm],0,80,0,amber),20,'amber holds when there is room to stop');
 assert.equal(signalHold([arm],0,97,0,amber),null,'amber within 5 m proceeds');
 assert.equal(signalHold([arm],0,102,0,red),null,'past the line: released');
 assert.equal(signalHold([arm],0,80,Math.PI,red),null,'traffic heading away is not controlled');
 assert.equal(signalHold([arm],0,80,Math.PI/2,red),null,'cross traffic is not controlled by this arm');
 assert.equal(signalHold([arm],12,80,0,red),null,'a parallel road 12 m over is outside the lanes');
 assert.equal(signalHold([arm],0,30,0,red),null,'beyond reach');
});

test('placements: every junction has both phase groups, arms sit off every at-grade carriageway and inside the map',()=>{
 const [minX,minZ,maxX,maxZ]=city.meta.extent;
 assert.ok(data.junctions.length>=300,`junctions ${data.junctions.length}`);
 const roads=city.roads.filter(r=>r.grade==='0');
 const cells=new Map<string,typeof roads>();
 for(const r of roads)for(const p of r.points){const k=Math.floor(p[0]/200)+','+Math.floor(p[1]/200);let c=cells.get(k);if(!c){c=[];cells.set(k,c);}if(!c.includes(r))c.push(r);}
 const segDist=(x:number,z:number,a:[number,number],b:[number,number])=>{const dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1e-9,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l2));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);};
 let checked=0;
 for(const j of data.junctions){
  assert.ok(j.arms.length>=2);
  assert.deepEqual([...new Set(j.arms.map(a=>a.group))].sort(),[0,1],`junction ${j.x},${j.z} lacks a phase group`);
  for(const arm of j.arms){
   assert.ok(arm.x>minX&&arm.x<maxX&&arm.z>minZ&&arm.z<maxZ);
   assert.ok(arm.arm>=3.5&&arm.arm<=14,`arm length ${arm.arm}`);
   assert.ok(arm.side===1||arm.side===-1);
   // Heads face approaching traffic: the stop line lies behind the pole relative to the head direction
   // by less than a carriageway width, and the pole is beside (not on) the approach.
   const fx=Math.sin(arm.yaw),fz=Math.cos(arm.yaw),dx=arm.stop[0]-arm.x,dz=arm.stop[1]-arm.z;
   assert.ok(Math.abs(dx*fx+dz*fz)<1.5,'stop line is level with the pole along the approach');
   assert.ok(Math.abs(dx*fz-dz*fx)>3,'pole stands beside the carriageway');
   if(checked++%7===0){
    const k=Math.floor(arm.x/200)+','+Math.floor(arm.z/200);
    for(const r of cells.get(k)??[])for(let i=1;i<r.points.length;i++)assert.ok(segDist(arm.x,arm.z,r.points[i-1],r.points[i])>=r.width/2+.99,`pole ${arm.x},${arm.z} inside ${r.kind}`);
   }
  }
 }
});

test('signalCell buckets neighbours together',()=>{assert.equal(signalCell(10,10),signalCell(59,59));assert.notEqual(signalCell(10,10),signalCell(61,10));});

test('signal GLB matches its manifest: six roles, opaque materials, lens sockets inside the head',async()=>{
 const path=root+'public/city/signals/'+manifest.file;assert.ok(existsSync(path));
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const doc=await io.read(path);
 let triangles=0;const roles=new Set<string>();
 for(const node of doc.getRoot().listNodes()){const mesh=node.getMesh();if(!mesh)continue;roles.add(node.getName().split('_')[0]);for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()??0)/3;}
 assert.equal(triangles,manifest.triangles);
 assert.deepEqual([...roles].sort(),['signal-arm','signal-head','signal-lens-amber','signal-lens-green','signal-lens-red','signal-pole']);
 for(const m of doc.getRoot().listMaterials())assert.equal(m.getAlphaMode(),'OPAQUE',m.getName());
 const L=manifest.layout;assert.ok(L.headZ<L.armZ&&L.armZ<L.poleHeight);
 for(const aspect of ['red','amber','green'] as const)assert.ok(Math.abs(L.lensOffsets[aspect][2]-L.headZ)<=.45);
});
