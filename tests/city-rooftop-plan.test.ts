import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planRooftop,inscribedRect,pointInPolygon,polygonArea,scaleRing,crownTop,encodeRoofLookup,decodeRoofLookup,rasterizeRing,ROOFTOP_KINDS,ROOF_FINISHES,KIND,mulberry32} from '../src/city-rooftop-plan.ts';
import {ringOffsets,rooftopCell,rooftopTint} from '../src/city-rooftops.ts';

const square=(w:number,d:number,cx=0,cz=0,theta=0)=>{const c=Math.cos(theta),s=Math.sin(theta);const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>[cx+u*c-v*s,cz+u*s+v*c]);pts.push(pts[0]);return pts;};
const lShape=[[0,0],[40,0],[40,12],[14,12],[14,36],[0,36],[0,0]];

test('inscribed rectangle fills a rotated box and picks the biggest wing of an L',()=>{
 const rect=inscribedRect(square(30,18,100,-50,.6))!;
 assert.ok(Math.abs(rect.halfU*2-30)<1.6&&Math.abs(rect.halfV*2-18)<1.6,JSON.stringify(rect));
 assert.ok(Math.hypot(rect.cx-100,rect.cz+50)<1.2);
 const wing=inscribedRect(lShape)!;
 // Either wing (40×12 or 14×36) is acceptable; the L's inner corner must not be spanned.
 assert.ok(wing.halfU*wing.halfV*4>=440&&Math.min(wing.halfU,wing.halfV)*2<=14.5,JSON.stringify(wing));
 // Every rectangle corner lies inside the footprint.
 const c=Math.cos(wing.theta),s=Math.sin(wing.theta);
 for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]])assert.ok(pointInPolygon(wing.cx+u*wing.halfU*c-v*wing.halfV*s,wing.cz+u*wing.halfU*s+v*wing.halfV*c,lShape));
});

test('crown scaling matches city_mesh.footprint (vertex-mean centre) and crown height matches build_city_facades',()=>{
 const ring=[[0,0],[10,0],[10,10],[0,10],[0,0]];const crown=scaleRing(ring,.76);
 assert.deepEqual(crown[0].map(v=>+v.toFixed(3)),[1.2,1.2]);assert.equal(crown.length,5);assert.deepEqual(crown[4],crown[0]);
 assert.equal(crownTop(20),21.2);assert.equal(crownTop(100),103.5);
 assert.equal(polygonArea(ring),100);
});

test('plans are deterministic, sit on the crown roof and stay inside the footprint',()=>{
 const tower={id:'t',rings:[square(36,28,500,300,.3)],height:120,style:'office',seed:12345};
 const a=planRooftop(tower),b=planRooftop(tower);
 assert.deepEqual(a,b);
 assert.ok(a.props.length>=3,'tall office gets several props');
 const crown=scaleRing(tower.rings[0],.76);
 for(const [kind,x,z,y,sx,sy,sz] of a.props){
  assert.equal(y,crownTop(120));
  assert.ok(pointInPolygon(x,z,crown),`${ROOFTOP_KINDS[kind].id} centre inside crown`);
  assert.ok(sx>0&&sy>0&&sz>0);
 }
 assert.ok(a.finish>=0&&a.finish<ROOF_FINISHES.length&&a.tint>=0&&a.tint<16);
});

test('typology rules: helipads only on tall offices with room, tanks on housing, nothing on tiny sheds',()=>{
 const rng=mulberry32(1);let helipads=0,offices=0;
 for(let i=0;i<400;i++){const p=planRooftop({rings:[square(30+rng()*20,26+rng()*20,i*50,0,rng())],height:95+rng()*60,style:'office',seed:i*7+3});offices++;if(p.props.some(q=>q[0]===KIND.helipad||q[0]===KIND['helipad-raised']))helipads++;}
 assert.ok(helipads/offices>.25&&helipads/offices<.75,`helipad share ${helipads}/${offices}`);
 const low=planRooftop({rings:[square(30,30)],height:30,style:'office',seed:9});
 assert.ok(!low.props.some(q=>q[0]===KIND.helipad||q[0]===KIND['helipad-raised']),'a 30 m office never gets a helipad');
 let tanks=0;for(let i=0;i<200;i++)if(planRooftop({rings:[square(24,14)],height:20,style:'residential',seed:i}).props.some(q=>q[0]===KIND['water-tank']))tanks++;
 assert.ok(tanks>150,`housing tanks ${tanks}/200`);
 assert.equal(planRooftop({rings:[square(4,4)],height:6,style:'residential',seed:1}).props.length,0);
 assert.equal(planRooftop({rings:[square(20,20)],height:2,style:'residential',seed:1}).props.length,0);
 const podium=planRooftop({rings:[square(80,60)],height:22,style:'office',seed:5});
 assert.ok(podium.props.some(q=>q[0]===KIND['cooling-tower'])&&podium.props.some(q=>q[0]===KIND['penthouse-metal']),'podium gets plant');
});

test('props never overlap each other on a roof',()=>{
 for(let seed=0;seed<60;seed++){
  const plan=planRooftop({rings:[square(28,22,0,0,seed*.1)],height:40+seed,style:seed%2?'office':'residential',seed});
  const boxes=plan.props.filter(p=>ROOFTOP_KINDS[p[0]].id!=='crown-screen').map(p=>{const fp=ROOFTOP_KINDS[p[0]].box?[p[4],p[6]]:[ROOFTOP_KINDS[p[0]].footprint[0]*p[4],ROOFTOP_KINDS[p[0]].footprint[1]*p[4]];return {x:p[1],z:p[2],r:Math.hypot(fp[0],fp[1])/2,kind:ROOFTOP_KINDS[p[0]].id};});
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const d=Math.hypot(boxes[i].x-boxes[j].x,boxes[i].z-boxes[j].z);
   // Circumscribed circles may touch for boxes placed corner to corner; centres must still be apart.
   assert.ok(d>Math.min(boxes[i].r,boxes[j].r)*.9,`${boxes[i].kind} vs ${boxes[j].kind} seed ${seed} d=${d.toFixed(2)}`);
  }
 }
});

test('lookup encoding round-trips and rasterization fills the footprint interior only',()=>{
 for(let f=0;f<ROOF_FINISHES.length;f++)for(const t of [0,7,15]){const v=encodeRoofLookup(f,t);assert.ok(v>0&&v<256);assert.deepEqual(decodeRoofLookup(v),{finish:f,tint:t});}
 assert.equal(decodeRoofLookup(0),null);
 const grid=new Uint8Array(20*20);rasterizeRing([[8,8],[40,8],[40,40],[8,40],[8,8]],5,grid,20,20,0,0,4);
 let filled=0;for(let r=0;r<20;r++)for(let c=0;c<20;c++){const inside=grid[r*20+c]===5;if(inside)filled++;const x=(c+.5)*4,z=(r+.5)*4;if(x>10&&x<38&&z>10&&z<38)assert.ok(inside,`cell ${c},${r} should be filled`);if(x<7||x>41||z<7||z>41)assert.ok(!inside,`cell ${c},${r} should be empty`);}
 assert.ok(filled>=49&&filled<=81,String(filled));
});

test('runtime helpers: ring order grows outward, cells are stable, tints stay near white',()=>{
 const rings=ringOffsets(2);assert.ok(rings[0][0]===0&&rings[0][1]===0);assert.equal(rings.length,25);
 assert.ok(rings.slice(1,9).every(([a,b])=>Math.max(Math.abs(a),Math.abs(b))===1));
 assert.equal(rooftopCell(199,-1),'0,-1');assert.equal(rooftopCell(200,0),'1,0');
 for(const kind of ROOFTOP_KINDS)for(const [x,z] of [[0,0],[1234.5,-678.9],[-6000,2500]]){const t=rooftopTint(kind.id,x,z);assert.ok(t.every(v=>v>=.7&&v<=1.2),kind.id+' '+t);}
});

test('shipped plan and props.glb agree on kinds; every instance is on a real ordinary building roof',async()=>{
 const plan=JSON.parse(await readFile(new URL('../public/city/rooftops/plan.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(await readFile(new URL('../public/city/rooftops/props-manifest.json',import.meta.url),'utf8'));
 const built=new Set(manifest.kinds.map((k:{id:string})=>k.id));
 for(const kind of ROOFTOP_KINDS)assert.ok(built.has(kind.id),'props.glb misses '+kind.id);
 assert.deepEqual(plan.groups.map((g:{kind:string})=>g.kind),ROOFTOP_KINDS.map(k=>k.id));
 const city=JSON.parse(await readFile(new URL('../public/city/city.json',import.meta.url),'utf8'));
 const excluded=new Set(JSON.parse(await readFile(new URL('../public/city/building-exclusions.json',import.meta.url),'utf8')).excludedIds);
 const heights=new Set<number>();for(const b of city.buildings)if(!excluded.has(b.id))heights.add(Math.round(crownTop(b.height)*100));
 const onCrown=(y:number)=>{const c=Math.round(y*100);return heights.has(c)||heights.has(c-1)||heights.has(c+1);};
 const total=plan.groups.reduce((s:number,g:{count:number})=>s+g.count,0);
 assert.ok(total>50000&&total<120000,String(total));
 const helipads=plan.groups.filter((g:{kind:string})=>g.kind.startsWith('helipad')).reduce((s:number,g:{count:number})=>s+g.count,0);
 assert.ok(helipads>=40,'helipads '+helipads);
 for(const group of plan.groups)for(const inst of group.instances.slice(0,200))assert.ok(onCrown(inst[2]),`${group.kind} at y=${inst[2]} is not a crown roof height`);
 assert.equal(plan.lookup.cell,4);assert.ok(plan.lookup.width>3000&&plan.lookup.height>1200);
});
