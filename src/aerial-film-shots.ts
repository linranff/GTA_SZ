import {filmProgress,orbit,type FilmPose,type FilmShot,type Point3} from './trailer-shots.ts';

// Scaled city coordinates. All shots are real camera translations or orbits.
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
const point=(a:Point3,b:Point3,u:number):Point3=>a.map((v,i)=>mix(v,b[i],u)) as Point3;
function fly(a:FilmPose,b:FilmPose,duration:number,bend:Point3=[0,0,0]){
 return (seconds:number):FilmPose=>{
  const u=filmProgress(seconds,duration),arc=4*u*(1-u),eye=point(a.eye,b.eye,u);
  return {eye:eye.map((v,i)=>v+bend[i]*arc) as Point3,target:point(a.target,b.target,u),fov:mix(a.fov,b.fov,u)};
 };
}
const cbd:Point3=[1750,-180,530];
const lastOrbit=orbit(cbd,1.65,.74,1900,.80);
export const AERIAL_SHOTS:FilmShot[]=[
 {id:'01',title:'城市初现 · 全域推进',location:'深圳 · 城市全景',mode:'day',seconds:16,
  pose:fly({eye:[100,1750,100],target:[1950,-500,450],fov:.75},
           {eye:[450,1120,-180],target:[1950,-250,400],fov:.76},16,[90,65,0])},
 {id:'02',title:'俯冲天际线 · 福田',location:'福田 · 中轴天际线',mode:'day',seconds:16,
  pose:fly({eye:[450,1120,-180],target:[1950,-250,400],fov:.76},
           {eye:[950,620,-510],target:[1750,-190,300],fov:.87},16,[-150,80,-80])},
 {id:'03',title:'越过楼群 · 山城展开',location:'福田 · 莲花山与城',mode:'day',seconds:14,
  pose:t=>{const u=filmProgress(t,14);return orbit([1750,-50,400],mix(-1,-.60,u),mix(.80,.86,u),mix(1350,2100,u),.86);}},
 {id:'04',title:'城市长轴 · 深南飞越',location:'深南大道 · 城市长轴',mode:'sunset',seconds:14,
  pose:fly({eye:[-3900,1100,-750],target:[-2700,-650,500],fov:.94},
           {eye:[-1100,1300,-550],target:[250,-850,600],fov:.94},14,[0,100,0])},
 {id:'05',title:'从海湾到春笋',location:'南山 · 中国华润大厦',mode:'sunset',seconds:16,
  pose:fly({eye:[-5950,1450,-1750],target:[-5146,70,-1216],fov:.92},
           {eye:[-5360,510,-1720],target:[-5100,35,-1080],fov:.89},16,[140,160,0])},
 {id:'06',title:'飞越万家灯火 · 罗湖',location:'罗湖 · 万家灯火',mode:'night',seconds:16,
  pose:fly({eye:[3050,1150,-1000],target:[4800,-950,800],fov:.95},
           {eye:[5350,1000,-450],target:[4800,-450,650],fov:.95},16,[0,100,-180])},
 {id:'07',title:'城市巨环 · 福田',location:'福田 · 都市夜航',mode:'night',seconds:14,
  pose:t=>{const u=filmProgress(t,14);return orbit(cbd,mix(1.0,1.65,u),mix(.80,.74,u),mix(2400,1900,u),.80);}},
 {id:'08',title:'万城归于一幅天际线',location:'深圳 · 天际之上',mode:'night',seconds:14,
  pose:fly(lastOrbit,{eye:[-600,1750,600],target:[1550,-750,450],fov:.70},14,[-160,80,0])}
];
