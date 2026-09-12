#!/usr/bin/env python3
"""Host entry and Blender worker for one isolated landmark candidate.

Host code is standard-library only. city_mesh and the preview environment are
imported only inside a dedicated Blender subprocess. The convenience export()
in city_mesh writes public/city and must not be called.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import struct
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
CANDIDATE_ROOT = (ROOT / "artifacts/landmark-candidates").resolve()
PUBLIC_CITY = (ROOT / "public/city").resolve()
DEFAULT_BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
DEFAULT_CITY = ROOT / "public/city/city.json"

SUPPORTED = {
    "tencent": {
        "module": "scripts/landmarks/tencent.py",
        "spec": "data/landmarks/tencent.json",
        "city_landmark_id": "tencent",
        "finish_name": "landmark_tencent",
        "glb_name": "landmark_tencent.glb",
    },
    "bamboo": {
        "module": "scripts/landmarks/bamboo.py",
        "spec": "data/landmarks/bamboo.json",
        "city_landmark_id": "bamboo",
        "finish_name": "landmark_bamboo",
        "glb_name": "landmark_bamboo.glb",
    },
    "pingan": {
        "module": "scripts/landmarks/pingan.py",
        "spec": "data/landmarks/pingan.json",
        "city_landmark_id": "pingan",
        "finish_name": "landmark_pingan",
        "glb_name": "landmark_pingan.glb",
    },
    "kk100": {
        "module": "scripts/landmarks/kk100.py",
        "spec": "data/landmarks/kk100.json",
        "city_landmark_id": "kk100",
        "finish_name": "landmark_kk100",
        "glb_name": "landmark_kk100.glb",
    },
    "diwang": {
        "module": "scripts/landmarks/diwang.py",
        "spec": "data/landmarks/diwang.json",
        "city_landmark_id": "diwang",
        "finish_name": "landmark_diwang",
        "glb_name": "landmark_diwang.glb",
    },
    "guomao": {
        "module": "scripts/landmarks/guomao.py",
        "spec": "data/landmarks/guomao.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_guomao",
        "glb_name": "landmark_guomao.glb",
    },
    "seg": {
        "module": "scripts/landmarks/seg.py",
        "spec": "data/landmarks/seg.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_seg",
        "glb_name": "landmark_seg.glb",
    },
    "stock-exchange": {
        "module": "scripts/landmarks/stock_exchange.py",
        "spec": "data/landmarks/stock-exchange.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_stock_exchange",
        "glb_name": "landmark_stock_exchange.glb",
    },
    "bay-sports": {
        "module": "scripts/landmarks/bay_sports.py",
        "spec": "data/landmarks/bay-sports.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_bay_sports",
        "glb_name": "landmark_bay_sports.glb",
    },
    "bay-one": {
        "module": "scripts/landmarks/bay_one.py",
        "spec": "data/landmarks/bay-one.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_bay_one",
        "glb_name": "landmark_bay_one.glb",
    },
    "hanking": {
        "module": "scripts/landmarks/hanking.py",
        "spec": "data/landmarks/hanking.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_hanking",
        "glb_name": "landmark_hanking.glb",
    },
    "grand-theater": {
        "module": "scripts/landmarks/grand_theater.py",
        "spec": "data/landmarks/grand-theater.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_grand_theater",
        "glb_name": "landmark_grand_theater.glb",
    },
    "concert-hall": {
        "module": "scripts/landmarks/concert_hall.py",
        "spec": "data/landmarks/concert-hall.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_concert_hall",
        "glb_name": "landmark_concert_hall.glb",
    },
    "library-center": {
        "module": "scripts/landmarks/library_center.py",
        "spec": "data/landmarks/library-center.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_library_center",
        "glb_name": "landmark_library_center.glb",
    },
    "mocata": {
        "module": "scripts/landmarks/mocata.py",
        "spec": "data/landmarks/mocata.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_mocata",
        "glb_name": "landmark_mocata.glb",
    },
    "convention-futian": {
        "module": "scripts/landmarks/convention_futian.py",
        "spec": "data/landmarks/convention-futian.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_convention_futian",
        "glb_name": "landmark_convention_futian.glb",
    },
    "book-mall": {
        "module": "scripts/landmarks/book_mall.py",
        "spec": "data/landmarks/book-mall.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_book_mall",
        "glb_name": "landmark_book_mall.glb",
    },
    "youth-palace": {
        "module": "scripts/landmarks/youth_palace.py",
        "spec": "data/landmarks/youth-palace.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_youth_palace",
        "glb_name": "landmark_youth_palace.glb",
    },
    "guanshanyue": {
        "module": "scripts/landmarks/guanshanyue.py",
        "spec": "data/landmarks/guanshanyue.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_guanshanyue",
        "glb_name": "landmark_guanshanyue.glb",
    },
    "futian-station": {
        "module": "scripts/landmarks/futian_station.py",
        "spec": "data/landmarks/futian-station.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_futian_station",
        "glb_name": "landmark_futian_station.glb",
    },
    "baypark": {
        "module": "scripts/landmarks/baypark.py",
        "spec": "data/landmarks/baypark.json",
        "city_landmark_id": "baypark",
        "finish_name": "landmark_baypark",
        "glb_name": "landmark_baypark.glb",
    },
    "talent": {
        "module": "scripts/landmarks/talent.py",
        "spec": "data/landmarks/talent.json",
        "city_landmark_id": "talent",
        "finish_name": "landmark_talent",
        "glb_name": "landmark_talent.glb",
    },
    "xiangmi": {
        "module": "scripts/landmarks/xiangmi.py",
        "spec": "data/landmarks/xiangmi.json",
        "city_landmark_id": "xiangmi",
        "finish_name": "landmark_xiangmi",
        "glb_name": "landmark_xiangmi.glb",
    },
    "lizhi": {
        "module": "scripts/landmarks/lizhi.py",
        "spec": "data/landmarks/lizhi.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_lizhi",
        "glb_name": "landmark_lizhi.glb",
    },
    "coco-park": {
        "module": "scripts/landmarks/coco_park.py",
        "spec": "data/landmarks/coco-park.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_coco_park",
        "glb_name": "landmark_coco_park.glb",
    },
    "window-world": {
        "module": "scripts/landmarks/window_world.py",
        "spec": "data/landmarks/window-world.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_window_world",
        "glb_name": "landmark_window_world.glb",
    },
    "mangrove": {
        "module": "scripts/landmarks/mangrove.py",
        "spec": "data/landmarks/mangrove.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_mangrove",
        "glb_name": "landmark_mangrove.glb",
    },
    "bijia": {
        "module": "scripts/landmarks/bijia.py",
        "spec": "data/landmarks/bijia.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_bijia",
        "glb_name": "landmark_bijia.glb",
    },
    "central-park": {
        "module": "scripts/landmarks/central_park.py",
        "spec": "data/landmarks/central-park.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_central_park",
        "glb_name": "landmark_central_park.glb",
    },
    "oct-harbour": {
        "module": "scripts/landmarks/oct_harbour.py",
        "spec": "data/landmarks/oct-harbour.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_oct_harbour",
        "glb_name": "landmark_oct_harbour.glb",
    },
    "shanghai-hotel": {
        "module": "scripts/landmarks/shanghai_hotel.py",
        "spec": "data/landmarks/shanghai-hotel.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_shanghai_hotel",
        "glb_name": "landmark_shanghai_hotel.glb",
    },
    "mixc-luohu": {
        "module": "scripts/landmarks/mixc_luohu.py",
        "spec": "data/landmarks/mixc-luohu.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_mixc_luohu",
        "glb_name": "landmark_mixc_luohu.glb",
    },
    "coastal-city": {
        "module": "scripts/landmarks/coastal_city.py",
        "spec": "data/landmarks/coastal-city.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_coastal_city",
        "glb_name": "landmark_coastal_city.glb",
    },
    "sea-world": {
        "module": "scripts/landmarks/sea_world.py",
        "spec": "data/landmarks/sea-world.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_sea_world",
        "glb_name": "landmark_sea_world.glb",
    },
    "qijie-gongguan": {
        "module": "scripts/landmarks/qijie_gongguan.py",
        "spec": "data/landmarks/qijie-gongguan.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_qijie_gongguan",
        "glb_name": "landmark_qijie_gongguan.glb",
    },
    "dongmen": {
        "module": "scripts/landmarks/dongmen.py",
        "spec": "data/landmarks/dongmen.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_dongmen",
        "glb_name": "landmark_dongmen.glb",
    },
    "futian-axis": {
        "module": "scripts/landmarks/futian_axis.py",
        "spec": "data/landmarks/futian-axis.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_futian_axis",
        "glb_name": "landmark_futian_axis.glb",
    },
    "houhai": {
        "module": "scripts/landmarks/houhai.py",
        "spec": "data/landmarks/houhai.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_houhai",
        "glb_name": "landmark_houhai.glb",
    },
    "caiwuwei": {
        "module": "scripts/landmarks/caiwuwei.py",
        "spec": "data/landmarks/caiwuwei.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_caiwuwei",
        "glb_name": "landmark_caiwuwei.glb",
    },
    "tech-park": {
        "module": "scripts/landmarks/tech_park.py",
        "spec": "data/landmarks/tech-park.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_tech_park",
        "glb_name": "landmark_tech_park.glb",
    },
    "huaqiangbei": {
        "module": "scripts/landmarks/huaqiangbei.py",
        "spec": "data/landmarks/huaqiangbei.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_huaqiangbei",
        "glb_name": "landmark_huaqiangbei.glb",
    },
    "design-society": {
        "module": "scripts/landmarks/design_society.py",
        "spec": "data/landmarks/design-society.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_design_society",
        "glb_name": "landmark_design_society.glb",
    },
    "airport-t3": {
        "module": "scripts/landmarks/airport_t3.py",
        "spec": "data/landmarks/airport-t3.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_airport_t3",
        "glb_name": "landmark_airport_t3.glb",
    },
    "universiade": {
        "module": "scripts/landmarks/universiade.py",
        "spec": "data/landmarks/universiade.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_universiade",
        "glb_name": "landmark_universiade.glb",
    },
    "happy-harbor": {
        "module": "scripts/landmarks/happy_harbor.py",
        "spec": "data/landmarks/happy-harbor.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_happy_harbor",
        "glb_name": "landmark_happy_harbor.glb",
    },
    "shenzhen-north": {
        "module": "scripts/landmarks/shenzhen_north.py",
        "spec": "data/landmarks/shenzhen-north.json",
        "city_landmark_id": None,
        "allow_spec_anchor": True,
        "finish_name": "landmark_shenzhen_north",
        "glb_name": "landmark_shenzhen_north.glb",
    },
}

FORBIDDEN_OUTPUT_NAMES = ("public", "src", "data", "scripts", "tests")
PREVIEW_VIEWS = ("front", "back", "left", "right", "top", "street_three_quarter")
PREVIEW_RESOLUTION = (1280, 960)
PREVIEW_TOP_PADDING = 1.32


def top_ortho_scale(size_x, size_y, resolution=PREVIEW_RESOLUTION, padding=PREVIEW_TOP_PADDING, sensor_fit="HORIZONTAL"):
    aspect = resolution[0] / resolution[1]
    if sensor_fit == "HORIZONTAL":
        return max(size_x, size_y * aspect) * padding
    return max(size_y, size_x / aspect) * padding


def top_ortho_extents(ortho_scale, resolution=PREVIEW_RESOLUTION, sensor_fit="HORIZONTAL"):
    aspect = resolution[0] / resolution[1]
    if sensor_fit == "HORIZONTAL":
        return ortho_scale, ortho_scale / aspect
    return ortho_scale * aspect, ortho_scale


class CandidateError(Exception):
    def __init__(self, message, code=2):
        super().__init__(message)
        self.code = code


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_tree(root):
    root = Path(root)
    files = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.name == ".DS_Store":
            continue
        files[str(path.relative_to(root)).replace("\\", "/")] = sha256_file(path)
    return files


def tree_fingerprint(files):
    digest = hashlib.sha256()
    for relative, value in sorted(files.items()):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(value.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def compare_maps(before, after, label):
    changed = []
    for key in sorted(set(before) | set(after)):
        if before.get(key) != after.get(key):
            changed.append({
                "path": key,
                "before": before.get(key),
                "after": after.get(key),
            })
    return {"label": label, "unchanged": not changed, "changed": changed}


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def resolve_project_path(value):
    if not value:
        raise CandidateError("path is required")
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def is_relative_to(path, parent):
    path = Path(path).resolve()
    parent = Path(parent).resolve()
    return path == parent or parent in path.parents


def resolve_output_dir(value):
    if value is None or str(value).strip() == "":
        raise CandidateError("output directory is required")
    output = resolve_project_path(value)
    if output.exists() and output.is_file():
        raise CandidateError(f"output path is a file: {output}")
    if is_relative_to(output, PUBLIC_CITY) or is_relative_to(output, ROOT / "public"):
        raise CandidateError(f"forbidden output path under public: {output}")
    if not is_relative_to(output, CANDIDATE_ROOT):
        raise CandidateError(
            f"output must resolve under {CANDIDATE_ROOT}, got {output}"
        )
    for name in FORBIDDEN_OUTPUT_NAMES:
        blocked = (ROOT / name).resolve()
        if is_relative_to(output, blocked):
            raise CandidateError(f"forbidden output path under {name}/: {output}")
    return output


def allocate_run_dir(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run = output / f"run-{stamp}"
    if run.exists():
        run = output / f"run-{stamp}-{os.getpid()}"
    run.mkdir(parents=True, exist_ok=False)
    return run


def supported_record(object_id):
    if object_id not in SUPPORTED:
        known = ", ".join(sorted(SUPPORTED))
        raise CandidateError(
            f"unsupported object: {object_id}; this runner only supports {known}"
        )
    return SUPPORTED[object_id]


def landmark_from_spec_anchor(spec, city_data, object_id):
    """Game x/z from a labelled spec anchor when city.json has no named landmark."""
    anchor = spec.get("anchor") or {}
    lon, lat = anchor.get("lon"), anchor.get("lat")
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        raise CandidateError(f"spec {object_id} is missing numeric anchor lon/lat")
    origin = city_data["meta"]["originWGS84"]
    scale = city_data["meta"]["horizontalScale"]
    x = (lon - origin[0]) * 102850 * scale
    z = (lat - origin[1]) * 111320 * scale
    return {
        "id": object_id,
        "name": spec.get("name", object_id),
        "lon": lon,
        "lat": lat,
        "x": x,
        "z": z,
        "height": 0,
        "source": "spec-anchor-reported",
    }


def _reject_escaped_or_public(path, kind):
    if not is_relative_to(path, ROOT):
        raise CandidateError(f"{kind} is outside the repository: {path}")
    if is_relative_to(path, PUBLIC_CITY) or is_relative_to(path, ROOT / "public"):
        raise CandidateError(f"{kind} must not resolve under public: {path}")


def resolve_source_file(value, *, suffix, canonical, kind):
    if value is None or str(value).strip() == "":
        value = str(canonical.relative_to(ROOT))
    path = resolve_project_path(value)
    _reject_escaped_or_public(path, kind)
    if path.suffix.lower() != suffix:
        raise CandidateError(f"{kind} must be a {suffix} file, got {path}")
    if path == canonical:
        if not path.is_file():
            raise CandidateError(f"missing {kind}: {path}")
        return path, "canonical"
    if is_relative_to(path, CANDIDATE_ROOT):
        if not path.is_file():
            raise CandidateError(f"missing {kind}: {path}")
        return path, "candidate"
    raise CandidateError(
        f"{kind} must be {canonical.relative_to(ROOT)} or a {suffix} file "
        f"under artifacts/landmark-candidates after path resolve, got {path}"
    )


def resolve_module_path(object_id, value):
    record = supported_record(object_id)
    return resolve_source_file(
        value,
        suffix=".py",
        canonical=(ROOT / record["module"]).resolve(),
        kind="module",
    )


def resolve_spec_path(object_id, value):
    record = supported_record(object_id)
    return resolve_source_file(
        value,
        suffix=".json",
        canonical=(ROOT / record["spec"]).resolve(),
        kind="spec",
    )


def load_build_module(module_path):
    path = Path(module_path).resolve()
    spec = importlib.util.spec_from_file_location("landmark_candidate_object_module", path)
    if spec is None or spec.loader is None:
        raise CandidateError(f"cannot import module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    build = getattr(module, "build", None)
    if not callable(build):
        raise CandidateError(f"module has no build(b, lm, spec, scale): {path}")
    return module


def validate_request(object_id, module, spec, output, city=None, scale=None):
    record = supported_record(object_id)
    output_dir = resolve_output_dir(output)
    module_path, module_kind = resolve_module_path(object_id, module)
    spec_path, spec_kind = resolve_spec_path(object_id, spec)
    city_path = resolve_project_path(city or DEFAULT_CITY)
    if not city_path.is_file():
        raise CandidateError(f"missing city json: {city_path}")
    payload = json.loads(spec_path.read_text(encoding="utf-8"))
    if payload.get("id") != object_id:
        raise CandidateError(f"spec id {payload.get('id')!r} does not match {object_id}")
    city_data = json.loads(city_path.read_text(encoding="utf-8"))
    landmark = None
    city_landmark_id = record.get("city_landmark_id")
    if city_landmark_id:
        landmark = next(
            (item for item in city_data.get("landmarks", []) if item.get("id") == city_landmark_id),
            None,
        )
    if landmark is None and record.get("allow_spec_anchor"):
        landmark = landmark_from_spec_anchor(payload, city_data, object_id)
    if landmark is None:
        raise CandidateError(f"city.json has no landmark {city_landmark_id}")
    for key in ("x", "z"):
        if key not in landmark:
            raise CandidateError(f"city landmark missing {key}")
    resolved_scale = scale if scale is not None else city_data["meta"]["horizontalScale"]
    if not isinstance(resolved_scale, (int, float)) or isinstance(resolved_scale, bool) or resolved_scale <= 0:
        raise CandidateError("scale must be a positive finite number")
    return {
        "objectId": object_id,
        "record": record,
        "module": module_path,
        "moduleKind": module_kind,
        "spec": spec_path,
        "specKind": spec_kind,
        "city": city_path,
        "output": output_dir,
        "scale": float(resolved_scale),
        "landmark": landmark,
        "cityMeta": {
            "originWGS84": city_data["meta"]["originWGS84"],
            "horizontalScale": city_data["meta"]["horizontalScale"],
            "verticalScale": city_data["meta"].get("verticalScale"),
        },
    }


def input_hashes(request):
    paths = {
        "module": request["module"],
        "spec": request["spec"],
        "city": request["city"],
        "city_mesh": ROOT / "scripts/city_mesh.py",
        "host": Path(__file__).resolve(),
        "preview": ROOT / "scripts/landmarks/candidate_preview.py",
    }
    return {
        key: {"path": str(path), "sha256": sha256_file(path), "bytes": path.stat().st_size}
        for key, path in paths.items()
    }


def glb_stats(path):
    data = Path(path).read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("model is not GLB")
    version, length, chunk_len, chunk_type = struct.unpack_from("<IIII", data, 4)
    if version != 2 or length != len(data) or chunk_type != 0x4E4F534A or 20 + chunk_len > len(data):
        raise ValueError("GLB header or JSON chunk is invalid")
    gltf = json.loads(data[20:20 + chunk_len])
    triangles = 0
    materials = set()
    mesh_names = []
    extras = []
    for mesh in gltf.get("meshes", []):
        mesh_names.append(mesh.get("name", ""))
        for primitive in mesh.get("primitives", []):
            accessor = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))
            if accessor is None:
                raise ValueError("GLB primitive missing POSITION/indices")
            count = gltf["accessors"][accessor]["count"]
            mode = primitive.get("mode", 4)
            if mode == 4:
                if count % 3:
                    raise ValueError("GLB triangle count is not a multiple of 3")
                triangles += count // 3
            elif mode in (5, 6):
                triangles += max(0, count - 2)
            else:
                raise ValueError("candidate GLB must use triangle meshes")
            if "material" in primitive:
                materials.add(primitive["material"])
    for kind, items in (("cameras", gltf.get("cameras", [])), ("lights", gltf.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", []))):
        if items:
            extras.append(kind)
    nodes = gltf.get("nodes", [])
    if any("camera" in node or "KHR_lights_punctual" in node.get("extensions", {}) for node in nodes):
        extras.append("nodes")
    if extras:
        raise ValueError(f"candidate GLB contains preview extras: {sorted(set(extras))}")
    if not triangles:
        raise ValueError("GLB has no triangles")
    material_names = [item.get("name", "") for item in gltf.get("materials", [])]
    return {
        "path": str(Path(path)),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "triangles": triangles,
        "meshes": len(gltf.get("meshes", [])),
        "materials": len(gltf.get("materials", [])),
        "materialNames": material_names,
        "meshNames": mesh_names,
        "source": "delivered GLB JSON chunk and file bytes",
    }


def png_info(path):
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    width, height = struct.unpack(">II", data[16:24])
    if width < 32 or height < 32 or len(data) < 2048:
        raise ValueError(f"PNG too small to inspect: {path}")
    return {
        "path": str(path),
        "width": width,
        "height": height,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def collect_views(run_dir):
    images = {"clay": {}, "material": {}}
    for mode in images:
        for name in PREVIEW_VIEWS:
            path = run_dir / "views" / mode / f"{name}.png"
            images[mode][name] = png_info(path)
    return images


def review_text(report):
    stats = report["glb"]
    views = report["views"]
    public = report["publicCity"]
    lines = [
        f"# 候选预览复核：{report['objectId']}",
        "",
        f"- 运行目录：`{report['runDir']}`",
        f"- 模块：`{report['inputs']['module']['path']}`（{report.get('moduleKind', 'unknown')}）",
        f"- 规格：`{report['inputs']['spec']['path']}`（{report.get('specKind', 'unknown')}）",
        f"- GLB：`{Path(stats['path']).name}`，{stats['triangles']} 三角形，{stats['meshes']} mesh，{stats['materials']} 材质，{stats['bytes']} 字节。",
        f"- 统计来自交付 GLB，不是旧 landmark-detail 清单复制。",
        f"- 灰模 6 张、材质 6 张；相机/灯光/渲染记录见 `worker.json` 与 `report.json`。",
        f"- public/city 文件数 {public['before']['fileCount']}，运行前后指纹{('一致' if public['unchanged'] else '不一致')}。",
        "",
        "预览只检查独立候选的体块与材质分区。它不是游戏碰撞、浏览器加载、或 RTX 3060 性能通过。",
        "本轮没有重新设计建筑，也没有写入总资产。",
        "",
        "## 视角文件",
    ]
    for mode in ("clay", "material"):
        lines.append(f"### {mode}")
        for name, info in views[mode].items():
            lines.append(f"- {name}: `{Path(info['path']).name}` {info['width']}×{info['height']} {info['bytes']} bytes")
    lines.append("")
    return "\n".join(lines) + "\n"


def host_command(argv):
    return [sys.executable, str(Path(__file__).resolve()), *argv]


def blender_command(blender, job_path):
    return [
        str(blender),
        "--background",
        "--factory-startup",
        "--python",
        str(Path(__file__).resolve()),
        "--",
        "--worker",
        "--job",
        str(job_path),
    ]


def parse_host_args(argv):
    parser = argparse.ArgumentParser(
        description="Export one supported landmark candidate into artifacts/landmark-candidates."
    )
    sub = parser.add_subparsers(dest="command")
    export = sub.add_parser("export", help="validate inputs and export one candidate")
    export.add_argument("--id", required=True)
    export.add_argument("--module", required=True)
    export.add_argument("--spec", default=None, help="defaults to the supported object's spec")
    export.add_argument("--output", required=True)
    export.add_argument("--city", default=str(DEFAULT_CITY))
    export.add_argument("--scale", type=float, default=None)
    export.add_argument("--blender", default=str(DEFAULT_BLENDER))
    worker = parser.add_argument_group("internal Blender worker")
    worker.add_argument("--worker", action="store_true")
    worker.add_argument("--job", default=None)
    args = parser.parse_args(argv)
    return args


def run_host(args, argv):
    request = validate_request(args.id, args.module, args.spec, args.output, args.city, args.scale)
    blender = Path(args.blender).expanduser()
    if not blender.is_absolute():
        blender = (ROOT / blender).resolve() if (ROOT / blender).exists() else blender.resolve()
    else:
        blender = blender.resolve()
    if not blender.is_file() or not os.access(blender, os.X_OK):
        raise CandidateError(f"Blender executable not available: {blender}", code=1)

    public_before = hash_tree(PUBLIC_CITY)
    inputs_before = input_hashes(request)
    run_dir = allocate_run_dir(request["output"])
    job = {
        "objectId": request["objectId"],
        "module": str(request["module"]),
        "moduleKind": request["moduleKind"],
        "spec": str(request["spec"]),
        "specKind": request["specKind"],
        "city": str(request["city"]),
        "scale": request["scale"],
        "landmark": request["landmark"],
        "finishName": request["record"]["finish_name"],
        "glbName": request["record"]["glb_name"],
        "runDir": str(run_dir),
        "root": str(ROOT),
    }
    write_json(run_dir / "job.json", job)
    write_json(run_dir / "public-city-before.json", {
        "fileCount": len(public_before),
        "aggregateSha256": tree_fingerprint(public_before),
        "files": public_before,
    })
    write_json(run_dir / "inputs-before.json", inputs_before)

    command = blender_command(blender, run_dir / "job.json")
    log_path = run_dir / "blender.log"
    with log_path.open("w", encoding="utf-8") as log:
        log.write("HOST " + " ".join(host_command(argv)) + "\n")
        log.write("BLENDER " + " ".join(command) + "\n")
        log.flush()
        result = subprocess.run(command, cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT, text=True)

    public_after = hash_tree(PUBLIC_CITY)
    inputs_after = input_hashes(request)
    public_cmp = compare_maps(public_before, public_after, "public/city")
    input_cmp = compare_maps(
        {key: value["sha256"] for key, value in inputs_before.items()},
        {key: value["sha256"] for key, value in inputs_after.items()},
        "candidate inputs",
    )
    write_json(run_dir / "public-city-after.json", {
        "fileCount": len(public_after),
        "aggregateSha256": tree_fingerprint(public_after),
        "files": public_after,
    })
    write_json(run_dir / "hash-compare.json", {"publicCity": public_cmp, "inputs": input_cmp})

    if result.returncode != 0:
        write_json(run_dir / "failure.json", {
            "ok": False,
            "reason": "blender_subprocess_failed",
            "returncode": result.returncode,
            "log": str(log_path),
            "publicCityUnchanged": public_cmp["unchanged"],
            "inputsUnchanged": input_cmp["unchanged"],
        })
        raise CandidateError(
            f"Blender subprocess failed with {result.returncode}; see {log_path}",
            code=1,
        )

    if (run_dir / "report.json").exists():
        raise CandidateError("worker must not write a host success report", code=1)

    worker_path = run_dir / "worker.json"
    if not worker_path.is_file():
        raise CandidateError("worker.json missing after Blender exit 0", code=1)
    worker = json.loads(worker_path.read_text(encoding="utf-8"))
    glb_path = run_dir / request["record"]["glb_name"]
    try:
        stats = glb_stats(glb_path)
        views = collect_views(run_dir)
    except (OSError, ValueError, KeyError, struct.error) as exc:
        raise CandidateError(f"delivered artifacts failed inspection: {exc}", code=1)
    if not public_cmp["unchanged"] or not input_cmp["unchanged"]:
        write_json(run_dir / "failure.json", {
            "ok": False,
            "reason": "hash_mismatch",
            "publicCity": public_cmp,
            "inputs": input_cmp,
        })
        raise CandidateError("public/city or readonly inputs changed during export", code=1)

    report = {
        "ok": True,
        "objectId": request["objectId"],
        "moduleKind": request["moduleKind"],
        "specKind": request["specKind"],
        "runDir": str(run_dir),
        "commands": {
            "host": host_command(argv),
            "blender": command,
        },
        "inputs": inputs_after,
        "landmark": {
            "id": request["landmark"]["id"],
            "name": request["landmark"].get("name"),
            "lon": request["landmark"].get("lon"),
            "lat": request["landmark"].get("lat"),
            "x": request["landmark"]["x"],
            "z": request["landmark"]["z"],
            "source": str(request["city"]),
        },
        "scale": request["scale"],
        "glb": stats,
        "buildReport": worker.get("buildReport"),
        "exportedObjects": worker.get("exportedObjects"),
        "preview": worker.get("preview"),
        "views": views,
        "publicCity": {
            "before": {"fileCount": len(public_before), "aggregateSha256": tree_fingerprint(public_before)},
            "after": {"fileCount": len(public_after), "aggregateSha256": tree_fingerprint(public_after)},
            "unchanged": True,
        },
        "limitations": [
            "Preview is not game collision acceptance.",
            "Preview is not browser loading or visual acceptance.",
            "Preview is not RTX 3060 or any runtime performance acceptance.",
            "This run did not redesign the building or publish shared assets.",
        ],
    }
    write_json(run_dir / "report.json", report)
    (run_dir / "review.md").write_text(review_text(report), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "runDir": str(run_dir),
        "glb": stats,
        "viewCount": sum(len(group) for group in views.values()),
        "publicCityUnchanged": True,
    }, ensure_ascii=False, indent=2))
    return 0


def run_worker(job_path):
    job = json.loads(Path(job_path).read_text(encoding="utf-8"))
    run_dir = Path(job["runDir"]).resolve()
    if not is_relative_to(run_dir, CANDIDATE_ROOT):
        raise CandidateError(f"worker refuses to write outside candidate root: {run_dir}", code=1)
    object_id = job.get("objectId")
    if object_id not in SUPPORTED:
        raise CandidateError(f"unsupported object in worker: {object_id}", code=1)
    module_path, module_kind = resolve_module_path(object_id, job["module"])
    spec_path, spec_kind = resolve_spec_path(object_id, job["spec"])

    sys.path.insert(0, str(SCRIPTS))
    from city_mesh import B
    from landmarks import candidate_preview
    builder_module = load_build_module(module_path)

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    landmark = job["landmark"]
    builder = B()
    build_report = builder_module.build(builder, landmark, spec, job["scale"])
    objects = builder.finish(job["finishName"])
    if not objects:
        raise CandidateError("B.finish returned no objects", code=1)
    unexpected = [ob.name for ob in objects if ob.type != "MESH"]
    if unexpected:
        raise CandidateError(f"finish produced non-mesh objects: {unexpected}", code=1)

    glb_path = run_dir / job["glbName"]
    import bpy
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.hide_set(False)
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_materials="EXPORT",
    )
    if not glb_path.is_file():
        raise CandidateError(f"GLB was not written: {glb_path}", code=1)

    preview = candidate_preview.render_preview(objects, run_dir)
    worker = {
        "ok": True,
        "objectId": job["objectId"],
        "loadedModule": str(module_path),
        "moduleKind": module_kind,
        "loadedSpec": str(spec_path),
        "specKind": spec_kind,
        "buildReport": build_report,
        "exportedObjects": [
            {
                "name": ob.name,
                "type": ob.type,
                "triangles": sum(len(polygon.vertices) - 2 for polygon in ob.data.polygons),
                "materials": [mat.name for mat in ob.data.materials],
            }
            for ob in objects
        ],
        "preview": preview,
        "blender": bpy.app.version_string,
        "usedCityMeshExport": False,
    }
    write_json(run_dir / "worker.json", worker)
    print("CANDIDATE_WORKER_OK", json.dumps({"glb": str(glb_path), "objects": len(objects)}), flush=True)
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    try:
        args = parse_host_args(argv)
        if args.worker:
            if not args.job:
                raise CandidateError("--job is required for --worker")
            return run_worker(args.job)
        if args.command != "export":
            raise CandidateError("use: landmark_candidate.py export --id --module --spec --output")
        return run_host(args, argv)
    except CandidateError as exc:
        print(f"CANDIDATE_ERROR {exc}", file=sys.stderr)
        return exc.code


if __name__ == "__main__":
    sys.exit(main())
