"""30m-source Lianhua relief, source-mapped trails and estimated forest stands."""
import math
import random


def height_at(grid, x, z):
    c, r = (x-grid['x0'])/grid['dx'], (z-grid['z0'])/grid['dz']
    cols, rows = grid['columns'], grid['rows']
    if c < 0 or r < 0 or c > cols-1 or r > rows-1:
        return 0.
    i, j = min(math.floor(c), cols-2), min(math.floor(r), rows-2)
    u, v, q = c-i, r-j, j*cols+i
    h = grid['heights']
    if u >= v:
        return h[q]*(1-u)+h[q+1]*(u-v)+h[q+cols+1]*v
    return h[q]*(1-v)+h[q+cols+1]*u+h[q+cols]*(v-u)


def build(b, lm, spec, scale=.6):
    # World-space terrain, unlike local-anchor building models.
    b.frame = (0, 0, 0)
    g = spec['grid']
    cols, rows, values = g['columns'], g['rows'], g['heights']
    def vertex(i, j):
        return (g['x0']+i*g['dx'], g['z0']+j*g['dz'], values[j*cols+i]+.045)
    for j in range(rows-1):
        for i in range(cols-1):
            a, c, d, e = vertex(i, j), vertex(i+1, j), vertex(i+1, j+1), vertex(i, j+1)
            if max(a[2], c[2], d[2], e[2]) < .075:
                continue
            b.face('park', [a, c, d])
            b.face('park', [a, d, e])
    # Trail strips follow the same height field at both edges, not just center.
    for paths, mat, offset in [(spec['paths'], 'pavement', .16), (spec.get('drapedRoads', []), 'asphalt', .19)]:
        for path in paths:
            for a, c in zip(path['points'], path['points'][1:]):
                dx, dz = c[0]-a[0], c[1]-a[1]
                length = math.hypot(dx, dz)
                if length < .01:
                    continue
                nx, nz = -dz/length*path['width']/2, dx/length*path['width']/2
                points = [(a[0]-nx, a[1]-nz), (c[0]-nx, c[1]-nz), (c[0]+nx, c[1]+nz), (a[0]+nx, a[1]+nz)]
                if mat == 'asphalt' and max(height_at(g, x, z) for x, z in points) < .25:
                    continue  # Existing flat roads already cover these sections.
                b.face(mat, [(x, z, height_at(g, x, z)+offset) for x, z in points],
                       [(0, 0), (length/8, 0), (length/8, 1), (0, 1)])
    # Light geometric canopy clusters suggest the woodland at city scale.
    # These are explicitly estimated stands, never individual surveyed trees.
    rng = random.Random(41281446)
    for _ in range(1600):
        x = rng.uniform(g['x0'], g['x0']+(cols-1)*g['dx'])
        z = rng.uniform(g['z0'], g['z0']+(rows-1)*g['dz'])
        ground = height_at(g, x, z)
        if ground < 12*scale:
            continue
        # Keep clear of mapped trails and service corridors.
        near_path = False
        for path in spec['paths']+spec.get('drapedRoads', []):
            for p, q in zip(path['points'], path['points'][1:]):
                dx, dy = q[0]-p[0], q[1]-p[1]
                t = min(1, max(0, ((x-p[0])*dx+(z-p[1])*dy)/(dx*dx+dy*dy or 1)))
                if math.hypot(x-p[0]-dx*t, z-p[1]-dy*t) < path['width']/2+4*scale:
                    near_path = True
                    break
            if near_path:
                break
        if near_path:
            continue
        radius = rng.uniform(5, 10)*scale
        ht = rng.uniform(4, 8)*scale
        b.loft('leaf' if rng.random()<.7 else 'leaflight',
               [(x, z, ground+.5, radius*.7, radius*.6),
                (x, z, ground+ht*.58, radius, radius*.85),
                (x, z, ground+ht, radius*.18, radius*.16)], 6)
    return {'nativeResolutionMeters': 30, 'estimatedCanopy': True}
