"""Verify encoded format and the closed camera orbit; record source provenance."""
import subprocess,json,hashlib,pathlib
p=pathlib.Path('public/city/loading/bamboo-clay-loop.mp4');out=pathlib.Path('output/playwright/loading-clay')
probe=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]));v=probe['streams'][0]
assert (v['width'],v['height'],v['nb_frames'],v['avg_frame_rate'])==(1920,1080,'720','30/1')
assert len(probe['streams'])==1 and v['codec_name']=='h264'
raw=subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(p),'-vf',r'select=eq(n\,0)+eq(n\,1)+eq(n\,718)+eq(n\,719),scale=320:180,format=gray','-fps_mode','passthrough','-f','rawvideo','-'])
n=320*180;frames=[raw[i:i+n] for i in range(0,len(raw),n)];assert len(frames)==4
mad=lambda a,b:sum(abs(x-y) for x,y in zip(a,b))/n
seam={'decodedFirstStepMAD':mad(frames[0],frames[1]),'decodedLastStepMAD':mad(frames[2],frames[3]),'decodedLoopStepMAD':mad(frames[3],frames[0])}
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
seam['rawEndpointPixelsIdentical']=sha(out/'frame-0.png')==sha(out/'frame-720.png')
seam['continuousStep']=seam['decodedLoopStepMAD']<=max(seam['decodedFirstStepMAD'],seam['decodedLastStepMAD'])*1.5
assert seam['rawEndpointPixelsIdentical'] and seam['continuousStep'],seam
cap=json.loads((out/'capture.json').read_text())
assert len(cap['info']['occlusionChecks'])>=12 and all(c['pass'] for c in cap['info']['occlusionChecks'])
assert all(not a['blend'] and a['depthWrite'] and a['alpha']==1 for a in cap['info']['opacityAudit'])
manifest={'title':'春笋 · 冷暖光影环绕','date':'2026-09-09','source':'Current local game geometry; dedicated offline clay rendering, no live game art changes','capture':cap,'encoding':{'width':1920,'height':1080,'fps':30,'seconds':24,'frames':720,'codec':'H.264','audio':False,'crf':23,'preset':'slow','maxrate':'2200k','faststart':True,'bytes':p.stat().st_size,'sha256':sha(p)},'loop':{'method':'Constant-speed closed 360-degree camera orbit, static scene, sample [0,T); no crossfade or duplicate terminal frame','seamChecks':seam},'assets':{f:sha('public/city/'+f) for f in ['landmarks.glb','terrain.glb','buildings.glb','landmark-detail.glb']},'scripts':['scripts/loading-clay-scene.ts','scripts/record-loading-clay.mjs','scripts/check-loading-clay.py'],'poster':{'bytes':pathlib.Path('public/city/loading/bamboo-clay-poster.jpg').stat().st_size,'sha256':sha('public/city/loading/bamboo-clay-poster.jpg')}}
pathlib.Path('public/city/loading/bamboo-clay-source.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(out/'seam-check.json').write_text(json.dumps(seam,indent=2));print(json.dumps({'format':manifest['encoding'],'seam':seam},indent=2))
