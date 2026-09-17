export type CityGraphicsQuality='low'|'medium'|'high';
export const CITY_GRAPHICS_STORAGE_KEY='shenchengji-graphics-quality-v1';
export const CITY_GRAPHICS_DEFAULT:CityGraphicsQuality='medium';
export const CITY_GRAPHICS_PROFILES={
 low:{maxPixels:1600*900,shadowSize:1024,ao:false,aoSamples:4,mirrorSize:256,mirrorMovingRate:3,roadIdleRate:5,waterIdleRate:6,vehicleProbe:false,msaa:1,bloomScale:.25,lensEffects:false,nearTrees:18,farTrees:160,aerialTrees:600,treeRadius:360,aerialTreeRadius:1000,detailScale:.5,canopyFull:20,canopyMid:140,canopyFar:900,canopyAerialMid:160,canopyAerialFar:2600,meadowClumps:512},
 medium:{maxPixels:1920*1080,shadowSize:2048,ao:true,aoSamples:4,mirrorSize:384,mirrorMovingRate:2,roadIdleRate:3,waterIdleRate:4,vehicleProbe:true,msaa:2,bloomScale:.5,lensEffects:false,nearTrees:36,farTrees:200,aerialTrees:900,treeRadius:440,aerialTreeRadius:1200,detailScale:.75,canopyFull:36,canopyMid:240,canopyFar:1600,canopyAerialMid:260,canopyAerialFar:4200,meadowClumps:1024},
 high:{maxPixels:1920*1080,shadowSize:2048,ao:true,aoSamples:8,mirrorSize:512,mirrorMovingRate:1,roadIdleRate:2,waterIdleRate:3,vehicleProbe:true,msaa:4,bloomScale:.5,lensEffects:true,nearTrees:48,farTrees:220,aerialTrees:1200,treeRadius:440,aerialTreeRadius:1200,detailScale:1,canopyFull:56,canopyMid:340,canopyFar:2200,canopyAerialMid:320,canopyAerialFar:6000,meadowClumps:1024},
} as const;
export function isCityGraphicsQuality(value:unknown):value is CityGraphicsQuality{return value==='low'||value==='medium'||value==='high';}
export function resolveCityGraphicsQuality(query:unknown,saved:unknown):CityGraphicsQuality{
 return isCityGraphicsQuality(query)?query:isCityGraphicsQuality(saved)?saved:CITY_GRAPHICS_DEFAULT;
}
/** Pure selection keeps unavailable/blocked storage from breaking boot. An
 * explicit URL is repeatable for reviews and never silently changes a save. */
export function loadCityGraphicsQuality(search:string,storage:Pick<Storage,'getItem'>|null):CityGraphicsQuality{
 let saved:unknown;try{saved=storage?.getItem(CITY_GRAPHICS_STORAGE_KEY);}catch{}
 return resolveCityGraphicsQuality(new URLSearchParams(search).get('quality'),saved);
}
export function saveCityGraphicsQuality(quality:CityGraphicsQuality,storage:Pick<Storage,'setItem'>|null){
 try{storage?.setItem(CITY_GRAPHICS_STORAGE_KEY,quality);return !!storage;}catch{return false;}
}
export function cityGraphicsRenderRatio(quality:CityGraphicsQuality,width:number,height:number,dpr:number){
 const safeWidth=Number.isFinite(width)&&width>0?width:1,safeHeight=Number.isFinite(height)&&height>0?height:1;
 const safeDpr=Number.isFinite(dpr)&&dpr>0?dpr:1;
 return Math.min(safeDpr,1.5,Math.sqrt(CITY_GRAPHICS_PROFILES[quality].maxPixels/(safeWidth*safeHeight)));
}
