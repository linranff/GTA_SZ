"""Pack licensed grass surfaces for a single opaque terrain pass (CPU only).

Sources are downloaded separately; no network, Blender scene reset, or city rebuild.
Run: .venv/bin/python scripts/prepare_grassland_materials.py
"""
from pathlib import Path
import hashlib, json, zipfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/grassland-v2/sources'
OUT = ROOT / 'public/city/grassland-v2'
OUT.mkdir(parents=True, exist_ok=True)
checks = []

def digest(data):
    return hashlib.sha256(data).hexdigest()

def photo(asset, key, suffix):
    catalog = json.loads((SOURCE / (asset.replace('_', '-') + '-files.json')).read_text())
    entry = catalog[key]['1k']['jpg']
    p = SOURCE / f'{asset}_{suffix}_1k.jpg'
    data = p.read_bytes()
    assert hashlib.md5(data).hexdigest() == entry['md5'], p.name
    checks.append(dict(file=p.name, url=entry['url'], sha256=digest(data), bytes=len(data)))
    return Image.open(p).convert('RGB')

def pack(name, color, normal, rough, ao, size, period):
    color = np.asarray(color.resize((size, size), Image.Resampling.LANCZOS), dtype=float) / 255
    ao = np.asarray(ao.convert('L').resize((size, size), Image.Resampling.LANCZOS), dtype=float) / 255
    # Mild cavity darkening baked into albedo. No hard directional shadows.
    color *= (.82 + .18 * ao[..., None])
    Image.fromarray(np.uint8(np.clip(color * 255, 0, 255))).save(OUT / f'{name}-color.jpg', quality=91, subsampling=0)
    n = np.asarray(normal.resize((size, size), Image.Resampling.LANCZOS), dtype=float) / 127.5 - 1
    n /= np.maximum(np.linalg.norm(n, axis=2)[..., None], .001)
    r = np.asarray(rough.convert('L').resize((size, size), Image.Resampling.LANCZOS), dtype=float) / 255
    packed = np.zeros((size, size, 3), dtype='uint8')
    packed[..., :2] = np.uint8(np.clip(n[..., :2] * 127.5 + 127.5, 0, 255))
    packed[..., 2] = np.uint8(np.clip(.74 + .24 * r, .74, .98) * 255)
    Image.fromarray(packed).save(OUT / f'{name}-normal-roughness.png', optimize=True)
    return dict(id=name, width=size, gamePeriod=period, sourceNormal='OpenGL',
                normalRoughnessChannels='R: tangent X, G: tangent Y, B: perceptual roughness',
                files=[f'{name}-color.jpg', f'{name}-normal-roughness.png'])

archive = SOURCE / 'Grass001_1K-JPG.zip'
checks.append(dict(file=archive.name, url='https://ambientcg.com/get?file=Grass001_1K-JPG.zip', sha256=digest(archive.read_bytes()), bytes=archive.stat().st_size))
with zipfile.ZipFile(archive) as z:
    def lawn(kind):
        with z.open(f'Grass001_1K-JPG_{kind}.jpg') as f:
            return Image.open(f).convert('RGB')
    layers = [pack('lawn', lawn('Color'), lawn('NormalGL'), lawn('Roughness'), lawn('AmbientOcclusion'), 1024, .84)]
for asset, name in [('sparse_grass', 'soil'), ('leafy_grass', 'litter')]:
    color, normal, arm = photo(asset, 'Diffuse', 'diff'), photo(asset, 'nor_gl', 'nor_gl'), photo(asset, 'arm', 'arm')
    layers.append(pack(name, color, normal, arm.getchannel('G'), arm.getchannel('R'), 512, 1.2))
files = {f: dict(bytes=(OUT/f).stat().st_size, sha256=digest((OUT/f).read_bytes())) for layer in layers for f in layer['files']}
manifest = dict(schemaVersion=1, license='CC0-1.0', layers=layers, files=files,
    sources=[dict(id='Grass001', url='https://ambientcg.com/view?id=Grass001', author='ambientCG / Lennart Demes', technique='procedural'),
             dict(id='sparse_grass', url='https://polyhaven.com/a/sparse_grass', author='Amal Kumar', technique='photographic surface'),
             dict(id='leafy_grass', url='https://polyhaven.com/a/leafy_grass', author='Charlotte Baglioni', technique='photographic surface')],
    sourceChecks=checks, downloadBytes=sum(x['bytes'] for x in files.values()),
    conservativeRGBABytesWithMipmaps=sum(int(layer['width']**2*4*4/3)*2 for layer in layers),
    notes=['World-space texture scale respects 0.60 city scale.', 'Static opaque PBR surface; no additional render targets.', 'Texture bytes are network sizes, not GPU memory.'])
(OUT/'materials.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['downloadBytes','conservativeRGBABytesWithMipmaps']}, indent=2))
