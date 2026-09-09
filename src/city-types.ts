export type V2=[number,number];
export type Road={id:string;name:string;displayName?:string;kind:string;width:number;oneway:boolean;points:V2[];grade:string};
export type Landmark={id:string;name:string;x:number;z:number;height:number;area:string;excludeRadius:number;arrival:V2;yaw:number;photoAngle?:number;photoDistance?:number;photoTargetHeight?:number;photoElevation?:number;detailCollision?:boolean};
export type CityData={meta:{counts:Record<string,number>;extent:number[];horizontalScale:number};land:V2[][][];coast:V2[][];roads:Road[];buildings:{rings:V2[][];height:number;style:string}[];green:{rings:V2[][];name:string}[];water:{rings:V2[][];name:string}[];landmarks:Landmark[];spawn:{x:number;z:number;yaw:number;road:string}};
