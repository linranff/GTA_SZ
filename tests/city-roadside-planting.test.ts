import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {MeshBuilder,NullEngine,Scene} from '@babylonjs/core';
import {CityLandscape} from '../src/city-landscape.ts';
import {closest,inRing} from '../src/driving.ts';
import {planRoadsidePlanting,ROADSIDE_PLANTING_BUDGET as B,ROADSIDE_TREE_RADII as R} from '../src/city-roadside-planting.ts';
import type {CityData,Road,V2} from '../src/city-types.ts';

const rectangle=(x1:number,z1:number,x2:number,z2:number):V2[]=>[[x1,z1],[x2,z1],[x2,z2],[x1,z2],[x1,z1]];
const road=(id:string,points:V2[],width=10,kind='primary'):Road=>({id,name:id,points,width,kind,oneway:false,grade:'0'});
function fixture():CityData{return {
 meta:{counts:{},extent:[-1100,-300,1100,300],horizontalScale:.6},
 land:[[rectangle(-1100,-300,1100,300)]],coast:[],
 roads:[road('main',[[-1000,0],[1000,0]]),road('cross',[[0,-200],[0,200]],6,'secondary')],
 green:[{name:'north verge',rings:[rectangle(-1050,8,1050,65),rectangle(40,10,85,45)]},{name:'south verge',rings:[rectangle(-1050,-65,1050,-8)]}],
 water:[{name:'canal',rings:[rectangle(-145,8,-95,60)]}],buildings:[{rings:[rectangle(120,9,165,60)],height:10,style:'office'}],
 landmarks:[],spawn:{x:0,z:0,yaw:0,road:'main'},
};}
function edgeDistance(x:number,z:number,ring:V2[]){return Math.min(...ring.map((p,i)=>closest(x,z,p,ring[(i+1)%ring.length]).d));}

test('whole crowns stay in verges and clear crossings, holes, buildings, bridges and old trees',()=>{
 const data=fixture(),existing=[{x:225,z:18,radius:6}];
 const bridge={points:[[-440,0],[-350,0]] as V2[],width:10,ramp:70};
 const detail={rings:[rectangle(330,-55,380,-8)]};
 const options={bridgeCrossings:[bridge],collisionFootprints:[detail]};
 const plan=planRoadsidePlanting(data,existing,options);
 assert.ok(plan.points.length>45,'both long verges should visibly receive trees');
 assert.ok(plan.points.some(p=>p.side===1)&&plan.points.some(p=>p.side===-1));
 assert.deepEqual(planRoadsidePlanting({...data,roads:[...data.roads].reverse()},existing,options),plan,'OSM iteration order must not move trees');
 for(const {plant:[x,z],radius} of plan.points){
  assert.ok(data.green.some(g=>inRing(x,z,g.rings[0])&&!g.rings.slice(1).some(r=>inRing(x,z,r))&&g.rings.every(r=>edgeDistance(x,z,r)>radius)));
  for(const r of data.roads)for(let i=1;i<r.points.length;i++)assert.ok(closest(x,z,r.points[i-1],r.points[i]).d>r.width/2+2.4+radius+.35);
  for(const p of [...data.water,...data.buildings,detail])assert.ok(!inRing(x,z,p.rings[0])&&edgeDistance(x,z,p.rings[0])>radius+.6);
  assert.ok(closest(x,z,bridge.points[0],bridge.points[1]).d>70+radius);
  assert.ok(Math.hypot(x,z)>B.junctionClearance+radius);
  assert.ok(Math.hypot(x-225,z-18)>=radius+6+B.treeGap);
 }
 for(let i=0;i<plan.points.length;i++)for(let j=i+1;j<plan.points.length;j++){
  const a=plan.points[i],b=plan.points[j];
  assert.ok(Math.hypot(a.plant[0]-b.plant[0],a.plant[1]-b.plant[1])>=Math.max(B.minimumTreeDistance,a.radius+b.radius+B.treeGap));
 }
 const byCell=new Map<string,number>();for(const {plant:[x,z]} of plan.points){const key=Math.floor(x/B.cellSize)+','+Math.floor(z/B.cellSize);byCell.set(key,(byCell.get(key)??0)+1);}assert.ok([...byCell.values()].every(n=>n<=B.perCell));
 assert.ok(plan.stats.generated<=B.total);
});

test('unusable strips, raised roads, props and steep terrain fail closed',()=>{
 const data=fixture();
 assert.equal(planRoadsidePlanting(data,[],{maxTrees:0}).points.length,0);
 assert.equal(planRoadsidePlanting(data,[],{blocked:()=>true}).points.length,0);
 assert.equal(planRoadsidePlanting(data,[],{heightAt:x=>x}).points.length,0);
 assert.equal(planRoadsidePlanting({...data,roads:data.roads.map(r=>({...r,grade:'1'}))},[]).points.length,0);
 const narrow={...data,green:[{name:'too narrow',rings:[rectangle(-1000,8,1000,10)]}]};
 assert.equal(planRoadsidePlanting(narrow,[]).points.length,0);
 const coastal={...data,coast:[[[-1000,15],[1000,15]]] as V2[][],green:[data.green[0]]};
 const plan=planRoadsidePlanting(coastal,[]);
 for(const p of plan.points)assert.ok(Math.abs(p.plant[1]-15)>p.radius+B.coastPromenade);
});

test('supplemental thin instances retain source planting and the existing near/far budgets',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),landscape=new CityLandscape(scene,(x,z)=>.001*x+.002*z);
 try{
  // CPU-only rendering fixture: existing model identities and tiny proxy
  // geometry exercise real thin-instance selection without network or GPU.
  const internal=landscape as unknown as {ready:boolean;planting:{trees:number[][];details:number[][]};openKinds:WeakMap<number[],string>;roadside:ReturnType<typeof planRoadsidePlanting>;prototypes:Map<string,{model:{id:string;triangles:number};meshes:ReturnType<typeof MeshBuilder.CreateBox>[]}>};
  for(const name of ['banyan','palm','orchid-tree','open-palm'])for(const suffix of ['','-lod']){
   const id=name+suffix,mesh=MeshBuilder.CreateBox(id,{size:1},scene);mesh.setEnabled(false);
   internal.prototypes.set(id,{model:{id,triangles:suffix?224:2644},meshes:[mesh]});
  }
  internal.ready=true;
  const oldPalm=[230,15,1,2,0];internal.planting.trees.push(oldPalm);internal.openKinds.set(oldPalm,'open-palm');
  const source=internal.planting.trees,sourceBefore=JSON.stringify(source),meshCount=scene.meshes.length;
  const data=fixture();data.roads=[road('main',[[-1000,0],[1000,0]])];data.water=[];data.buildings=[];
  data.green=[{name:'verges',rings:[rectangle(-1050,-70,1050,70)]}];
  const first=landscape.configureRoadside(data);
  assert.ok(first.generated>50);
  for(const point of internal.roadside.points)assert.ok(Math.hypot(point.plant[0]-230,point.plant[1]-15)>=point.radius+R.palm*2+B.treeGap,'old open palms need room for the wider original LOD used beyond 550 units');
  landscape.update(0,0,false,true);
  assert.equal(landscape.stats.roadside.visible.near,B.near,'new near trees have their own limit');
  assert.ok(landscape.stats.roadside.visible.far<=B.far);
  assert.ok(landscape.stats.nearTrees<=48&&landscape.stats.farTrees<=220);
  assert.equal(landscape.stats.treeBudget,268);
  assert.equal(scene.meshes.length,meshCount,'reuse prototypes instead of adding tree meshes');
  assert.equal(internal.planting.trees,source);assert.equal(JSON.stringify(source),sourceBefore);
  for(const prototype of internal.prototypes.values())for(const mesh of prototype.meshes)if(mesh.isEnabled())for(const matrix of mesh.thinInstanceGetWorldMatrices()){
   assert.ok(Math.abs(matrix.m[13]-(.001*matrix.m[12]+.002*matrix.m[14]+.05))<.00001,'root follows the established height sampler');
  }
  const second=landscape.configureRoadside(data);assert.equal(second.generated,first.generated);
  landscape.update(0,0,true,true);assert.ok(landscape.stats.roadside.visible.far<=B.aerial);
  assert.equal(landscape.stats.nearTrees,0);assert.ok(landscape.stats.farTrees<=1200);assert.equal(landscape.stats.treeBudget,1200);
  landscape.dispose();
 }finally{engine.dispose();}
});

test('clearance radii contain every current near/far asset vertex',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const models=[['landscape/banyan',R.banyan],['landscape/palm',R.palm],['landscape/orchid-tree',R.orchid],['open-vegetation/island-tree',R.openBroadleaf],['open-vegetation/palm',R.openPalm]] as const;
 for(const [name,envelope] of models)for(const suffix of ['','-lod']){
  const doc=await io.read(fileURLToPath(new URL('../public/city/'+name+suffix+'.glb',import.meta.url)));let maximum=0;
  for(const node of doc.getRoot().listNodes()){
   const world=node.getWorldMatrix();for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const position=primitive.getAttribute('POSITION')!;
    for(let i=0;i<position.getCount();i++){
     const p=position.getElement(i,[]);
     const x=world[0]*p[0]+world[4]*p[1]+world[8]*p[2]+world[12],z=world[2]*p[0]+world[6]*p[1]+world[10]*p[2]+world[14];
     maximum=Math.max(maximum,Math.hypot(x,z));
    }
   }
  }
  assert.ok(maximum>1&&maximum<=envelope,`${name+suffix}: measured ${maximum}, envelope ${envelope}`);
 }
});
