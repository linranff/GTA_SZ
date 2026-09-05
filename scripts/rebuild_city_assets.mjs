/** Full source rebuild is staged: an unreviewed stage cannot replace public/city.
 * npm run assets -- --plan : read-only dependency/command plan
 * npm run assets          : build a fresh isolated candidate under artifacts/rebuilds
 * Inspect the generated build-status.json and README.md before integrating assets.
 */
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv/bin/python'),blender='/Applications/Blender.app/Contents/MacOS/Blender',node=process.execPath;
const args=process.argv.slice(2);if(args.some(a=>!['--plan','--stage'].includes(a)))throw Error('Supported: --plan or --stage. Publishing is deliberately separate from rebuilding.');
const stages=[
 ['python','make_city_materials.py'],['node','prepare_architecture_textures.mjs'],['python','make_architecture_windows.py'],['blender','build_driving_assets.py'],['copy','public/city/car.glb','public/city/traffic-car.glb'],
 ['python','prepare_city_streets.py'],['python','prepare_city_ground.py'],['blender','build_city_ground.py'],['blender','build_city_detail_assets.py'],
 ['python','prepare_landmark_terrain.py','--offline'],['blender','build_landmark_details.py'],['node','optimize_landmark_details.mjs'],
 ['blender','build_city_facades.py'],['node','optimize_city.mjs','buildings','facades','roads','terrain','landmarks'],['node','split_city_facades.mjs'],
 ['refresh-exclusions'],
 ['node','colorize_architecture.mjs','--input','public/city/buildings.glb','--output','artifacts/materials/buildings-tinted.glb'],
 ['node','prepare_facade_diversity.mjs'],['python','make_facade_diversity_atlas.py'],
 ['copy','artifacts/materials/facade-diversity/buildings-varied.glb','public/city/buildings.glb'],
 ['copy','artifacts/materials/facade-diversity/facade-atlas.png','public/city/textures/architecture/facade-atlas.png'],
 ['copy','artifacts/materials/facade-diversity/facade-windows.png','public/city/textures/architecture/facade-windows.png'],
 ['blender','build_vehicle_candidate.py'],['node','optimize_vehicle_candidate.mjs'],
 ['copy','artifacts/city/vehicle-candidate/indigo-gt.glb','public/city/car.glb'],['copy','artifacts/city/vehicle-candidate/vehicle-manifest.json','public/city/vehicle-manifest.json'],
 ['python','build_landscape_assets.py','--prepare'],['blender','build_landscape_assets.py'],
 ['node','finalize_city_assets.mjs'],['node','inspect_landmark_details.mjs'],['python','validate_landmark_details.py'],
];
// Scripts resolve their root from __file__/import.meta.url. Copy them together
// with source inputs so their hard-coded public writes stay inside the stage.
const inputs=['scripts','data','public/city','public/licenses','artifacts/city/vehicle-candidate/source','artifacts/city/vehicle-candidate/source-manifest.json','artifacts/city/vehicle-candidate/ATTRIBUTION.md'];
const required=['.venv/bin/python','public/city/city.json','public/city/landmark-detail.json','data/processed/shenzhen_study/buildings.geojson','artifacts/city/vehicle-candidate/source/CarConcept.glb','artifacts/city/vehicle-candidate/source-manifest.json','data/raw/materials/curtain-glass-source.png','data/raw/materials/warm-residential-source.png','data/raw/materials/light-stone-source.png'];
const missing=required.filter(p=>!fs.existsSync(path.join(root,p)));if(!fs.existsSync(blender))missing.push(blender);
if(args.includes('--plan')){console.log(JSON.stringify({mode:'read-only-plan',publicCityIsPreserved:true,missing,inputs,stages},null,2));process.exit(missing.length?1:0);}
if(missing.length)throw Error('Source rebuild prerequisites missing; current delivery preserved: '+missing.join(', '));
const vehicleSource=fs.readFileSync(path.join(root,'artifacts/city/vehicle-candidate/source/CarConcept.glb')),sourceManifest=JSON.parse(fs.readFileSync(path.join(root,'artifacts/city/vehicle-candidate/source-manifest.json'),'utf8'));
if(createHash('sha256').update(vehicleSource).digest('hex')!==sourceManifest.files['CarConcept.glb'].sha256)throw Error('Vehicle source hash changed; update and review provenance before rebuilding. Current delivery preserved.');
const stage=path.join(root,'artifacts/rebuilds',new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);fs.mkdirSync(stage,{recursive:true});
const status={version:1,state:'preparing',startedAt:new Date().toISOString(),stage,sourceRoot:root,publicCityIsPreserved:true,completed:[],failedStage:null};
const save=()=>fs.writeFileSync(path.join(stage,'build-status.json'),JSON.stringify(status,null,2)+'\n');save();
try{
 for(const entry of inputs){const source=path.join(root,entry);if(!fs.existsSync(source)){if(entry==='public/licenses')continue;throw Error('Missing source input: '+entry);}fs.cpSync(source,path.join(stage,entry),{recursive:true,mode:fs.constants.COPYFILE_FICLONE});}
 // All scripts are copied, but dependencies and the Python runtime remain shared.
 // node resolves root/node_modules through the staging directory's ancestors.
 fs.mkdirSync(path.join(stage,'artifacts/materials'),{recursive:true});
 for(const [index,item] of stages.entries()){
  status.state='building';status.failedStage={index,command:item};save();console.log(`[${index+1}/${stages.length}]`,item.join(' '));
  const [kind,file,...rest]=item;
  if(kind==='copy'){const dest=path.join(stage,rest[0]);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(stage,file),dest);}
  else if(kind==='refresh-exclusions'){
   const manifest=JSON.parse(fs.readFileSync(path.join(stage,'public/city/landmark-detail.json'),'utf8'));
   fs.writeFileSync(path.join(stage,'public/city/building-exclusions.json'),JSON.stringify({excludedIds:manifest.baseBuildingIds,assets:{},status:'staged-before-finalize'},null,2));
  }else{
   const command=kind==='python'?python:kind==='blender'?blender:node;
   const commandArgs=kind==='blender'?['--background','--factory-startup','--python','scripts/'+file]:['scripts/'+file,...rest];
   const result=spawnSync(command,commandArgs,{cwd:stage,stdio:'inherit'});if(result.error||result.status!==0)throw Error(result.error?.message??`Stage exited ${result.status}: ${item.join(' ')}`);
  }
  status.completed.push(item);status.failedStage=null;save();
 }
 status.state='candidate-ready';status.finishedAt=new Date().toISOString();save();
 fs.writeFileSync(path.join(stage,'README.md'),'# Source rebuild candidate\n\nAll asset generators ran inside this isolated directory. The live public/city was preserved.\n\nThis is an unreviewed candidate, not an approved replacement: verify current-world screenshots, camera/vehicle controls, streamed facade loading, road planting clearance and measured FPS before integration. Review build-status.json and public/city/delivery-manifest.json.\n\nThe vehicle is rebuilt from its licensed CarConcept source; the eight-family facade is rebuilt from city/source OSM tags and the color pass; no previous tinted/UV2/vehicle output is reused. Source data, manually authored textures and licence files are inputs.\n');
 console.log('Candidate ready at',stage,'— current public/city was not replaced.');
}catch(error){status.state='failed';status.error=String(error.message??error);status.finishedAt=new Date().toISOString();save();console.error('Rebuild failed inside staging; current public/city is unchanged. Inspect',path.join(stage,'build-status.json'));throw error;}
