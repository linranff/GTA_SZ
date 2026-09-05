"""Authored modular Shenzhen-inspired street, apartment and articulated character.
Run with Blender. Every visible building has an assembled facade and shopfront.
All assets/materials are original; maps are made by make_game_textures.py.
"""
import bpy, bmesh, math, random, json
from mathutils import Vector
from pathlib import Path
from collections import defaultdict

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; TEX=OUT/'textures'
(ROOT/'artifacts/game').mkdir(parents=True,exist_ok=True)
rng=random.Random(28)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
M={}

def material(name,color,rough=.75,metal=0,texture=None,emission=0):
    scanned={'plaster':'plastered_wall_05','paint':'plastered_wall_05','wood':'wood_table_001'}.get(name)
    if scanned and name!='paint' and (TEX/'polyhaven'/f'{scanned}_diff.jpg').exists():texture=f'polyhaven/{scanned}_diff.jpg'
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if texture:
        t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(str(TEX/texture))
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        if emission: m.node_tree.links.new(t.outputs['Color'],p.inputs['Emission Color'])
    elif emission: p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=emission
    if scanned and (TEX/'polyhaven'/f'{scanned}_nor_gl.jpg').exists():
        normal=m.node_tree.nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(TEX/'polyhaven'/f'{scanned}_nor_gl.jpg'));normal.image.colorspace_settings.name='Non-Color'
        convert=m.node_tree.nodes.new('ShaderNodeNormalMap');convert.inputs['Strength'].default_value=.48
        m.node_tree.links.new(normal.outputs['Color'],convert.inputs['Color']);m.node_tree.links.new(convert.outputs['Normal'],p.inputs['Normal'])
        roughmap=m.node_tree.nodes.new('ShaderNodeTexImage');roughmap.image=bpy.data.images.load(str(TEX/'polyhaven'/f'{scanned}_rough.jpg'));roughmap.image.colorspace_settings.name='Non-Color'
        m.node_tree.links.new(roughmap.outputs['Color'],p.inputs['Roughness'])
    M[name]=m
    return m

material('ceramic',(.67,.69,.64),texture='ceramic.jpg')
material('warmwall',(.73,.66,.57),texture='ceramic-warm.jpg')
material('plaster',(.7,.68,.61),texture='plaster.jpg')
material('paint',(.77,.75,.68),.94)
material('road',(.3,.32,.32),texture='asphalt.jpg')
material('paving',(.57,.55,.49),texture='paving.jpg')
material('wood',(.4,.24,.11),texture='wood.jpg')
material('trim',(.44,.47,.44),.6)
material('steel',(.16,.2,.2),.4,.65)
material('aluminium',(.58,.61,.58),.35,.75)
material('glass',(.10,.20,.22),.23,.25)
material('warmglass',(.47,.33,.16),.45,emission=.3)
material('curtain',(.56,.53,.43),.95)
material('white',(.80,.79,.70),.67)
material('rubber',(.029,.035,.034),.95)
material('red',(.43,.095,.048),.6)
material('green',(.09,.24,.15),.7)
material('leaf',(.13,.24,.075),.88)
material('leaflight',(.25,.34,.10),.9)
material('bark',(.23,.18,.12),1)
material('clay',(.38,.20,.12),.85)
material('yellow',(.64,.46,.13),.85)
material('lamp',(.94,.70,.32),.6,emission=2.0)
material('skin',(.50,.31,.20),.88)
material('shirt',(.095,.13,.14),.94)
material('pants',(.055,.075,.087),.95)
material('hair',(.035,.025,.018),.99)
material('bag',(.18,.18,.135),.94)
material('linen',(.65,.64,.57),1)
material('terracotta',(.51,.25,.16),1)
material('blue',(.20,.35,.45),.84)
material('windowpane',(.63,.75,.74),.17)
M['windowpane'].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.13
M['windowpane'].surface_render_method='DITHERED'
for name in ['food','store','used','work','home','laundry']:
    material('sign-'+name,(1,1,1),.7,texture='sign-'+name+'.png',emission=.14)

class Builder:
    def __init__(self): self.groups=defaultdict(lambda: [[],[],[]]); self.frame=(0,0,0)
    def pt(self,p):
        x,y,z=p; bx,by,a=self.frame
        return (bx+x*math.cos(a)-y*math.sin(a),by+x*math.sin(a)+y*math.cos(a),z)
    def quad(self,mat,points,uv=None):
        v,f,u=self.groups[mat]; n=len(v); v.extend([self.pt(p) for p in points]); f.append(tuple(range(n,n+len(points))))
        if uv is None:
            normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]))
            drop=max(range(3),key=lambda i:abs(normal[i])); axes=[i for i in range(3) if i!=drop]
            uv=[(p[axes[0]]*.6,p[axes[1]]*.6) for p in points]
        u.extend(uv)
    def box(self,mat,pos,size):
        x,y,z=pos; a,b,c=[s/2 for s in size]
        q=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for inds in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]: self.quad(mat,[q[i] for i in inds])
    def tube(self,mat,a,b,r,sides=8,r2=None):
        a,b=Vector(a),Vector(b); direction=(b-a).normalized(); helper=Vector((0,0,1)) if abs(direction.z)<.9 else Vector((1,0,0))
        u=direction.cross(helper).normalized(); v=direction.cross(u); r2=r if r2 is None else r2
        rings=[[tuple(p+rad*(math.cos(i*2*math.pi/sides)*u+math.sin(i*2*math.pi/sides)*v)) for i in range(sides)] for p,rad in [(a,r),(b,r2)]]
        for i in range(sides): self.quad(mat,[rings[0][i],rings[0][(i+1)%sides],rings[1][(i+1)%sides],rings[1][i]])
        if mat not in ['skin','pants']:
            self.quad(mat,list(reversed(rings[0]))); self.quad(mat,rings[1])
    def loft(self,mat,rings,segments=24,power=1.0):
        rows=[]
        for x,y,z,rx,ry in rings:
            row=[]
            for i in range(segments):
                a=i*math.tau/segments;cx,cy=math.cos(a),math.sin(a)
                row.append((x+math.copysign(abs(cx)**power,cx)*rx,y+math.copysign(abs(cy)**power,cy)*ry,z))
            rows.append(row)
        for j in range(len(rows)-1):
            for i in range(segments):self.quad(mat,[rows[j][i],rows[j][(i+1)%segments],rows[j+1][(i+1)%segments],rows[j+1][i]])
        self.quad(mat,list(reversed(rows[0])));self.quad(mat,rows[-1])
    def oval(self,mat,c,r,segments=14,rings=8):
        points=[]
        for j in range(rings+1):
            p=math.pi*j/rings
            points.append([(c[0]+r[0]*math.sin(p)*math.cos(i*2*math.pi/segments),c[1]+r[1]*math.sin(p)*math.sin(i*2*math.pi/segments),c[2]+r[2]*math.cos(p)) for i in range(segments)])
        for j in range(rings):
            for i in range(segments): self.quad(mat,[points[j][i],points[j+1][i],points[j+1][(i+1)%segments],points[j][(i+1)%segments]])
    def finish(self,prefix,merge=True):
        objects=[]
        for mat,(vertices,faces,uvs) in self.groups.items():
            mesh=bpy.data.meshes.new(prefix+'_'+mat); mesh.from_pydata(vertices,[],faces); mesh.update()
            ob=bpy.data.objects.new(prefix+'_'+mat,mesh); bpy.context.collection.objects.link(ob); mesh.materials.append(M[mat])
            uv=mesh.uv_layers.new(name='UVMap')
            for loop,coord in zip(uv.data,uvs): loop.uv=coord
            if mat in ['skin','hair','shirt','pants','bag','leaf','leaflight','bark','linen','terracotta'] or prefix in ['room','upgrade']:
                bm=bmesh.new();bm.from_mesh(mesh)
                bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
                if prefix in ['room','upgrade'] and mat in ['wood','steel','blue','white','trim']:
                    bm.normal_update()
                    edges=[e for e in bm.edges if len(e.link_faces)==2 and e.link_faces[0].normal.dot(e.link_faces[1].normal)<.85]
                    bmesh.ops.bevel(bm,geom=edges,offset=.009,segments=3,affect='EDGES',clamp_overlap=True)
                bm.to_mesh(mesh);bm.free();mesh.update()
                if mat in ['skin','hair','shirt','pants','bag','leaf','leaflight','bark','linen','terracotta']:
                    for p in mesh.polygons: p.use_smooth=True
            objects.append(ob)
        return objects

B=Builder()
def window(x,z,lit=False,grill=True):
    B.box('warmglass' if lit else 'glass',(x,.10,z),(1.72,.08,1.62))
    for xx in [-.9,0,.9]: B.box('aluminium',(x+xx,-.015,z),(.045,.15,1.78))
    for zz in [-.87,.87]: B.box('white',(x,-.015,z+zz),(1.88,.18,.065))
    B.box('aluminium',(x,-.05,z-.12),(1.76,.08,.035))
    B.box('trim',(x,-.15,z-.94),(2.02,.4,.13))
    B.box('curtain',(x-.61,.035,z),(.36,.03,1.60))
    if grill:
        for xx in range(9): B.box('steel',(x-.82+xx*.205,-.32,z),(.018,.025,1.68))
        for zz in [-.8,0,.8]: B.box('steel',(x,-.32,z+zz),(1.72,.025,.021))
        for xx in [-.83,.83]: B.box('steel',(x+xx,-.17,z-.8),(.03,.32,.03))

def ac(x,z):
    B.box('white',(x,-.34,z),(.81,.53,.56)); B.box('steel',(x-.11,-.615,z),(.49,.013,.43))
    for i in range(9): B.box('trim',(x+.29,-.623,z-.2+i*.05),(.16,.02,.014))
    for i in range(16):
        a=i*math.pi*2/16; b=(i+1)*math.pi*2/16
        B.tube('aluminium',(x-.11+math.cos(a)*.18,-.63,z+math.sin(a)*.18),(x-.11+math.cos(b)*.18,-.63,z+math.sin(b)*.18),.008,4)
    for dx in [-.28,.28]: B.box('steel',(x+dx,-.29,z-.33),(.035,.66,.04))

shops=['food','store','used','work','home','laundry','store','food']
for side in [-1,1,0]:
    for index,y in (enumerate(range(6,96,12)) if side else [(2,105),(3,105)]):
        B.frame=(side*8.7,y,math.pi/2 if side==-1 else -math.pi/2) if side else (-5.4 if index==2 else 5.4,y,0)
        n=5+(index%3==1); wall='ceramic' if (index+(side==1))%3 else 'warmwall'; top=4+n*2.85
        B.box(wall,(0,6,top/2),(10.5,.35,top))
        for x in [-5.2,5.2]: B.box(wall,(x,3,top/2),(.30,6,top))
        for floor in range(n):
            base=4+floor*2.85
            B.box(wall,(0,.15,base+.39),(10.5,.32,.78)); B.box(wall,(0,.15,base+2.67),(10.5,.32,.37))
            for edge in [-5.0,-1.72,1.72,5.0]: B.box(wall,(edge,.15,base+1.58),(1.62 if abs(edge)<4 else .53,.32,1.60))
            B.box('trim',(0,-.05,base),(10.7,.55,.13))
            for col,x in enumerate([-3.45,0,3.45]): window(x,base+1.61,rng.random()<.23,not(index%4==1 and floor%2))
            ac(2.08,base+1.0)
            if floor in [1,3] and index%2==0:
                B.box('paving',(-3.45,-.65,base+.50),(2.7,1.45,.15))
                for dx in range(13): B.box('steel',(-4.72+dx*.21,-1.3,base+1.05),(.025,.027,1.0))
                B.box('aluminium',(-3.45,-1.3,base+1.55),(2.65,.05,.04))
                for xx in [-4.72,-2.18]: B.box('steel',(xx,-.65,base+1.55),(.04,1.32,.04))
                B.box('clay',(-3.0,-.72,base+.73),(.38,.36,.3)); B.oval('leaf',(-3,-.72,base+1.0),(.3,.3,.32),10,5)
        B.box('white',(0,0,top+.16),(10.8,.65,.32))
        B.box(wall,(0,5.7,top+.5),(10.6,.3,1)); B.box('trim',(0,3,top),(10.5,6,.22))
        for x in [-4.95,4.95]:
            B.tube('trim',(x,-.28,.25),(x,-.28,top-.2),.065)
            for z in range(2,int(top),3): B.box('steel',(x,-.30,z),(.2,.18,.055))
        # recessed shop front, full entrance frame, display glazing and lit interior
        B.box('wood',(0,1.8,.1),(9.8,3.6,.15)); B.box('plaster',(0,2.9,1.9),(10.1,.15,3.8))
        B.box('warmglass',(0,2.75,2.5),(9.5,.05,1.5))
        for x in [-5,-2.55,2.55,5]: B.box('trim',(x,-.04,1.65),(.23,.55,3.3))
        for x in [-3.7,3.7]:
            B.box('glass',(x,.08,1.45),(2.05,.045,2.65))
            for dx in [-1.0,1.0]: B.box('aluminium',(x+dx,-.02,1.45),(.06,.1,2.75))
            B.box('aluminium',(x,-.02,1.2),(2.1,.1,.06))
        B.box('rubber',(0,-.05,.1),(2.3,1.1,.025))
        B.box('white',(0,.1,3.2),(10.5,.65,.18))
        sign=shops[index] if side==-1 else shops[(index+3)%8]
        B.box('steel',(0,-.18,3.55),(10.45,.32,.91))
        B.quad('sign-'+sign,[(-5.1,-.355,3.13),(5.1,-.355,3.13),(5.1,-.355,3.97),(-5.1,-.355,3.97)],[(0,0),(1,0),(1,1),(0,1)])
        for x in [-3.6,0,3.6]: B.box('lamp',(x,-.44,3.03),(1.7,.14,.055))
        if index%2==0:
            B.box('green' if side==-1 else 'red',(0,-.72,2.85),(10.4,1.5,.075))
            B.box('green' if side==-1 else 'red',(0,-1.42,2.69),(10.4,.05,.3))

B.frame=(0,0,0)
B.box('road',(0,48,-.15),(12.8,112,.3))
for side in [-1,1]:
    B.box('paving',(side*7.55,48,.04),(2.3,112,.18))
    for y in range(-6,104,1): B.box('trim',(side*6.37,y,.10),(.18,.985,.24))
    for y in range(0,100,12):
        B.box('steel',(side*6.10,y,.012),(.44,.8,.035))
        for j in range(9): B.box('rubber',(side*6.10,y-.34+j*.08,.034),(.37,.025,.016))
    for y in range(0,100,8): B.box('yellow',(side*5.8,y,.015),(.10,3,.008))

def stool(x,y):
    B.box('red',(x,y,.43),(.36,.36,.08))
    for dx in [-.13,.13]:
        for dy in [-.13,.13]: B.tube('red',(x+dx*1.2,y+dy*1.2,.1),(x+dx,y+dy,.43),.033,6)
def table(x,y):
    B.box('wood',(x,y,.78),(1.05,.75,.085))
    for dx in [-.42,.42]:
        for dy in [-.27,.27]: B.tube('steel',(x+dx,y+dy,.1),(x+dx,y+dy,.76),.024)
    for off in [-.23,.2]:
        B.tube('white',(x+off,y,.83),(x+off,y,.92),.11,16,r2=.15)
    for dy in [-.75,.75]: stool(x,y+dy)

def tree(x,y,scale=1):
    B.tube('bark',(x,y,.1),(x+.13,y,3.7*scale),.15*scale,10,r2=.085)
    for i in range(7):
        a=i*2.399; dx=math.cos(a)*1.2*scale; dy=math.sin(a)*1.2*scale; z=(3.3+(i%3)*.4)*scale
        B.tube('bark',(x,y,2.1*scale),(x+dx,y+dy,z),.065,7,r2=.018)
        for j in range(4):
            ox=dx+rng.uniform(-.65,.65)*scale; oy=dy+rng.uniform(-.65,.65)*scale
            cz=z+rng.uniform(0,.6)*scale
            for leaf in range(72):
                # Individually shaped leaf geometry; no spherical canopy stand-ins.
                a=rng.uniform(0,math.tau);r=rng.random()**.5
                c=Vector((x+ox+math.cos(a)*r*.92*scale,y+oy+math.sin(a)*r*.72*scale,cz+rng.uniform(-.45,.45)*scale))
                heading=rng.uniform(0,math.tau);tilt=rng.uniform(-.6,.6)
                u=Vector((math.cos(heading),math.sin(heading),tilt)).normalized()*rng.uniform(.13,.23)*scale
                v=Vector((-math.sin(heading),math.cos(heading),rng.uniform(-.2,.2)))*rng.uniform(.045,.075)*scale
                tip=c+u;end=c-u;spine=c+Vector((0,0,.016))
                mat='leaflight' if rng.random()<.27 else 'leaf'
                B.quad(mat,[tuple(end),tuple(c-v),tuple(tip),tuple(spine)])
                B.quad(mat,[tuple(tip),tuple(c+v),tuple(end),tuple(spine)])
    B.box('paving',(x,y,.2),(1.5,1.5,.35))
    B.box('bark',(x,y,.39),(1.23,1.23,.04))

def bike(x,y,a=0):
    old=B.frame; B.frame=(x,y,a)
    for yy in [-.64,.64]:
        for i in range(24):
            a1=i*math.tau/24; a2=(i+1)*math.tau/24
            B.tube('rubber',(0,yy+math.cos(a1)*.3,.43+math.sin(a1)*.3),(0,yy+math.cos(a2)*.3,.43+math.sin(a2)*.3),.035,6)
        for i in range(8):
            a1=i*math.tau/8; B.tube('aluminium',(0,yy,.43),(0,yy+math.cos(a1)*.28,.43+math.sin(a1)*.28),.005,4)
    for p,q in [((0,-.64,.43),(0,-.15,.84)),((0,-.15,.84),(0,.13,.43)),((0,.13,.43),(0,-.64,.43)),((0,-.15,.84),(0,.51,.88)),((0,.51,.88),(0,.13,.43)),((0,.51,.88),(0,.64,.43)),((0,.51,.88),(0,.48,1.1))]: B.tube('green',p,q,.027)
    B.box('rubber',(0,-.17,.93),(.22,.3,.075)); B.tube('steel',(-.29,.48,1.1),(.29,.48,1.1),.024)
    B.box('steel',(0,.63,.90),(.36,.29,.28)); B.box('rubber',(0,.63,1.045),(.32,.25,.015))
    B.frame=old

for y in [13,38,62,87]:
    tree(-7.1,y,.95); tree(7.0,y+5,1.12)
for x,y in [(-7,4),(-7,7),(7,32),(7,35)]: table(x,y)
for side in [-1,1]:
    for y in [18,20,45,47,70,72,94]: bike(side*7.5,y,side*.25)
    for y in [22,52,82]:
        x=side*6.7
        B.tube('steel',(x,y,.1),(x,y,5.3),.065,10,r2=.035)
        B.tube('steel',(x,y,5.3),(x-side*.8,y,5.45),.04)
        B.box('steel',(x-side*.8,y,5.42),(.75,.28,.12)); B.box('lamp',(x-side*.8,y,5.35),(.62,.23,.03))
    for y in [26,56,90]:
        B.box('green',(side*7.9,y,.52),(.55,.62,.86)); B.box('steel',(side*7.9,y,.99),(.6,.66,.09))

# Work trolleys and carefully labeled, strappable freight (boxes are actual parcels).
for x,y in [(5.0,7.0),(4.8,10),(-5,43)]:
    B.box('blue',(x,y,.29),(.9,1.25,.12))
    for dx in [-.34,.34]:
        for dy in [-.48,.48]: B.oval('rubber',(x+dx,y+dy,.19),(.09,.12,.12),10,6)
    for dx in [-.36,.36]: B.tube('steel',(x+dx,y+.55,.32),(x+dx,y+.55,1.13),.028)
    B.tube('steel',(x-.36,y+.55,1.13),(x+.36,y+.55,1.13),.028)
    for z in [.57,1.05]:
        B.box('wood',(x,y-.1,z),(.72,.78,.44))
        B.box('white',(x,y-.505,z),(.23,.015,.15)); B.box('yellow',(x,y-.10,z+.225),(.05,.79,.012))
street=B.finish('street')

# A separate, fully modeled apartment is loaded with a scene transition.
B=Builder(); B.frame=(0,0,0)
B.box('paving',(0,0,-.08),(4,4.5,.16))
B.box('paint',(0,0,2.95),(4.1,4.6,.13))
B.box('paint',(-2,0,1.45),(.16,4.5,2.9)); B.box('paint',(2,0,1.45),(.16,4.5,2.9))
B.box('paint',(0,2.25,.50),(4,.16,1.0)); B.box('paint',(0,2.25,2.70),(4,.16,.4))
for x in [-1.55,1.55]: B.box('paint',(x,2.25,1.75),(.9,.16,1.5))
B.box('windowpane',(0,2.28,1.75),(2.2,.015,1.48))
for x in [-1.1,0,1.1]: B.box('white',(x,2.13,1.75),(.045,.13,1.56))
for z in [1,2.5]: B.box('white',(0,2.13,z),(2.25,.13,.065))
for x in [-.9,-.6,-.3,.3,.6,.9]: B.box('steel',(x,2.04,1.75),(.019,.026,1.4))
B.box('trim',(0,1.99,.96),(2.4,.3,.11))
for side in [-1,1]:
    B.box('trim',(side*1.9,0,.06),(.06,4.4,.12))
    for ix in range(24):
        x=side*1.10-.18+ix*.016
        nx=x+.016
        B.quad('curtain',[(x,2.0+math.sin(ix*.9)*.045,.93),(nx,2.0+math.sin((ix+1)*.9)*.045,.93),(nx,2.0+math.sin((ix+1)*.9)*.045,2.58),(x,2.0+math.sin(ix*.9)*.045,2.58)])
B.tube('steel',(-1.39,1.99,2.62),(1.39,1.99,2.62),.021)
B.box('white',(-1.91,-.15,1.07),(.07,.12,.10))
for z in [1.05,1.085]:B.box('rubber',(-1.868,-.15,z),(.006,.02,.009))
# Exterior facade visible through window, plus base bed and table.
B.box('ceramic',(0,3.7,2),(4,.25,4)); B.box('glass',(0,3.5,2.1),(1.8,.04,1.5))
for x in [-.88,0,.88]: B.box('aluminium',(x,3.47,2.1),(.03,.08,1.55))
B.box('steel',(.96,.10,.30),(1.55,2.05,.14)); B.box('linen',(.96,.10,.45),(1.47,1.99,.18))
B.oval('linen',(.96,.82,.61),(.51,.31,.095),18,7)
for x in [.25,1.66]:
    for y in [-.87,1.07]: B.tube('steel',(x,y,.02),(x,y,.64 if y<0 else 1.05),.027)
B.tube('steel',(.25,1.07,1.05),(1.66,1.07,1.05),.03)
for x in [.5,.75,1,1.25,1.5]: B.tube('steel',(x,1.07,.42),(x,1.07,1.02),.014)
B.box('wood',(-1.2,.05,.76),(1.20,.65,.075))
for x in [-1.7,-.7]:
    for y in [-.18,.28]: B.tube('steel',(x,y,0),(x,y,.72),.024)
B.box('blue',(-1.13,-.73,.44),(.4,.4,.07))
for x in [-1.27,-.99]:
    for y in [-.87,-.59]: B.tube('blue',(x,y,.01),(x,y,.43),.028)
B.box('rubber',(-1.47,-1.8,.35),(.55,.32,.7))
room=B.finish('room')
B=Builder()
def duvet_point(ix,iy):
    x=-.77+ix/36*1.54;y=-1.01+iy/48*2.02
    edge=max(0,abs(x)-.64)*1.2+max(0,abs(y)-.88)*1.0
    wrinkle=.012*math.sin(y*26+x*14)*(.25+abs(x))+.006*math.sin(x*29-y*9)
    return(.96+x,.05+y,.69-edge+wrinkle)
for ix in range(36):
    for iy in range(48):B.quad('terracotta',[duvet_point(ix,iy),duvet_point(ix+1,iy),duvet_point(ix+1,iy+1),duvet_point(ix,iy+1)])
B.loft('linen',[(.96,.82,.72,.46,.24),(.96,.82,.77,.51,.29),(.96,.82,.87,.45,.24),(.96,.82,.88,.38,.18)],24,.48)
B.box('wood',(1.1,-1.55,.38),(.60,.48,.72)); B.tube('steel',(1.1,-1.55,.75),(1.1,-1.55,1.01),.019)
B.tube('lamp',(1.1,-1.55,1.01),(1.1,-1.55,1.25),.19,20,r2=.13)
B.tube('clay',(-1.4,.1,.81),(-1.4,.1,1.0),.08,16,r2=.10)
for i in range(18):
    a=i*2.399;c=Vector((-1.4,.1,1.02));tip=c+Vector((math.cos(a)*.22,math.sin(a)*.22,.13+(i%3)*.025));mid=(c+tip)*.5;cross=Vector((-math.sin(a)*.055,math.cos(a)*.055,0))
    B.tube('green',tuple(c),tuple(mid),.004,5);B.quad('leaf',[tuple(c),tuple(mid-cross),tuple(tip),tuple(mid+cross)])
B.box('wood',(-1.13,-.73,.48),(.46,.43,.065))
B.box('wood',(-1.13,-.97,.83),(.46,.05,.42))
for x in [-1.31,-.95]:
    for y in [-.91,-.55]:B.tube('steel',(x,y,.02),(x,y,.48),.018,8)
upgrade=B.finish('upgrade')

B=Builder();bike(0,0);cycle=B.finish('bicycle')

# Main character has independent pivot nodes for a real procedural walk cycle.
actor=[]
def part(name,fn,pivot=(0,0,0)):
    global B
    B=Builder(); fn(B); objects=B.finish(name)
    empty=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(empty); empty.location=pivot
    for ob in objects: ob.parent=empty
    actor.extend([empty,*objects])
def torso(b):
    b.loft('shirt',[(0,0,1.02,.18,.13),(0,0,1.09,.20,.14),(0,0,1.27,.215,.14),(0,0,1.43,.25,.145),(0,0,1.50,.22,.13),(0,0,1.56,.085,.078)],24,.80)
    b.tube('skin',(0,0,1.52),(0,0,1.66),.072,16)
    b.oval('skin',(0,-.008,1.77),(.104,.105,.146),24,16)
    b.oval('hair',(0,.012,1.855),(.108,.104,.080),24,10)
    b.oval('skin',(0,-.107,1.77),(.025,.034,.031),10,7)
    for x in [-.105,.105]: b.oval('skin',(x,0,1.77),(.015,.028,.039),12,8)
    for x in [-.042,.042]:
        b.oval('white',(x,-.099,1.795),(.013,.005,.0045),10,6)
        b.oval('hair',(x,-.104,1.795),(.004,.003,.004),8,5)
    b.tube('hair',(-.025,-.105,1.715),(.025,-.105,1.715),.0035,5)
    b.loft('bag',[(0,.18,1.07,.13,.06),(0,.19,1.12,.17,.085),(0,.19,1.42,.17,.09),(0,.18,1.49,.12,.07)],20,.55)
    b.loft('bag',[(0,.27,1.10,.10,.01),(0,.28,1.13,.13,.03),(0,.28,1.26,.13,.03),(0,.27,1.28,.10,.01)],16,.55)
    for x in [-.12,.12]: b.box('steel',(x,.314,1.22),(.018,.012,.05))
    for x in [-.16,.16]: b.tube('bag',(x,-.10,1.49),(x,-.115,1.12),.026,8)
part('body',torso)
for sign,label in [(-1,'L'),(1,'R')]:
    def arm(b,s=sign):
        b.tube('shirt',(0,0,.03),(s*.045,0,-.19),.095,16,r2=.077)
        b.tube('skin',(s*.045,0,-.16),(s*.064,-.025,-.38),.057,12,r2=.044)
        b.tube('skin',(s*.064,-.025,-.38),(s*.065,-.07,-.57),.046,12,r2=.032)
        b.oval('skin',(s*.065,-.067,-.61),(.045,.037,.070),12,9)
    part('arm'+label,arm,(sign*.24,0,1.47))
    def leg(b,s=sign):
        b.tube('pants',(0,0,0),(0,.014,-.40),.109,16,r2=.083)
        b.tube('pants',(0,.014,-.40),(0,0,-.81),.083,16,r2=.055)
        b.oval('rubber',(0,-.063,-.87),(.071,.15,.074),16,9)
        b.oval('white',(0,-.063,-.919),(.072,.148,.020),16,6)
    part('leg'+label,leg,(sign*.115,0,.97))

def export(objects,filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in objects if o.type=='MESH')
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),use_selection=True,export_format='GLB',export_yup=True,export_apply=True,export_animations=False)
    print('EXPORTED',filename,len(objects),flush=True)

export(street,'street.glb'); export(room,'room.glb'); export(upgrade,'room-upgrade.glb'); export(actor,'chenye.glb');export(cycle,'bicycle.glb')
# Lin Xia has her own silhouette, canvas bag, light shirt and tied hair.
female=[]; copies={}
for ob in actor:
    if ob.name=='body_bag': continue
    clone=ob.copy()
    if ob.type=='MESH': clone.data=ob.data.copy()
    clone.name='linxia_'+ob.name; bpy.context.collection.objects.link(clone); copies[ob]=clone;female.append(clone)
for ob,clone in copies.items():
    if ob.parent in copies: clone.parent=copies[ob.parent]
    if clone.type=='MESH':
        if 'shirt' in ob.name:
            clone.data.materials.clear();clone.data.materials.append(M['white'])
            if ob.name=='body_shirt':
                for v in clone.data.vertices: v.co.x*=.90;v.co.y*=.93
        if ob.name=='body_skin':
            for v in clone.data.vertices: v.co.x*=.94
B=Builder()
B.oval('hair',(0,.066,1.77),(.107,.082,.115),20,10)
B.oval('hair',(0,.133,1.65),(.055,.065,.17),16,10)
B.oval('linen',(.24,.065,1.06),(.13,.055,.22),18,10)
for x,y,z in [(.23,-.03,1.5),(.24,.02,1.3)]: B.tube('linen',(x,y,z),(x,.07,1.05),.014,7)
extra=B.finish('linxia_details')
for ob in extra: ob.parent=copies[next(o for o in actor if o.name=='body')]
female.extend(extra);export(female,'linxia.glb')
# Store authored pieces side by side in the editable source file, without cameras in game exports.
for ob in room+upgrade: ob.location.x+=30
for ob in actor:
    if ob.parent is None: ob.location.x+=38
for ob in female:
    if ob.parent is None: ob.location.x+=40
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'artifacts/game/shenchengji-assets.blend'))
stats={'assets':{},'source':'original modular Blender geometry; original procedural maps and CC0 Poly Haven plaster/wood maps; see ATTRIBUTION.md','geography':'fictional composite Longhua street; not a surveyed reconstruction'}
for label,objects in [('street',street),('room',room),('upgrade',upgrade),('actor',actor),('linxia',female),('bicycle',cycle)]:
    stats['assets'][label]={'meshes':sum(o.type=='MESH' for o in objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects if o.type=='MESH')}
(OUT/'asset-manifest.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
print(json.dumps(stats),flush=True)
