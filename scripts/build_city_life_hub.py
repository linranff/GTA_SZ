"""Original Shenzhen street-life hub; incremental Blender asset, no city rebuild.

Run with .venv/bin/python scripts/build_city_life_hub.py. Artwork is generated
with Pillow, then Blender builds the model and its native review scene.
Local Blender axes are east / north / up; the entrance faces local south.
This is a fictional gameplay location, not a measured real Shenzhen building.
"""
from pathlib import Path
import json, math, random, sys

R = Path(__file__).resolve().parents[1]
OUT = R / 'public/city/life-hub'
ART = R / 'artifacts/city/life-hub'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)


def artwork():
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new('RGB', (2048, 2048), (25, 62, 59))
    glow = Image.new('RGB', image.size, (0, 0, 0))
    draw, light = ImageDraw.Draw(image), ImageDraw.Draw(glow)
    font_path = '/System/Library/Fonts/STHeiti Medium.ttc'

    def text(s, box, color, size, emission=False):
        x, y, w, h = box
        while size > 10:
            font = ImageFont.truetype(font_path, size)
            bounds = draw.textbbox((0, 0), s, font=font)
            if bounds[2] - bounds[0] < w and bounds[3] - bounds[1] < h:
                break
            size -= 2
        point = (x + (w - bounds[2] + bounds[0])/2 - bounds[0], y + (h - bounds[3] + bounds[1])/2 - bounds[1])
        draw.text(point, s, font=font, fill=color)
        if emission:
            light.text(point, s, font=font, fill=color)

    # Generous padding around each rectangle prevents adjacent-sign mip bleed.
    regions = {
        'header': [16, 16, 2016, 352], 'coffee': [16, 400, 992, 224],
        'rice': [1040, 400, 992, 224], 'menu': [16, 660, 496, 650],
        'jobs': [552, 660, 704, 650], 'supply': [1300, 660, 732, 256],
        'return': [1300, 952, 732, 256], 'board': [16, 1344, 704, 680],
        'rack': [760, 1344, 1272, 192], 'opening': [760, 1570, 1272, 180],
        'notice': [760, 1788, 1272, 236],
    }
    def panel(name, color):
        x, y, w, h = regions[name]
        draw.rounded_rectangle((x, y, x+w, y+h), radius=5, fill=color)
        return x, y, w, h
    cream, teal, orange = (246, 224, 177), (28, 66, 61), (231, 148, 67)
    panel('header', teal)
    text('湾畔生活驿站', (48, 35, 1950, 225), cream, 180, True)
    text('B A Y S I D E   ·   EVERYDAY SHENZHEN', (150, 277, 1720, 63), (172, 202, 185), 43)
    for name, label, subtitle in [('coffee', '街角咖啡', 'COFFEE / TAKE A MOMENT'), ('rice', '今日热饭', 'HOT MEALS / MADE WITH CARE')]:
        x, y, w, h = panel(name, teal)
        text(label, (x+20, y+5, w-40, 140), cream, 108, True)
        text(subtitle, (x+15, y+150, w-30, 56), (171, 196, 175), 31)
    x, y, w, h = panel('menu', (243, 224, 184))
    for n, (label, size) in enumerate([('今日菜单', 54), ('热饭套餐  18', 39), ('街角咖啡  12', 39), ('清凉茶     6', 39), ('忙完 · 记得吃饭', 31)]):
        text(label, (x+16, y+40+n*110, w-32, 80), teal, size)
    x, y, w, h = panel('jobs', (218, 212, 183))
    text('日结信息', (x+28, y+20, w-56, 110), teal, 77)
    for n, label in enumerate(['城市配送 · 雨后巡检', '来这里，找下一份工作。', '当天结算 / 凭手艺吃饭', '也留一点时间给自己。']):
        text(label, (x+25, y+170+n*95, w-50, 70), (69, 76, 59), 39 if n==0 else 34)
    for name, label in [('supply', '骑手补给 / REST STOP'), ('return', '慢一点 · 也是到达')]:
        x, y, w, h = panel(name, teal)
        text(label, (x+16, y+12, w-32, h-24), cream, 67, True)
    x, y, w, h = panel('board', teal)
    text('收工了', (x+25, y+30, w-50, 190), cream, 134)
    text('先吃一口热饭', (x+25, y+257, w-50, 120), cream, 72)
    text('HOT MEAL  ¥18', (x+25, y+440, w-50, 100), orange, 54)
    text('湾畔生活驿站', (x+25, y+568, w-50, 70), (156, 190, 173), 39)
    x, y, w, h = panel('rack', orange)
    text('配送取货 / PICK UP', (x+20, y+12, w-40, h-24), teal, 104)
    x, y, w, h = panel('opening', teal)
    text('OPEN  06:30 — 23:00', (x+20, y+12, w-40, h-24), cream, 75, True)
    x, y, w, h = panel('notice', (222, 226, 206))
    text('下一个路口，生活继续。', (x+20, y+12, w-40, h-24), teal, 93)
    image.save(OUT/'signs.png', optimize=True)
    glow.save(OUT/'signs-emissive.png', optimize=True)
    (OUT/'artwork.json').write_text(json.dumps(regions, ensure_ascii=False, indent=2))


if 'bpy' not in sys.modules:
    try:
        import bpy
    except ImportError:
        import subprocess
        artwork()
        subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender', '--background', '--python-exit-code', '1', '--python', str(Path(__file__).resolve())], check=True)
        raise SystemExit

sys.path.insert(0, str(R/'scripts'))
from city_mesh import B, M, material, export, bpy
from mathutils import Vector

rng = random.Random(813)
b = B()

# Storefront finishes: rendered, modeled joints and trim, not a facade decal.
material('hub_limestone', (.63, .62, .53), .77)
material('hub_plaster', (.82, .76, .62), .88)
material('hub_concrete', (.33, .39, .36), .84)
material('hub_terrazzo', (.49, .51, .46), .72)
material('hub_teal', (.055, .19, .18), .41, .20)
material('hub_trim', (.07, .11, .11), .30, .75)
material('hub_aluminium', (.45, .50, .48), .30, .82)
material('hub_wood', (.34, .19, .085), .64)
material('hub_wood_light', (.51, .32, .14), .62)
material('hub_clay', (.58, .28, .14), .86)
material('hub_roof', (.20, .25, .23), .40, .58)
material('hub_interior', (.59, .51, .37), .90)
material('hub_black', (.015, .025, .026), .80)
material('hub_glass', (.13, .25, .24), .10, .15)
material('hub_warm_light', (1.0, .64, .30), .25, 0, 2.0)
material('hub_cool_light', (.47, .85, .77), .30, 0, 1.25)
material('hub_bike_cream', (.78, .70, .48), .28, .25)
material('hub_bike_teal', (.035, .34, .32), .23, .40)
material('hub_leaf', (.075, .20, .085), .90)
material('hub_leaf_lime', (.23, .34, .10), .88)
material('hub_pink', (.66, .11, .29), .88)
for i, c in enumerate([(.55,.31,.09),(.60,.47,.22),(.20,.36,.29),(.49,.19,.12),(.67,.63,.49)]):
    material(f'hub_product_{i}', c, .59)

# Glass uses native alpha; runtime finishes it with depth prepass and IBL.
glass = next(n for n in M['hub_glass'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
glass.inputs['Alpha'].default_value = .30
glass.inputs['IOR'].default_value = 1.47
M['hub_glass'].surface_render_method = 'DITHERED'
sign = material('hub_signs', (1,1,1), .57, .04)
nodes, links = sign.node_tree.nodes, sign.node_tree.links
p = next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
for filename, socket in [('signs.png','Base Color'), ('signs-emissive.png','Emission Color')]:
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(OUT/filename))
    links.new(texture.outputs['Color'], p.inputs[socket])
p.inputs['Emission Strength'].default_value = 1.30
regions = json.loads((OUT/'artwork.json').read_text())

def label(name, x, y, z, width, height):
    u, v, w, h = regions[name]
    uv = [(u/2048,1-(v+h)/2048),((u+w)/2048,1-(v+h)/2048),((u+w)/2048,1-v/2048),(u/2048,1-v/2048)]
    # Front faces point south; backface culling preserves crisp glass normals.
    b.face('hub_signs', [(x-width/2,y,z-height/2),(x+width/2,y,z-height/2),(x+width/2,y,z+height/2),(x-width/2,y,z+height/2)], uv)

def strip(m, a, c, w=.025):
    b.tube(m,a,c,w,8)

def slats(m, x, y, z, width, depth, spacing=.20, thickness=.08):
    for n in range(max(1,int(depth/spacing))):
        b.box(m,(x,y-depth/2+(n+.5)*spacing,z),(width,thickness,.065))

def planter(x, y, width=1.8):
    b.box('hub_clay',(x,y,.47),(width,.73,.68))
    b.box('hub_concrete',(x,y,.83),(width+.055,.78,.06))
    b.box('hub_black',(x,y,.83),(width-.14,.59,.07))
    # Individually cupped leaves; no opaque green tree proxy.
    for i in range(int(width*22)):
        xx=x+rng.uniform(-width*.43,width*.43); yy=y+rng.uniform(-.20,.20)
        h=rng.uniform(.30,.65);angle=rng.random()*math.tau
        strip('hub_leaf',(xx,yy,.85),(xx+math.cos(angle)*.12,yy+math.sin(angle)*.12,.85+h),.014)
        for side in [-1,1]:
            tip=(xx+math.cos(angle)*.25*side,yy+math.sin(angle)*.25*side,.89+h*.75)
            b.face('hub_leaf' if i%3 else 'hub_leaf_lime',[(xx-.035,yy,.88+h*.40),(tip[0]-.055*math.sin(angle),tip[1]+.055*math.cos(angle),tip[2]),(xx+.035,yy,.88+h),(tip[0]+.055*math.sin(angle),tip[1]-.055*math.cos(angle),tip[2])])
        if i%8==0:
            for a in range(5):
                a=a*math.tau/5;xx2=xx+math.cos(a)*.075;yy2=yy+math.sin(a)*.075
                b.loft('hub_pink',[(xx2,yy2,.91+h,.04,.04),(xx2,yy2,.95+h,.07,.065)],6)

def bench(x,y,width=2.0):
    for xx in [x-width*.39,x+width*.39]:
        for yy in [y-.22,y+.22]:
            b.box('hub_trim',(xx,yy,.46),(.085,.085,.61))
        b.box('hub_trim',(xx,y,.73),(.095,.63,.09))
        strip('hub_trim',(xx,y+.25,.65),(xx,y+.35,1.37),.04)
    slats('hub_wood_light',x,y,.81,width,.58,.115,.085)
    for h in [1.03,1.20,1.37]:
        b.box('hub_wood',(x,y+.29+(h-1)*.11,h),(width,.075,.115))

# Level paved forecourt and genuinely open storefront, room depth visible.
b.box('hub_concrete',(0,-.70,.09),(13.0,8.7,.18))
for x in range(26):
    for y in range(17):
        b.box('hub_terrazzo' if (x+y)%7 else 'hub_limestone',(-6.25+x*.50,-4.7+y*.50,.186),(.488,.488,.035))
b.box('hub_plaster',(0,3.22,1.80),(12,.18,3.20))
for x in [-5.92,5.92]:
    b.box('hub_plaster',(x,.62,1.8),(.16,5.2,3.2))
b.box('hub_interior',(0,.6,.255),(11.7,5.1,.12))
b.box('hub_roof',(0,.50,3.36),(12.7,6.2,.19))
b.box('hub_trim',(0,-2.61,3.30),(12.8,.13,.24))
for x in range(65):
    b.box('hub_roof',(-6.32+x*.197,.55,3.49),(.040,6.1,.035))
for xx in [-5.91,-1.50,1.50,5.91]:
    b.box('hub_teal',(xx,-1.93,1.83),(.17,.25,3.25))
    b.box('hub_limestone',(xx,-1.99,.72),(.31,.28,1.03))
b.box('hub_plaster',(0,-1.94,2.93),(11.7,.18,.80))
# The mast sign sits above the deep canopy, readable from the approaching road.
for xx in [-2.8,2.8]:
    b.box('hub_trim',(xx,-2.25,3.67),(.065,.065,.53))
b.box('hub_teal',(0,-2.30,3.95),(7.55,.12,.77))
label('header',0,-2.365,3.95,7.39,.65)

# A slim aluminum-and-timber canopy; exposed rafters, gutter and posts.
for x in [-5.7,-1.4,1.4,5.7]:
    b.box('hub_trim',(x,-3.00,1.51),(.095,.095,2.63))
    strip('hub_trim',(x,-3.00,2.58),(x,-1.97,2.85),.045)
for i in range(40):
    x=-6.15+i*.315
    b.box('hub_wood',(x,-2.65,2.78),(.14,1.63,.13))
b.face('hub_teal',[(-6.28,-3.48,2.82),(6.28,-3.48,2.82),(6.28,-1.94,3.01),(-6.28,-1.94,3.01)])
b.box('hub_teal',(0,-3.49,2.81),(12.65,.08,.31))
b.box('hub_warm_light',(0,-3.46,2.66),(12.20,.035,.026))
strip('hub_trim',(-6.2,-3.38,2.85),(6.2,-3.38,2.85),.064)
for x in [-6.15,6.15]:
    strip('hub_trim',(x,-3.32,2.85),(x,-3.32,.25),.05)

# Glazed entry with independently modeled mullions, handle and sill.
for xx,width in [(-.47,.88),(.47,.88)]:
    b.box('hub_glass',(xx,-1.975,1.40),(width,.022,2.19))
    for x in [xx-width/2,xx+width/2]:
        b.box('hub_trim',(x,-2.015,1.4),(.045,.05,2.21))
    for z in [.30,2.49]:
        b.box('hub_trim',(xx,-2.018,z),(width,.06,.045))
    b.box('hub_aluminium',(xx*.32,-2.084,1.41),(.028,.045,.38))
b.box('hub_teal',(0,-2.09,.32),(1.85,.26,.065))
label('opening',0,-2.09,2.08,1.27,.19)

# Left cafe, right meal window. Interiors remain shallow but fully geometric.
for center in [-3.72,3.72]:
    b.box('hub_teal',(center,-1.94,.72),(4.05,.16,1.0))
    for i in range(34):
        b.box('hub_wood',(center-1.96+i*.12,-2.047,.71),(.035,.03,.87))
    b.box('hub_limestone',(center,-2.12,1.24),(4.15,.62,.10))
    b.box('hub_trim',(center,-1.99,2.46),(4.12,.08,.08))
    for xx in [center-2.02,center+2.02]:
        b.box('hub_trim',(xx,-1.99,1.87),(.055,.07,1.2))
    # Side transoms leave large open serving apertures rather than black panels.
    for xx in [center-1.6,center+1.6]:
        b.box('hub_glass',(xx,-1.99,1.86),(.79,.026,1.1))
        b.box('hub_trim',(xx+(.41 if xx<center else -.41),-2.025,1.87),(.028,.04,1.14))
    b.box('hub_interior',(center,1.17,1.0),(3.95,.70,1.45))
    b.box('hub_limestone',(center,1.10,1.75),(4.06,.84,.10))
    for zz in [1.22,1.85,2.45]:
        b.box('hub_wood',(center,2.77,zz),(3.88,.58,.065))
        b.box('hub_warm_light',(center,2.56,zz-.052),(3.65,.04,.02))
        for i in range(16):
            xx=center-1.75+i*.23
            h=rng.uniform(.14,.29); material_name=f'hub_product_{i%5}'
            b.box(material_name,(xx,2.65,zz+h/2+.04),(.13,.13,h))
    for xx in [center-1.0,center+1.0]:
        strip('hub_trim',(xx,-.7,3.21),(xx,-.7,2.3),.016)
        b.loft('hub_teal',[(xx,-.7,2.25,.20,.20),(xx,-.7,2.40,.09,.09)],16)
        b.loft('hub_warm_light',[(xx,-.7,2.242,.175,.175),(xx,-.7,2.255,.175,.175)],16)
label('coffee',-3.72,-3.537,2.81,2.5,.22)
label('rice',3.72,-3.537,2.81,2.5,.22)

# Counter dressing: espresso machine, grinder, cups, steam trays, crates.
b.box('hub_aluminium',(-4.45,1.06,2.04),(1.05,.49,.47))
b.box('hub_black',(-4.45,.807,1.97),(.97,.025,.24))
for x in [-4.7,-4.45,-4.2]:
    strip('hub_aluminium',(x,.75,2.0),(x,.64,1.96),.024)
    b.loft('hub_plaster',[(x,.64,1.86,.06,.06),(x,.64,1.95,.067,.067)],12)
b.loft('hub_black',[(-3.53,1.12,1.81,.11,.11),(-3.53,1.12,2.02,.11,.11)],12)
b.loft('hub_glass',[(-3.53,1.12,2.02,.15,.15),(-3.53,1.12,2.29,.15,.15)],16)
for x in [2.4,3.1,3.8,4.5]:
    b.box('hub_aluminium',(x,.90,1.85),(.58,.48,.12))
    b.box('hub_product_1',(x,.90,1.927),(.49,.39,.035))
    strip('hub_aluminium',(x+.1,.65,1.95),(x+.24,.45,2.07),.015)
label('menu',5.37,-2.02,1.92,.50,.66)

# Community notice board; canopy glazing keeps posters readable after rain.
b.box('hub_wood',(-5.90,-3.74,1.57),(1.14,.11,1.12))
label('jobs',-5.90,-3.805,1.57,1.02,.95)
for xx in [-6.40,-5.40]:
    b.box('hub_trim',(xx,-3.70,.85),(.055,.075,1.38))
b.box('hub_teal',(-5.90,-3.75,2.2),(1.25,.35,.06))

# Delivery rack, visible parcels and numbered slots, sheltered at the front.
rx,ry=3.95,-3.83
for xx in [rx-.90,rx+.90]:
    for yy in [ry-.30,ry+.30]:
        b.box('hub_trim',(xx,yy,.9),(.055,.055,1.45))
for z in [.33,.79,1.24]:
    b.box('hub_aluminium',(rx,ry,z),(1.87,.69,.038))
    b.box('hub_teal',(rx,ry-.345,z+.075),(1.87,.033,.14))
    for i in range(4):
        xx=rx-.70+i*.465;h=.19+(i%2)*.06
        b.box('hub_product_1',(xx,ry,z+.04+h/2),(.30,.31,h))
        b.box('hub_plaster',(xx,ry-.163,z+.07+h/2),(.17,.007,.08))
        strip('hub_wood',(xx-.065,ry,z+h+.04),(xx,ry,z+h+.11),.008)
        strip('hub_wood',(xx+.065,ry,z+h+.04),(xx,ry,z+h+.11),.008)
b.box('hub_teal',(rx,ry,1.65),(1.94,.75,.055))
label('rack',rx,ry-.39,1.50,1.79,.20)

bench(-3.4,-4.06,2.25)
planter(-.90,-4.30,1.17)
planter(5.57,-4.17,1.60)
planter(6.10,.90,1.55)
label('supply',-3.8,-2.035,.75,2.75,.37)
label('return',3.8,-2.035,.77,2.75,.37)

# A-board with folded metal legs and shallow bevelled sign frame.
for side in [-1,1]:
    for xx in [.48,1.30]:
        strip('hub_aluminium',(xx,-4.6+side*.33,.20),(xx,-4.6,1.38),.027)
b.box('hub_teal',(.89,-4.755,.91),(.90,.08,.87))
label('board',.89,-4.801,.91,.83,.80)

def wheel(x,y,z,r=.265):
    # Cross section torus, tread blocks, hub and 12 separate metal spokes.
    major=r-.055
    for i in range(32):
        a=i*math.tau/32;c=(i+1)*math.tau/32
        for j in range(8):
            aa=j*math.tau/8;cc=(j+1)*math.tau/8
            def q(t,u):return (x+math.cos(t)*(major+.055*math.cos(u)),y+.055*math.sin(u),z+math.sin(t)*(major+.055*math.cos(u)))
            b.face('hub_black',[q(a,aa),q(c,aa),q(c,cc),q(a,cc)])
    strip('hub_aluminium',(x,y-.10,z),(x,y+.10,z),.07)
    for i in range(12):
        a=i*math.tau/12
        strip('hub_aluminium',(x,y-.057,z),(x+math.cos(a)*(r-.09),y-.045,z+math.sin(a)*(r-.09)),.009)

def scooter(x,y,body):
    for xx in [x-.63,x+.66]:wheel(xx,y,.49)
    b.loft(body,[(x-.02,y,.51,.59,.18),(x-.02,y,.64,.65,.22),(x-.08,y,.79,.39,.20)],24,power=.62)
    b.loft('hub_black',[(x-.22,y,.77,.36,.18),(x-.20,y,.86,.37,.18),(x-.17,y,.91,.28,.16)],24,power=.6)
    strip('hub_aluminium',(x+.66,y,.49),(x+.35,y,1.13),.041)
    b.loft(body,[(x+.39,y,.73,.12,.21),(x+.42,y,.99,.17,.23),(x+.35,y,1.21,.085,.20)],16)
    strip('hub_trim',(x+.32,y,1.10),(x+.27,y,1.33),.036)
    strip('hub_trim',(x+.27,y-.36,1.33),(x+.27,y+.36,1.33),.027)
    for side in [-1,1]:
        strip('hub_black',(x+.27,y+side*.27,1.33),(x+.27,y+side*.41,1.33),.04)
        strip('hub_trim',(x+.30,y+side*.27,1.33),(x+.33,y+side*.36,1.53),.012)
        b.loft('hub_aluminium',[(x+.33,y+side*.36,1.51,.08,.05),(x+.33,y+side*.36,1.56,.08,.05)],12)
    b.box('hub_cool_light',(x+.54,y,1.05),(.035,.24,.065))
    b.box('hub_teal',(x-.58,y,.94),(.45,.47,.44))
    b.box('hub_trim',(x-.58,y,1.16),(.48,.49,.035))
    b.box('hub_product_1',(x-.805,y,1.0),(.016,.30,.16))
    strip('hub_aluminium',(x-.12,y,.60),(x-.13,y-.23,.19),.021)

scooter(-3.45,4.38,'hub_bike_cream')
scooter(-1.35,4.38,'hub_bike_teal')
# Utility side (back of shop) includes parked scooters without blocking front.
for x in [-4.5,-2.35,-.25]:
    strip('hub_trim',(x,4.19,.20),(x,4.19,.74),.037)
    strip('hub_trim',(x,4.19,.74),(x+.48,4.19,.74),.037)
    strip('hub_trim',(x+.48,4.19,.74),(x+.48,4.19,.20),.037)
for x in [3.2,4.6]:
    b.box('hub_concrete',(x,1.62,3.81),(1.17,.82,.59))
    for z in range(10):
        b.box('hub_aluminium',(x,1.191,3.57+z*.048),(1.02,.024,.021))
    b.loft('hub_black',[(x,1.62,4.12,.26,.26),(x,1.62,4.14,.26,.26)],24)
    for i in range(9):
        a=i*math.tau/9
        strip('hub_aluminium',(x-.29*math.cos(a),1.62-.29*math.sin(a),4.15),(x+.29*math.cos(a),1.62+.29*math.sin(a),4.15),.011)
for x in [-4.7,-3.4,-2.1]:
    b.box('hub_trim',(x,1.5,3.75),(1.1,1.83,.08))
    b.box('hub_glass',(x,1.5,3.80),(1.01,1.74,.04))
    for j in range(6):
        b.box('hub_aluminium',(x,1.5-.73+j*.29,3.826),(1.02,.013,.012))

objects = b.finish('life_hub')
# Bevels catch the grazing sun. Two segments preserve the small fabrication
# details without turning each flat slat into high subdivision geometry.
for ob in objects:
    if not any(s in ob.name for s in ['glass','signs','leaf','pink','light']):
        bevel = ob.modifiers.new('Manufactured edge radius','BEVEL')
        bevel.width = .009
        bevel.segments = 2
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = .60
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    ob.data.update()

report = export('life-hub',objects)
positions=[v.co for ob in objects for v in ob.data.vertices]
bounds=[min(p.x for p in positions),min(p.y for p in positions),max(p.x for p in positions),max(p.y for p in positions)]
report.update({'schemaVersion':1,'design':'Original fictional Shenzhen everyday-life stop','entrance':'local south / runtime negative Z','bounds':bounds, 'height':max(p.z for p in positions),'interactions':{'entry':[0,-4.35],'delivery':[3.95,-4.45],'rest':[-3.65,-3.3]},'sources':'Original model and original sign artwork; system font rasterized, no font redistributed.'})
(R/'public/city/life-hub.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(ART/'build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

# Native file retains material and geometry. The review render is only the
# asset inspection image, not a claim about the browser's final city rendering.
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'life-hub.blend'))
bpy.ops.object.camera_add(location=(13,-20,11))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.4))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=19
bpy.context.scene.camera=camera
world=bpy.data.worlds.new('Hub studio')
world.use_nodes=True;background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.40,.48,.57,1)
background.inputs[1].default_value=.45
bpy.context.scene.world=world
for loc,power,size,color in [((2,-8,13),2100,9,(1,.83,.65)),((-8,0,7),1600,8,(.70,.84,1)),((3,8,10),2000,7,(1,.84,.67))]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.data.color=color
    light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ART/'asset-review.png')
scene.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
print(json.dumps(report,ensure_ascii=False),flush=True)
