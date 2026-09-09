"""Original 120 s arrangement of the game's 海湾晚风, plus timed driving ambience."""
from pathlib import Path
import json
import numpy as np
from scipy import signal
from scipy.io import wavfile

RATE=48000
DURATION=120
N=RATE*DURATION
OUT=Path('output/trailer/audio')
OUT.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(17092026)
score=np.zeros((N,2),dtype=np.float32)
effects=np.zeros_like(score)

def add(bus,a,at,gain=1.,pan=0.):
    start=max(0,int(round(at*RATE))); end=min(N,start+len(a))
    if end<=start:return
    a=np.asarray(a[:end-start]*gain,dtype=np.float32)
    bus[start:end,0]+=a*np.sqrt((1-pan)/2)
    bus[start:end,1]+=a*np.sqrt((1+pan)/2)

def tone(note,at,duration,amp,kind='key',pan=0.):
    t=np.arange(int(duration*RATE),dtype=np.float32)/RATE
    hz=440*2**((note-69)/12)
    if kind=='pad':
        env=(1-np.exp(-t/.55))*np.minimum(1,np.maximum(0,(duration-t)/1.4))
        a=(np.sin(2*np.pi*hz*t)+.35*np.sin(2*np.pi*(hz*1.002)*t)+.15*np.sin(4*np.pi*hz*t))/1.5
    elif kind=='bass':
        env=(1-np.exp(-t/.012))*np.exp(-t/1.2)*np.minimum(1,(duration-t)/.06)
        a=np.sin(2*np.pi*hz*t)+.16*np.sin(4*np.pi*hz*t)
    else:
        env=(1-np.exp(-t/.005))*np.exp(-t/1.2)*np.minimum(1,(duration-t)/.08)
        a=np.sin(2*np.pi*hz*t+1.15*np.exp(-t*4)*np.sin(4*np.pi*hz*t))
        a+=.12*np.sin(2*np.pi*hz*3*t)*np.exp(-t*2.8)
    add(score,a*env,at,amp,pan)

def noise(length,cutoff,kind='lowpass'):
    a=rng.normal(0,1,int(length*RATE)).astype(np.float32)
    sos=signal.butter(2,cutoff,kind,fs=RATE,output='sos')
    return signal.sosfilt(sos,a).astype(np.float32)

beat=60/72
chords=[[50,57,60,64],[46,53,57,60],[53,60,64,67],[48,55,58,62]]
melody=[0,2,3,1,2,1,3,2]
for bar in range(36):
    at=bar*4*beat
    chord=chords[(bar//2)%4]
    if bar>=34:chord=[50,57,60,65]  # settle on D for the final title
    density=.62 if at<15 else .82 if at<41 else 1.0 if at<68 else 1.08 if at<104 else .75
    for j,n in enumerate(chord):tone(n,at,5.8,.017*density,'pad',[-.6,-.2,.25,.6][j])
    for b in [0,2]:tone(chord[0]-12,at+b*beat,2.3,.10*density,'bass',0)
    for b in range(4):
        if at<8 and b%2:continue
        if at>113 and b>1:continue
        n=chord[melody[(bar*4+b)%8]]+12
        tone(n,at+b*beat,2.8,.046*density,'key',.32*np.sin(bar+b*1.7))
    # The driving section gains a quiet eighth-note counterline.
    if 65<=at<104:
        for b in [0.5,1.5,2.5,3.5]:tone(chord[int(b*2)%4]+12,at+b*beat,1.3,.015,'key',-.35)
    if 38<=at<112:
        strength=.50 if at<65 else .85 if at<104 else .42
        for b in [0,2.5]:
            t=np.arange(int(.42*RATE))/RATE
            phase=2*np.pi*(46*t+42*.035*(1-np.exp(-t/.035)))
            kick=np.sin(phase)*np.exp(-t/0.10)*(1-np.exp(-t/.002))
            add(score,kick,at+b*beat,.15*strength)
        for b in [1,3]:
            snare=noise(.18,1100,'highpass'); t=np.arange(len(snare))/RATE
            add(score,snare*np.exp(-t/0.035),at+b*beat,.035*strength,-.08)
        for b in np.arange(0,4,.5):
            hat=noise(.085,6400,'highpass'); t=np.arange(len(hat))/RATE
            add(score,hat*np.exp(-t/.018),at+b*beat,.012*strength*(.7 if b%1 else 1),.22)

# Soft stereo reflections keep the original motif spacious without a long muddy tail.
dry=score.copy()
for delay,gain in [(.19,.16),(.37,.10),(.59,.065),(.83,.04)]:
    n=int(delay*RATE);score[n:]+=dry[:-n,::-1]*gain
del dry
t=np.arange(N,dtype=np.float32)/RATE
fade=np.minimum(1,t/1.2)*np.minimum(1,np.maximum(0,(DURATION-t)/1.8))
score*=fade[:,None]

# Wind and shore ambience are deliberately low under the score.
shore=noise(DURATION,650)
shore_env=.007*(.6+.4*np.sin(t*.42)**2)
shore_env*=np.where(t<23,1.,np.where((t>=68)&(t<104),.6,.18))
add(effects,shore*shore_env,0,1,-.28)
city=noise(DURATION,[100,380],'bandpass')
add(effects,city,0,.006,.18)

# Use the recorded vehicle telemetry when present, otherwise the authored speed curve.
specs=[('10',68,9,13,.55),('11',77,8,17,.12),('12',85,8,16.5,.12),('13',93,11,16,0)]
for id,at,duration,start_speed,acceleration in specs:
    st=np.arange(int(duration*RATE),dtype=np.float32)/RATE
    speed=start_speed+acceleration*st
    take=Path('output/trailer/takes')/(id+'.json')
    if take.exists():
        poses=json.loads(take.read_text())['poses']
        if poses:speed=np.interp(st,[p['frame']/60 for p in poses],[p['speed'] for p in poses]).astype(np.float32)
    motion=np.clip(speed/32,0,1)
    ramp=np.minimum(1,st/.35)*np.minimum(1,(duration-st)/.4)
    distance=1 if id!='13' else np.exp(-st/.95)*.9+.025
    amp=ramp*distance
    phase=np.cumsum((48+speed*8+3.1)/RATE,dtype=np.float64)*2*np.pi
    motor=np.sin(phase)*(.012+.015*motion)
    harmonic=np.sin(np.cumsum((98+speed*15+5.3)/RATE,dtype=np.float64)*2*np.pi)*.003
    roll=noise(duration,[180,1300],'bandpass')*(.052*motion**.65)
    wind=noise(duration,[240,2100],'bandpass')*(.023*motion**2)
    add(effects,(motor+harmonic+roll+wind)*amp,at,1,0 if id!='11' else -.13)

# Three subdued daytime birds, composed here rather than copied from a sample library.
for at in [26.1,30.6,37.2]:
    st=np.arange(int(.22*RATE),dtype=np.float32)/RATE
    phase=2*np.pi*(2300*st+450*st*st/.22)
    chirp=np.sin(phase)*np.sin(np.pi*st/.22)**3
    add(effects,chirp,at,.007,.55)
    add(effects,chirp,at+.31,.004,-.25)
effects*=fade[:,None]
mix=score+effects
peak=float(np.max(np.abs(mix)))
gain=min(1.5,.85/max(peak,1e-6))
for name,a in [('score',score),('effects',effects),('mix',mix)]:
    wavfile.write(OUT/(name+'.wav'),RATE,(a*gain).astype(np.float32))
(OUT/'composition.json').write_text(json.dumps({'title':'海湾晚风 · 宣传片重编曲','basis':'src/city-audio.ts original chord voicings and melody; new synthesis and arrangement','durationSeconds':DURATION,'sampleRate':RATE,'channels':2,'tempoBpm':72,'bars':36,'narration':False,'peakBeforeNormalization':peak*gain,'drivingIntervals':[{'shot':x[0],'start':x[1],'duration':x[2]} for x in specs]},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'seconds':DURATION,'samples':N,'peak':peak*gain,'output':str(OUT/'mix.wav')}))
