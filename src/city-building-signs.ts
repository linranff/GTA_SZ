import {DynamicTexture,Effect,Matrix,Mesh,ShaderMaterial,Texture,Vector3,VertexData,type AbstractMesh,type Scene} from '@babylonjs/core';

export const BUILDING_SIGN_SHADERS={vertex:`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;attribute vec4 color;attribute float letterSize;uniform mat4 worldViewProjection;varying vec2 vUV;varying vec3 vPosition;varying vec3 vNormal;varying vec3 vColor;varying float vLetterSize;void main(){vUV=uv;vPosition=position;vNormal=normal;vColor=color.rgb;vLetterSize=letterSize;gl_Position=worldViewProjection*vec4(position,1.);}`,fragment:`precision highp float;uniform sampler2D lettering;uniform vec3 signEyePosition;uniform float night;uniform float pixelScale;uniform float maxDistance;varying vec2 vUV;varying vec3 vPosition;varying vec3 vNormal;varying vec3 vColor;varying float vLetterSize;void main(){vec3 view=signEyePosition-vPosition;if(dot(view,vNormal)<=0.)discard;float d=max(1.,length(view));float readable=smoothstep(2.,7.,vLetterSize*pixelScale/d);float fade=1.-smoothstep(maxDistance*.64,maxDistance,d);float coverage=texture2D(lettering,vUV).a*readable*fade;if(coverage<.015)discard;gl_FragColor=vec4(vColor*mix(.72,1.9,night),coverage);}`};

export type BuildingSign={id:string;buildingId:string;text:string;kind:'osm-building-name'|'fictional-game-business';fictionalDisclosure:string|null;seed:number;position:[number,number,number];normal:[number,number,number];tangent:[number,number,number];width:number;height:number;orientation:'horizontal'|'vertical';anchor:string;font:'sans'|'serif'|'display';buildingHeight:number;letterHeight:number;colorIndex:number;radianceScale:number};
export type BuildingSignManifest={schemaVersion:1;noNewLights:true;stats:Record<string,unknown>;signs:BuildingSign[];sourceCitySha256?:string};
type Focus={x:number;y?:number;z:number};
type Options={manifest?:BuildingSignManifest;manifestUrl?:string;maxVisible?:number;maxDistance?:number};
const WIDTH=2048,HEIGHT=1024,CELL_W=256,CELL_H=128;
const COLORS=[[1,.57,.32],[.39,.85,1],[1,.81,.48],[.65,.81,1],[.91,.37,.60],[.45,1,.77],[1,.91,.77],[.67,.54,1]] as const;
const FONT_FAMILIES={sans:'"PingFang SC","Microsoft YaHei",sans-serif',serif:'"Songti SC","Noto Serif CJK SC",serif',display:'"Heiti SC","Microsoft YaHei",sans-serif'};

export type BuildingSignView={viewProjection:Matrix;forward:Vector3;pixelScale:number};
export function signLetterHeight(sign:BuildingSign){return sign.orientation==='vertical'?sign.height/Math.max(1,[...sign.text].length)*.88:sign.height*([...sign.text].length>13?.40:sign.kind==='fictional-game-business'?.64:.86);}
export function selectBuildingSigns(signs:BuildingSign[],focus:Focus,maxVisible=64,maxDistance=1100,view?:BuildingSignView){
 const projected=new Vector3(),list:{sign:BuildingSign;score:number;distance:number}[]=[];
 for(const sign of signs){
  const dx=sign.position[0]-focus.x,dy=sign.position[1]-(focus.y??0),dz=sign.position[2]-focus.z,distance=Math.hypot(dx,dy,dz);if(distance>=maxDistance)continue;
  const facing=-(dx*sign.normal[0]+dy*sign.normal[1]+dz*sign.normal[2])/Math.max(1,distance);
  let score=1/Math.max(1,distance);
  if(view){
   // Spend the atlas budget on readable, front-facing signs in the main view.
   // Allow a small screen margin so turning does not cause immediate popping.
   if(facing<.16||dx*view.forward.x+dy*view.forward.y+dz*view.forward.z<=0)continue;
   Vector3.TransformCoordinatesFromFloatsToRef(...sign.position,view.viewProjection,projected);
   if(Math.abs(projected.x)>1.22||Math.abs(projected.y)>1.3||projected.z<0)continue;
   const letterPixels=signLetterHeight(sign)*view.pixelScale/Math.max(1,distance);if(letterPixels<2.4)continue;
   score=letterPixels*(.38+.62*facing)/(1+.10*(projected.x*projected.x+projected.y*projected.y));
  }
  list.push({sign,score,distance});
 }
 list.sort((a,b)=>b.score-a.score||a.sign.id.localeCompare(b.sign.id,'en'));
 return list.slice(0,Math.min(64,Math.max(1,maxVisible))).map(q=>q.sign);
}
export function stableBuildingSignSet(signs:BuildingSign[]){return [...signs].sort((a,b)=>a.id.localeCompare(b.id,'en'));}
export function validateBuildingSignManifest(value:unknown):value is BuildingSignManifest{
 const v=value as BuildingSignManifest;if(!v||v.schemaVersion!==1||v.noNewLights!==true||!Array.isArray(v.signs)||v.signs.length>5000)return false;
 const ids=new Set<string>();return v.signs.every(s=>{
  if(!s||typeof s.id!=='string'||ids.has(s.id)||typeof s.buildingId!=='string'||typeof s.text!=='string'||!s.text.trim()||[...s.text].length>40)return false;ids.add(s.id);
  if(s.kind!=='osm-building-name'&&s.kind!=='fictional-game-business')return false;
  if(s.kind==='fictional-game-business'&&s.fictionalDisclosure!=='深城纪·虚构品牌')return false;
  if(!['sans','serif','display'].includes(s.font)||!['horizontal','vertical'].includes(s.orientation))return false;
  if(![s.position,s.normal,s.tangent].every(a=>Array.isArray(a)&&a.length===3&&a.every(x=>Number.isFinite(x)&&Math.abs(x)<100000)))return false;
  if(Math.abs(Math.hypot(...s.normal)-1)>.01||Math.abs(Math.hypot(...s.tangent)-1)>.01||Math.abs(s.normal[1])>.001||Math.abs(s.tangent[1])>.001)return false;
  if(![s.width,s.height,s.letterHeight,s.buildingHeight,s.radianceScale].every(x=>Number.isFinite(x)&&x>0)||s.width>40||s.height>20)return false;
  return s.position[1]>s.height/2&&s.position[1]+s.height/2<=s.buildingHeight+.1&&Number.isInteger(s.colorIndex)&&s.colorIndex>=0&&s.colorIndex<COLORS.length;
 });
}

/** Upper-facade game signage, independent of the evidence-gated landmark signs.
 * One shared dynamic atlas and one merged mesh are resident. The full manifest
 * is plain data; only 64 near signs have geometry and text pixels at a time.
 * Existing Chinese names are exact OSM strings; the manifest marks fictional
 * game brands and their rendered small print explicitly. No real-world logo or
 * photographic sign placement is claimed by this artistic layer.
 */
export async function attachCityBuildingSigns(scene:Scene,baseMeshes:AbstractMesh[],mapData?:{buildings?:unknown[]},options:Options={}){
 let disposed=false,night=false,state:'loading'|'ready'|'error'|'disposed'='loading',error:string|null=null;
 let manifest:BuildingSignManifest|null=null,mesh:Mesh|null=null,material:ShaderMaterial|null=null,atlas:DynamicTexture|null=null;
 let visible:BuildingSign[]=[],lastKey='',lastUpdate=-Infinity,rebuilds=0,atlasUploads=0,lastRebuildMs=0;
 const meshes:Mesh[]=[],request=new AbortController(),maxVisible=Math.min(64,Math.max(1,options.maxVisible??64)),maxDistance=Math.min(1400,Math.max(200,options.maxDistance??1100));
 const focusPosition=new Vector3(),renderEye=new Vector3(),inverseView=Matrix.Identity();
 function setNight(value:boolean){night=value;material?.setFloat('night',night?1:0);}
 function dispose(){if(disposed)return;disposed=true;state='disposed';request.abort();mesh?.dispose(false,false);material?.dispose(false,false);atlas?.dispose();meshes.length=0;visible=[];}
 scene.onDisposeObservable.addOnce(dispose);
 function stats(){return {state,error,night,totalPlaced:manifest?.signs.length??0,coverage:manifest?.stats??null,visibleSigns:visible.length,visibleRealNames:visible.filter(s=>s.kind==='osm-building-name').length,visibleFictionalBrands:visible.filter(s=>s.kind==='fictional-game-business').length,meshCount:mesh?1:0,drawCalls:mesh?.isEnabled()?1:0,triangles:visible.length*2,textureCount:atlas?1:0,textureBytesWithMipmaps:atlas?Math.ceil(WIDTH*HEIGHT*4*4/3):0,atlasSize:[WIDTH,HEIGHT],rebuilds,atlasUploads,lastRebuildMs,maxVisible,maxDistance,selectionPolicy:'front-facing/main-frustum/letter-pixel score; stable set ordering',glyphUVPolicy:'actual measured ink bounds',placementPolicy:'upper facade .76–.92 height; stable OSM id seed; authored landmarks excluded',readyBaseMeshes:baseMeshes.filter(m=>!m.isDisposed()&&m.getTotalVertices()>0).length,mapBuildingPieces:mapData?.buildings?.length??null,visible:visible.map(s=>({id:s.id,text:s.text,kind:s.kind,font:s.font,orientation:s.orientation,position:s.position}))};}
 function drawCell(ctx:CanvasRenderingContext2D,sign:BuildingSign,index:number){
  const x=(index%8)*CELL_W,y=Math.floor(index/8)*CELL_H;ctx.save();ctx.fillStyle='white';ctx.textAlign='center';ctx.textBaseline='middle';
  const font=(size:number)=>`${sign.font==='display'?800:600} ${size}px ${FONT_FAMILIES[sign.font]}`;
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,maxGlyphHeight=0;
  const paint=(text:string,cx:number,cy:number,size:number,main=true)=>{const m=ctx.measureText(text),ascent=Number.isFinite(m.actualBoundingBoxAscent)?m.actualBoundingBoxAscent:size*.55,descent=Number.isFinite(m.actualBoundingBoxDescent)?m.actualBoundingBoxDescent:size*.45;
   const inkLeft=Number.isFinite(m.actualBoundingBoxLeft)?m.actualBoundingBoxLeft:m.width/2,inkRight=Number.isFinite(m.actualBoundingBoxRight)?m.actualBoundingBoxRight:m.width/2;
   left=Math.min(left,cx-inkLeft);right=Math.max(right,cx+inkRight);top=Math.min(top,cy-ascent);bottom=Math.max(bottom,cy+descent);if(main)maxGlyphHeight=Math.max(maxGlyphHeight,ascent+descent);ctx.fillText(text,cx,cy);
  };
  if(sign.orientation==='vertical'){
   const chars=[...sign.text],size=Math.min(27,108/(chars.length+.25)),step=108/chars.length;ctx.font=font(size);
   for(let i=0;i<chars.length;i++)paint(chars[i],x+128,y+6+step*(i+.5),size);
   if(sign.kind==='fictional-game-business'){ctx.font=`9px ${FONT_FAMILIES.sans}`;paint('虚构品牌',x+128,y+122,9,false);}
  }else{
   const chars=[...sign.text],lines=chars.length>13?[chars.slice(0,Math.ceil(chars.length/2)).join(''),chars.slice(Math.ceil(chars.length/2)).join('')]:[sign.text];
   let size=lines.length>1?38:49;ctx.font=font(size);while(Math.max(...lines.map(line=>ctx.measureText(line).width))>238&&size>12){size--;ctx.font=font(size);}
   const center=sign.kind==='fictional-game-business'?49:64;for(let i=0;i<lines.length;i++)paint(lines[i],x+128,y+center+(i-(lines.length-1)/2)*(size+3),size);
   if(sign.kind==='fictional-game-business'){ctx.font=`12px ${FONT_FAMILIES.sans}`;paint(sign.fictionalDisclosure!,x+128,y+90,12,false);}
  }
  ctx.restore();
  // Fit UVs to actual glyph ink, not the 128px allocation rectangle. This is
  // critical for long names whose fitted font can be only 15–25px high.
  left=Math.max(x+1,Math.floor(left)-3);right=Math.min(x+CELL_W-1,Math.ceil(right)+3);top=Math.max(y+1,Math.floor(top)-3);bottom=Math.min(y+CELL_H-1,Math.ceil(bottom)+3);
  return {u0:left/WIDTH,u1:right/WIDTH,v0:top/HEIGHT,v1:bottom/HEIGHT,letterHeight:sign.height*maxGlyphHeight/Math.max(1,bottom-top)};
 }
 function rebuild(signs:BuildingSign[]){
  if(!atlas||!mesh)return;const start=performance.now(),ctx=atlas.getContext() as CanvasRenderingContext2D;ctx.clearRect(0,0,WIDTH,HEIGHT);
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],colors:number[]=[],sizes:number[]=[],indices:number[]=[];
  signs.forEach((s,i)=>{const uv=drawCell(ctx,s,i),[cx,cy,cz]=s.position,[tx,,tz]=s.tangent,c=COLORS[s.colorIndex];
   // UV v0 is canvas top. In the left-handed city, exterior-facing
   // tangent order projects right-to-left: reverse U so Chinese reads normally.
   for(const [side,up,u,v] of [[-1,-1,uv.u0,uv.v1],[1,-1,uv.u1,uv.v1],[1,1,uv.u1,uv.v0],[-1,1,uv.u0,uv.v0]]){positions.push(cx+tx*s.width*.5*side,cy+s.height*.5*up,cz+tz*s.width*.5*side);normals.push(...s.normal);uvs.push(uv.u0+uv.u1-u,v);colors.push(c[0]*s.radianceScale,c[1]*s.radianceScale,c[2]*s.radianceScale,1);sizes.push(uv.letterHeight);}
   indices.push(i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3);
  });
  const data=new VertexData();data.positions=positions;data.normals=normals;data.uvs=uvs;data.colors=colors;data.indices=indices;data.applyToMesh(mesh,true);mesh.setVerticesData('letterSize',sizes,true,1);mesh.refreshBoundingInfo();mesh.setEnabled(signs.length>0);atlas.update(false,false);visible=signs;rebuilds++;atlasUploads++;lastRebuildMs=performance.now()-start;
 }
 function update(focus?:Focus,force=false){
  if(disposed||state!=='ready'||!mesh||!material||!manifest)return;
  const camera=scene.activeCamera;if(focus)focusPosition.set(focus.x,focus.y??camera?.position.y??4,focus.z);else if(camera)focusPosition.copyFrom(camera.globalPosition);
  const pixels=scene.getEngine().getRenderHeight(),fov=camera?.fov??.9;material.setFloat('pixelScale',pixels/(2*Math.tan(fov/2)));material.setFloat('maxDistance',maxDistance);
  const now=performance.now();if(!force&&now-lastUpdate<350)return;lastUpdate=now;
  const signView=camera?{viewProjection:scene.getTransformMatrix(),forward:camera.getForwardRay().direction,pixelScale:pixels/(2*Math.tan(fov/2))}:undefined;
  const selected=stableBuildingSignSet(selectBuildingSigns(manifest.signs,focusPosition,maxVisible,maxDistance,signView)),key=selected.map(s=>s.id).join('|');if(key!==lastKey){lastKey=key;rebuild(selected);}
 }
 const result={meshes,update,setNight,stats,dispose};
 try{
  if(scene.isDisposed)throw new Error('scene-disposed');
  const supplied:unknown=options.manifest??await fetch(options.manifestUrl??'/city/building-signs.json',{signal:request.signal}).then(r=>{if(!r.ok)throw new Error('sign-manifest-http-'+r.status);return r.json();});
  if(disposed||scene.isDisposed)return result;if(!validateBuildingSignManifest(supplied))throw new Error('invalid-building-sign-manifest');manifest=supplied;
  Effect.ShadersStore['cityUpperSignsVertexShader']=BUILDING_SIGN_SHADERS.vertex;
  Effect.ShadersStore['cityUpperSignsFragmentShader']=BUILDING_SIGN_SHADERS.fragment;
  atlas=new DynamicTexture('city-upper-signs-atlas',{width:WIDTH,height:HEIGHT},scene,true,Texture.TRILINEAR_SAMPLINGMODE);atlas.hasAlpha=true;atlas.wrapU=Texture.CLAMP_ADDRESSMODE;atlas.wrapV=Texture.CLAMP_ADDRESSMODE;atlas.anisotropicFilteringLevel=4;
  material=new ShaderMaterial('city-upper-signs',scene,{vertex:'cityUpperSigns',fragment:'cityUpperSigns'},{attributes:['position','normal','uv','color','letterSize'],uniforms:['worldViewProjection','signEyePosition','night','pixelScale','maxDistance'],samplers:['lettering'],needAlphaBlending:true});material.backFaceCulling=false;material.disableDepthWrite=true;material.setTexture('lettering',atlas);material.setFloat('night',night?1:0);
  // MirrorTexture temporarily replaces scene view. Bind this render's eye,
  // not the active camera's ordinary position or a once-per-frame cached eye.
  material.onBindObservable.add(()=>{const effect=material?.getEffect();if(!effect)return;scene.getViewMatrix().invertToRef(inverseView);inverseView.getTranslationToRef(renderEye);effect.setVector3('signEyePosition',renderEye);effect.setFloat('pixelScale',scene.getEngine().getRenderHeight()/(2*Math.tan((scene.activeCamera?.fov??.9)/2)));});
  mesh=new Mesh('city-upper-building-signs',scene);mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={kind:'city-upper-building-signs',noNewLights:true,fictionalBrandDisclosure:'Rendered small print and manifest distinguish fictional businesses from exact OSM names'};meshes.push(mesh);state='ready';update(undefined,true);
 }catch(reason){if(!disposed){state='error';error=reason instanceof Error?reason.message:String(reason);}}
 return result;
}
