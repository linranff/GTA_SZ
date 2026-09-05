"""Deterministic, original procedural material maps and shop lettering.
No photos or generated concept images are used as fake 3D scenery.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/textures'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(47)
N = 512

def surface(name, base, kind):
    im = Image.new('RGB', (N, N)); px = im.load()
    for y in range(N):
        for x in range(N):
            grain = rng.gauss(0, 3.5)
            broad = 2 * math.sin(x / 43) * math.cos(y / 31)
            v = grain + broad
            if kind == 'tile':
                if x % 64 < 2 or y % 32 < 2: v -= 30
                else: v += ((x // 64 * 7 + y // 32 * 11) % 9) - 4
            if kind == 'paving':
                if (x + (y // 128 % 2) * 128) % 256 < 4 or y % 128 < 4: v -= 40
            if kind == 'wood': v += 8 * math.sin(y / 2.8 + math.sin(x / 47)) + 4 * math.sin(y / 1.3)
            if kind == 'asphalt': v += rng.gauss(0, 5)
            px[x,y] = tuple(max(0,min(255,int(c + v))) for c in base)
    if kind == 'asphalt':
        d = ImageDraw.Draw(im)
        for _ in range(13):
            x,y = rng.randrange(N),rng.randrange(N)
            pts=[(x,y)]
            for i in range(rng.randrange(4,10)):
                x+=rng.randrange(-20,21); y+=rng.randrange(4,19); pts.append((x,y))
            d.line(pts,fill=(66,69,67),width=1)
    im.save(OUT / (name + '.jpg'), quality=91)

surface('ceramic', (184,187,176), 'tile')
surface('ceramic-warm', (202,190,169), 'tile')
surface('plaster', (195,193,179), 'plain')
surface('asphalt', (103,111,111), 'asphalt')
surface('paving', (158,155,144), 'paving')
surface('wood', (123,82,49), 'wood')

font_path='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
def sign(name,title,subtitle,bg,fg=(243,234,211)):
    im=Image.new('RGB',(1024,256),bg); d=ImageDraw.Draw(im)
    d.rectangle((12,12,1012,244),outline=tuple(min(255,c+35) for c in bg),width=3)
    ft=ImageFont.truetype(font_path,128)
    box=d.textbbox((0,0),title,font=ft)
    d.text(((1024-(box[2]-box[0]))/2,4),title,font=ft,fill=fg)
    sm=ImageFont.truetype(font_path,27)
    box=d.textbbox((0,0),subtitle,font=sm)
    d.text(((1024-(box[2]-box[0]))/2,193),subtitle,font=sm,fill=fg)
    im.save(OUT / (name+'.png'))

sign('sign-food','阿芳快餐','现炒热饭  ·  慢慢吃，别着急',(141,65,41))
sign('sign-store','好邻居便利店','日用百货  ·  饮料零食  ·  扫码支付',(37,91,75))
sign('sign-used','旧物新生活','二手家具  ·  好东西再用一次',(44,79,99))
sign('sign-work','顺成仓配','分拣  ·  搬运  ·  今日结算',(63,81,81))
sign('sign-home','青禾公寓','有一盏灯，留给晚归的人',(103,93, 71))
sign('sign-laundry','巷口洗衣','洗净一天的疲惫',(55,100,119))
print('Wrote',len(list(OUT.iterdir())),'original material and sign maps')
