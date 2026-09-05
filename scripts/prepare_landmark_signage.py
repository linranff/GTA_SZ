"""Hand-authored text assets: verified lettering, bounded pixels, explicit poses.

Photographs are references only. Local font outlines are rendering proxies;
unregistered entrance surfaces receive artwork but no invented world placement.
"""
from pathlib import Path
import json
import math
import html
import base64
import io
import argparse
from hashlib import sha256
from PIL import Image, ImageDraw, ImageFont

R = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=Path, default=R / 'public/city')
parser.add_argument('--review-dir', type=Path, default=R / 'artifacts/materials/signage')
options = parser.parse_args()
asset_root = options.output_dir.resolve()
O = asset_root / 'textures/signage'
A = options.review_dir.resolve()
O.mkdir(parents=True, exist_ok=True)
A.mkdir(parents=True, exist_ok=True)
evidence_path = R / 'data/materials/landmark-signage.json'
evidence = json.loads(evidence_path.read_text())
signs = {s['id']: s for p in evidence['places'] for s in p['signs']}
font_root = Path('/System/Library/Fonts/Supplemental')

def font(name, size):
    return ImageFont.truetype(str(font_root / name), size)

def fitted(draw, text, box, filename, color, max_size=120):
    x, y, width, height = box
    for size in range(max_size, 7, -1):
        face = font(filename, size)
        b = draw.textbbox((0, 0), text, font=face)
        if b[2] - b[0] <= width and b[3] - b[1] <= height:
            draw.text((x + (width - b[2] + b[0])/2 - b[0], y + (height - b[3] + b[1])/2 - b[1]), text, font=face, fill=color)
            return
    raise ValueError('Text could not fit')

def tencent_artwork(image, english_only, color):
    # Commons identifies this as the 2017 Tencent mark, sourced from Tencent's
    # website. Its SVG actually embeds a PNG; keep that provenance explicit.
    source = Image.open(R / 'data/raw/materials/tencent-logo-2017-source.png').convert('RGBA')
    if english_only:
        source = source.crop((0, 0, 1531, 290))  # transparent gap before 腾讯
    mask = source.getchannel('A')
    mask.thumbnail((image.width-16, image.height-8), Image.Resampling.LANCZOS)
    artwork = Image.new('RGBA', mask.size, color)
    artwork.putalpha(mask)
    xy = ((image.width-artwork.width)//2, (image.height-artwork.height)//2)
    alpha = Image.new('L', image.size, 0); alpha.paste(mask, xy)
    # Constant RGB under transparent pixels avoids dark mip edges and compresses
    # better than resampling four channels of a flat-color mark independently.
    image.paste(color, (0, 0, image.width, image.height)); image.putalpha(alpha)
    stream = io.BytesIO(); artwork.save(stream, format='PNG')
    return [f'<image x="{xy[0]}" y="{xy[1]}" width="{artwork.width}" height="{artwork.height}" href="data:image/png;base64,{base64.b64encode(stream.getvalue()).decode()}"/>']

artwork = []
requested = ['tencent-south-roof', 'tencent-low-link-bilingual', 'qijie-entry-bilingual', 'mixc-street-link-entry']
for ident in requested:
    entry = signs[ident]
    assert entry['textAssetReady'] and entry['exactText']
    width, height = (512, 96) if ident == 'tencent-south-roof' else (512, 128)
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    colors = entry['colors']['suggestedSrgbHex']
    svg_parts = []
    if ident == 'tencent-south-roof':
        svg_parts = tencent_artwork(image, True, colors['letters'])
    elif ident == 'tencent-low-link-bilingual':
        svg_parts = tencent_artwork(image, False, colors['letters'])
    elif ident == 'qijie-entry-bilingual':
        fitted(draw, '七街公館', (57, 8, 398, 72), 'Arial Unicode.ttf', colors['letters'])
        fitted(draw, 'SEVENTH AVENUE RESIDENCE', (36, 94, 440, 22), 'Arial.ttf', colors['letters'])
        svg_parts = [f'<text x="256" y="77" text-anchor="middle" font-family="Arial Unicode MS" font-size="72" fill="{colors["letters"]}">七街公館</text>', f'<text x="256" y="115" text-anchor="middle" font-family="Arial" font-size="23" fill="{colors["letters"]}">SEVENTH AVENUE RESIDENCE</text>']
    else:
        # Staggered brand composition; ordinary one-line typography would erase
        # the observed small "the", larger X and lowered gold c.
        main, gold = colors['mainLetters'], colors['goldAccent']
        fitted(draw, 'the', (17, 8, 43, 23), 'Arial.ttf', gold)
        fitted(draw, 'mi', (10, 42, 88, 74), 'Arial.ttf', main)
        fitted(draw, 'X', (103, 11, 75, 104), 'Arial.ttf', main)
        fitted(draw, 'c', (176, 62, 40, 49), 'Arial.ttf', gold)
        fitted(draw, '万象天地', (238, 43, 262, 64), 'Arial Unicode.ttf', main)
        svg_parts = [f'<g font-family="Arial"><text x="18" y="30" font-size="24" fill="{gold}">the</text><text x="9" y="111" font-size="82" fill="{main}">mi</text><text x="103" y="110" font-size="112" fill="{main}">X</text><text x="179" y="111" font-size="66" fill="{gold}">c</text><text x="244" y="100" font-family="Arial Unicode MS" font-size="63" fill="{main}">万象天地</text></g>']
    path = O / f'{ident}.png'
    image.save(path, optimize=True)
    (A / f'{ident}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><title>{html.escape(entry["exactText"])}</title>'+''.join(svg_parts)+'</svg>\n')
    artwork.append({'id': ident, 'exactText': entry['exactText'], 'url': f'/city/textures/signage/{ident}.png', 'width': width, 'height': height,
                    'bytes': path.stat().st_size, 'sha256': sha256(path.read_bytes()).hexdigest(),
                    'sourceIds': entry['sourceIds'], 'method': 'Manual layout from referenced Tencent brand artwork; no image generation.' if ident.startswith('tencent-') else 'Manually composed text and local font outlines, no image generation.',
                    'typographyStatus': '2017 Tencent mark contours from the referenced brand artwork, recolored to the observed building sign.' if ident.startswith('tencent-') else 'Readable lettering and composition follow references; font contours remain approximations, including Qijie calligraphy.',
                    'artworkSource': 'data/materials/tencent-logo-source.json' if ident.startswith('tencent-') else None,
                    'renderReady': entry['renderReady'], 'placementStatus': entry['renderPlacementStatus']})

# Install only source-matched surfaces. Do not reuse known names as invented
# roof signs on unrelated or unregistered surfaces.
spec = json.loads((R / 'data/landmarks/tencent.json').read_text())
tower = next(t for t in spec['towers'] if t['id'] == 'south')
v = lambda key: tower[key]['value']
placement = signs['tencent-south-roof']['placementEstimate']
scale = .6
angle = math.radians(v('rotation_deg'))
c, s = math.cos(angle), math.sin(angle)
u = (placement['horizontalCenterFacadeFraction'] - .5) * v('width_m')
out = -v('depth_m') / 2 - 1.4  # clear existing folded glazing and mullion depth
dx, dz = v('center_m')
x = (spec['anchor']['lon'] - 114.025) * 102850 + dx + u*c - out*s
z = (spec['anchor']['lat'] - 22.536) * 111320 + dz + u*s + out*c
placements = [{'id': 'tencent-south-roof', 'placeId': 'tencent', 'text': 'Tencent', 'textureUrl': '/city/textures/signage/tencent-south-roof.png',
               'position': [x*scale, placement['heightCenterFraction']*v('height_m')*scale, z*scale],
               'width': placement['signWidthFacadeFraction']*v('width_m')*scale,
               'height': placement['signHeightFraction']*v('height_m')*scale,
               'rotationY': -angle, 'surfaceNormal': [s, 0, -c],
               'placementStatus': 'photo_interpretation_estimated', 'sourceIds': signs['tencent-south-roof']['sourceIds'],
               'illuminationVerified': False, 'emissiveAtDusk': 0, 'emissiveAtNight': 0,
               'note': 'Observed white lettering. Cardinal face and metric pose estimated from the locked tower footprint; night emission has not been verified.'}]
qijie = signs['qijie-entry-bilingual']
if qijie['renderReady']:
    p = qijie['placementEstimate']
    assert p['status'] == 'photo_interpretation_estimated'
    model = next(m for m in json.loads((R / p['modelSpec']).read_text())['models'] if m['id'] == p['modelId'])
    origin_e = (model['centerWGS84'][0]-114.025)*102850
    origin_n = (model['centerWGS84'][1]-22.536)*111320
    def qijie_scene(enu):
        return [(origin_e+enu[0])*scale, enu[2]*scale, (origin_n+enu[1])*scale]
    normal_e, normal_n, _ = p['outwardNormalEastNorthUp']
    rotation = math.atan2(-normal_e, -normal_n)
    canopy = p['canopyApproximation']
    placements.append({'id': qijie['id'], 'placeId': 'qijie-gongguan', 'text': qijie['exactText'],
                       'textureUrl': '/city/textures/signage/qijie-entry-bilingual.png',
                       'position': qijie_scene(p['signCenterLocalEastNorthUpMeters']),
                       'width': p['signWidthMeters']*scale, 'height': p['signHeightMeters']*scale,
                       'rotationY': rotation, 'surfaceNormal': [normal_e, 0, normal_n],
                       'placementStatus': p['status'], 'sourceIds': qijie['sourceIds'],
                       'illuminationVerified': False, 'emissiveAtDusk': 0, 'emissiveAtNight': 0,
                       'canopy': {'position': qijie_scene(canopy['centerLocalEastNorthUpMeters']),
                                  'size': [canopy['widthMeters']*scale, canopy['thicknessMeters']*scale, canopy['outwardProjectionMeters']*scale],
                                  'rotationY': rotation, 'albedoSrgb': canopy['suggestedSrgbHex'], 'roughness': .6,
                                  'status': 'photo_interpretation_estimated'},
                       'note': 'West-recess entrance matched by the reported west entrance and reference photograph. Metric offset, height, canopy and font contours remain approximations; no unverified LED text or night emission.'})
manifest = {'schemaVersion': 1, 'sourceEvidenceSha256': sha256(evidence_path.read_bytes()).hexdigest(), 'artwork': artwork, 'placements': placements,
            'textureBytes': sum(t['bytes'] for t in artwork), 'activeTextureCount': len(placements), 'additionalTriangles': len(placements)*2+sum(12 for p in placements if 'canopy' in p),
            'noNewLights': True, 'pending': [t['id'] for t in artwork if not t['renderReady']]}
(asset_root / 'landmark-signage.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
sheet = Image.new('RGB', (544, 600), '#203137')
label = ImageDraw.Draw(sheet)
for i, asset in enumerate(artwork):
    sign = Image.open(O / (asset['id']+'.png'))
    sheet.paste(sign, (16, i*150+21), sign)
    label.text((16, i*150+4), asset['id'], fill='#d8e1dc')
sheet.save(A.parent / 'signage-artwork-review.png')
print(json.dumps({'artwork': len(artwork), 'readyPlacements': len(placements), 'bytes': manifest['textureBytes'], 'pending': manifest['pending']}, ensure_ascii=False))
