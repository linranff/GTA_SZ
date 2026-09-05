from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path
import random,math
O=Path('public/city/textures');O.mkdir(parents=True,exist_ok=True)
for style in ['office','residential','stone']:
 rng=random.Random(48);n=1024
 im=Image.new('RGB',(n,n),(85,107,115) if style=='office' else (163,161,145));em=Image.new('RGB',(n,n));d=ImageDraw.Draw(im);e=ImageDraw.Draw(em)
 for j in range(8):
  for i in range(8):
   x=i*128;y=j*128;r=rng.random();lit=rng.random()<.105
   if style=='office':
    c=(int(99+r*30),int(124+r*28),int(140+r*27));rect=(x+5,y+5,x+122,y+113)
    d.rectangle(rect,fill=c);d.rectangle((x+7,y+8,x+12,y+110),fill=(163,178,179));d.rectangle((x,y+116,x+127,y+125),fill=(61,77,83));d.line((x+64,y+5,x+64,y+113),fill=(143,160,162),width=3)
   else:
    c=(38+int(r*22),64+int(r*16),76+int(r*15));rect=(x+20,y+18,x+106,y+103)
    d.rectangle((x+14,y+13,x+112,y+108),fill=(108,115,109));d.rectangle(rect,fill=c);d.line((x+64,y+18,x+64,y+103),fill=(173,182,173),width=5);d.line((x+20,y+59,x+106,y+59),fill=(174,183,175),width=4)
    d.rectangle((x,y+115,x+127,y+127),fill=(128,132,124));d.rectangle((x+86,y+93,x+114,y+110),fill=(134,145,137));d.line((x+88,y+98,x+112,y+98),fill=(69,81,80),width=2)
   if lit:
    d.rectangle((rect[0]+5,rect[1]+4,rect[2]-5,rect[3]-5),fill=(119,119,103));e.rectangle((rect[0]+5,rect[1]+4,rect[2]-5,rect[3]-5),fill=(245,172,85))
    cx=(rect[0]+rect[2])//2;e.rectangle((cx-2,rect[1],cx+2,rect[3]),fill=(6,5,3));e.rectangle((rect[0]+4,rect[1]+4,rect[0]+19,rect[3]-4),fill=(110,66,30));e.rectangle((rect[0]+4,rect[3]-14,rect[2]-4,rect[3]-5),fill=(25,18,10))
    for k in range(3):d.line((rect[0]+5,rect[1]+10+k*15,rect[2]-5,rect[1]+10+k*15),fill=(106,104,78),width=3)
 im.save(O/f'{style}.jpg',quality=92);em.save(O/f'{style}-emissive.png');em.save(O/f'{style}-emissive.jpg',quality=95)
rng=random.Random(822);n=1024;im=Image.new('RGB',(n,n));px=im.load()
for y in range(n):
 for x in range(n):
  k=rng.gauss(0,3.6)+2*math.sin(x*.065)*math.sin(y*.018);px[x,y]=(max(0,int(50+k)),max(0,int(55+k)),max(0,int(60+k)))
im.save(O/'road.jpg',quality=94)
# Chinese motorway signs are original artwork, not downloaded trademark images.
font='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
for id,a,b in [('west','后海  南山','HOUHAI     NANSHAN  →'),('east','福田  罗湖','FUTIAN       LUOHU  →'),('bay','深圳湾公园','SHENZHEN BAY PARK'),('center','市民中心','CIVIC CENTER')]:
 im=Image.new('RGB',(1024,256),(18,79,80));d=ImageDraw.Draw(im);d.rounded_rectangle((8,8,1015,247),radius=12,outline=(210,231,215),width=7);d.text((48,22),a,font=ImageFont.truetype(font,77),fill=(237,245,220));d.text((48,132),b,font=ImageFont.truetype(font,38),fill=(215,235,219));im.save(O/f'sign-{id}.jpg',quality=94)

for kind in ['grass','paving']:
 im=Image.new('RGB',(512,512));pix=im.load();rng=random.Random(331)
 for y in range(512):
  for x in range(512):
   n=rng.uniform(-9,9)
   if kind=='grass':
    k=math.sin(x*.062)*math.sin(y*.078)*7+n;pix[x,y]=(int(62+k),int(84+k),int(55+k))
   else:
    joint=(x%32<2 or y%32<2);k=n*.4-(20 if joint else 0);pix[x,y]=(int(116+k),int(125+k),int(121+k))
 im.save(O/(kind+'.jpg'),quality=92)
