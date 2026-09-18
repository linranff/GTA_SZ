"""Relief companions for the ordinary-building shaders (no photo inputs; derived from our own atlas).

  .venv/bin/python scripts/make_facade_relief_atlas.py

facade-relief.png (1024², same 8-tile layout as facade-atlas.png):
  R,G  surface slope dH/du, dH/dv in metres per metre, encoded (slope/4+.5) over ±2. Glazing sits
       12 cm behind the wall with a chamfered reveal; mullion caps stand 2.5 cm proud; masonry
       families get 1 cm panel joints and fine tile grain. The wall shader turns this into a
       surface-gradient bump, so pane edges and frames catch or shadow the low sun.
  B    shade: reveal ambient occlusion × sill shadow × rain streaks under sills (1 = clean/open).
  A    frame mask (1 = metal mullion): smoother, lighter specular than the wall.
roof-detail.png (512², one 8 m tile, world-XZ projected by the roof shader):
  R membrane sheet seams, G grain (0.5 neutral), B stains/blotches, A height for a subtle bump.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
from scipy import ndimage

R=Path(__file__).resolve().parents[1];T=R/'public/city/textures/architecture';A=R/'artifacts/materials/facade-relief';A.mkdir(parents=True,exist_ok=True)
atlas=np.asarray(Image.open(T/'facade-atlas.png').convert('RGBA')).astype('int16')
N=1024;TW,TH=256,512;INNER=(8,8,248,504)
PERIODS=[(14,19.2),(18,20.4),(14,17.6),(20,17.6),(16,22.4),(12,16.8),(20,16),(20,18.4)]
ROWS=[8,8,8,8,8,8,4,8];MASONRY={2,3,4,5,7}
out=np.zeros((N,N,4),dtype='float32')
rng=np.random.default_rng(7331)
def smoothstep(a,b,x):t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
for family in range(8):
    x0,y0=(family%4)*TW,(family//4)*TH
    tile=atlas[y0:y0+TH,x0:x0+TW]
    glass=(tile[:,:,3]<140)                       # alpha class: 85 glass / 199 wall
    px_u=PERIODS[family][0]/240;px_v=PERIODS[family][1]/496   # metres per texel
    # Height field (metres). Chamfered reveal: recess reached ~3 texels inside the pane edge.
    dist_in=ndimage.distance_transform_edt(glass)
    h=np.where(glass,-.12*smoothstep(0,3,dist_in),0.).astype('float32')
    frame=ndimage.binary_dilation(glass,iterations=2)&~glass
    h[frame]+=.025
    if family in MASONRY:
        rows=ROWS[family];bh=496/rows
        joints=np.zeros_like(h,dtype=bool)
        for r in range(rows+1):
            yy=int(round(8+r*bh))-1
            if 0<=yy<TH:joints[yy,:]=True
        cols=(6,4,4,3,3,3,5,3)[family]
        for c in range(cols+1):
            xx=int(round(8+c*240/cols))-1
            if 0<=xx<TW:joints[:,xx]=True
        h[joints&~glass&~frame]-=.01
        grain=ndimage.gaussian_filter(rng.normal(0,1,(TH,TW)),.8).astype('float32')
        h+=np.where(~glass,grain*.003,0)
    else:
        grain=ndimage.gaussian_filter(rng.normal(0,1,(TH,TW)),1.2).astype('float32')
        h+=np.where(~glass&~frame,grain*.0012,0)
    gy,gx=np.gradient(h)                          # per texel
    su=np.clip(gx/px_u,-2,2);sv=np.clip(gy/px_v,-2,2)
    # Shade: reveal AO (dark near the frame inside the pane), lintel shadow (top 10 texels of a pane),
    # sill shadow on the wall just below a pane, rain streaks running down from pane corners.
    ao=np.where(glass,.55+.45*smoothstep(0,6,dist_in),1.)
    above=np.zeros_like(glass);above[1:,:]=glass[:-1,:]          # texel above is glass → we are under a pane top edge? (use column scan instead)
    lintel=np.ones_like(ao)
    below_wall=np.ones_like(ao)
    streak=np.zeros_like(ao)
    for x in range(TW):
        col=glass[:,x];y=0
        while y<TH:
            if col[y]:
                y1=y
                while y1<TH and col[y1]:y1+=1
                lintel[y:min(TH,y+10),x]*=np.linspace(.72,1,min(10,TH-y),dtype='float32')[:min(10,TH-y)] if y1-y>10 else 1
                lo=min(TH,y1+4);below_wall[y1:lo,x]*=np.linspace(.84,1,lo-y1,dtype='float32') if lo>y1 else 1
                y=y1
            else:y+=1
    if family in MASONRY or family==6:
        # Streak sources: bottom corners of each pane, 22 % of them, fading over 30–60 texels.
        lab,n=ndimage.label(glass)
        for i in range(1,n+1):
            ys,xs=np.where(lab==i)
            if len(ys)<12:continue
            yb=ys.max();
            for xc in (xs.min()+1,xs.max()-1):
                if rng.random()<.22:
                    length=int(rng.integers(30,60));w=int(rng.integers(2,4));strength=rng.uniform(.18,.34)
                    for k in range(length):
                        yy=yb+1+k
                        if yy>=TH:break
                        fade=(1-k/length)**1.4
                        streak[yy,max(0,xc-w//2):min(TW,xc+w//2+1)]=np.maximum(streak[yy,max(0,xc-w//2):min(TW,xc+w//2+1)],strength*fade)
    shade=np.clip(ao*lintel*below_wall*(1-streak*(~glass)),0,1)
    tile_out=np.stack([su/4+.5,sv/4+.5,shade,frame.astype('float32')],-1)
    # Replicate the inner area into the 8 px gutters exactly like the colour atlas.
    inner=tile_out[8:504,8:248]
    tile_out[8:504,8:248]=inner
    tile_out[8:504,0:8]=inner[:,:1];tile_out[8:504,248:256]=inner[:,-1:]
    tile_out[0:8,:]=tile_out[8:9,:];tile_out[504:512,:]=tile_out[503:504,:]
    out[y0:y0+TH,x0:x0+TW]=tile_out
Image.fromarray(np.clip(out*255+.5,0,255).astype('uint8'),'RGBA').save(T/'facade-relief.png',optimize=True)

# Roof detail: one 8 m tile at 64 texels/m.
S=512;rng=np.random.default_rng(4421)
yy,xx=np.mgrid[0:S,0:S]
seam=np.zeros((S,S),dtype='float32')
for k in range(0,S,96):                          # 1.5 m membrane sheets with a 2-texel overlap line
    seam[:,max(0,k-1):k+2]=1
    seam[max(0,k+48-1):k+50,:]=np.maximum(seam[max(0,k+48-1):k+50,:],.55)   # staggered end laps
seam=ndimage.gaussian_filter(seam,.6)
grain=ndimage.gaussian_filter(rng.normal(0,1,(S,S)),1.1);grain=np.clip(grain/grain.std()*.18+.5,0,1)
coarse=ndimage.gaussian_filter(rng.normal(0,1,(S,S)),18);coarse=(coarse-coarse.min())/(coarse.max()-coarse.min())
stains=np.clip(smoothstep(.55,.85,coarse)*.9,0,1)
# Drain puddle rings and drip streaks give the aerial roof something to read.
for _ in range(6):
    cx,cy=rng.integers(40,S-40,2);r=rng.uniform(14,30)
    d=np.hypot(xx-cx,yy-cy);stains=np.maximum(stains,np.clip(1-np.abs(d-r)/4,0,1)*.6)
height=np.clip(.5-seam*.25+(grain-.5)*.6,0,1)
roof=np.stack([seam,grain,stains,height],-1)
Image.fromarray(np.clip(roof*255+.5,0,255).astype('uint8'),'RGBA').save(T/'roof-detail.png',optimize=True)

report={'files':[]}
for f in ['facade-relief.png','roof-detail.png']:
    p=T/f;report['files'].append({'name':f,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':Image.open(p).size})
(A/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
