import type {CityData,V2} from './city-types.ts';
import {closest} from './driving.ts';
export type BridgeCrossing={id:string;name:string;width:number;points:V2[];length:number;height:number;ramp:number};
export type ParkLight={id:string;name:string;x:number;z:number;height:number;radius:number;color:[number,number,number];power:number};
export type CoastalManifest={schemaVersion:1;waterHeight:number;crossings:BridgeCrossing[];parkLights:ParkLight[];shoreDistance:{url:string;extent:number[];maxDistance:number}};
export function bridgeRamp(distance:number,height=2.8,ramp=70){const t=Math.max(0,Math.min(1,distance/ramp));return height*(1-t*t*(3-2*t));}
export function createBridgeHeightSampler(data:CityData,manifest:CoastalManifest,base:(x:number,z:number)=>number){
 type Seg={a:V2;b:V2;width:number;height?:number;ramp?:number};const crossings=new Map<string,Seg[]>(),roads=new Map<string,Seg[]>();const size=100;
 const add=(map:Map<string,Seg[]>,q:Seg,margin:number)=>{for(let x=Math.floor((Math.min(q.a[0],q.b[0])-margin)/size);x<=Math.floor((Math.max(q.a[0],q.b[0])+margin)/size);x++)for(let z=Math.floor((Math.min(q.a[1],q.b[1])-margin)/size);z<=Math.floor((Math.max(q.a[1],q.b[1])+margin)/size);z++){const k=x+','+z,cell=map.get(k)??[];cell.push(q);map.set(k,cell);}};
 for(const b of manifest.crossings)for(let i=1;i<b.points.length;i++)add(crossings,{a:b.points[i-1],b:b.points[i],width:b.width,height:b.height,ramp:b.ramp},b.ramp);
 for(const r of data.roads)if(Number(r.grade)>=0)for(let i=1;i<r.points.length;i++)add(roads,{a:r.points[i-1],b:r.points[i],width:r.width},r.width/2+8);
 function bridgeHeight(x:number,z:number){const k=Math.floor(x/size)+','+Math.floor(z/size),q=crossings.get(k);if(!q)return 0;let height=0;for(const s of q)height=Math.max(height,bridgeRamp(closest(x,z,s.a,s.b).d,s.height,s.ramp));if(!height)return 0;const onRoad=roads.get(k)?.some(s=>closest(x,z,s.a,s.b).d<=s.width/2+8);return onRoad?height:0;}
 return {bridgeHeight,heightAt:(x:number,z:number)=>Math.max(base(x,z),bridgeHeight(x,z)),stats:{crossings:manifest.crossings.length,bridgeClearance:2.8-manifest.waterHeight,roadAligned:true}};
}
export async function loadCoastalInfrastructure(data:CityData,base:(x:number,z:number)=>number){const response=await fetch('/city/coastal/infrastructure.json');if(!response.ok)throw Error('海湾桥梁与照明清单加载失败');const manifest=await response.json() as CoastalManifest;if(manifest.schemaVersion!==1||manifest.crossings.length>2000||manifest.parkLights.length>400)throw Error('海湾基础设施清单无效');return {manifest,...createBridgeHeightSampler(data,manifest,base)};}
