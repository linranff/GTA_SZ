// Diagnostic-only GL validation. Check each new program/framebuffer/draw-buffer
// combination once, avoiding synchronous getError calls on every ordinary draw.
export function installGpuDrawDiagnostics(){
 const proto=WebGL2RenderingContext.prototype,native={};
 const sources=new WeakMap(),attached=new WeakMap(),ids=new WeakMap(),fbMasks=new WeakMap(),seen=new Set();let nextId=1,program=null,framebuffer=null,backMask=[1029],colorMask=[true,true,true,true],checks=0;
 const id=o=>{if(!o)return 0;if(!ids.has(o))ids.set(o,nextId++);return ids.get(o);};
 window.__cityGpuDiagnostics={errors:[],get checks(){return checks;}};
 for(const name of ['colorMask','shaderSource','attachShader','useProgram','bindFramebuffer','drawBuffers','drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced'])native[name]=proto[name];
 proto.colorMask=function(...mask){colorMask=mask;return native.colorMask.apply(this,mask);};
 proto.shaderSource=function(shader,source){sources.set(shader,source);return native.shaderSource.call(this,shader,source);};
 proto.attachShader=function(p,s){const a=attached.get(p)||[];a.push(s);attached.set(p,a);return native.attachShader.call(this,p,s);};
 proto.useProgram=function(p){program=p;return native.useProgram.call(this,p);};
 proto.bindFramebuffer=function(target,fb){if(target===this.FRAMEBUFFER||target===this.DRAW_FRAMEBUFFER)framebuffer=fb;return native.bindFramebuffer.call(this,target,fb);};
 proto.drawBuffers=function(mask){if(framebuffer)fbMasks.set(framebuffer,[...mask]);else backMask=[...mask];return native.drawBuffers.call(this,mask);};
 for(const name of ['drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced'])proto[name]=function(...args){
  const mask=framebuffer?fbMasks.get(framebuffer)||[this.COLOR_ATTACHMENT0]:backMask,key=`${id(program)}:${id(framebuffer)}:${mask.join(',')}:${colorMask.join(',')}`;
  if(seen.has(key))return native[name].apply(this,args);seen.add(key);checks++;
  const before=this.getError(),result=native[name].apply(this,args),error=this.getError();
  if(before||error){const record={time:performance.now(),before,error,method:name,args,program:id(program),framebuffer:id(framebuffer),drawBuffers:mask,colorMask:[...colorMask],sources:(attached.get(program)||[]).map(s=>sources.get(s)),stack:new Error().stack};window.__cityGpuDiagnostics.errors.push(record);console.error('CITY_GPU_DIAGNOSTIC '+JSON.stringify({...record,sources:record.sources.map(s=>s?.slice(0,400))}));}
  return result;
 };
}
