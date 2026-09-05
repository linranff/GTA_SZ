"""Hand-authored facade grammar atlas; generates new art, no photo inputs.
Outputs only review candidates under artifacts, never public assets.
"""
from pathlib import Path
from PIL import Image,ImageDraw
import json,random,hashlib
import numpy as np
R=Path(__file__).resolve().parents[1];O=R/'artifacts/materials/facade-diversity';O.mkdir(parents=True,exist_ok=True)
N=1024;atlas=Image.new('RGB',(N,N));windows=Image.new('RGB',(N,N));review=Image.new('RGB',(1024,1090),'#15242a');labels=ImageDraw.Draw(review)
FAMILIES=[('blue-curtain','蓝灰竖梃幕墙',6,8,(130,155,162)),('ribbon-office','浅铝横向带窗',4,8,(183,191,189)),('warm-housing','暖色住宅',4,8,(198,180,148)),('ivory-slab','象牙白板式住宅',3,8,(207,208,195)),('stone-mixed','石材商住',3,8,(181,178,164)),('ceramic-village','陶砖低层/城中村艺术类型',3,8,(164,173,162)),('industrial','轻工业厂房',5,4,(184,189,183)),('concrete-balcony','旧式灰色阳台住宅',3,8,(170,176,173))]
for family,(key,title,cols,rows,wall) in enumerate(FAMILIES):
    rng=random.Random(6143+family);tile=Image.new('RGB',(256,512),wall);draw=ImageDraw.Draw(tile);mask=Image.new('RGB',tile.size);md=ImageDraw.Draw(mask)
    # Fine material variation stays low contrast; lighting remains in the engine.
    for _ in range(6500):
        x,y=rng.randrange(256),rng.randrange(512);delta=rng.randrange(-6,7);draw.point((x,y),fill=tuple(max(0,min(255,c+delta)) for c in wall))
    def glass(box,shade=0):
        x0,y0,x1,y1=[round(n) for n in box]
        draw.rectangle((x0-2,y0-2,x1+2,y1+2),fill=(68,79,79));color=(69+shade,91+shade,103+shade)
        draw.rectangle((x0,y0,x1,y1),fill=color)
        for yy in range(y0,y1+1):
            delta=round(4*(1-(yy-y0)/max(1,y1-y0)));draw.line((x0,yy,x1,yy),fill=tuple(c+delta for c in color))
        if rng.random()<.22:draw.rectangle((x1-3,y0+2,x1-1,y1-2),fill=(104+shade,122+shade,133+shade))
        draw.line((x0,y0,x1,y0),fill=(116,135,141),width=1)
        # R is exact glazing stencil; G/B are reserved independent window variation.
        md.rectangle((x0+2,y0+2,x1-2,y1-2),fill=(255,180,160))
    innerW,innerH=240,496;bw,bh=innerW/cols,innerH/rows
    for row in range(rows):
        for col in range(cols):
            x,y=8+col*bw,8+row*bh;shade=rng.choice([-5,0,4,7])
            if family==0:
                glass((x+2,y+3,x+bw-3,y+bh-12),shade);draw.rectangle((x,y+bh-10,x+bw,y+bh-3),fill=(107,128,137));draw.line((x+1,y,x+1,y+bh),fill=(194,201,196),width=2)
            elif family==1:
                glass((x+2,y+7,x+bw-3,y+bh-19),shade);draw.rectangle((x,y+bh-15,x+bw,y+bh-1),fill=(211,216,207));draw.line((x,y+bh-1,x+bw,y+bh-1),fill=(134,149,151),width=2)
            elif family==2:
                glass((x+10,y+10,x+bw-10,y+bh-14),shade);draw.line((x+bw/2,y+10,x+bw/2,y+bh-14),fill=(191,185,164),width=2);draw.rectangle((x+6,y+bh-10,x+bw-6,y+bh-6),fill=(215,201,172))
            elif family==3:
                glass((x+11,y+5,x+bw-11,y+bh-18),shade);draw.rectangle((x+5,y+bh-17,x+bw-5,y+bh-5),fill=(159,171,168));draw.line((x+6,y+bh-18,x+bw-6,y+bh-18),fill=(222,225,211),width=2)
                for p in range(3):draw.line((x+15+p*17,y+bh-17,x+15+p*17,y+bh-5),fill=(88,106,108),width=1)
            elif family==4:
                glass((x+17,y+6,x+bw-17,y+bh-13),shade);draw.line((x+2,y,x+2,y+bh),fill=(150,149,139),width=1);draw.line((x,y+bh-1,x+bw,y+bh-1),fill=(136,140,134),width=2)
            elif family==5:
                glass((x+12,y+12,x+bw-17,y+bh-16),shade);draw.line((x+bw/2,y+12,x+bw/2,y+bh-16),fill=(181,181,164),width=1)
                for yy in range(round(y+3),round(y+bh),10):draw.line((x,yy,x+bw,yy),fill=(148,158,150),width=1)
                if (col+row)%3==0:draw.rectangle((x+bw-15,y+bh-21,x+bw-2,y+bh-10),fill=(199,195,174));draw.line((x+bw-16,y+1,x+bw-16,y+bh),fill=(119,130,122),width=2)
            elif family==6:
                glass((x+4,y+bh*.23,x+bw-4,y+bh*.64),shade);draw.line((x+bw/2,y+bh*.23,x+bw/2,y+bh*.64),fill=(168,177,171),width=2);draw.line((x+4,y+bh*.44,x+bw-4,y+bh*.44),fill=(155,164,159),width=2);draw.rectangle((x,y+bh-9,x+bw,y+bh-2),fill=(149,165,161))
            else:
                glass((x+8,y+6,x+bw-9,y+bh-18),shade);draw.rectangle((x+4,y+bh-18,x+bw-4,y+bh-5),fill=(136,151,146));draw.line((x+4,y+bh-19,x+bw-4,y+bh-19),fill=(204,207,191),width=2)
                for p in range(4):draw.line((x+12+p*17,y+bh-18,x+12+p*17,y+bh-5),fill=(77,99,99),width=1)
    pixels=np.asarray(tile).astype('int16');stencil=np.asarray(mask).copy();glassOnly=((pixels[:,:,2]-pixels[:,:,0])>=28)&((pixels[:,:,1]-pixels[:,:,0])>=18);stencil[~glassOnly]=0;mask=Image.fromarray(stencil)
    # Repeat nearest interior edge into the gutter, so low mip levels cannot bleed a neighbour family.
    for img in [tile,mask]:
        img.paste(img.crop((8,8,248,504)).resize((240,496)),(8,8))
        img.paste(img.crop((8,8,9,504)).resize((8,496)),(0,8));img.paste(img.crop((247,8,248,504)).resize((8,496)),(248,8))
        img.paste(img.crop((0,8,256,9)).resize((256,8)),(0,0));img.paste(img.crop((0,503,256,504)).resize((256,8)),(0,504))
    x,y=(family%4)*256,(family//4)*512;atlas.paste(tile,(x,y));windows.paste(mask,(x,y));review.paste(tile,(x,y+34));labels.text((x+5,y+10),key,fill='#e2e8e3')
a=np.asarray(atlas).astype('int16');glass=((a[:,:,2]-a[:,:,0])>=28)&((a[:,:,1]-a[:,:,0])>=18);rough=np.where(glass,85,199).astype('uint8');rgba=atlas.convert('RGBA');rgba.putalpha(Image.fromarray(rough));rgba.save(O/'facade-atlas.png',optimize=True);windows.resize((512,512),Image.Resampling.NEAREST).save(O/'facade-windows.png',optimize=True);review.save(O/'facade-atlas-review.png')
report={'schemaVersion':1,'method':'Original hand-authored parametric facade grammar; no surveyed facade claim','families':[{'id':i,'key':f[0],'label':f[1],'columns':f[2],'rows':f[3]} for i,f in enumerate(FAMILIES)],'files':[], 'estimatedRGBA8WithMipmapsBytes':int((1024**2+512**2)*4*4/3),'newLights':0,'newGeometry':0,'albedoAlpha':'Linear perceptual roughness (glass .33, solid facade .78); shader forces opaque output alpha', 'windowPolicy':'Exact glazing stencil; runtime per-building/window occupancy, no baked occupancy in atlas'}
for f in ['facade-atlas.png','facade-windows.png']:
 p=O/f;report['files'].append({'name':f,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(O/'atlas-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
