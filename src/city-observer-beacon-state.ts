export type BeaconPoint={x:number;y:number;z:number;name:string;arrival?:[number,number];yaw?:number};
export type BeaconFavorite=BeaconPoint&{id:string;createdAt:number};
export const BEACON_STORAGE_KEY='shenchengji-observer-places-v1';
export const BEACON_LIMIT=24;
export const BEACON_HOLD_MS=650;
export const BEACON_DRAG_TOLERANCE=8;

export function beaconName(value:string,fallback='我的地点'){
 return value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,48)||fallback;
}
const finite=(value:unknown,limit:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=limit;
export function validBeaconPoint(value:unknown):value is BeaconPoint{
 if(!value||typeof value!=='object')return false;
 const point=value as Record<string,unknown>;
 return finite(point.x,1e6)&&finite(point.z,1e6)&&finite(point.y,1e4)&&typeof point.name==='string'&&point.name.length<=256
  &&(point.arrival===undefined||(Array.isArray(point.arrival)&&point.arrival.length===2&&point.arrival.every(n=>finite(n,1e6))))
  &&(point.yaw===undefined||finite(point.yaw,1e5));
}
export function copyBeaconPoint(point:BeaconPoint):BeaconPoint{
 return {x:point.x,y:point.y,z:point.z,name:beaconName(point.name),...(point.arrival?{arrival:[...point.arrival] as [number,number]}:{}),...(point.yaw!==undefined?{yaw:point.yaw}:{})};
}
/** Stored browser data is untrusted: rebuild known fields and skip damaged rows. */
export function decodeBeaconFavorites(raw:string|null):BeaconFavorite[]{
 try{
  if(!raw||raw.length>100000)return [];
  const data=JSON.parse(raw) as {version?:unknown;places?:unknown};
  if(!data||data.version!==1||!Array.isArray(data.places))return [];
  const places:BeaconFavorite[]=[],ids=new Set<string>();
  for(const row of data.places){
   if(!validBeaconPoint(row))continue;const metadata=row as BeaconPoint&{id:unknown;createdAt:unknown};
   if(typeof metadata.id!=='string'||!metadata.id.length||metadata.id.length>80||ids.has(metadata.id)||!finite(metadata.createdAt,1e14)||metadata.createdAt<0)continue;
   places.push({...copyBeaconPoint(row),id:metadata.id,createdAt:metadata.createdAt});ids.add(metadata.id);
   if(places.length===BEACON_LIMIT)break;
  }
  return places;
 }catch{return [];}
}
export function encodeBeaconFavorites(places:BeaconFavorite[]){return JSON.stringify({version:1,places:places.slice(0,BEACON_LIMIT).map(point=>({...copyBeaconPoint(point),id:point.id,createdAt:point.createdAt}))});}
export function matchingBeacon(places:BeaconFavorite[],point:BeaconPoint){return places.find(place=>Math.hypot(place.x-point.x,place.z-point.z)<3&&Math.abs(place.y-point.y)<8);}

export type BeaconPointer={id:number;x:number;y:number;button:number;primary:boolean;shift:boolean};
/** The UI consumes only a stationary hold. Once cancelled, normal orbit/pan
 * receives the complete movement from the original pointer-down position. */
export class BeaconHoldGesture{
 pointer:{id:number;x:number;y:number;started:number;phase:'pending'|'held'}|null=null;
 begin(pointer:BeaconPointer,now:number){
  if(this.pointer||pointer.button!==0||!pointer.primary||pointer.shift){this.cancel();return false;}
  this.pointer={id:pointer.id,x:pointer.x,y:pointer.y,started:now,phase:'pending'};return true;
 }
 move(id:number,x:number,y:number,shift:boolean,buttons=1){
  const pointer=this.pointer;if(!pointer||pointer.id!==id)return false;
  // Mouse chords report pointermove, not a second pointerdown. Releasing the
  // left button while another stays down also does not emit pointerup yet.
  if(!(buttons&1)||(pointer.phase==='pending'&&buttons!==1)){this.cancel();return false;}
  if(pointer.phase==='held')return true;
  if(shift||Math.hypot(x-pointer.x,y-pointer.y)>BEACON_DRAG_TOLERANCE){this.cancel();return false;}
  return true;
 }
 fire(now:number){const pointer=this.pointer;if(!pointer||pointer.phase!=='pending'||now-pointer.started<BEACON_HOLD_MS)return null;pointer.phase='held';return {x:pointer.x,y:pointer.y};}
 progress(now:number){return this.pointer?.phase==='pending'?Math.max(0,Math.min(1,(now-this.pointer.started)/BEACON_HOLD_MS)):0;}
 end(id:number){if(this.pointer?.id!==id)return false;const consumed=this.pointer.phase==='held';this.cancel();return consumed;}
 cancel(){this.pointer=null;}
}
