"""Original Maison Lune cafe and three adult staff, authored in Blender.

Incremental: writes only bamboo-cafe assets and its editable .blend source.
Run: .venv/bin/python scripts/build_bamboo_cafe.py
The interior uses the existing game pedestrian/life-hub scale; the geographic
site uses the city's established east/north frame. No real shop is implied.
"""
from pathlib import Path
import sys, math, random, json, hashlib

R = Path(__file__).resolve().parents[1]
OUT = R / 'public/city/bamboo-cafe'
ART = R / 'artifacts/city/bamboo-cafe'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
SPEC = json.loads((R/'data/locations/bamboo-cafe.json').read_text())


def artwork():
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np
    rng = np.random.default_rng(9024)
    size = 1024
    yy, xx = np.mgrid[0:size, 0:size]/size
    # Authored tileable grain / veins, not a photograph or generated image.
    grain = np.sin(xx*math.tau*19 + np.sin(yy*math.tau)*1.2 + np.sin(yy*math.tau*5)*.4)
    fine = np.sin(xx*math.tau*109 + np.sin(yy*math.tau*3)*2)
    tone = .90 + .075*grain + .022*fine + rng.normal(0,.008,(size,size))
    rgb = np.stack([tone*110,tone*65,tone*39], axis=-1).clip(0,255).astype('uint8')
    Image.fromarray(rgb).save(OUT/'walnut.jpg',quality=92)
    field = xx*7 + yy*4 + .10*np.sin(yy*math.tau*3) + .16*np.sin(xx*math.tau*2)
    vein = np.exp(-np.abs(np.sin(field*math.pi))*70)
    small = np.exp(-np.abs(np.sin((field*2.13+xx*.6)*math.pi))*130)*.23
    shade = vein*.20 + small*.09 + rng.normal(0,.003,(size,size))
    rgb = np.stack([235-shade*220,232-shade*230,220-shade*200],axis=-1).clip(0,255).astype('uint8')
    Image.fromarray(rgb).save(OUT/'marble.jpg',quality=93)
    atlas = Image.new('RGB',(2048,1024),(236,225,204))
    draw = ImageDraw.Draw(atlas)
    font_cn = '/System/Library/Fonts/Supplemental/Songti.ttc'
    if not Path(font_cn).exists(): font_cn='/System/Library/Fonts/STHeiti Medium.ttc'
    font_en = '/System/Library/Fonts/Supplemental/Times New Roman.ttf'
    if not Path(font_en).exists(): font_en=font_cn
    def text(s,rect,size,color=(75,54,36),latin=False):
        x,y,w,h=rect
        font=ImageFont.truetype(font_en if latin else font_cn,size)
        box=draw.textbbox((0,0),s,font=font)
        draw.text((x+(w-box[2]+box[0])/2-box[0],y+(h-box[3]+box[1])/2-box[1]),s,font=font,fill=color)
    draw.rectangle((16,16,2032,340),fill=(28,48,43))
    text('月 白  ·  女 仆 咖 啡 馆',(28,24,1990,205),128,(237,214,159))
    text('M A I S O N   L U N E',(30,238,1988,84),64,(230,215,182),True)
    text('月 白',(20,384,490,180),103)
    text('COFFEE & PATISSERIE',(20,568,490,58),28,latin=True)
    text('慢 慢 喝 一 杯',(20,648,490,88),43)
    for i,s in enumerate(['MENU / 今日精选','海盐拿铁     32','手冲咖啡     38','草莓千层     46','香草可露丽   24','午后茶双人   128']):
        text(s,(554,392+i*87,640,72),40 if i else 48)
    text('MAISON LUNE',(1260,400,754,110),54,latin=True)
    text('COFFEE · TEA · DESSERT',(1260,520,754,65),26,latin=True)
    text('OPEN  10:00 — 23:00',(1260,614,754,65),32,latin=True)
    text('把这一刻，留给自己。',(1260,732,754,110),43)
    for x in [542,1228]: draw.line((x,380,x,994),fill=(176,145,92),width=3)
    atlas.save(OUT/'lettering.png',optimize=True)


try:
    import bpy
except ImportError:
    import subprocess
    artwork()
    subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','--background','--factory-startup','--python-exit-code','1','--python',str(Path(__file__).resolve())],check=True)
    subprocess.run(['node',str(R/'scripts/optimize_bamboo_cafe.mjs')],check=True)
    raise SystemExit

sys.path.insert(0,str(R/'scripts'))
from city_mesh import B, M, material
from mathutils import Vector

random.seed(240909)
batch = B()
objects=[]
COLLIDERS=[]
group='shell'


def mat(name,c,rough=.5,metal=0,emit=0,texture=None):
    name='cafe_'+name
    m=material(name,c,rough,metal,emit)
    if texture:
        p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/texture),check_existing=True)
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    return name

ivory=mat('ivory',(.82,.77,.65),.65)
plaster=mat('plaster',(.65,.59,.48),.8)
wood=mat('walnut',(1,1,1),.36,texture='walnut.jpg')
wood2=mat('walnut_light',(.23,.105,.045),.43)
marble=mat('marble',(1,1,1),.27,texture='marble.jpg')
gold=mat('brass',(.65,.39,.13),.26,.82)
dark=mat('ink',(.018,.028,.027),.4)
green=mat('velvet_emerald',(.032,.13,.102),.85)
rose=mat('velvet_rose',(.29,.083,.108),.86)
linen=mat('linen',(.83,.78,.66),.84)
white=mat('porcelain',(.90,.87,.78),.19)
chrome=mat('chrome',(.65,.69,.67),.18,.94)
lamp=mat('warm_fixture',(1,.73,.40),.3,0,3)
glass=mat('glass',(.58,.72,.69),.14,.0)
gp=next(n for n in M[glass].node_tree.nodes if n.type=='BSDF_PRINCIPLED');gp.inputs['Alpha'].default_value=.14;gp.inputs['IOR'].default_value=1.46;M[glass].surface_render_method='DITHERED'
labelmat=mat('lettering',(1,1,1),.58,texture='lettering.png')
skin=mat('skin',(.72,.45,.34),.54)
blush=mat('lip',(.40,.085,.09),.43)
hair=mat('hair_espresso',(.037,.017,.012),.32)
hair2=mat('hair_chestnut',(.115,.040,.019),.35)
uniform=mat('uniform_midnight',(.018,.024,.042),.66)
apron=mat('apron',(.88,.84,.74),.72)
iris=mat('iris',(.20,.11,.036),.32)
leaf=mat('leaf',(.027,.16,.064),.8)
berry=mat('strawberry',(.54,.023,.036),.38)
pastry=mat('pastry',(.56,.265,.072),.54)
cream=mat('cream',(.94,.80,.59),.68)
coffee=mat('coffee',(.056,.018,.007),.20)


def register(ob,m,smooth=False):
    ob.data.materials.clear();ob.data.materials.append(M[m])
    ob['cafe_group']=group
    if smooth:
        for p in ob.data.polygons:p.use_smooth=True
    objects.append(ob)
    return ob


def box(m,p,s,bevel=0,angle=0):
    if not bevel and angle==0:
        batch.box(m,p,s);return
    bpy.ops.mesh.primitive_cube_add(size=1,location=p,rotation=(0,0,angle))
    ob=bpy.context.object;ob.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=ob.modifiers.new('Crafted soft edge','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return register(ob,m)


def ellipsoid(m,p,r,n=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=n,ring_count=rings,radius=1,location=p)
    ob=bpy.context.object;ob.scale=r
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return register(ob,m,True)


def tube(m,a,b,r,n=12,r2=None): batch.tube(m,a,b,r,n,r2)
def loft(m,rings,n=32,power=1):
    # Turned ceramics and organic surfaces need shared smooth normals. The
    # city batch intentionally uses hard faces, unsuitable at arm's length.
    local=B();local.loft(m,rings,n,power)
    result=local.finish('turned detail',smooth=True)
    for ob in result:ob['cafe_group']=group;objects.append(ob)
    return result[0]


def line(m,points,r=.012,closed=False,res=2):
    curve=bpy.data.curves.new('hand-shaped trim','CURVE');curve.dimensions='3D';curve.resolution_u=2
    curve.bevel_depth=r;curve.bevel_resolution=res
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for v,p in zip(spline.points,points):v.co=(*p,1)
    spline.use_cyclic_u=closed
    ob=bpy.data.objects.new('curved detail',curve);bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False)
    return register(ob,m,True)


def ring(m,x,y,z,r,thick=.012,n=40):
    line(m,[(x+math.cos(i*math.tau/n)*r,y+math.sin(i*math.tau/n)*r,z)for i in range(n)],thick,True)


def flush(name):
    global batch
    for ob in batch.finish(name,smooth=group.startswith('staff_')):ob['cafe_group']=group;objects.append(ob)
    batch=B()


def label(region,p,w,h):
    x,y,z=p;u,v,ww,hh=region
    batch.face(labelmat,[(x-w/2,y,z-h/2),(x+w/2,y,z-h/2),(x+w/2,y,z+h/2),(x-w/2,y,z+h/2)],[(u/2048,1-(v+hh)/1024),((u+ww)/2048,1-(v+hh)/1024),((u+ww)/2048,1-v/1024),(u/2048,1-v/1024)])


def arch(m,cx,y,bottom,shoulder,r,thick=.035):
    pts=[(cx-r,y,bottom),(cx-r,y,shoulder)]
    pts += [(cx+math.cos(math.pi-i*math.pi/32)*r,y,shoulder+math.sin(math.pi-i*math.pi/32)*r) for i in range(33)]
    pts += [(cx+r,y,bottom)]
    line(m,pts,thick)


def rect_frame(m,cx,y,cz,w,h,r=.018):
    line(m,[(cx-w/2,y,cz-h/2),(cx+w/2,y,cz-h/2),(cx+w/2,y,cz+h/2),(cx-w/2,y,cz+h/2)],r,True)


def obstacle(x,y,w,d):COLLIDERS.append({'x':x,'z':y,'width':w,'depth':d})


def plant(x,y,z=0,scale=1):
    loft(marble,[(x,y,z,.27*scale,.27*scale),(x,y,z+.52*scale,.36*scale,.36*scale)],24)
    ring(gold,x,y,z+.51*scale,.355*scale,.012)
    for i in range(13):
        a=i*2.399;h=(.45+random.random()*.8)*scale;rad=(.28+random.random()*.20)*scale
        start=(x,y,z+.48*scale);tip=(x+math.cos(a)*rad,y+math.sin(a)*rad,z+.55*scale+h)
        line(leaf,[start,((start[0]+tip[0])/2,(start[1]+tip[1])/2,tip[2]-.2),tip],.012*scale)
        ob=ellipsoid(leaf,tip,(.10*scale,.035*scale,.29*scale),12,7);ob.rotation_euler=(.4*math.cos(a),.7*math.sin(a),a)


def cup(x,y,z,angle=0):
    loft(white,[(x,y,z,.075,.075),(x,y,z+.02,.11,.11),(x,y,z+.135,.125,.125),(x,y,z+.14,.118,.118),(x,y,z+.03,.064,.064)],24)
    ring(gold,x,y,z+.141,.12,.003,28)
    loft(coffee,[(x,y,z+.123,.108,.108),(x,y,z+.124,.108,.108)],24)
    # Rosetta latte art: a tapered sequence of cream leaves.
    for i in range(5):
        yy=y-.049+i*.021;rr=.041*(1-i*.13)
        ellipsoid(cream,(x,yy,z+.125),(rr,.014,.0015),12,5)
    line(cream,[(x,y-.065,z+.128),(x,y+.065,z+.128)],.003,False,1)
    line(white,[(x+.12+math.sin(i*math.pi/16)*.06,y,z+.075+math.cos(i*math.pi/16)*.061)for i in range(17)],.014)
    loft(white,[(x,y,z-.018,.16,.16),(x,y,z-.003,.18,.18),(x,y,z+.005,.17,.17)],24)


def rose_vase(x,y,z):
    loft(white,[(x,y,z,.06,.06),(x,y,z+.12,.105,.105),(x,y,z+.22,.055,.055)],20)
    for i in range(3):
        a=i*2.4;xx=x+.08*math.cos(a);yy=y+.08*math.sin(a);zz=z+.36+i*.025
        tube(leaf,(x,y,z+.17),(xx,yy,zz),.008,8)
        for j in range(7):
            aj=j*2.4;ob=ellipsoid(rose,(xx+.032*math.cos(aj),yy+.032*math.sin(aj),zz+.008*j),(.034,.022,.024),10,6);ob.rotation_euler.z=aj


def chair(x,y,a=0):
    # Curved upholstered tub back, turned walnut legs and brass ferrules.
    def pt(u,v,z):return(x+u*math.cos(a)-v*math.sin(a),y+u*math.sin(a)+v*math.cos(a),z)
    for u in [-.23,.23]:
        for v in [-.22,.22]:
            tube(wood,pt(u*1.14,v*1.12,.25),pt(u,v,.70),.027,12,.04)
            tube(gold,pt(u*1.14,v*1.12,.245),pt(u*1.12,v*1.10,.33),.029,12)
    ob=ellipsoid(green,pt(0,0,.72),(.38,.35,.095),24,10);ob.rotation_euler.z=a
    # One continuous, softly padded shell, rising into a rounded tub back.
    shell=B();sections=[]
    for i in range(41):
        t=i*math.pi/40;top=1.04+.23*math.sin(t)
        sections.append([pt(math.cos(t)*r,math.sin(t)*r,z)for r,z in [(.31,.73),(.395,.73),(.405,top-.045),(.39,top),(.35,top+.015),(.308,top-.035)]])
    for j in range(40):
        for k in range(6):shell.face(green,[sections[j][k],sections[j][(k+1)%6],sections[j+1][(k+1)%6],sections[j+1][k]])
    shell.face(green,list(reversed(sections[0])));shell.face(green,sections[-1])
    for ob in shell.finish('tailored velvet chair',smooth=True):ob['cafe_group']=group;objects.append(ob)
    line(gold,[pt(math.cos(i*math.pi/40)*.36,math.sin(i*math.pi/40)*.36,1.057+.23*math.sin(i*math.pi/40))for i in range(41)],.005)
    obstacle(x,y,.78,.78)


def table(x,y):
    loft(gold,[(x,y,.25,.35,.35),(x,y,.30,.35,.35),(x,y,.40,.08,.08),(x,y,.98,.055,.055)],24)
    loft(marble,[(x,y,1.00,.67,.67),(x,y,1.055,.67,.67),(x,y,1.065,.65,.65)],48)
    ring(gold,x,y,1.013,.675,.01)
    rose_vase(x,y,1.065)
    cup(x-.25,y-.24,1.087)
    box(linen,(x+.30,y+.13,1.074),(.25,.35,.012),.015,.16)
    line(gold,[(x+.39,y+.02,1.087),(x+.39,y+.25,1.087)],.008)
    obstacle(x,y,1.36,1.36)


def pendant(x,y,z,r=.60):
    tube(gold,(x,y,z),(x,y,4.02),.018,12)
    ring(gold,x,y,z,r,.023,48)
    for i in range(12):
        a=i*math.tau/12;xx=x+r*math.cos(a);yy=y+r*math.sin(a)
        tube(gold,(x,y,z+.30),(xx,yy,z),.012,8)
        ellipsoid(lamp,(xx,yy,z-.075),(.055,.055,.15),12,8)
    loft(ivory,[(x,y,z+.31,.14,.14),(x,y,z+.47,.08,.08)],20)


# Exterior shell, open entrance and tiled forecourt.
box(plaster,(0,-2.5,.09),(19.2,19.4,.18))
box(marble,(0,-9.0,.205),(18.8,4.0,.06))
for x in range(-9,10):
    for y in [-10,-9,-8]:line(gold,[(x-.48,y-.48,.239),(x+.48,y-.48,.239)],.004,False,1)
box(wood,(0,0,.17),(17.8,13.8,.14))
box(ivory,(0,6.95,2.17),(18,.22,3.86))
for x in [-8.95,8.95]:box(ivory,(x,0,2.17),(.22,14,3.86))
# Front arches are real openings; door center is entirely unobstructed.
for cx in [-6,0,6]:
    r=2.25;shoulder=1.78
    for i in range(32):
        a=math.pi-i*math.pi/32;b=math.pi-(i+1)*math.pi/32
        x0=cx+r*math.cos(a);x1=cx+r*math.cos(b);z0=shoulder+r*.78*math.sin(a);z1=shoulder+r*.78*math.sin(b)
        batch.face(ivory,[(x0,-7.12,z0),(x1,-7.12,z1),(x1,-7.12,4.02),(x0,-7.12,4.02)])
        batch.face(ivory,[(x1,-6.88,z1),(x0,-6.88,z0),(x0,-6.88,4.02),(x1,-6.88,4.02)])
    pts=[(cx-r,-7.14,.26),(cx-r,-7.14,shoulder)]+[(cx+r*math.cos(math.pi-i*math.pi/40),-7.14,shoulder+r*.78*math.sin(math.pi-i*math.pi/40))for i in range(41)]+[(cx+r,-7.14,.26)]
    line(gold,pts,.033)
    if cx:
        batch.face(glass,[(cx-r,-7,.3),(cx+r,-7,.3),(cx+r,-7,shoulder)]+[(cx+r*math.cos(i*math.pi/32),-7,shoulder+r*.78*math.sin(i*math.pi/32))for i in range(33)])
        for xx in [cx-.75,cx+.75]:box(gold,(xx,-7,1.86),(.03,.06,3.12))
        obstacle(cx,-7,4.5,.3)
for x in [-8.68,-3,3,8.68]:
    box(ivory,(x,-7,2.03),(.62,.42,3.64),.035)
    for dx in [-.17,-.085,0,.085,.17]:tube(plaster,(x+dx,-7.23,.5),(x+dx,-7.23,3.45),.024,10)
    box(marble,(x,-7,.39),(.76,.62,.28),.025)
    box(ivory,(x,-7,3.81),(.80,.57,.22),.025)
    obstacle(x,-7,.8,.5)
box(ivory,(0,0,4.08),(18.5,14.5,.18),.055)
for z,w in [(3.85,18.4),(4.06,18.8),(4.22,18.9)]:
    box(ivory,(0,-7.25,z),(w,.30,.11),.02)
    box(ivory,(0,7.25,z),(w,.30,.11),.02)
box(dark,(0,-7.25,3.92),(10.4,.10,.70),.035)
label((16,16,2016,324),(0,-7.312,3.92),10.1,.65)
for x in [-7.7,7.7]:plant(x,-9.4,0,1.2)
for x in [-4.6,4.6]:
    # Outdoor bistro tables and a small fixed terrace, not scattered clutter.
    table(x,-9.15);chair(x-.95,-9.15,-math.pi/2);chair(x+.95,-9.15,math.pi/2)
# Flat accessible walk to the nearby roadside.
box(marble,(0,-16.0,.095),(3.1,12,.18))
flush('cafe_shell')

group='interior'
# Parquet blocks, alternating grain direction and restrained colour variation.
for ix in range(27):
    for iy in range(21):
        x=-8.48+ix*.65;y=-6.49+iy*.65
        for j in range(3):
            dx,dy=(j*.21-.21,0) if (ix+iy)%2 else (0,j*.21-.21)
            box(wood if (ix*13+iy+j)%5 else wood2,(x+dx,y+dy,.245),(.196,.625,.015) if (ix+iy)%2 else (.625,.196,.015))
for x in [-8.63,8.63]:box(marble,(x,0,.25),(.22,13.6,.027))
for y in [-6.63,6.63]:box(marble,(0,y,.25),(17.25,.22,.027))
# Wainscoting, inset raised panels and brass bead trim.
for x in [-8.78,8.78]:
    box(wood,(x,0,.78),(.10,13.45,1.05))
    for y in range(-6,7):
        for zz in [.37,1.17]:box(gold,(x- .065 if x>0 else x+.065,y,zz),(.014,.79,.014))
        for yy in [y-.395,y+.395]:box(gold,(x-.065 if x>0 else x+.065,yy,.77),(.014,.014,.80))
    box(gold,(x,0,1.33),(.12,13.7,.025))
# Framed wall art over the banquettes, inlaid abstract crescent motifs.
for yy in [-3.7,.1,3.5]:
    box(dark,(-8.72,yy,2.3),(.025,1.50,1.55))
    for z in [1.52,3.08]:box(gold,(-8.67,yy,z),(.04,1.57,.035))
    for y in [yy-.775,yy+.775]:box(gold,(-8.67,y,2.3),(.04,.035,1.59))
    line(gold,[(-8.64,yy+math.cos(t)*.48,2.3+math.sin(t)*.55)for t in [i*math.pi*1.58/40+.4 for i in range(41)]],.035)
# Coffered ceiling, four recesses and ribbon coves.
for x in [-8.6,0,8.6]:box(ivory,(x,0,3.83),(.22,13.7,.26),.035)
for y in [-6.7,0,6.7]:box(ivory,(0,y,3.83),(17.6,.22,.26),.035)
for x in [-4.3,4.3]:
    for y in [-3.35,3.35]:
        box(linen,(x,y,3.96),(8.10,6.18,.08))
        for xx in [x-3.9,x+3.9]:box(lamp,(xx,y,3.93),(.025,5.90,.018))
        for yy in [y-2.95,y+2.95]:box(lamp,(x,yy,3.93),(7.8,.025,.018))
for x,y in [(-4.2,-2.6),(4.2,-2.6),(0,2.0)]:pendant(x,y,3.15,.65)
# Long upholstered left banquettes with rounded cushions, piping and tufting.
for yy in [-3.65,.0,3.55]:
    box(wood,(-7.90,yy,.44),(1.38,2.7,.40),.07)
    box(rose,(-7.65,yy,.77),(1.14,2.63,.27),.12)
    box(rose,(-8.25,yy,1.13),(.24,2.65,1.12),.115)
    for y in [yy-1.05,yy-.7,yy-.35,yy,yy+.35,yy+.7,yy+1.05]:
        for z in [1.00,1.35]:ellipsoid(gold,(-8.10,y,z),(.012,.017,.017),8,6)
    line(gold,[(-8.10,yy-1.20,1.65),(-8.10,yy+1.20,1.65)],.009)
    obstacle(-7.75,yy,1.45,2.75)
    table(-6.25,yy);chair(-5.25,yy,math.pi/2)
for x,y in [(-2.9,-.4),(2.1,-3.55),(6.4,-3.50),(6.5,.3)]:
    table(x,y)
    for a in [0,math.pi]:chair(x+math.cos(a)*.98,y+math.sin(a)*.98,a+math.pi/2)
# Fluted counter, marble top, brass toe kick and inset warm plinth.
box(wood,(2.3,3.65,.82),(9.4,1.38,1.14),.08)
box(marble,(2.3,3.65,1.44),(9.60,1.58,.13),.06)
box(gold,(2.3,2.91,.42),(9.28,.026,.16))
box(lamp,(2.3,2.91,.31),(9.05,.028,.028))
for i in range(114):tube(wood2,(-2.27+i*.081,2.929,.54),(-2.27+i*.081,2.929,1.31),.025,10)
obstacle(2.3,3.65,9.6,1.58)
# Back bar with arch-shaped brass shelf frames and individual books/jars.
for cx in [-5.65,-1.85,2.0,5.85]:
    box(dark,(cx,6.72,2.12),(3.16,.08,2.84))
    arch(gold,cx,6.63,.6,2.2,1.40,.035)
    for zz in [1.08,1.72,2.35]:
        box(wood,(cx,6.22,zz),(2.86,1.04,.072),.025)
        box(lamp,(cx,6.20,zz+.043),(2.6,.022,.015))
        for j in range(7):
            xx=cx-1.14+j*.365
            if zz==1.72:
                loft(glass,[(xx,6.3,zz+.04,.10,.10),(xx,6.3,zz+.29,.10,.10),(xx,6.3,zz+.40,.042,.042),(xx,6.3,zz+.50,.042,.042)],14)
                box(gold,(xx,6.3,zz+.51),(.077,.077,.035),.01)
            else:
                box([ivory,green,rose,wood2][j%4],(xx,6.3,zz+.23),(.19,.28,.36),.012)
                box(gold,(xx,6.145,zz+.25),(.12,.009,.025))
    box(wood,(cx,6.3,.65),(3.1,1.05,.75),.035)
    for xx in [cx-.77,cx+.77]:box(gold,(xx,5.75,.75),(.16,.025,.035),.01)
for cx,zz,w,h,region in [(-5.65,2.18,1.96,1.78,(554,380,640,610)),(-1.85,2.16,1.87,1.44,(20,384,490,374))]:
    # Menu boards sit in front of the shelf plane, not behind its rails.
    box(wood,(cx,5.68,zz),(w+.08,.07,h+.08),.02)
    label(region,(cx,5.635,zz),w,h)
    for x in [cx-w/2-.015,cx+w/2+.015]:box(gold,(x,5.625,zz),(.016,.015,h+.04))
    for z in [zz-h/2-.015,zz+h/2+.015]:box(gold,(cx,5.625,z),(w+.04,.015,.016))
# Espresso machine: rounded boiler, ribbed drip tray, portafilters and gauges.
box(green,(3.0,3.75,1.84),(1.72,.80,.71),.10)
box(chrome,(3.0,3.29,1.94),(1.59,.11,.43),.035)
box(chrome,(3.0,3.25,1.535),(1.77,.53,.045),.015)
for i in range(21):box(dark,(2.22+i*.077,3.22,1.563),(.026,.36,.012))
for xx in [2.55,3.45]:
    tube(chrome,(xx,3.24,1.93),(xx,3.24,1.72),.10,20)
    tube(dark,(xx,3.19,1.79),(xx,2.98,1.75),.035,12)
    cup(xx,3.18,1.59)
    ob=ellipsoid(dark,(xx,3.20,2.08),(.085,.025,.085),20,10)
    line(gold,[(xx,3.17,2.08),(xx+.037,3.17,2.12)],.005)
line(chrome,[(3.77,3.53,1.97),(3.92,3.34,1.82),(3.89,3.21,1.59)],.022)
for xx in [2.35,2.65,2.95,3.25,3.55]:cup(xx,3.70,2.22)
loft(dark,[(4.30,3.80,1.51,.23,.23),(4.30,3.80,1.94,.17,.17)],24)
loft(glass,[(4.30,3.80,1.97,.17,.17),(4.30,3.80,2.38,.25,.25)],24)
loft(coffee,[(4.30,3.80,2.0,.16,.16),(4.30,3.80,2.27,.22,.22)],20)
# Glazed patisserie cabinet with stone base and raised dessert stands.
box(gold,(-.65,3.63,1.55),(2.6,1.05,.08),.025)
for xx in [-1.92,.62]:box(gold,(xx,3.63,1.91),(.025,1.05,.69))
for yy in [3.11,4.15]:box(glass,(-.65,yy,1.90),(2.55,.018,.65))
box(glass,(-.65,3.63,2.24),(2.58,1.08,.018))
box(gold,(-.65,3.63,2.25),(2.62,.027,.035))
for x in [-1.45,-.65,.15]:
    loft(white,[(x,3.57,1.60,.23,.23),(x,3.57,1.66,.21,.21)],24)
    if x< -1:
        for zz in [1.70,1.75,1.80,1.85]:loft(cream if zz in [1.75,1.85] else pastry,[(x,3.57,zz,.155,.155),(x,3.57,zz+.045,.155,.155)],24)
        for j in range(4):ellipsoid(berry,(x+.095*math.cos(j*math.pi/2),3.57+.095*math.sin(j*math.pi/2),1.95),(.042,.04,.065),12,7)
    elif x<0:
        for j in range(3):
            yy=3.42+j*.15
            for zz in [1.72,1.785]:ellipsoid([rose,green,cream][j],(x,yy,zz),(.115,.09,.039),16,8)
            loft(cream,[(x,yy,1.75,.11,.085),(x,yy,1.76,.11,.085)],16)
    else:
        for k in range(3):
            y=3.43+k*.15
            for j in range(9):
                t=(j/8-.5)*2.3;rr=.045+.025*math.sin(j/8*math.pi)
                ob=ellipsoid(pastry,(x+math.sin(t)*.14,y+math.cos(t)*.11,1.72),(rr,rr,.055),10,6);ob.rotation_euler.z=-t
for x in [5.15,5.65,6.15]:cup(x,3.5,1.53)
for x,y in [(-8,-5.9),(8,-5.9),(8,5.9)]:plant(x,y,.24,.95)
label((1260,384,754,520),(7.48,2.92,2.36),1.6,1.10)
flush('cafe_interior')


def bow(m,x,y,z,size=.10):
    for side in [-1,1]:
        ob=ellipsoid(m,(x+side*size*.57,y,z),(size*.68,.027,size*.43),16,8);ob.rotation_euler.y=side*.30
    ellipsoid(m,(x,y-.015,z),(.025,.028,.027),12,7)
    for side in [-1,1]:
        batch.face(m,[(x+side*.013,y,z-.014),(x+side*size*.64,y,z-size*.95),(x+side*size*.18,y,z-size*.90)])


def hand(p,m=skin):
    x,y,z=p
    ellipsoid(m,(x,y,z),(.038,.026,.065),16,8)
    for i in range(4):
        xx=x+(i-1.5)*.017
        line(m,[(xx,y,z-.034),(xx,y-.008,z-.080+(abs(i-1.5)*.008)),(xx,y-.017,z-.088+abs(i-1.5)*.008)],.009,False,2)
    line(m,[(x+.033,y,z+.007),(x+.056,y-.009,z-.018),(x+.050,y-.026,z-.034)],.011)


def person(spec,index):
    global group
    start=len(objects);group='staff_'+spec['id']
    is_jk=index==2;is_rose=index==1;cloth=uniform if not is_rose else rose;hm=hair2 if is_jk else hair
    # Adult proportions and a relaxed standing pose; no school-age character.
    for side in [-1,1]:
        x=side*.092;yy=.015 if side<0 else -.012
        loft(apron if not is_jk else uniform,[(x,yy,.11,.046,.050),(x,yy,.33,.050,.055),(x,yy,.55,.073,.064),(x,yy,.75,.080,.082)],20)
        # Sculpted leather Mary Janes: low heel, toe box and instep strap.
        ellipsoid(dark,(x,yy-.048,.095),(.062,.124,.046),24,10)
        box(dark,(x,yy+.028,.055),(.094,.070,.065),.018)
        line(cloth,[(x-.052,yy-.03,.119),(x,yy-.051,.145),(x+.052,yy-.03,.119)],.012)
        ellipsoid(gold,(x+.052,yy-.03,.12),(.009,.007,.012),10,6)
    # Skirt has modeled radial pleats and an overlapping lining hem.
    rings=[];n=72
    for z,rad in [(.58,.285),(.60,.300),(.75,.264),(.92,.214),(1.02,.164)]:
        rings.append([(math.cos(a)*rad*(1+.055*math.cos(a*24)),math.sin(a)*rad*.79*(1+.055*math.cos(a*24)),z)for a in [i*math.tau/n for i in range(n)]])
    for j in range(len(rings)-1):
        for i in range(n):batch.face(cloth,[rings[j][i],rings[j][(i+1)%n],rings[j+1][(i+1)%n],rings[j+1][i]])
    line(apron if not is_jk else gold,[(x,y,z+.014)for x,y,z in rings[0]],.009,True,1)
    if is_jk:
        # Fine plaid stripes are geometry, so the outfit remains legible nearby.
        for z,rad in [(.67,.284),(.79,.252),(.89,.225)]:
            line(rose,[(math.cos(a)*rad,math.sin(a)*rad*.79,z)for a in [i*math.tau/72 for i in range(72)]],.004,True,1)
    loft(cloth,[(0,0,.99,.165,.116),(0,0,1.10,.146,.100),(0,0,1.24,.190,.122),(0,0,1.36,.204,.105),(0,0,1.395,.14,.093)],36)
    loft(skin,[(0,0,1.39,.051,.049),(0,0,1.47,.052,.052)],24)
    # Separate white apron / shirt front with fitted side seams.
    if not is_jk:
        # Curved apron follows the skirt with a real fabric clearance; a flat
        # rectangle would disappear through the pleats in the front view.
        apron_rows=[]
        for z,rad in [(.635,.294),(.66,.286),(.76,.260),(.91,.218),(1.025,.164)]:
            apron_rows.append([(math.sin(a)*rad,-math.cos(a)*rad*.79-.019,z)for a in [-.80+i*1.60/24 for i in range(25)]])
        for j in range(4):
            for i in range(24):batch.face(apron,[apron_rows[j][i],apron_rows[j][i+1],apron_rows[j+1][i+1],apron_rows[j+1][i]])
        batch.face(apron,[(-.11,-.126,1.03),(.11,-.126,1.03),(.13,-.119,1.33),(-.13,-.119,1.33)])
        for side in [-1,1]:
            line(apron,[(side*.14,-.117,1.03),(side*.17,-.115,1.32),(side*.14,0,1.40),(side*.13,.12,1.07)],.019)
            box(apron,(side*.095,-.223,.78),(.078,.012,.078),.01)
            for j in range(15):
                t=j/14;rad=.294*(1-t)+.164*t
                ellipsoid(apron,(side*math.sin(.80)*rad,-math.cos(.80)*rad*.79-.023,.635+t*.39),(.009,.007,.013),10,6)
        for j in range(25):
            a=-.80+j*1.6/24
            ellipsoid(apron,(math.sin(a)*.294,-math.cos(a)*.294*.79-.022,.635),(.012,.007,.008),10,6)
        bow(apron,0,.129,1.035,.11)
    else:
        batch.face(apron,[(-.07,-.13,1.11),(.07,-.13,1.11),(.10,-.121,1.365),(-.10,-.121,1.365)])
        for side in [-1,1]:batch.face(cloth,[(side*.085,-.139,1.14),(side*.195,-.12,1.33),(side*.105,-.128,1.378),(side*.025,-.146,1.26)])
        for z in [1.12,1.205]:ellipsoid(gold,(0,-.151,z),(.010,.005,.011),10,6)
    # Peter Pan collar, ribbon tie and enamel name badge.
    for side in [-1,1]:
        ellipsoid(apron,(side*.054,-.096,1.382),(.059,.025,.026),16,8)
    bow(rose if is_jk else cloth,0,-.149,1.30,.069)
    box(gold,(.11,-.134,1.29),(.060,.012,.025),.005)
    # Slightly bent forearms; one employee carries a brass serving tray.
    for side in [-1,1]:
        shoulder=(side*.193,0,1.345);elbow=(side*.267,-.019,1.10)
        carrying=index==0 and side==1
        wrist=(side*.274,-.055,.93) if not carrying else (.31,-.21,1.025)
        ellipsoid(cloth,shoulder,(.090,.084,.094),20,10)
        tube(cloth,shoulder,elbow,.060,20,.047)
        tube(cloth if is_jk else skin,elbow,wrist,.042,20,.029)
        if not is_jk:
            tube(apron,(elbow[0],elbow[1],elbow[2]+.035),elbow,.052,18)
        if carrying:
            ellipsoid(skin,(.31,-.25,1.025),(.039,.065,.020),20,10)
            for j in range(4):tube(skin,(.282+j*.018,-.27,1.027),(.282+j*.018,-.326+abs(j-1.5)*.007,1.034),.008,12,.006)
            line(skin,[(.345,-.229,1.025),(.363,-.255,1.037),(.355,-.274,1.039)],.009)
        else:hand(wrist)
    if index==0:
        loft(gold,[(.31,-.29,1.05,.19,.15),(.31,-.29,1.065,.195,.155)],28)
        # A petite porcelain cup on the tray, scaled from the table service.
        loft(white,[(.30,-.29,1.067,.045,.045),(.30,-.29,1.135,.062,.062)],18)
        loft(coffee,[(.30,-.29,1.135,.052,.052),(.30,-.29,1.137,.052,.052)],18)
    # Sculpted head silhouette: shaped chin, cheeks, eye sockets and forehead.
    head=loft(skin,[(0,-.018,1.444,.023,.038),(0,-.008,1.46,.050,.064),(0,0,1.49,.074,.076),(0,0,1.54,.090,.085),(0,.008,1.60,.086,.081),(0,.011,1.656,.063,.061),(0,.010,1.676,.016,.02)],64)
    bpy.context.view_layer.objects.active=head;head.select_set(True)
    sub=head.modifiers.new('Soft sculpted facial silhouette','SUBSURF');sub.levels=2
    bpy.ops.object.modifier_apply(modifier=sub.name);head.select_set(False)
    for side in [-1,1]:
        ellipsoid(skin,(side*.088,.010,1.546),(.015,.018,.030),16,10)
        ellipsoid(gold,(side*.088,-.004,1.520),(.008,.008,.009),12,7)
        # Almond eye and sculpted upper/lower lids, pupils and catchlights.
        xx=side*.034
        ellipsoid(apron,(xx,-.073,1.570),(.023,.010,.010),28,14)
        ellipsoid(iris,(xx,-.083,1.570),(.008,.002,.009),24,12)
        ellipsoid(dark,(xx,-.085,1.570),(.0035,.001,.006),20,10)
        ellipsoid(white,(xx-.0025,-.0865,1.573),(.002,.0008,.002),12,8)
        line(hm,[(xx+math.cos(t)*.023,-.082+abs(math.cos(t))*.006,1.57+math.sin(t)*.0105)for t in [i*math.pi/20 for i in range(21)]],.0017,False,2)
        line(skin,[(xx+math.cos(t)*.023,-.080+abs(math.cos(t))*.006,1.57-math.sin(t)*.010)for t in [i*math.pi/20 for i in range(21)]],.0020,False,2)
        line(hm,[(xx-.022,-.075,1.594),(xx,-.079,1.599),(xx+.022,-.075,1.596)],.0024)
    ellipsoid(skin,(0,-.083,1.548),(.012,.016,.027),20,12)
    ellipsoid(skin,(0,-.096,1.537),(.013,.012,.010),16,10)
    line(blush,[(-.022,-.078,1.510),(-.011,-.086,1.513),(0,-.089,1.510),(.011,-.086,1.513),(.022,-.078,1.510)],.0028)
    line(blush,[(-.021,-.079,1.508),(0,-.089,1.505),(.021,-.079,1.508)],.003)
    # Fitted crown, sculpted bangs and individually tapered hair locks.
    loft(hm,[(0,.025,1.591,.091,.076),(0,.020,1.641,.078,.069),(0,.012,1.683,.040,.045),(0,.009,1.690,.006,.009)],48)
    def lock(points,width):
        a,b,c,d=[Vector(p)for p in points];rings=[]
        for j in range(19):
            t=j/18;p=(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d
            w=width*(.18+.82*math.sin(math.pi*t)**.45) if j<18 else .001
            rings.append((*p,w,w*.24))
        loft(hm,rings,10)
    # Broad tapered locks, not cylindrical cables; very fine glints describe
    # individual strands while the continuous rear shell hides scalp gaps.
    rear=B();slices=[]
    for j in range(7):
        z=[1.385,1.42,1.49,1.57,1.63,1.67,1.688][j];r=[.086,.097,.102,.100,.080,.050,.012][j]
        slices.append([(math.cos(t)*r,.018+math.sin(t)*r*.85,z)for t in [i*math.pi/40 for i in range(41)]])
    for j in range(6):
        for i in range(40):rear.face(hm,[slices[j][i],slices[j][i+1],slices[j+1][i+1],slices[j+1][i]])
    for ob in rear.finish('smooth bob hair',smooth=True):ob['cafe_group']=group;objects.append(ob)
    for i in range(10):
        t=i/9;xx=-.079+t*.158
        lock([(xx*.45,-.023,1.681),(xx*.82,-.065,1.664),(xx+.004,-.086,1.624),(xx-.005,-.083,1.603+.013*math.sin(t*math.pi))],.014)
    for side in [-1,1]:
        for j in range(5):
            y=-.014+j*.025;xx=side*(.086+.007*math.sin(j))
            lock([(side*.068,y,1.66),(xx,y,1.56),(side*.099,y+.008,1.42 if index!=2 else 1.47),(side*.082,y+.018,1.385 if index!=2 else 1.445)],.013)
    if not is_jk:
        # Lace maid headpiece, scallops, side ribbons.
        line(apron,[(math.cos(t)*.099,0,1.58+math.sin(t)*.13)for t in [i*math.pi/24 for i in range(25)]],.018)
        for i in range(13):
            t=i*math.pi/12;ellipsoid(apron,(math.cos(t)*.102,0,1.585+math.sin(t)*.142),(.015,.022,.014),12,7)
        for side in [-1,1]:bow(cloth,side*.10,-.008,1.58,.034)
    else:
        ellipsoid(hm,(0,.115,1.47),(.085,.064,.19),24,14)
        bow(rose,0,.15,1.61,.044)
    flush(group)
    # Welded/softened body normals; faces and garments remain separate materials.
    root=bpy.data.objects.new(group,None);bpy.context.collection.objects.link(root)
    for ob in objects[start:]:ob.parent=root
    root.location=(spec['position'][0],spec['position'][1],.245);root.rotation_euler.z=spec['heading']
    root['adultAge']=spec['age'];root['characterName']=spec['name'];root['role']=spec['role']
    for frame,angle in [(1,-.006),(65,.008),(129,-.006)]:
        root.rotation_euler.y=angle;root.keyframe_insert(data_path='rotation_euler',frame=frame,index=1)
    return root


staff_roots=[person(s,i)for i,s in enumerate(SPEC['staff'])]

# Consolidate by material and ownership, preserving the editable source first.
bpy.ops.object.select_all(action='DESELECT')
for ob in objects:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
for ob in objects:
    if 'staff_' in ob.get('cafe_group',''):
        for poly in ob.data.polygons:poly.use_smooth=True

# Native source retains individual construction objects and authored animation.
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=129;scene.render.fps=24
scene.world.color=(.22,.22,.22)
from bamboo_cafe_studio import setup as setup_studio
setup_studio()
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'maison-lune.blend'))

def consolidate(part):
    groups={}
    for ob in list(bpy.context.scene.objects):
        if ob.type!='MESH' or ob.get('cafe_group') not in part:continue
        key=(ob.get('cafe_group'),ob.data.materials[0].name)
        groups.setdefault(key,[]).append(ob)
    result=[]
    for (g,m),obs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in obs:ob.select_set(True)
        bpy.context.view_layer.objects.active=obs[0]
        if len(obs)>1:bpy.ops.object.join()
        ob=bpy.context.object;ob.name=g+'_'+m
        # Recalculate normals; do not remove UV boundaries or material roles.
        result.append(ob)
    return result

reports=[]
for name,parts in [('exterior',{'shell'}),('interior',{'interior',*['staff_'+s['id']for s in SPEC['staff']]})]:
    meshes=consolidate(parts)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in meshes:ob.select_set(True)
    if name=='interior':
        for root in staff_roots:root.select_set(True)
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=name=='interior',export_cameras=False,export_lights=False,export_materials='EXPORT',export_extras=True)
    reports.append({'id':name,'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':sum(sum(len(p.vertices)-2 for p in ob.data.polygons)for ob in meshes),'meshes':len(meshes),'materials':len({slot.name for ob in meshes for slot in ob.data.materials})})

manifest={'schemaVersion':1,'spec':SPEC,'models':reports,'colliders':COLLIDERS,'lighting':{'interiorPoints':[[-4.2,-2.6,3.0],[4.2,-2.6,3.0],[0,2,3.2],[2.5,5.8,2.8]],'fixtureEmission':2.4},'provenance':{'creator':'Original Blender-authored geometry for 深城纪','realBusiness':False,'allStaffAdults':True,'textures':'Original procedural grain, marble and typeset lettering; no external photographs','source':'scripts/build_bamboo_cafe.py','editableBlend':'artifacts/city/bamboo-cafe/maison-lune.blend','geometryScope':'complete exterior, walkable furnished cafe, three stylized adult staff','budgetException':'Hero enterable interior and staff, distance-gated; not the 25k landmark exterior budget'}}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(ART/'build-report.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('CAFE_BUILD '+json.dumps(reports))
