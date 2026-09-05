export type LifeSave={version:1;cash:number;completed:string[]};
export type Ride={id:string;title:string;person:string;description:string;pickupLine:string;arrivalLine:string;reward:number;from:[number,number];to:[number,number]};
export type ActiveRide={id:string;phase:'pickup'|'riding';startOdometer:number;debugged:boolean};
export const newLife=():LifeSave=>({version:1,cash:180,completed:[]});
export function readLife(value:unknown):LifeSave{const v=value as Partial<LifeSave>|null;if(!v||v.version!==1||!Number.isFinite(v.cash)||v.cash!<0||!Array.isArray(v.completed)||v.completed.some(x=>typeof x!=='string'))return newLife();return {version:1,cash:Math.min(v.cash!,1e7),completed:[...new Set(v.completed)]};}
/** Completion is one-shot, driven by a stopped arrival after actual travel. */
export function settleRide(save:LifeSave,active:ActiveRide,ride:Ride,odometer:number,atDestination:boolean,speed:number){
 if(active.id!==ride.id||active.phase!=='riding'||active.debugged||save.completed.includes(ride.id)||!atDestination||Math.abs(speed)>1||odometer-active.startOdometer<150)return false;
 save.cash+=ride.reward;save.completed.push(ride.id);return true;
}
