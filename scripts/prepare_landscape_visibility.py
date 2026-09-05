"""CPU-only texture corrections for the existing original landscape models.

Writes candidate assets only. Does not regenerate trees, change planting, or
touch public. Keeps source leaf alpha exactly, fills hidden RGB to avoid black
mip fringes, and removes recognisable periodic colour lobes from lawn detail.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/city/landscape-visibility-candidate'
OUT.mkdir(parents=True,exist_ok=True)
source=Image.open(ROOT/'public/city/landscape/foliage-atlas.png').convert('RGBA')
pixels=np.array(source)
result=pixels.copy()

def padded_rgb(rgba):
    """Push-pull padding independently inside each leaf atlas quadrant."""
    rgb=rgba[:,:,:3].astype(np.float32)
    weights=(rgba[:,:,3]>0).astype(np.float32)
    levels=[(rgb,weights)]
    while rgb.shape[0]>1:
        h,w=weights.shape
        coverage=weights.reshape(h//2,2,w//2,2).sum((1,3))
        colour=(rgb*weights[:,:,None]).reshape(h//2,2,w//2,2,3).sum((1,3))/np.maximum(coverage[:,:,None],1e-6)
        weights=coverage*.25;rgb=colour;levels.append((rgb,weights))
    fill=rgb
    for colour,coverage in reversed(levels[:-1]):
        fill=np.array(Image.fromarray(np.clip(fill,0,255).astype(np.uint8)).resize((colour.shape[1],colour.shape[0]),Image.Resampling.BILINEAR)).astype(np.float32)
        fill[coverage>0]=colour[coverage>0]
    return np.clip(fill,0,255).astype(np.uint8)

for y in [0,512]:
    for x in [0,512]:
        tile=pixels[y:y+512,x:x+512]
        result[y:y+512,x:x+512,:3]=padded_rgb(tile)
assert np.array_equal(result[:,:,3],pixels[:,:,3])
assert np.array_equal(result[:,:,:3][pixels[:,:,3]>0],pixels[:,:,:3][pixels[:,:,3]>0])
Image.fromarray(result).save(OUT/'foliage-atlas-padded.png',optimize=True)

# No broad sine/cosine, mowing checker pattern, or isolated repeated bright
# blotch in the 8m detail tile. World ground-cover texture owns patch colour.
rng=np.random.default_rng(640913)
n=512
grain=rng.normal(0,2.2,(n,n,1))
rgb=np.clip(np.array([76,97,67],dtype=np.float32)+grain,0,255).astype(np.uint8)
lawn=Image.fromarray(rgb);draw=ImageDraw.Draw(lawn)
for _ in range(15000):
    x,y=rng.integers(0,n,2);dx=int(rng.integers(-2,3));dy=-int(rng.integers(1,5));v=int(rng.integers(-9,12));color=(76+v,97+v,67+v)
    # Wrapping all endpoints makes the edge statistically identical to the
    # interior; no edge seams acquire a repeated light/dark grid.
    for tx in [-n,0,n]:
        for ty in [-n,0,n]:
            if -5<x+tx<n+5 and -5<y+ty<n+5:draw.line((int(x)+tx,int(y)+ty,int(x)+dx+tx,int(y)+dy+ty),fill=color,width=1)
lawn.save(OUT/'lawn-detail-v2.jpg',quality=94,optimize=True)

report={'alphaUnchanged':True,'opaqueRGBUnchanged':True,'dimensions':{'foliage':[1024,1024],'lawn':[512,512]},'lodAlphaCutoff':.17,'nearAlphaCutoff':.47,'mips':[]}
for size in [1024,256,64,16,8,4,2,1]:
    a=np.array(Image.fromarray(pixels[:,:,3]).resize((size,size),Image.Resampling.BOX))/255
    report['mips'].append({'size':size,'meanAlpha':float(a.mean()),'oldSurvivingTexelFraction':float((a>=.47).mean()),'lodSurvivingTexelFraction':float((a>=.17).mean())})
old=Image.open(ROOT/'public/city/landscape/lawn.jpg')
# A broad low pass exposes visible periodic low-frequency structure, separated
# from individual fine grass strokes. New detail should be almost uniform here.
report['lawnLowFrequencyStddev']={name:float(np.asarray(im.filter(ImageFilter.GaussianBlur(12)),dtype=float).std((0,1)).mean()) for name,im in [('before',old),('after',lawn)]}
(OUT/'validation.json').write_text(json.dumps(report,indent=2)+'\n')

panel=Image.new('RGB',(1536,1088),(21,36,38));d=ImageDraw.Draw(panel)
d.text((20,12),'CPU texture diagnostic; gameplay visibility requires current GPU screenshot',fill='white')
for col,(im,label) in enumerate([(old,'OLD: repeating 2 x 3 colour lobes'),(lawn,'NEW: low amplitude fine fibres'),(Image.fromarray(result).convert('RGB'),'PADDED FOLIAGE RGB (alpha unchanged)')]):
    panel.paste(im.resize((512,512)),(col*512,54));d.text((col*512+12,34),label,fill='white')
for col,im in enumerate([old,lawn]):
    preview=Image.new('RGB',(512,512))
    tile=im.resize((128,128),Image.Resampling.LANCZOS)
    for y in range(4):
        for x in range(4):preview.paste(tile,(x*128,y*128))
    panel.paste(preview,(col*512,576))
alpha=Image.fromarray(pixels[:,:,3]).resize((4,4),Image.Resampling.BOX)
for i,(cut,label) in enumerate([(.47,'OLD alpha test at mip 4x4'),(.17,'LOD alpha test at mip 4x4')]):
    mask=Image.fromarray((np.asarray(alpha)/255>=cut).astype(np.uint8)*255).resize((220,220),Image.Resampling.NEAREST)
    panel.paste(mask,(1030+i*248,628));d.text((1030+i*248,603),label,fill='white')
panel.save(OUT/'texture-visibility-review.png')
print(json.dumps(report,indent=2))
