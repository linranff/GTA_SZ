"""Prepare two shared road maps from Poly Haven's CC0 asphalt_floor scan.

Run with .venv/bin/python scripts/prepare_cinematic_road.py --download.
With --source-dir, preparation is offline. --orm-only preserves the normal file.
No Blender scene is imported.
The albedo belongs to the landscape pass and is deliberately not regenerated.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/city/textures/road-cinematic"
MANIFEST = ROOT / "data/materials/road-cinematic.json"
SOURCE = {
    "normal.png": {
        "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/asphalt_floor/asphalt_floor_nor_gl_1k.png",
        "sha256": "dbd2f10be9249626426f1922f04319cba114af30fad05b9c46a154eea28f86dd",
    },
    "arm.png": {
        "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/asphalt_floor/asphalt_floor_arm_1k.png",
        "sha256": "da13bdd60a4a832e9f6f748c9520a438d1c742214e3adb9a81cd61fbb725802b",
    },
}


def periodic_field(size: int, seed: int, bands: tuple[tuple[int, int, float], ...]) -> np.ndarray:
    """Smooth periodic variation at several scales, with no lighting direction."""
    rng = np.random.default_rng(seed)
    axis = np.arange(size, dtype=np.float32) * (2 * np.pi / size)
    x, y = axis[None, :], axis[:, None]
    field = np.zeros((size, size), np.float32)
    for low, high, amplitude in bands:
        for _ in range(8):
            kx = int(rng.integers(low, high + 1)) * rng.choice([-1, 1])
            ky = int(rng.integers(low, high + 1)) * rng.choice([-1, 1])
            field += amplitude * np.cos(x * kx + y * ky + rng.uniform(0, 2 * np.pi)) / 8
    field -= field.mean()
    return field / max(float(field.std()), 1e-6)


def smoothstep(a: np.ndarray) -> np.ndarray:
    a = np.clip(a, 0, 1)
    return a * a * (3 - 2 * a)


def prepare(source_dir: Path, orm_only: bool = False) -> dict:
    for name, source in SOURCE.items():
        if orm_only and name == "normal.png":
            continue
        assert hashlib.sha256((source_dir / name).read_bytes()).hexdigest() == source["sha256"], name
    OUT.mkdir(parents=True, exist_ok=True)
    if orm_only:
        existing = json.loads(MANIFEST.read_text())
        expected = next(item["sha256"] for item in existing["outputs"] if "normal-gl" in item["url"])
        assert hashlib.sha256((OUT / "asphalt-normal-gl.webp").read_bytes()).hexdigest() == expected
        encoded_normal = np.asarray(Image.open(OUT / "asphalt-normal-gl.webp").convert("RGB"))
    else:
        normal = np.asarray(Image.open(source_dir / "normal.png").convert("RGB"), dtype=np.float32) / 127.5 - 1
        # The flat road should not inherit the scan's average tangent-plane tilt.
        normal[:, :, :2] -= normal[:, :, :2].mean(axis=(0, 1))
        normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
        encoded_normal = np.uint8(np.clip(np.rint((normal + 1) * 127.5), 0, 255))
        Image.fromarray(encoded_normal).save(OUT / "asphalt-normal-gl.webp", lossless=True, method=6)

    # Eight scan repeats over an 11.28 game-metre patch. The 2048 map retains
    # 256 roughness texels per scan repeat while the normal remains full 1024.
    size, repeats = 2048, 8
    arm = Image.open(source_dir / "arm.png").convert("RGB").resize((size // repeats, size // repeats), Image.Resampling.LANCZOS)
    scan = np.tile(np.asarray(arm, dtype=np.float32) / 255, (repeats, repeats, 1))
    rough_scan = np.clip((scan[:, :, 1] - .85) / .14, 0, 1)
    macro = periodic_field(size, 97132, ((1, 3, .55), (4, 8, .55), (10, 18, .18)))
    wetness = smoothstep((macro + 1.1) / 3.5)
    # The first integrated screenshot showed large white wet patches. Use a
    # broad, low-contrast transition with more medium-scale breakup. Both ends
    # retain scanned roughness, rather than turning wet areas into flat mirrors.
    dry = .72 + rough_scan * .10
    damp = .52 + rough_scan * .10
    roughness = dry * (1 - wetness) + damp * wetness
    cavity = .94 + scan[:, :, 0] * .06
    orm = np.stack((cavity, roughness, np.zeros_like(roughness)), axis=2)
    encoded_orm = np.uint8(np.clip(np.rint(orm * 255), 0, 255))
    Image.fromarray(encoded_orm).save(OUT / "asphalt-orm.webp", lossless=True, method=6)

    outputs = []
    for name, role, resolution in [
        ("asphalt-normal-gl.webp", "tangent-space OpenGL normal, linear", 1024),
        ("asphalt-orm.webp", "R=cavity AO; G=roughness; B=zero metallic, all linear", 2048),
    ]:
        path = OUT / name
        outputs.append({"url": "/city/textures/road-cinematic/" + name, "role": role, "size": [resolution, resolution], "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    manifest = {
        "version": 1,
        "source": {"title": "Asphalt Floor", "assetId": "asphalt_floor", "author": "eye-candy.xyz", "url": "https://polyhaven.com/a/asphalt_floor", "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license", "downloadMetadataUrl": "https://api.polyhaven.com/files/asphalt_floor", "checkedDate": "2026-09-05", "sourceWidthMetres": 2.35, "sourceWidthEvidence": "Poly Haven info endpoint dimensions 2349.9999 mm; page rounds to 2.3 m", "files": SOURCE},
        "adaptation": {"albedo": "Preserve landscape albedo texture; calibrated linear reflectance multiplier [0.72,0.76,0.79]", "normal": "Convert source to RGB8 lossless WebP, remove mean XY tilt, renormalize; source detail retained at 1K", "roughness": "Original periodic multiscale dampness field blended with tiled scanned aggregate; no baked light, reflection, lane direction or shadows", "gameScale": .60, "sourceGameWidth": 1.41, "ormGameWidth": 11.28, "roadUvWorldDivisor": 14, "roadUvEvidence": "scripts/build_city_detail_assets.py uses (x/14,y/14); current roads.glb decoded world-space position/UV spot-check agrees within quantization tolerance", "normalStrength": .22, "specularIntensity": .38, "runtimeParameterSource": "src/city-road-surface.ts; checked against integration owner's current values", "dryRoughnessFormula": ".72 + .10 * normalizedScannedRoughness", "dampRoughnessFormula": ".52 + .10 * normalizedScannedRoughness", "distribution": "Continuous soft transition, with equal broad/medium frequency weighting and a smaller fine breakup band", "tuningReference": "output/playwright/visual-upgrade/first-integrated/opening-no-hud.png: reduce large white isolated wet spots; new image still requires runtime review", "roughnessPercentiles": {str(p): round(float(np.percentile(roughness, p)), 4) for p in (0, 10, 50, 90, 100)}, "dampAreaFractionAboveHalf": round(float((wetness > .5).mean()), 4)},
        "outputs": outputs,
        "totalBytes": sum(item["bytes"] for item in outputs),
        "estimatedTextureMiBWithMipmapsRGBA8": round((1024**2 + 2048**2) * 4 * 4 / 3 / 1024**2, 2),
        "validation": {"sourceHashes": "pass", "metallicChannelAllZero": bool(np.all(encoded_orm[:, :, 2] == 0)), "roughnessBounds": [int(encoded_orm[:, :, 1].min()), int(encoded_orm[:, :, 1].max())], "normalUnitLengthMaxError": float(np.abs(np.linalg.norm(encoded_normal.astype(np.float32) / 127.5 - 1, axis=2) - 1).max()), "runtimeVisualReview": "pending", "runtimePerformance": "not measured"},
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--orm-only", action="store_true", help="only rebuild ORM; verify and retain the existing normal")
    args = parser.parse_args()
    if args.source_dir:
        report = prepare(args.source_dir, args.orm_only)
    elif args.download:
        with tempfile.TemporaryDirectory(prefix="shenchengji-road-source-") as folder:
            source_dir = Path(folder)
            for name, source in SOURCE.items():
                if args.orm_only and name == "normal.png":
                    continue
                request = urllib.request.Request(source["url"], headers={"User-Agent": "ShenchengjiAssetPreparation/1.0"})
                with urllib.request.urlopen(request, timeout=60) as response:
                    (source_dir / name).write_bytes(response.read())
            report = prepare(source_dir, args.orm_only)
    else:
        parser.error("provide --source-dir for an offline build or --download")
    print(json.dumps({"totalBytes": report["totalBytes"], "adaptation": report["adaptation"], "validation": report["validation"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
