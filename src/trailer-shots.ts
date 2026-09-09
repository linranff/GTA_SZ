export type Point3=[number,number,number];
export type FilmPose={eye:Point3;target:Point3;fov:number};
export type FilmShot={id:string;title:string;location:string;mode:'night'|'day'|'sunset';seconds:number;pose:(seconds:number)=>FilmPose;drive?:{start:number;speed:number;acceleration:number};matchDay?:boolean};
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
const vec=(a:Point3,b:Point3,u:number):Point3=>a.map((x,i)=>mix(x,b[i],u)) as Point3;
/** Integrated trapezoid velocity: 10% gentle acceleration, a constant-speed middle. */
export function filmProgress(t:number,duration:number){const u=Math.max(0,Math.min(1,t/duration)),e=.1;return u<e?u*u/(2*e*(1-e)):u>1-e?1-(1-u)**2/(2*e*(1-e)):(u-e/2)/(1-e);}
export function orbit(target:Point3,yaw:number,pitch:number,distance:number,fov=.85):FilmPose{const h=Math.cos(pitch)*distance;return {target,eye:[target[0]-Math.sin(yaw)*h,target[1]+Math.sin(pitch)*distance,target[2]-Math.cos(yaw)*h],fov};}
function track(a:FilmPose,b:FilmPose,seconds:number){return (t:number)=>{const u=filmProgress(t,seconds);return {eye:vec(a.eye,b.eye,u),target:vec(a.target,b.target,u),fov:mix(a.fov,b.fov,u)};};}
const bamboo:Point3=[-5146,89.376,-1216.62],hill:Point3=[1741.5,18,1381.5],civic:Point3=[1821.68,22,692.63];
const springStart=orbit(bamboo,-.58,-.075,650),springMid=orbit(bamboo,-.48,.06,550),springEnd=orbit(bamboo,-.40,.14,465);
const springPath=track(springMid,springEnd,15);
const aerialA:FilmPose={eye:[3030,650,-275],target:[1790,-190,790],fov:.85};
const aerialB:FilmPose={eye:[2640,735,-300],target:[1660,-200,880],fov:.85};
const aerialC:FilmPose={eye:[2600,765,-360],target:[1660,-210,880],fov:.85};
export const FILM_SHOTS:FilmShot[]=[
 {id:'01',title:'湖面夜色',location:'深圳湾 · 人才公园',mode:'night',seconds:8,pose:track(springStart,orbit(bamboo,-.49,-.065,620),8)},
 {id:'02',title:'春笋升起',location:'中国华润大厦 · 春笋',mode:'night',seconds:7,pose:t=>springPath(t)},
 {id:'03',title:'同城入昼',location:'雨后 · 晴日',mode:'day',seconds:8,matchDay:true,pose:t=>springPath(7+t)},
 {id:'04',title:'向莲花山靠近',location:'福田 · 莲花山',mode:'day',seconds:11,pose:track(orbit(hill,0,.28,1450),orbit(hill,.025,.22,800),11)},
 {id:'05',title:'山与城同框',location:'山与城 · 福田中轴',mode:'day',seconds:7,pose:track(orbit(hill,Math.PI,.23,830),orbit([1741.5,35,1340],Math.PI+.06,.32,800),7)},
 {id:'06',title:'腾讯连桥',location:'南山 · 腾讯滨海大厦',mode:'day',seconds:8,pose:t=>orbit([-5837.92183,67,-681.22495],-2.38+filmProgress(t,8)*.40,.25,340)},
 {id:'07',title:'市民中心',location:'福田 · 深圳市民中心',mode:'day',seconds:6,pose:track(orbit(civic,-.14,.22,310),orbit(civic,.08,.22,305),6)},
 {id:'08',title:'万象天地塔楼',location:'南山 · 万象天地',mode:'day',seconds:7,pose:track(orbit([-4581.520103,53.76,588.579787],-1.52,.20,430),orbit([-4581.520103,53.76,588.579787],-1.31,.22,415),7)},
 {id:'09',title:'财富广场弧面',location:'福田 · 财富广场',mode:'sunset',seconds:6,pose:track(orbit([-218.097333,25,291.438209],-.76,.18,145),orbit([-218.097333,27,291.438209],-.48,.22,140),6)},
 {id:'10',title:'海湾出发',location:'滨海大道 · 自由驾驶',mode:'sunset',seconds:9,drive:{start:1560,speed:13,acceleration:.55},pose:()=>springStart},
 {id:'11',title:'侧前方伴行',location:'沿着海湾 · 向前',mode:'sunset',seconds:8,drive:{start:1700,speed:17,acceleration:.12},pose:()=>springStart},
 {id:'12',title:'夜间疾行',location:'夜色 · 继续出发',mode:'night',seconds:8,drive:{start:1720,speed:16.5,acceleration:.12},pose:()=>springStart},
 {id:'13',title:'从车到城市',location:'从一条路 · 到一座城',mode:'night',seconds:11,drive:{start:1845,speed:16,acceleration:0},pose:()=>springStart},
 {id:'14',title:'城市全景',location:'深圳 · 灯火之间',mode:'night',seconds:10,pose:track(aerialA,aerialB,10)},
 {id:'15',title:'片名落幕',location:'',mode:'night',seconds:6,pose:track(aerialB,aerialC,6)}
];
export const FILM_FPS=60;
