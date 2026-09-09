"""Original Shenzhen Bay sightseeing floatplane, authored in Blender.

Dimensions are game-art estimates, not a reproduction of a certified airframe.
Local Blender axes: X starboard, +Y nose, Z up; origin near centre of gravity.
Run with Blender --background --factory-startup --python scripts/build_floatplane.py.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from city_mesh import *
import hashlib

OUT = O / 'floatplane-manifest.json'
S = B()
material('fp_pearl', (.77,.83,.88), .26, .32)
material('fp_indigo', (.019,.038,.125), .25, .48)
material('fp_yellow', (.94,.52,.024), .30, .24)
material('fp_glass', (.025,.069,.108), .105, .38)
material('fp_alloy', (.33,.40,.44), .24, .78)
material('fp_gasket', (.021,.028,.035), .72, .04)
material('fp_prop', (.025,.032,.043), .31, .32)
material('fp_float', (.43,.51,.57), .34, .44)
material('fp_red', (1,.012,.006), .2, .1, 4)
material('fp_green', (.006,1,.10), .2, .1, 4)
material('fp_light', (1,.88,.68), .16, .1, 4)


def lerp_stations(stations, at):
    for a,b in zip(stations, stations[1:]):
        if a[0] <= at <= b[0]:
            t = (at-a[0])/(b[0]-a[0])
            return [a[i]*(1-t)+b[i]*t for i in range(1,len(a))]
    return list(stations[0 if at < stations[0][0] else -1][1:])


def horizontal_loft(builder, stations, count, segments, material_fn, offset=(0,0,0)):
    """Elliptical station loft along Y, outward winding including end caps."""
    rings=[]
    for j in range(count+1):
        y=stations[0][0]+(stations[-1][0]-stations[0][0])*j/count
        rx,rz,zc=lerp_stations(stations,y)
        rings.append([(offset[0]+rx*math.cos(i*math.tau/segments),
                       offset[1]+y,offset[2]+zc+rz*math.sin(i*math.tau/segments))
                      for i in range(segments)])
    for j in range(count):
        for i in range(segments):
            k=(i+1)%segments
            q=[rings[j][i],rings[j+1][i],rings[j+1][k],rings[j][k]]
            centre=tuple(sum(p[n] for p in q)/4 for n in range(3))
            builder.face(material_fn(centre, (i+.5)*math.tau/segments),q)
    builder.face('fp_pearl', rings[0])
    builder.face('fp_pearl', list(reversed(rings[-1])))
    return rings


# A tapered rear cone, full cabin, sloping windshield and rounded engine cowl.
FUSELAGE=[(-5.1,.035,.07,.17),(-4.6,.13,.19,.13),(-3.7,.25,.30,.10),
          (-2.7,.39,.44,.08),(-1.7,.58,.60,.15),(-1.0,.70,.72,.23),
          (.15,.75,.80,.29),(1.10,.74,.77,.29),(1.62,.71,.65,.18),
          (2.15,.66,.49,.04),(2.78,.60,.43,.005),(3.35,.52,.37,.00),
          (3.75,.38,.31,.00),(3.89,.22,.23,.00)]


def body_material(p,a):
    x,y,z=p
    # Three side panes with structural pillars, plus a curved forward windscreen.
    side_glass=.23 < a < 1.13 or 2.01 < a < 2.91
    if side_glass and z>.46 and any(lo<y<hi for lo,hi in [(-1.15,-.35),(-.26,.58),(.69,1.49)]):
        return 'fp_glass'
    if 1.58<y<2.10 and .45<a<2.69 and z>.45:
        return 'fp_glass'
    if z<-.19:
        return 'fp_indigo'
    if -.12<z<-.02 and -4.15<y<2.25:
        return 'fp_yellow'
    return 'fp_pearl'

horizontal_loft(S,FUSELAGE,72,48,body_material)


def body_point(y,a,extra=.006):
    rx,rz,z=lerp_stations(FUSELAGE,y)
    return ((rx+extra)*math.cos(a),y,z+(rz+extra)*math.sin(a))


# Window borders, a centre windscreen mullion, recessed door shutlines and handles.
for aa in [(.23,1.13),(2.01,2.91)]:
    for lo,hi in [(-1.15,-.35),(-.26,.58),(.69,1.49)]:
        for a in aa:
            for j in range(8):
                y0=lo+(hi-lo)*j/8;y1=lo+(hi-lo)*(j+1)/8
                S.tube('fp_gasket',body_point(y0,a),body_point(y1,a),.011,6)
        for y in [lo,hi]:
            for j in range(8):
                a0=aa[0]+(aa[1]-aa[0])*j/8;a1=aa[0]+(aa[1]-aa[0])*(j+1)/8
                S.tube('fp_pearl',body_point(y,a0,.011),body_point(y,a1,.011),.018,6)
for j in range(9):
    y0=1.57+.55*j/9;y1=1.57+.55*(j+1)/9
    S.tube('fp_pearl',body_point(y0,math.pi/2,.014),body_point(y1,math.pi/2,.014),.018,8)
for side in [-1,1]:
    angle=0 if side==1 else math.pi
    for y in [-.31,1.53]:
        for j in range(10):
            a0=angle+side*(-.40+j*.073);a1=a0+side*.073
            S.tube('fp_gasket',body_point(y,a0,.010),body_point(y,a1,.010),.007,5)
    S.tube('fp_alloy',(side*.746,.99,.25),(side*.754,1.20,.25),.027,10)
    S.tube('fp_gasket',(side*.57,2.99,.04),(side*.51,3.44,.04),.045,10)
    # Side cowl cooling louvres.
    for j in range(6):
        y=2.72+j*.11
        S.tube('fp_gasket',(side*(.60-j*.012),y,.13),
               (side*(.59-j*.012),y,-.10),.015,6)
    S.tube('fp_alloy',(side*.38,2.47,-.29),(side*.47,2.72,-.46),.080,12)
    S.tube('fp_gasket',(side*.47,2.72,-.46),(side*.49,2.80,-.50),.061,12)


def thickness(t):
    # Closed trailing-edge NACA-like profile, 12% chord ratio.
    return 5*.12*(.2969*math.sqrt(max(t,0))-.1260*t-.3516*t*t+.2843*t**3-.1036*t**4)


def wing(builder, side, span, root_chord, tip_chord, centre_y, root_z,
         sweep=.18, dihedral=.020, main=True):
    ns=36 if main else 18;nc=18 if main else 14
    sections=[]
    # Airfoil perimeter: top leading-to-trailing, then bottom back to leading.
    ts=[.5-.5*math.cos(math.pi*j/nc) for j in range(nc+1)]
    for j in range(ns+1):
        r=j/ns;x=side*span*r
        chord=root_chord+(tip_chord-root_chord)*r
        taper=max(.06,math.sqrt(max(0,1-max(0,(r-.95)/.05)**2)))
        cy=centre_y-sweep*r;z=root_z+dihedral*abs(x)
        ring=[]
        for t in ts:
            camber=.022*math.sin(math.pi*t)*chord
            ring.append((x,cy+chord*(.48-t),z+camber+thickness(t)*chord*taper))
        for t in reversed(ts[1:-1]):
            camber=.022*math.sin(math.pi*t)*chord
            ring.append((x,cy+chord*(.48-t),z+camber-thickness(t)*chord*taper))
        sections.append(ring)
    n=len(sections[0])
    for j in range(ns):
        r=(j+.5)/ns
        for i in range(n):
            k=(i+1)%n
            mat='fp_yellow' if r>.925 else 'fp_indigo' if r>.875 else 'fp_pearl'
            q=[sections[j][i],sections[j+1][i],sections[j+1][k],sections[j][k]]
            if side>0:q.reverse()
            builder.face(mat,q)
    cap=sections[-1] if side>0 else list(reversed(sections[-1]))
    builder.face('fp_yellow',cap)
    if main:
        # Separated flap/aileron hinges and spars visible in oblique light.
        for t in [.76]:
            for j in range(48):
                p=[]
                for r in [.08+.79*j/48,.08+.79*(j+1)/48]:
                    c=root_chord+(tip_chord-root_chord)*r
                    p.append((side*span*r,centre_y-sweep*r+c*(.48-t),
                              root_z+dihedral*span*r+.022*math.sin(math.pi*t)*c+thickness(t)*c+.008))
                builder.tube('fp_gasket',*p,.006,5)
        for r in [.10,.37,.64,.86]:
            c=root_chord+(tip_chord-root_chord)*r
            for j in range(18):
                p=[]
                for t in [.03+.92*j/18,.03+.92*(j+1)/18]:
                    p.append((side*span*r,centre_y-sweep*r+c*(.48-t),root_z+dihedral*span*r+
                              .022*math.sin(math.pi*t)*c+thickness(t)*c+.006))
                builder.tube('fp_alloy',*p,.004,5)


wing(S,-1,7.0,2.18,1.46,.39,1.38)
wing(S,1,7.0,2.18,1.46,.39,1.38)
wing(S,-1,2.35,1.10,.70,-4.17,.26,sweep=.30,dihedral=.015,main=False)
wing(S,1,2.35,1.10,.70,-4.17,.26,sweep=.30,dihedral=.015,main=False)

# Sculpted fin: a swept leading edge, rounded thickness and separate rudder seam.
FIN=[(.24,-3.20,-5.05,.105),(.70,-3.45,-5.10,.095),
     (1.50,-3.95,-5.14,.071),(2.22,-4.43,-5.17,.039),(2.35,-4.69,-5.13,.019)]
finrings=[]
for j in range(39):
    z=.24+(2.35-.24)*j/38
    lead,trail,rx=lerp_stations(FIN,z)
    ring=[]
    for i in range(36):
        a=i*math.tau/36
        ring.append((rx*math.cos(a),(lead+trail)/2+(lead-trail)/2*math.sin(a),z))
    finrings.append(ring)
for j in range(len(finrings)-1):
    for i in range(36):
        k=(i+1)%36
        S.face('fp_yellow' if j>32 else 'fp_indigo' if j>28 else 'fp_pearl',
               [finrings[j][i],finrings[j][k],finrings[j+1][k],finrings[j+1][i]])
S.face('fp_yellow',finrings[-1])
for side in [-1,1]:
    for j in range(18):
        z0=.30+1.85*j/18;z1=.30+1.85*(j+1)/18
        lead,trail,rx=lerp_stations(FIN,z0);lead1,trail1,rx1=lerp_stations(FIN,z1)
        S.tube('fp_gasket',(side*rx*.86,trail+(lead-trail)*.22,z0),
               (side*rx1*.86,trail1+(lead1-trail1)*.22,z1),.009,6)

# Two stepped floats with pronounced bow, chine, underside keel and access covers.
FLOATS=[(-3.33,.08,.12,-.98),(-2.85,.27,.23,-1.03),(-1.90,.34,.28,-1.01),
        (-.30,.355,.30,-1.03),(-.17,.35,.25,-.96),(.0,.35,.37,-1.02),
        (1.25,.35,.36,-.99),(2.35,.29,.27,-.87),(3.02,.15,.15,-.72),
        (3.28,.025,.035,-.59)]
for side in [-1,1]:
    cx=side*1.27
    horizontal_loft(S,FLOATS,44,24,
        lambda p,a: 'fp_indigo' if p[2]<-1.16 else 'fp_float' if p[2]<-.80 else 'fp_pearl',
        (cx,0,0))
    for a in [-.18,math.pi+.18]:
        for j in range(54):
            pts=[]
            for y in [-3.10+6.14*j/54,-3.10+6.14*(j+1)/54]:
                rx,rz,zc=lerp_stations(FLOATS,y)
                pts.append((cx+(rx+.007)*math.cos(a),y,zc+(rz+.007)*math.sin(a)))
            S.tube('fp_alloy',*pts,.014,7)
    for y in [-2.2,-1.25,.56,1.52]:
        rx,rz,zc=lerp_stations(FLOATS,y)
        S.box('fp_gasket',(cx,y,zc+rz+.009),(.27,.28,.014))
        S.box('fp_alloy',(cx,y,zc+rz+.018),(.20,.21,.010))
    for y in [-1.42,1.22]:
        S.tube('fp_alloy',(side*.39,y,-.29),(cx,y-.19,-.75),.050,12)
        S.tube('fp_alloy',(side*.39,y+.48,-.24),(cx,y-.19,-.75),.035,10)
    S.tube('fp_alloy',(cx,-1.60,-.74),(cx,1.03,-.75),.032,10)
    # Float-to-float transverse beams and wire braces.
    for y in [-1.61,1.03]:
        if side==1:
            S.tube('fp_alloy',(-1.27,y,-.80),(1.27,y,-.80),.052,12)
    S.tube('fp_alloy',(side*.52,-.55,-.16),(side*4.12,.29,1.44),.045,12)
    S.tube('fp_alloy',(side*.51,-.51,-.16),(side*4.10,-.49,1.45),.034,10)
    S.tube('fp_alloy',(side*2.40,.02,.61),(side*2.44,.07,1.37),.021,8)
    S.tube('fp_alloy',(side*.56,.91,-.12),(side*1.10,.61,-.47),.027,10)
    S.tube('fp_gasket',(side*.86,.62,-.42),(side*1.22,.62,-.42),.042,10)
    # Water rudders at the float stern, with narrow actuating struts.
    S.box('fp_indigo',(cx,-3.21,-1.19),(.055,.24,.52))
    S.tube('fp_alloy',(cx,-2.89,-.82),(cx,-3.24,-1.18),.024,8)

# Nose spinner/collar and a separate, balanced three-blade propeller object.
S.tube('fp_gasket',(0,3.88,0),(0,3.98,0),.235,48)
S.tube('fp_alloy',(0,3.98,0),(0,4.06,0),.175,48)
PROP_CENTER=(0,4.09,0)
P=B()
P.tube('fp_pearl',(0,-.08,0),(0,.28,0),.20,48,r2=.035)
for blade in range(3):
    a=blade*math.tau/3
    # Width, sweep and twist vary with radius; elliptic shell rather than a plate.
    rings=[]
    for j in range(30):
        r=.15+1.29*j/29
        w=(.07+.10*math.sin(math.pi*j/29)**.6)*min(1,(1.46-r)*13)
        sweep=.11*(r/1.44)**1.5
        twist=.30*(1-r/1.7)
        ring=[]
        for i in range(12):
            q=i*math.tau/12
            tangent=sweep+w*math.cos(q)
            y=.025*math.sin(q)+twist*w*math.cos(q)
            ring.append((math.cos(a)*r-math.sin(a)*tangent,y,
                         math.sin(a)*r+math.cos(a)*tangent))
        rings.append(ring)
    for j in range(29):
        for i in range(12):
            k=(i+1)%12
            P.face('fp_yellow' if j>25 else 'fp_prop',[rings[j][i],rings[j+1][i],rings[j+1][k],rings[j][k]])
    P.face('fp_yellow',rings[-1])

# Navigation lenses, landing light recesses and aerodynamic aerials.
for side,mat in [(-1,'fp_red'),(1,'fp_green')]:
    S.tube(mat,(side*6.94,.02,1.53),(side*6.96,.20,1.53),.055,16)
    S.tube('fp_gasket',(side*2.22,1.36,1.41),(side*2.22,1.42,1.41),.105,20)
    S.tube('fp_light',(side*2.22,1.421,1.41),(side*2.22,1.430,1.41),.078,20)
S.tube('fp_red',(0,-4.84,2.34),(0,-4.84,2.40),.042,12)
S.tube('fp_alloy',(0,-1.82,.78),(0,-1.98,1.27),.018,8,r2=.006)
S.tube('fp_alloy',(0,-4.03,.40),(0,-4.12,.78),.012,8,r2=.004)

objects=S.finish('floatplane_airframe',smooth=True)
prop_objects=P.finish('floatplane_propeller',smooth=True)
# Preserve a dedicated local pivot and a predictable node name after glTF export.
bpy.ops.object.select_all(action='DESELECT')
for ob in prop_objects:ob.select_set(True)
bpy.context.view_layer.objects.active=prop_objects[0]
bpy.ops.object.join()
prop=prop_objects[0];prop.name='floatplane_propeller_mesh';prop.data.name='floatplane_propeller_geometry'
pivot=bpy.data.objects.new('floatplane_propeller',None)
bpy.context.collection.objects.link(pivot)
pivot.location=PROP_CENTER
prop.parent=pivot;prop.location=(0,0,0)
objects.append(prop)

for ob in objects:
    # Consistent outward normals, while splitting sharp edges on boxes and braces.
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
    ob.data.update()

bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for ob in [*objects,pivot]:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(O/'floatplane.glb'),export_format='GLB',
    use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
stats={'file':'floatplane.glb','bytes':(O/'floatplane.glb').stat().st_size,
       'triangles':sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in objects),
       'meshes':len(objects)}
bpy.ops.wm.save_as_mainfile(filepath=str(A/'floatplane.blend'))
points=[ob.matrix_world@v.co for ob in objects for v in ob.data.vertices]
bounds={'min':[min(p[i] for p in points) for i in range(3)],
        'max':[max(p[i] for p in points) for i in range(3)]}
dimensions=[bounds['max'][i]-bounds['min'][i] for i in range(3)]
asset=O/'floatplane.glb'
stats['sha256']=hashlib.sha256(asset.read_bytes()).hexdigest()
manifest={
    'schemaVersion':1,'id':'shenzhen-bay-floatplane','name':'湾翼 · 双浮筒观光飞机',
    'asset':'/city/floatplane.glb','assetStats':stats,
    'license':'Original project-authored geometry and materials; no external model or texture assets.',
    'reference':'User supplied high-wing twin-float sightseeing aircraft screenshot; visual inspiration only.',
    'dimensionsAre':'Art-directed gameplay dimensions, not surveyed or airworthiness specifications.',
    'coordinates':{'blender':{'right':'+X','forward':'+Y','up':'+Z'},
                   'gltfRightHanded':{'right':'+X','forward':'-Z','up':'+Y'},
                   'units':'metres / game units; scale 1.0','origin':'approximate centre of gravity'},
    'boundsBlender':bounds,'dimensionsBlenderXYZ':dimensions,
    'propeller':{'node':'floatplane_propeller','centreBlender':list(PROP_CENTER),
                 'centreGltf':[PROP_CENTER[0],PROP_CENTER[2],-PROP_CENTER[1]],
                 'axisBlender':[0,1,0],'axisGltf':[0,0,-1],
                 'localPivotAtHub':True,'bladeCount':3,'radius':1.46},
    'collisionProxy':{'fuselageRadius':.9,'wingHalfSpan':7.0,'noseForward':4.37,'tailBackward':5.18,
                      'floatHalfWidth':1.64,'lowestPoint':bounds['min'][2]},
    'materials':sorted({m.name for ob in objects for m in ob.data.materials}),
    'generator':{'blender':bpy.app.version_string,'script':'scripts/build_floatplane.py'},
    'sourceSha256':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in [Path(__file__),R/'scripts/city_mesh.py']},
    'validation':{'finiteVertices':all(math.isfinite(c) for p in points for c in p),
                  'normalsRecalculatedOutward':True,'dedicatedPropellerPivot':True,
                  'gameVisualReview':'pending integration'},
}
OUT.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'floatplane':stats,'dimensions':dimensions,'propeller':manifest['propeller']},ensure_ascii=False))
