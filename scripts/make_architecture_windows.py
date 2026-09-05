"""Manually art-directed, sparse window masks aligned to the actual facade art.

Cool dark glazing segmentation is a stencil, not a real occupancy assertion.
Only selected connected window regions emit; plaster, stone and mullions stay dark.
"""
from pathlib import Path
from hashlib import sha256
import json
import random
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/city/textures/architecture'
names = ['curtain-glass', 'warm-residential', 'light-stone']
reports = []
review = Image.new('RGB', (768, 540), '#172128')
draw = ImageDraw.Draw(review)
for i, name in enumerate(names):
    source = OUT / f'{name}.png'
    image = Image.open(source).convert('RGB').resize((256, 256), Image.Resampling.LANCZOS)
    a = np.asarray(image).astype(float)
    red, green, blue = [a[:, :, c] for c in range(3)]
    glass = (green - red > 2) & (blue >= red - 2) & (a.mean(axis=2) < 175)
    cleaned = Image.fromarray((glass * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    mask = np.asarray(cleaned) > 0
    seen = np.zeros(mask.shape, dtype=bool)
    components = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        stack = [(int(y), int(x))]
        seen[y, x] = True
        points = []
        while stack:
            yy, xx = stack.pop()
            points.append((yy, xx))
            for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                ny, nx = yy + dy, xx + dx
                if 0 <= ny < 256 and 0 <= nx < 256 and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        ys, xs = zip(*points)
        width, height = max(xs) - min(xs), max(ys) - min(ys)
        if 100 < len(points) < 1000 and width < height * 2.8 and min(xs) > 2 and max(xs) < 253 and min(ys) > 2 and max(ys) < 253:
            components.append(points)
    rng = random.Random(9017 + i)
    selected = rng.sample(components, min([5, 6, 3][i], len(components)))
    light = np.zeros((256, 256), dtype='uint8')
    for points in selected:
        intensity = rng.choice([140, 170, 205])
        for y, x in points:
            if glass[y, x]:
                light[y, x] = intensity
    assert 0 < np.count_nonzero(light) / light.size < .065
    assert not np.any((light > 0) & ~glass)
    target = OUT / f'{name}-windows.png'
    emission = Image.fromarray(light).convert('RGB')
    emission.save(target, optimize=True)
    reports.append({'id': name, 'url': f'/city/textures/architecture/{name}-windows.png', 'width': 256, 'height': 256,
                    'bytes': target.stat().st_size, 'sha256': sha256(target.read_bytes()).hexdigest(),
                    'albedoSha256': sha256(source.read_bytes()).hexdigest(), 'litRegions': len(selected),
                    'litPixelFraction': float(np.count_nonzero(light) / light.size), 'wallPixelsLit': 0,
                    'method': 'Hand-directed sparse selection through a glazing-only color stencil; artistic occupancy, not real room data.'})
    review.paste(image, (i * 256, 20))
    review.paste(emission, (i * 256, 284))
    draw.text((i * 256 + 6, 4), name, fill='#eef3ed')
report = {'schemaVersion': 1, 'textures': reports, 'totalBytes': sum(r['bytes'] for r in reports),
          'estimatedRGBA8WithMipmapsBytes': 3 * 256 * 256 * 4 * 4 / 3,
          'note': 'Aligned to current albedo hashes. Re-run after facade art changes. Existing unrelated 1024px emission masks are not reused.'}
(ROOT / 'data/materials/architecture-windows.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'artifacts/materials').mkdir(exist_ok=True, parents=True)
review.save(ROOT / 'artifacts/materials/facade-window-mask-review.png')
print(json.dumps(report, ensure_ascii=False, indent=2))
