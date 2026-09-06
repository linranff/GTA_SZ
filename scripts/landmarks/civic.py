"""Civic Center exterior: mapped courtyards, wing canopy and red/yellow towers.

All local dimensions are real metres; apply game scale exactly once. The roof
height field is an explicit photographic reconstruction, not survey data.
"""
import math


def roof_height(x, y):
    return (30 + 31*math.exp(-(x/113)**2) + 8.7*(abs(x)/243)**8
            + 5*math.exp(-(x/72)**2)*math.cos((y+12)/78*math.pi*.5))


def build(b, lm, spec, scale=.6):
    old_frame = b.frame
    b.frame = (lm['x'], lm['z'], 0)
    s = scale
    def point(x, y, z): return (x*s, y*s, z*s)
    def face(mat, pts): b.face(mat, [point(*p) for p in pts])
    def box(mat, p, size): b.box(mat, point(*p), tuple(v*s for v in size))
    def tube(mat, a, c, r=.15, n=6): b.tube(mat, point(*a), point(*c), r*s, n)
    def roof_z(x, y): return roof_height(x, y)
    try:
        roof = spec['roof']
        # Actual mapped tower holes and courtyard slots survive the roof mesh.
        for tri in roof['trianglesMeters']:
            pts = [(x, y, roof_z(x, y)) for x, y in tri]
            if sum(a[0]*c[1]-c[0]*a[1] for a, c in zip(pts, pts[1:]+pts[:1])) < 0:
                pts.reverse()
            face('civic_roof_blue', pts)
            face('civic_soffit', [(x, y, z-3.4) for x, y, z in reversed(pts)])
        for ri, ring in enumerate(roof['ringsMeters']):
            for a, c in zip(ring, ring[1:]):
                length = math.dist(a, c)
                count = max(1, math.ceil(length/2))
                for i in range(count):
                    x, y = [a[k]+(c[k]-a[k])*i/count for k in range(2)]
                    xx, yy = [a[k]+(c[k]-a[k])*(i+1)/count for k in range(2)]
                    z, zz = roof_z(x,y), roof_z(xx,yy)
                    face('civic_fascia', [(x,y,z-3.4),(xx,yy,zz-3.4),(xx,yy,zz),(x,y,z)])
                    tube('civic_eave_light', (x,y,z-3.12),(xx,yy,zz-3.12), .16, 5)
                    # Fine vertical metal ribs give the broad fascia structure.
                    tube('civic_mullion', (x,y,z-.1),(x,y,z-3.2), .035, 4)
        # Roof standing seams: short grid-aligned pieces are clipped through
        # triangle interpolation; no lines span the mapped roof openings.
        for tri in roof['trianglesMeters']:
            lo, hi = min(p[0] for p in tri), max(p[0] for p in tri)
            for k in range(math.ceil(lo/7), math.floor(hi/7)+1):
                x = k*7
                ys=[]
                for a,c in zip(tri,tri[1:]+tri[:1]):
                    if min(a[0],c[0]) <= x < max(a[0],c[0]):
                        ys.append(a[1]+(c[1]-a[1])*(x-a[0])/(c[0]-a[0]))
                if len(ys)==2 and abs(ys[1]-ys[0]) > .06:
                    tube('civic_roof_seam',(x,ys[0],roof_z(x,ys[0])+.035),
                         (x,ys[1],roof_z(x,ys[1])+.035),.028,4)

        for part in spec['parts']:
            rings = part['ringsMeters']
            role = part['role']
            if role.endswith('office'):
                # Five floors around the mapped open courtyards. The central
                # north-south streets sit between these wings and the towers.
                for tri in part['roofTrianglesMeters']:
                    face('civic_office_roof', [(x,y,19) for x,y in tri])
                for ring in rings:
                    for a,c in zip(ring,ring[1:]):
                        length=math.dist(a,c)
                        if length<.01: continue
                        for floor in range(5):
                            z=floor*3.8
                            face('civic_glass', [(*a,z+.45),(*c,z+.45),(*c,z+3.35),(*a,z+3.35)])
                            face('civic_fascia', [(*a,z),(*c,z),(*c,z+.45),(*a,z+.45)])
                            face('civic_fascia', [(*a,z+3.35),(*c,z+3.35),(*c,z+3.8),(*a,z+3.8)])
                        for i in range(math.ceil(length/2.6)+1):
                            t=min(1,i/math.ceil(length/2.6))
                            x,y=[a[k]+(c[k]-a[k])*t for k in range(2)]
                            tube('civic_mullion',(x,y,.2),(x,y,19),.10,4)
                # Branching supports above each office's five-storey terrace.
                minx,maxx=min(p[0] for p in rings[0]),max(p[0] for p in rings[0])
                for x in range(math.ceil((minx+9)/17)*17,int(maxx-6),17):
                    for y in [-45,45]:
                        top=roof_z(x,y)-3.5
                        tube('civic_fascia',(x,y,19),(x,y,23),.45,8)
                        for dx,dy in [(-4,-3),(4,-3),(-4,3),(4,3)]:
                            tube('civic_fascia',(x,y,22),(x+dx,y+dy,top),.22,6)
                        box('civic_flood_light',(x,y,19.25),(1.6,1.1,.25))
            else:
                cx,cy=part['centerMeters']
                material='civic_yellow' if role=='yellow-round' else 'civic_red'
                sign=-1 if role=='yellow-round' else 1
                # Both roof slopes are documented as skillion; colour towers
                # are bounded by the primary-source maximum rather than OSM91.5.
                extreme=max(sign*(p[0]-cx) for p in rings[0])
                def tower_z(x,y): return 84.5-(extreme-sign*(x-cx))*.27
                for a,c in zip(rings[0],rings[0][1:]):
                    za,zc=tower_z(*a),tower_z(*c)
                    face(material,[(*a,11.5),(*c,11.5),(*c,zc),(*a,za)])
                    # At the city camera's scale hairline 3D panel joints alias
                    # and cast scattered black dots; preserve the photographed
                    # clean colour planes instead of subpixel dark cylinders.
                    tube('civic_fascia',(*a,za),(*c,zc),.20,6)
                for tri in part['roofTrianglesMeters']:
                    face('civic_tower_roof',[(x,y,tower_z(x,y)) for x,y in tri])
                # Transparent podium around each tower, on its own footprint.
                base=part['podiumRingsMeters'][0]
                box('civic_office_roof',(cx,cy,11.3),(52,58,.35))
                for a,c in zip(base,base[1:]):
                    face('civic_glass',[(*a,.2),(*c,.2),(*c,11.5),(*a,11.5)])
                    for h in [3.8,7.6,11.5]: tube('civic_fascia',(*a,h),(*c,h),.15,5)
                    count=math.ceil(math.dist(a,c)/3)
                    for i in range(count+1):
                        x,y=[a[k]+(c[k]-a[k])*i/count for k in range(2)]
                        tube('civic_mullion',(x,y,.2),(x,y,11.5),.09,4)

        # Open centre: a broad stair and pedestrian terraces, not a solid block.
        box('civic_stone',(0,-8,.20),(157,113,.25))
        # Tile joints break up the broad civic forecourt without covering roads.
        for x in range(-78,79,4):
            face('civic_paving_joint',[(x-.035,-64,.331),(x+.035,-64,.331),(x+.035,48,.331),(x-.035,48,.331)])
        for y in range(-64,49,4):
            face('civic_paving_joint',[(-78,y-.035,.332),(78,y-.035,.332),(78,y+.035,.332),(-78,y+.035,.332)])
        for i in range(24):
            box('civic_stone',(0,-56+i*1.1,.13+i*.12),(25,1.13,.26+i*.24))
        for x in [-18,18]:
            box('civic_stone',(x,-28,2.9),(8,35,5.8))
            tube('civic_eave_light',(x,-45,5.96),(x,-11,5.96),.08,5)
        # Central glazed ridge stitches the long wing into one recognizable roof.
        for y in range(-55,59,3):
            z=roof_z(0,y)+.15
            face('civic_glass',[(-1.3,y,z),(1.3,y,z),(1.3,y+2.8,roof_z(0,y+2.8)+.15),(-1.3,y+2.8,roof_z(0,y+2.8)+.15)])
    finally:
        b.frame=old_frame
    return {'heightMeters':84.7,'roofSpanMeters':486,'sourceIds':[p['id'] for p in spec['parts']],
            'limitations':spec['limitations'],'orientation':'west yellow round / east red rectangular'}
