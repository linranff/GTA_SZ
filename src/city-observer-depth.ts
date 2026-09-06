/** Raising the drone with E does not change its orbit distance. Use actual
 * clearance above all static scenery to reserve depth precision for the city.
 * A ceiling (including roofs and distant mountains) keeps close-up buildings
 * safe; terrain height alone would allow clipping through their upper floors. */
export function observerNearClip(distance:number,cameraHeight:number,sceneryTop:number,vehicleInspection=false){
 if(vehicleInspection)return .15;
 const orbitNear=Math.max(.3,Math.min(4,distance*.003));
 const clearance=Math.max(0,cameraHeight-sceneryTop);
 return Math.max(orbitNear,Math.min(128,clearance*.1));
}
