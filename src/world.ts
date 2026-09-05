import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, DirectionalLight,
  ShadowGenerator, TransformNode, MeshBuilder, StandardMaterial, PBRMaterial,
  RawCubeTexture, Texture, Effect, ShaderMaterial, Quaternion, PointLight,
  ImportMeshAsync, SSAO2RenderingPipeline, type AbstractMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { GameState } from './state.ts';

export const CHECKPOINTS = [{x:-2,z:25},{x:2,z:49},{x:-1,z:83}];
export const PLACES = {
  work:{x:6.8,z:6,label:'何志 · 接日结'}, used:{x:-6.9,z:30,label:'旧物新生活'},
  home:{x:-6.9,z:54,label:'青禾公寓 · 回家'}, friend:{x:-5.6,z:8,label:'林夏 · 聊聊'},
  finish:{x:-1,z:86,label:'装车点 · 结算'}, food:{x:-6.8,z:4,label:'阿芳 · 晚饭'},
};
type Actor={root:TransformNode;limbs:TransformNode[];phase:number;pose:Quaternion[]};
export class World {
  engine:Engine;scene:Scene;camera:FreeCamera;player!:Actor;
  street!:TransformNode; room!:TransformNode; upgrade!:TransformNode;
  markers:AbstractMesh[]=[];npcs:Actor[]=[]; keys=new Set<string>();
  state:GameState; started=false; paused=false; ready=false; bike=false;
  yaw=0;pitch=.28; drag=false;lastPointer={x:0,y:0};walk=0;lastMove=0;
  target=new Vector3();direction=new Vector3();private shadows:ShadowGenerator;
  private streetNpcs!:TransformNode;private deliveryCart!:TransformNode;private cycle!:TransformNode;
  samples:number[]=[];frames=0;onTick:((dt:number)=>void)|null=null;
  constructor(public canvas:HTMLCanvasElement,state:GameState){
    this.state=state;
    this.engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false,powerPreference:'high-performance'},false);
    this.engine.setHardwareScalingLevel(Math.max(1,window.innerWidth/1920,window.innerHeight/1080));
    this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(.55,.65,.68,1);
    this.street=new TransformNode('street',this.scene);this.streetNpcs=new TransformNode('npcs',this.scene);
    this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogDensity=.010;this.scene.fogColor=new Color3(.67,.72,.70);
    this.scene.imageProcessingConfiguration.toneMappingEnabled=true;
    this.scene.imageProcessingConfiguration.toneMappingType=1;
    this.scene.imageProcessingConfiguration.exposure=1.22;
    this.scene.imageProcessingConfiguration.contrast=1.10;
    const hemi=new HemisphericLight('sky',new Vector3(0,1,0),this.scene);hemi.intensity=.65;hemi.diffuse=new Color3(.86,.93,1);hemi.groundColor=new Color3(.24,.22,.18);
    const sun=new DirectionalLight('late-afternoon',new Vector3(-.38,-.82,.36),this.scene);sun.position=new Vector3(30,55,-15);sun.diffuse=new Color3(1,.86,.64);sun.intensity=2.3;
    this.shadows=new ShadowGenerator(2048,sun);this.shadows.usePercentageCloserFiltering=true;this.shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;this.shadows.bias=.00035;this.shadows.normalBias=.035;
    sun.shadowMinZ=1;sun.shadowMaxZ=160;sun.autoCalcShadowZBounds=true;
    const faces=[];for(let i=0;i<6;i++){const data=new Uint8Array(32*32*3);for(let p=0;p<1024;p++){const y=(p/32|0)/31;data[p*3]=Math.round(128+(i===2?45:0)-y*20);data[p*3+1]=Math.round(151+(i===2?30:0)-y*25);data[p*3+2]=Math.round(156+(i===2?23:0)-y*35);}faces.push(data);}
    const env=new RawCubeTexture(this.scene,faces,32,Engine.TEXTUREFORMAT_RGB,Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,Texture.TRILINEAR_SAMPLINGMODE);env.gammaSpace=true;this.scene.environmentTexture=env;this.scene.environmentIntensity=.55;
    this.camera=new FreeCamera('camera',new Vector3(0,2.9,3),this.scene);this.camera.minZ=.12;this.camera.maxZ=350;this.camera.fov=.95;
    if(SSAO2RenderingPipeline.IsSupported){const ao=new SSAO2RenderingPipeline('contact-depth',this.scene,{ssaoRatio:.5,blurRatio:.5},[this.camera]);ao.radius=1.3;ao.totalStrength=.65;ao.samples=8;ao.expensiveBlur=false;ao.maxZ=90;}
    this.sky();
    window.addEventListener('resize',()=>{this.engine.setHardwareScalingLevel(Math.max(1,window.innerWidth/1920,window.innerHeight/1080));this.engine.resize();});
    window.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();this.keys.add(e.code);});
    window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>{this.keys.clear();this.drag=false;});
    canvas.addEventListener('pointerdown',e=>{if(this.started&&!this.paused){this.drag=true;this.lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
    canvas.addEventListener('pointerup',()=>this.drag=false);
    canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.yaw+=(e.clientX-this.lastPointer.x)*.004;this.pitch=Math.max(.12,Math.min(.7,this.pitch+(e.clientY-this.lastPointer.y)*.002));this.lastPointer={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.pitch=Math.max(.12,Math.min(.7,this.pitch+e.deltaY*.0004));},{passive:false});
    this.engine.runRenderLoop(()=>{const raw=this.engine.getDeltaTime();const dt=Math.min(raw/1000,.04);if(this.ready){this.update(dt);if(this.started&&!this.paused&&!document.hidden){if(this.samples.length<18000)this.samples.push(raw);this.frames++;}}this.scene.render();});
  }
  private sky(){
    Effect.ShadersStore['citySkyVertexShader']='precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vP; void main(){vP=position;gl_Position=worldViewProjection*vec4(position,1.0);}';
    Effect.ShadersStore['citySkyFragmentShader']='precision highp float; varying vec3 vP; void main(){vec3 p=normalize(vP);float h=smoothstep(-0.05,0.85,p.y);vec3 c=mix(vec3(.79,.79,.68),vec3(.36,.54,.66),h);float s=pow(max(0.,dot(p,normalize(vec3(.38,.82,-.36)))),400.);c+=vec3(.22,.16,.08)*s;gl_FragColor=vec4(c,1.);}';
    const sky=MeshBuilder.CreateSphere('sky',{diameter:550,segments:24},this.scene);const mat=new ShaderMaterial('sky-material',this.scene,{vertex:'citySky',fragment:'citySky'},{attributes:['position'],uniforms:['worldViewProjection']});mat.backFaceCulling=false;mat.disableDepthWrite=true;sky.material=mat;sky.infiniteDistance=true;sky.isPickable=false;sky.applyFog=false;
  }
  private async load(file:string,parent:TransformNode){
    const r=await ImportMeshAsync('/assets/'+file,this.scene);
    // Blender exports (x, z, -y). Retain glTF's Z reflection but remove
    // the loader's additional half turn: game axes become (x, z, y).
    r.meshes[0].rotationQuaternion=Quaternion.Identity();r.meshes[0].parent=parent;
    for(const mesh of r.meshes){mesh.isPickable=false;mesh.receiveShadows=true;
      if(mesh.material instanceof PBRMaterial){mesh.material.environmentIntensity=.5;mesh.material.directIntensity=1;mesh.material.forceIrradianceInFragment=true;}
    }
    return r;
  }
  private makeActor(root:TransformNode):Actor{
    const limbs=['armL','armR','legL','legR'].map(name=>root.getChildTransformNodes().find(n=>n.name===name||n.name.endsWith('.'+name)||n.name.endsWith('_'+name))!).filter(Boolean);
    const pose=limbs.map(n=>n.rotationQuaternion?.clone()??Quaternion.FromEulerVector(n.rotation));
    return {root,limbs,pose,phase:Math.random()*Math.PI*2};
  }
  async init(progress:(s:string)=>void){
    progress('正在载入街道、店面和生活物件');
    const street=await this.load('street.glb',this.street);
    for(const mesh of street.meshes)if(!/road|paving|lamp|glass|sign/.test(mesh.name)&&mesh.getTotalVertices())this.shadows.addShadowCaster(mesh);
    progress('正在整理出租屋和你的行李');
    this.room=new TransformNode('room-scene',this.scene);this.upgrade=new TransformNode('upgrade-scene',this.scene);
    await this.load('room.glb',this.room);await this.load('room-upgrade.glb',this.upgrade);
    const playerRoot=new TransformNode('player',this.scene);const actor=await this.load('chenye.glb',playerRoot);
    this.player=this.makeActor(playerRoot);this.player.root.scaling.setAll(.93);this.player.root.rotation.y=Math.PI;
    this.cycle=new TransformNode('riding-bicycle',this.scene);this.cycle.parent=playerRoot;this.cycle.rotation.y=Math.PI;
    await this.load('bicycle.glb',this.cycle);this.cycle.setEnabled(false);
    for(const mesh of actor.meshes)if(mesh.getTotalVertices())this.shadows.addShadowCaster(mesh);
    for(let i=0;i<5;i++){
      const root=playerRoot.clone('resident-'+i,null,false)!;root.parent=this.streetNpcs;root.position.set(i%2?4.3:-4.8,.13,8+i*17);root.rotation.y=i%2?0:Math.PI;
      const npc=this.makeActor(root);this.npcs.push(npc);
      for(const mesh of root.getChildMeshes()){
        if(mesh.material instanceof PBRMaterial&&mesh.material.name==='shirt'){
          const m=mesh.material.clone('resident-shirt-'+i)!;m.albedoColor=i===0?new Color3(.80,.78,.69):i===1?new Color3(.70,.26,.07):new Color3(.21,.30,.31);mesh.material=m;
        }
      }
      root.getChildTransformNodes().find(n=>n.name.endsWith('riding-bicycle'))?.setEnabled(false);
    }
    this.npcs[0].root.position.set(PLACES.friend.x,.13,PLACES.friend.z);this.npcs[0].root.rotation.y=-Math.PI/2;
    this.npcs[0].root.dispose();
    const linxiaRoot=new TransformNode('linxia',this.scene);linxiaRoot.parent=this.streetNpcs;
    await this.load('linxia.glb',linxiaRoot);linxiaRoot.position.set(PLACES.friend.x,.035,PLACES.friend.z);linxiaRoot.rotation.y=-Math.PI/2;this.npcs[0]=this.makeActor(linxiaRoot);
    this.npcs[1].root.position.set(PLACES.work.x,.13,PLACES.work.z);this.npcs[1].root.rotation.y=Math.PI/2;
    const markerMat=new StandardMaterial('destination',this.scene);markerMat.diffuseColor=new Color3(.9,.70,.33);markerMat.emissiveColor=new Color3(.3,.17,.04);markerMat.alpha=.76;
    for(const point of CHECKPOINTS){
      const ring=MeshBuilder.CreateTorus('delivery-ring',{diameter:2.15,thickness:.045,tessellation:48},this.scene);ring.position.set(point.x,.045,point.z);ring.material=markerMat;ring.parent=this.street;ring.isPickable=false;ring.setEnabled(false);this.markers.push(ring);
    }
    this.deliveryCart=new TransformNode('delivery-cart',this.scene);this.deliveryCart.parent=this.street;this.deliveryCart.setEnabled(false);
    // The moving trolley reuses the authored parcel and platform design; boxes here are freight.
    const blue=new StandardMaterial('cart-blue',this.scene);blue.diffuseColor=new Color3(.21,.31,.35);
    const carton=new StandardMaterial('cart-cardboard',this.scene);carton.diffuseColor=new Color3(.50,.36,.20);
    const base=MeshBuilder.CreateBox('cart-platform',{width:.8,height:.12,depth:1.1},this.scene);base.position.y=.28;base.parent=this.deliveryCart;base.material=blue;
    for(const x of [-.29,.29])for(const z of [-.39,.39]){const wheel=MeshBuilder.CreateCylinder('cart-wheel',{diameter:.22,height:.065,tessellation:14},this.scene);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.14,z);wheel.parent=this.deliveryCart;wheel.material=blue;}
    for(let i=0;i<2;i++){const box=MeshBuilder.CreateBox('parcel',{width:.65,height:.4,depth:.66},this.scene);box.parent=this.deliveryCart;box.position.set(0,.53+i*.4,0);box.material=carton;}
    const lamp=new PointLight('bedside-light',new Vector3(1.1,1.15,-1.55),this.scene);lamp.diffuse=new Color3(1,.67,.34);lamp.intensity=.3;lamp.range=3;lamp.parent=this.upgrade;
    this.syncLocation();await this.scene.whenReadyAsync();this.ready=true;
  }
  syncLocation(){
    const interior=this.state.location==='room';this.street.setEnabled(!interior);this.streetNpcs.setEnabled(!interior);this.room.setEnabled(interior);this.upgrade.setEnabled(interior&&this.state.inventory.includes('mattress'));this.player.root.setEnabled(!interior);
    this.room.getChildMeshes().filter(m=>m.name==='room_blue').forEach(m=>m.setEnabled(!this.state.inventory.includes('mattress')));
    if(interior){this.camera.position.set(0,1.7,-3.3);this.camera.setTarget(new Vector3(.1,1.13,.65));this.scene.fogDensity=0;}
    else{this.player.root.position.set(this.state.x,-.025,this.state.z);this.scene.fogDensity=.0045;this.followCamera(1);}
  }
  private animate(actor:Actor,speed:number,time:number){
    actor.limbs.forEach((n,i)=>{const value=Math.sin(time*8+actor.phase+(i%2?Math.PI:0))*speed*(i<2?.33:.44);n.rotationQuaternion=actor.pose[i].multiply(Quaternion.RotationAxis(Vector3.Right(),value));});
  }
  private followCamera(factor:number){
    const s=this.state;const distance=5.0;const target=new Vector3(s.x,1.38,s.z);
    const desired=new Vector3(s.x-Math.sin(this.yaw)*distance,1.6+this.pitch*distance,s.z-Math.cos(this.yaw)*distance);
    desired.x=Math.max(-6,Math.min(6,desired.x));desired.z=Math.max(-3,Math.min(103,desired.z));
    Vector3.LerpToRef(this.camera.position,desired,factor,this.camera.position);this.camera.setTarget(target);
  }
  private update(dt:number){
    this.walk+=dt;
    if(!this.started){this.camera.position.set(3.4+Math.sin(this.walk*.08)*1.2,2.9,1.2);this.camera.setTarget(new Vector3(-1.2,3.1,25));return;}
    if(this.paused){this.lastMove=0;return;}
    if(this.state.location==='street'){
      const s=this.state;let x=0,z=0;
      if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))z++;
      if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))z--;
      if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x--;
      if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x++;
      const len=Math.hypot(x,z);this.lastMove=len?1:0;
      if(len){x/=len;z/=len;const dx=x*Math.cos(this.yaw)+z*Math.sin(this.yaw),dz=z*Math.cos(this.yaw)-x*Math.sin(this.yaw);
        const speed=s.work==='hauling'?2.8:this.bike?7.5:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?5.0:3.0;
        let nx=Math.max(-5.55,Math.min(5.55,s.x+dx*speed*dt));let nz=Math.max(1.5,Math.min(98,s.z+dz*speed*dt));
        // Authored parked trolleys are collidable; sidewalks beyond the curb are reserved for static props.
        for(const p of [{x:5,z:7},{x:4.8,z:10},{x:-5,z:43}])if(Math.abs(nx-p.x)<.85&&Math.abs(nz-p.z)<1.0){if(Math.abs(s.x-p.x)>=.85)nx=s.x;else nz=s.z;}
        s.x=nx;s.z=nz;const a=Math.atan2(dx,dz)+Math.PI;let delta=a-this.player.root.rotation.y;delta=Math.atan2(Math.sin(delta),Math.cos(delta));this.player.root.rotation.y+=delta*Math.min(1,dt*12);
      }
      this.player.root.position.set(s.x,-.025+Math.abs(Math.sin(this.walk*8))*.016*this.lastMove,s.z);
      this.animate(this.player,this.lastMove,this.walk);this.followCamera(Math.min(1,dt*8));
      this.cycle.setEnabled(this.bike&&s.work!=='hauling');
      this.npcs.forEach((npc,i)=>{if(i<2){this.animate(npc,0,this.walk);return;}npc.root.position.z=25+i*10+Math.sin(this.walk*.11+i)*8;const dir=Math.cos(this.walk*.11+i);npc.root.rotation.y=dir>0?Math.PI:0;this.animate(npc,.38,this.walk);});
      this.markers.forEach((m,i)=>{m.setEnabled(s.work==='hauling'&&i===s.checkpoint);m.scaling.setAll(1+Math.sin(this.walk*3)*.06);});
      this.deliveryCart.setEnabled(s.work==='hauling');this.deliveryCart.position.set(s.x-Math.sin(this.player.root.rotation.y)*1.0,0,s.z-Math.cos(this.player.root.rotation.y)*1.0);this.deliveryCart.rotation.y=this.player.root.rotation.y;
    }
    this.onTick?.(dt);
  }
  performance(){
    const data=this.samples.slice(120).sort((a,b)=>a-b);const percentile=(p:number)=>data[Math.min(data.length-1,Math.floor(data.length*p))]??0;
    const mean=data.reduce((a,b)=>a+b,0)/(data.length||1);
    return {samples:data.length,meanFps:mean?1000/mean:0,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),over50ms:data.filter(v=>v>50).length,width:this.engine.getRenderWidth(),height:this.engine.getRenderHeight(),activeMeshes:this.scene.getActiveMeshes().length,triangles:this.scene.getActiveIndices()/3,renderer:this.engine.getGlInfo(),userAgent:navigator.userAgent};
  }
  resetPerformanceCapture(){this.samples=[];this.frames=0;}
}
