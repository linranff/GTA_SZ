"""Bake the authored panoramic sky to linear RGBE for Babylon PBR + sky.

Blender --background --python scripts/build_sunset_environment.py
This is artistic radiance reconstruction from an AI-generated PNG, not a
measured photographic HDR. The source image remains unchanged.
"""
from pathlib import Path
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/art-direction/shenzhen-fire-sky-panorama.png'
DEST = ROOT / 'public/city/environment/shenzhen-fire-sky.hdr'


def smooth(lo, hi, value):
    t = np.clip((value - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


image = bpy.data.images.load(str(SOURCE), check_existing=False)
image.colorspace_settings.name = 'Non-Color'
w, h = image.size
pixels = np.empty(w * h * 4, dtype=np.float32)
image.pixels.foreach_get(pixels)
# Blender image pixel rows start at the bottom; panorama equations start at top.
rgb = pixels.reshape(h, w, 4)[::-1, :, :3].copy()
u = np.linspace(0, 1, w, endpoint=True)[None, :, None]
v = np.linspace(0, 1, h, endpoint=True)[:, None, None]
# The generated sun was at 55.5% height. Put it 1 degree above the game horizon.
src_v = np.where(v <= .5, v * 1.125, .5625 + (v - .5) * .875)
rows = np.clip(src_v[:, 0, 0] * (h - 1), 0, h - 1)
a = np.floor(rows).astype(int)
b = np.minimum(h - 1, a + 1)
weight = (rows - a)[:, None, None]
rgb = rgb[a] * (1 - weight) + rgb[b] * weight
rgb = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)

# The opposite hemisphere retains cloud luminance in indigo; a feathered
# 57%-of-azimuth fire region prevents the entire dome becoming uniformly red.
fire = smooth(-.46, .24, np.cos((u - .478) * np.pi * 2))
luma = (rgb * np.array([.2126, .7152, .0722])).sum(axis=2, keepdims=True)
indigo = luma * np.array([.27, .39, .90])
rgb = rgb * fire + indigo * (1 - fire)
# Match both image edges and close the spherical poles before cubemap sampling.
seam = smooth(0, .035, np.minimum(u, 1 - u))
rgb = rgb * seam + (rgb + rgb[:, ::-1]) * .5 * (1 - seam)
pole = smooth(0, .032, v)
rgb = rgb * pole + rgb.mean(axis=1, keepdims=True) * (1 - pole)

peak = rgb.max(axis=2, keepdims=True)
rgb *= 2.8 + 5.4 * smooth(.32, .95, peak)
# Artist-authored compact solar radiance gives wet glass a real HDR highlight;
# the visible sky has a separate hue-preserving shoulder in the runtime.
sun = np.exp(-((u - .478) / .0025) ** 2 - ((v - .4933) / .004) ** 2)
rgb += sun * np.array([24.0, 13.0, 3.0])
# The lower hemisphere supplies a muted ground bounce, not clouds underfoot.
ground = smooth(.51, .69, v)
rgb = rgb * (1 - ground) + np.array([.12, .115, .14]) * ground

# Babylon's panorama decoder uses nearest source texels. Resample the baked
# radiance bilinearly before that projection, avoiding visible 8px stair steps
# when a driving camera magnifies a small section of the panorama. This adds
# smooth samples, not invented source detail; the source's native size is kept
# in the provenance record.
dw, dh = 4096, 2048
xs = np.linspace(0, w - 1, dw)
xa = xs.astype(int)
xb = np.minimum(w - 1, xa + 1)
xw = (xs - xa)[None, :, None]
rgb = rgb[:, xa] * (1 - xw) + rgb[:, xb] * xw
ys = np.linspace(0, h - 1, dh)
ya = ys.astype(int)
yb = np.minimum(h - 1, ya + 1)
yw = (ys - ya)[:, None, None]
rgb = rgb[ya] * (1 - yw) + rgb[yb] * yw
output = bpy.data.images.new('Shenzhen Fire Sky - authored linear radiance', width=dw, height=dh, alpha=True, float_buffer=True)
output.colorspace_settings.name = 'Non-Color'
rgba = np.ones((dh, dw, 4), dtype=np.float32)
rgba[:, :, :3] = rgb[::-1]
output.pixels.foreach_set(rgba.ravel())
output.filepath_raw = str(DEST)
output.file_format = 'HDR'
output.save()
print(f'SUNSET_BAKED {dw}x{dh} (source {w}x{h}) maxRadiance={rgb.max():.3f} {DEST}')
