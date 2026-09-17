import {filmProgress,orbit,type FilmPose,type FilmShot,type Point3} from './trailer-shots.ts';

/** Short caption-free loops for the README (`trailer.html?reel=readme`). Every shot is a real
 * camera orbit or a staged drive on the current assets; 6 s each so the GIFs stay small. */
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
function sweep(target:Point3,yaw:[number,number],pitch:[number,number],distance:[number,number],seconds:number,fov=.85){
 return (t:number):FilmPose=>{const u=filmProgress(t,seconds);return orbit(target,mix(yaw[0],yaw[1],u),mix(pitch[0],pitch[1],u),mix(distance[0],distance[1],u),fov);};
}
export const README_SHOTS:FilmShot[]=[
 {id:'r1',title:'春笋 · 黄昏',location:'南山 · 中国华润大厦',mode:'sunset',seconds:6,pose:sweep([-5146,105,-1216.62],[-.62,-.34],[.07,.11],[600,540],6)},
 {id:'r2',title:'福田中轴 · 白天',location:'福田 · 平安金融中心与市民中心',mode:'day',seconds:6,pose:sweep([1700,140,450],[.62,.36],[.19,.17],[1350,1250],6,.82)},
 {id:'r3',title:'罗湖 · 夜',location:'罗湖 · 京基100、地王、国贸',mode:'night',seconds:6,pose:sweep([4860,125,620],[.34,-.02],[.15,.13],[640,600],6,.88)},
 {id:'r4',title:'南山 · 腾讯滨海大厦',location:'南山 · 后海与科技园',mode:'day',seconds:6,pose:sweep([-5796,78,-671],[-2.55,-2.12],[.21,.19],[540,500],6,.86)},
 {id:'r5',title:'滨海大道 · 夜间驾驭',location:'滨海大道 · 自由驾驶',mode:'night',seconds:6,drive:{start:1720,speed:16.5,acceleration:.12},pose:()=>orbit([0,0,0],0,0,1)},
 {id:'r6',title:'莲花山 · 山与城',location:'福田 · 莲花山公园',mode:'sunset',seconds:6,pose:sweep([1741.5,30,1381.5],[Math.PI-.16,Math.PI+.10],[.24,.22],[880,820],6)}
];
