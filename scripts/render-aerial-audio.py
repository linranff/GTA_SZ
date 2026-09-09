"""An original, spacious cinematic score for the second 120-second city film."""
from pathlib import Path
import json
import numpy as np
from scipy import signal
from scipy.io import wavfile

RATE=48000
SECONDS=120
N=RATE*SECONDS
OUT=Path('output/aerial-film/audio')
OUT.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(202609072)
score=np.zeros((N,2),np.float32)
effects=np.zeros_like(score)

def add(bus,mono,at,gain=1.,pan=0.):
    start=int(round(at*RATE));end=min(N,start+len(mono))
    if start<0 or end<=start:return
    mono=np.asarray(mono[:end-start]*gain,np.float32)
    bus[start:end,0]+=mono*np.sqrt((1-pan)/2)
    bus[start:end,1]+=mono*np.sqrt((1+pan)/2)

def pitched(note,at,duration,gain,kind='strings',pan=0.):
    t=np.arange(int(duration*RATE),dtype=np.float32)/RATE
    hz=440*2**((note-69)/12)
    if kind=='strings':
        env=(1-np.exp(-t/.8))*np.minimum(1,np.maximum(0,(duration-t)/1.5))
        phase=2*np.pi*hz*t+.013*np.sin(2*np.pi*4.8*t)
        a=np.zeros_like(t)
        for partial in range(1,7):
            a+=(np.sin(phase*partial)+.6*np.sin(2*np.pi*hz*1.0015*partial*t+.3))*np.exp(-partial*.19)/partial
        a*=.45*(.95+.05*np.sin(t*2.7))
    elif kind=='horn':
        env=(1-np.exp(-t/.3))*np.minimum(1,np.maximum(0,(duration-t)/.9))
        phase=2*np.pi*hz*t+.018*np.sin(2*np.pi*4.3*t)
        a=np.sin(phase)+.32*np.sin(phase*2)+.19*np.sin(phase*3)+.065*np.sin(phase*5)
        a*=.7
    elif kind=='pulse':
        env=(1-np.exp(-t/.015))*np.exp(-t/.19)*np.minimum(1,np.maximum(0,(duration-t)/.05))
        a=np.sin(2*np.pi*hz*t)+.23*np.sin(2*np.pi*hz*2*t)+.09*np.sin(2*np.pi*hz*3*t)
    elif kind=='bell':
        env=(1-np.exp(-t/.01))*np.exp(-t/1.5)*np.minimum(1,np.maximum(0,(duration-t)/.4))
        a=np.sin(2*np.pi*hz*t+.7*np.exp(-t*3)*np.sin(2*np.pi*hz*2*t))
    else:
        env=(1-np.exp(-t/.035))*np.exp(-t/1.1)*np.minimum(1,np.maximum(0,(duration-t)/.15))
        a=np.sin(2*np.pi*hz*t)+.15*np.sin(4*np.pi*hz*t)
    add(score,a*env,at,gain,pan)

def noise(duration,cutoff,kind='bandpass'):
    a=rng.normal(0,1,int(duration*RATE)).astype(np.float32)
    return signal.sosfilt(signal.butter(2,cutoff,kind,fs=RATE,output='sos'),a).astype(np.float32)

def drum(at,gain,pan=0.):
    t=np.arange(int(.95*RATE),dtype=np.float32)/RATE
    phase=2*np.pi*(47*t+38*.045*(1-np.exp(-t/.045)))
    a=(np.sin(phase)+.22*np.sin(phase*1.47))*(1-np.exp(-t/.0015))*np.exp(-t/.22)
    a+=noise(.95,[90,1800])*np.exp(-t/.035)*.13
    add(score,a,at,gain,pan)

# 120 BPM in a broad half-time feel; every camera cut falls on a bar boundary.
beat=.5
chords=[[50,57,62,65],[46,53,58,62],[53,60,65,69],[48,55,60,64]]
melody=[74,69,72,65,69,77,76,72]
for bar in range(60):
    at=bar*2
    chord=chords[(bar//4)%4]
    if bar>=56:chord=[50,57,62,65]
    energy=.52 if at<16 else .68 if at<32 else .83 if at<46 else .92 if at<60 else .74 if at<76 else 1.06 if at<106 else .96
    if bar%2==0:
        for j,n in enumerate(chord):pitched(n,at,6.1,.033*energy,'strings',[-.62,-.23,.24,.62][j])
    pitched(chord[0]-12,at,2.3,.15*energy,'bass')
    if bar%2==0:
        pitched(melody[(bar//2)%8],at+.5,4.2,.048*energy,'bell',.25*np.sin(bar))
    if 16<=at<114:
        rhythm=[0,.5,1,1.5] if at<76 else [0,.25,.5,.75,1,1.25,1.5,1.75]
        for index,offset in enumerate(rhythm):
            pitched(chord[[0,1,2,1][index%4]],at+offset,.7,.029*energy,'pulse',.28 if index%2 else -.28)
    if bar%4==0:
        for j,n in enumerate([chord[0],chord[1],chord[2]]):
            pitched(n+12,at+.08,5.7,.025*energy,'horn',[-.35,0,.35][j])
    if 30<=at<116:
        drum(at,.18*energy,-.13)
        if at>=46:drum(at+1.5,.095*energy,.22)
        if at>=76:
            brush=noise(.28,[1800,7500]);t=np.arange(len(brush))/RATE
            add(score,brush*np.exp(-t/.055),at+1,.026*energy,.1)

# Wide room reflections; stereo cross-delays retain the centre for low drums.
dry=score.copy()
for delay,gain in [(.071,.13),(.139,.11),(.227,.10),(.367,.085),(.509,.072),(.743,.056),(1.071,.038),(1.337,.025)]:
    shift=int(delay*RATE);score[shift:]+=dry[:-shift,::-1]*gain
del dry

# Soft air beds and boundary swells accompany altitude and large camera movement.
air=noise(SECONDS,[130,1200]);t=np.arange(N,dtype=np.float32)/RATE
add(effects,air*(.004+.003*np.sin(t*.17)**2),0,1,-.2)
add(effects,noise(SECONDS,[95,280]),0,.007,.17)
cuts=[0,16,32,46,60,76,92,106]
for at in cuts:
    drum(at,.14 if at<76 else .21,0)
    if at:
        swell=noise(2.8,[400,4000]);s=np.arange(len(swell),dtype=np.float32)/RATE
        env=np.where(s<1.6,(s/1.6)**2,np.exp(-(s-1.6)/.3))
        add(effects,swell*env,at-1.6,.015 if at<76 else .020,.25 if at%4 else -.25)

fade=np.minimum(1,t/1.2)*np.minimum(1,np.maximum(0,(SECONDS-t)/3))
score*=fade[:,None];effects*=fade[:,None]
mix=score+effects
peak=float(np.max(np.abs(mix)));gain=min(1.,.82/peak)
for name,bus in [('score',score),('effects',effects),('mix',mix)]:
    wavfile.write(OUT/(name+'.wav'),RATE,np.asarray(bus*gain,np.float32))
(OUT/'composition.json').write_text(json.dumps({'title':'天际之上','durationSeconds':SECONDS,'sampleRate':RATE,'channels':2,'tempoBpm':120,'feel':'half time','bars':60,'originalSynthesis':True,'externalMusicSamples':False,'narration':False,'pictureCutsSeconds':cuts,'peakBeforeMaster':peak*gain},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(OUT/'mix.wav'),'seconds':SECONDS,'peak':peak*gain}))
