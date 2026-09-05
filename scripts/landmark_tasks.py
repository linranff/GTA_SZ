#!/usr/bin/env python3
"""Export independent landmark jobs; validate evidence and artifact-backed stages.

Standard-library only. No external agent is launched by this program.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
STAGES = ("planned", "evidence-ready", "modelled", "verified")
CHECKS = ("scale", "orientation", "silhouette", "context", "collision", "browser", "performance", "provenance")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def repo_path(value):
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def known(value):
    if value is None or isinstance(value, bool):
        return False
    if isinstance(value, str):
        return value.strip().lower() not in ("", "unknown", "pending", "tbd", "null", "待核实", "待确认", "未知")
    if isinstance(value, (int, float)):
        return finite(value)
    if isinstance(value, dict):
        return bool(value) and all(known(v) for v in value.values())
    if isinstance(value, list):
        return bool(value) and all(known(v) for v in value)
    return False


def required_shapes(place):
    kind = str(place.get("kind", "")).lower()
    if place["id"] == "lianhua" or any(k in kind for k in ("terrain", "hill", "mountain", "山")):
        return ["extent", "elevation_profile", "silhouette"]
    if place["id"] == "tech-park" or any(k in kind for k in ("district", "area", "neighborhood", "片区")):
        return ["extent", "layout", "silhouette"]
    return ["footprint", "height", "orientation", "silhouette"]


def prompt(job, folder):
    place = job["place"]
    return f"""# 独立建模任务：{place['name']}（{place['id']}）

执行者标签：{job['agent']}。标签只用于派工，不表示任何应用已经安装或启动。
项目根目录：{ROOT}
任务文件：{folder / 'job.json'}

先读 `skills/landmark-reconstruction/SKILL.md` 和 `docs/landmarks/agent-workflow.md`，再读 job.json 的 sourceRecord、evidence.json 以及已有对象模块。

目标：依据公开地图、官方/建筑师资料和可核查照片，提高这一对象的实际尺度、朝向、轮廓和组成关系；先形体、后立面细节。不得把估计标成实测，不得凭地点名字猜坐标。照片默认只作观察参考，不作为贴图发布。资料不足时保留 pending，并明确缺什么。

仅写 job.json 中 ownership.workerFiles / workerDirectories 指定的位置。共享城市加载、总构建器、总清单、地形准备和其他对象归主集成人员；发现需要改动时在本任务目录写 integration-notes.md，不直接改共享文件。已有对象模块须保留接口并明确本任务唯一写入者。

交付顺序：
1. 补全 evidence.json：地点身份、EPSG:4326 坐标、带来源与不确定度的形体观察；必需观察类别为 {', '.join(job['requiredShapes'])}。
2. 运行 `.venv/bin/python scripts/landmark_tasks.py check --job '{folder / 'job.json'}' --stage evidence-ready --record`。失败时修复证据或报告阻塞，不跳过。
3. 在 scripts/landmarks/{place['id']}.py 中编写可重复构建的对象模块，使用 scripts/city_mesh.py 的 B API；只有经主集成确认的调用接口才可接入。若尚无独立导出器，交付模块和参数并等待主集成导出，不能虚构 GLB。
4. 真实米制参数保留在证据中。当前游戏 x=(lon-114.025)*102850*0.60，north=(lat-22.536)*111320*0.60；Blender 为 east/north/up，垂直尺度同为0.60。只缩放一次。旧 UTM 参考不能直接混入当前游戏坐标。
5. 填 model.json 的真实文件路径、模型 SHA256、sourceModuleSha256，执行 modelled 检查。任务预算：{json.dumps(job['budget'], ensure_ascii=False)}；这是暂定增量预算，不能据此声称已通过性能验收。
6. 与主集成协作生成至少俯视、远景轮廓、街面高度三个实机视角，记录逐项验收及性能数据到 validation.json。每项必须有可读取证据路径、reviewedBy、reviewedAt。verified 仅由主集成人员结合实机复核推进。

本任务的 evidence.json / model.json / validation.json 模板内 unknown 和 null 必须据实处理，不能批量改为 pass。所有模型更改都会使旧 SHA256 验收失效。若采用总 GLB，由主集成人员设置 artifactMeshPrefix 为 detail_{place['id']}_ 来核对该对象网格；工具保留整包大小与总面数，不伪造独立GLB。

返回：改动文件、来源支持了什么、仍属估计的参数、构建/验证命令及结果、待集成事项。不要声称已调用 Grok、Cursor、ChatGPT 或 Codex 的另一个实例，除非确有调用结果。
"""


def generate(args):
    source = repo_path(args.source)
    if not source.is_file():
        raise ValueError(f"pending: 地点清单不存在：{source}；先完成地点调查")
    payload = read(source)
    places = payload.get("places", []) if isinstance(payload, dict) else payload
    if not isinstance(places, list) or not places:
        raise ValueError("地点清单必须是非空数组或包含非空 places 数组")
    ids = [p.get("id") for p in places]
    if any(not isinstance(i, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", i) for i in ids):
        raise ValueError("每个地点 id 必须为安全且稳定的英文短横线标识")
    if len(ids) != len(set(ids)):
        raise ValueError("地点清单含重复 id")
    requested = set(args.place or [])
    if requested - set(ids):
        raise ValueError(f"找不到地点：{sorted(requested - set(ids))}")
    output = repo_path(args.output)
    result = []
    sources = payload.get("sources", []) if isinstance(payload, dict) else []
    for place in places:
        if requested and place["id"] not in requested:
            continue
        ident = place["id"]
        folder = output / ident
        if (folder / "job.json").exists():
            result.append({"id": ident, "result": "existing-preserved", "job": str(folder / "job.json")})
            continue
        if folder.exists() and any(folder.iterdir()):
            raise ValueError(f"任务目录非空且无 job.json，拒绝覆盖：{folder}")
        folder.mkdir(parents=True, exist_ok=True)
        shapes = required_shapes(place)
        broad = "extent" in shapes
        job = {
            "schemaVersion": 1, "createdAt": stamp(), "stage": "planned", "agent": args.agent,
            "place": {"id": ident, "name": place.get("name", ident), "kind": place.get("kind", "unknown")},
            "sourceManifest": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
            "sourceManifestSha256": digest(source), "sourceRecord": place,
            "requiredShapes": shapes,
            "coordinatePolicy": {"sourceCRS": "EPSG:4326", "originWGS84": [114.025, 22.536],
                "blenderAxes": ["east", "north", "up"], "horizontalScale": 0.60, "verticalScale": 0.60,
                "projection": "equirectangular; x=(lon-114.025)*102850*0.60; y=(lat-22.536)*111320*0.60"},
            "budget": {"status": "provisional", "maxTriangles": 60000 if broad else 25000,
                "maxMaterials": 12, "maxBytes": (12 if broad else 8) * 1024 * 1024, "maxTextureEdge": 2048},
            "ownership": {"workerFiles": [f"scripts/landmarks/{ident}.py"],
                "workerDirectories": [str(folder), f"artifacts/landmarks/{ident}"],
                "integrationOwner": "主集成人员", "sharedFilesRequireIntegration": [
                    "src/city-world.ts", "scripts/build_landmark_details.py", "scripts/prepare_landmark_terrain.py",
                    "public/city/landmark-detail.glb", "data/landmarks/priority-places.json",
                    "scripts/build_city_facades.py", "scripts/finalize_city_assets.mjs",
                    "public/city/buildings.glb", "public/city/facades.glb", "public/city/building-exclusions.json"]},
            "files": {"evidence": "evidence.json", "model": "model.json", "validation": "validation.json"},
            "history": [{"stage": "planned", "at": stamp(), "reason": "task generated; inputs require review"}],
        }
        center = place.get("location", {}).get("center")
        evidence = {"schemaVersion": 1, "placeId": ident,
            "identity": {"status": "unknown", "sourceIds": []},
            "location": {"crs": "EPSG:4326", "center": center, "status": "unknown", "sourceIds": []},
            "sources": sources,
            "observations": [{"kind": k, "value": None, "unit": None, "basis": "unknown",
                "sourceIds": [], "uncertainty": "unknown"} for k in shapes],
            "blockers": place.get("modeling", {}).get("blockers", [])}
        model = {"schemaVersion": 1, "placeId": ident, "artifactPath": f"artifacts/landmarks/{ident}/model.glb",
            "sourceModule": f"scripts/landmarks/{ident}.py", "sha256": None, "sourceModuleSha256": None, "artifactMeshPrefix": None,
            "accuracyClaim": "reference-informed", "estimatedParameters": [], "buildCommand": None}
        validation = {"schemaVersion": 1, "placeId": ident, "artifactSha256": None, "evidenceSha256": None,
            "checks": {k: {"status": "unknown", "evidencePaths": [], "reviewedBy": None,
                "reviewedAt": None, "notes": ""} for k in CHECKS}}
        for name, data in (("job.json", job), ("evidence.json", evidence), ("model.json", model), ("validation.json", validation)):
            write(folder / name, data)
        (folder / "prompt.md").write_text(prompt(job, folder), encoding="utf-8")
        result.append({"id": ident, "result": "created", "stage": "planned", "job": str(folder / "job.json")})
    return {"jobs": result, "externalAgentsLaunched": False}


def evidence_errors(evidence, job):
    errors = []
    sources = {s.get("id"): s for s in evidence.get("sources", [])}

    def backed(ids):
        return bool(ids) and all(i in sources and sources[i].get("url", "").startswith(("https://", "http://"))
            and known(sources[i].get("publisher")) and re.match(r"^\d{4}-\d{2}-\d{2}", str(sources[i].get("accessedAt", "")))
            and sources[i].get("status") not in ("unknown", "pending", "unavailable") for i in ids)

    if evidence.get("placeId") != job["place"]["id"]:
        errors.append("evidence.placeId 不匹配")
    identity = evidence.get("identity", {})
    if identity.get("status") != "confirmed" or not backed(identity.get("sourceIds")):
        errors.append("地点身份未由可追溯来源确认")
    location = evidence.get("location", {})
    center = location.get("center")
    valid_center = isinstance(center, list) and len(center) == 2 and all(finite(v) for v in center)
    if not (location.get("crs") == "EPSG:4326" and valid_center and -180 <= center[0] <= 180
            and -90 <= center[1] <= 90 and location.get("status") == "confirmed" and backed(location.get("sourceIds"))):
        errors.append("坐标须为来源已确认的 EPSG:4326 [lon, lat]")
    for kind in job["requiredShapes"]:
        observations = [o for o in evidence.get("observations", []) if o.get("kind") == kind]
        if not any(known(o.get("value")) and o.get("basis") in ("reported", "measured", "estimated")
                and backed(o.get("sourceIds")) and known(o.get("uncertainty")) for o in observations):
            errors.append(f"缺少 {kind} 的有来源观察及不确定度（不能为 unknown）")
    if evidence.get("blockers"):
        errors.append("evidence.blockers 尚未清空：" + json.dumps(evidence["blockers"], ensure_ascii=False))
    for path, expected in evidence.get("sourceSnapshots", {}).items():
        local = repo_path(path)
        if not local.is_file() or digest(local) != expected:
            errors.append(f"来源快照已缺失或变化，须重新核对：{path}")
    return errors


def glb_stats(path, mesh_prefix=None):
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("模型不是 GLB")
    version, length, chunk_len, chunk_type = struct.unpack_from("<IIII", data, 4)
    if version != 2 or length != len(data) or chunk_type != 0x4E4F534A or 20 + chunk_len > len(data):
        raise ValueError("GLB 头或 JSON 块无效")
    gltf = json.loads(data[20:20 + chunk_len])
    triangles = 0
    total_triangles = 0
    materials = set()
    selected_meshes = 0
    for mesh in gltf.get("meshes", []):
        selected = mesh_prefix is None or mesh.get("name", "").startswith(mesh_prefix)
        if selected:
            selected_meshes += 1
        for primitive in mesh.get("primitives", []):
            accessor = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))
            if accessor is None:
                raise ValueError("GLB primitive 缺少 POSITION/indices")
            count = gltf["accessors"][accessor]["count"]
            mode = primitive.get("mode", 4)
            if mode == 4:
                if count % 3:
                    raise ValueError("GLB 三角形索引/顶点数量不是 3 的倍数")
                primitive_triangles = count // 3
            elif mode in (5, 6):
                primitive_triangles = max(0, count - 2)
            else:
                raise ValueError("重点地标交付须使用三角形网格")
            total_triangles += primitive_triangles
            if selected:
                triangles += primitive_triangles
                if "material" in primitive:
                    materials.add(primitive["material"])
    if not triangles:
        raise ValueError("GLB 没有三角形，或指定对象网格前缀没有匹配")
    return {"triangles": triangles, "materials": len(materials), "bytes": len(data),
        "selectedMeshes": selected_meshes, "meshNamePrefix": mesh_prefix, "wholeFileTriangles": total_triangles,
        "scope": "selected object meshes; bytes refer to whole shared GLB" if mesh_prefix else "whole GLB"}


def assess(path):
    job = read(path)
    folder = path.parent
    errors = {stage: [] for stage in STAGES[1:]}
    contents = {}
    for name, stage in (("evidence", "evidence-ready"), ("model", "modelled"), ("validation", "verified")):
        try:
            contents[name] = read(folder / job["files"][name])
        except (OSError, ValueError, KeyError) as exc:
            errors[stage].append(f"无法读取 {name}：{exc}")
    if "evidence" in contents:
        errors["evidence-ready"] += evidence_errors(contents["evidence"], job)
    model = contents.get("model", {})
    artifact = repo_path(model.get("artifactPath") or "__missing__")
    stats = None
    actual_sha = None
    if model.get("placeId") != job["place"]["id"]:
        errors["modelled"].append("model.placeId 不匹配")
    try:
        mesh_prefix = model.get("artifactMeshPrefix")
        if mesh_prefix is not None and mesh_prefix != f"detail_{job['place']['id']}_":
            raise ValueError("artifactMeshPrefix 须严格对应本任务 detail_<id>_，不能选择其他对象")
        stats = glb_stats(artifact, mesh_prefix)
        actual_sha = digest(artifact)
        if actual_sha != model.get("sha256"):
            errors["modelled"].append("model.sha256 未填写或与当前 GLB 不符")
    except (OSError, ValueError, KeyError, IndexError, struct.error) as exc:
        errors["modelled"].append(f"模型缺失或无效：{exc}")
    if not model.get("sourceModule") or not repo_path(model["sourceModule"]).is_file():
        errors["modelled"].append("可重复构建的 sourceModule 缺失")
    elif digest(repo_path(model["sourceModule"])) != model.get("sourceModuleSha256"):
        errors["modelled"].append("sourceModuleSha256 未填写或源码已变化，需要重新构建")
    if not model.get("buildCommand"):
        errors["modelled"].append("model.buildCommand 未填写")
    validation = contents.get("validation", {})
    if validation.get("placeId") != job["place"]["id"]:
        errors["verified"].append("validation.placeId 不匹配")
    if actual_sha is None or validation.get("artifactSha256") != actual_sha:
        errors["verified"].append("验收未绑定当前 GLB SHA256")
    if "evidence" not in contents or validation.get("evidenceSha256") != digest(folder / job["files"]["evidence"]):
        errors["verified"].append("验收未绑定当前 evidence.json SHA256")
    for kind in CHECKS:
        check = validation.get("checks", {}).get(kind, {})
        if check.get("status") != "pass" or not known(check.get("reviewedBy")) or not re.match(
                r"^\d{4}-\d{2}-\d{2}", str(check.get("reviewedAt", ""))):
            errors["verified"].append(f"{kind} 尚未完成具名验收")
        paths = check.get("evidencePaths", [])
        if not paths or not all(isinstance(p, str) and repo_path(p).is_file() for p in paths):
            errors["verified"].append(f"{kind} 缺少可读取的验收证据文件")
    if stats:
        for field, limit in (("triangles", "maxTriangles"), ("materials", "maxMaterials"), ("bytes", "maxBytes")):
            if stats[field] > job["budget"][limit]:
                errors["verified"].append(f"{field}={stats[field]} 超过任务预算 {job['budget'][limit]}，须由主集成实测后调整并记录理由")
    stage = "planned"
    for candidate in STAGES[1:]:
        if errors[candidate]:
            break
        stage = candidate
    return job, {"id": job["place"]["id"], "recordedStage": job["stage"], "currentStage": stage,
        "errors": errors, "modelStats": stats, "note": "检查结构与证据文件；照片/形体判断须由具名评审实际核对"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("generate", help="生成独立 job.json 与可复制 prompt.md；不覆盖现有任务")
    create.add_argument("--source", default="data/landmarks/priority-places.json")
    create.add_argument("--output", default="artifacts/landmark-jobs")
    create.add_argument("--place", action="append", help="可重复指定；默认全部地点")
    create.add_argument("--agent", default="unassigned", help="派工标签，不启动应用")
    for name in ("status", "check"):
        command = sub.add_parser(name)
        command.add_argument("--job", required=True, help="job.json 路径")
        if name == "check":
            command.add_argument("--stage", choices=STAGES[1:], required=True)
            command.add_argument("--record", action="store_true", help="仅检查通过时记录推进事件")
    args = parser.parse_args()
    try:
        if args.command == "generate":
            result = generate(args)
        else:
            path = repo_path(args.job)
            job, result = assess(path)
            if args.command == "check":
                passed = STAGES.index(result["currentStage"]) >= STAGES.index(args.stage)
                result["requestedStage"] = args.stage
                result["passed"] = passed
                if passed and args.record:
                    job["stage"] = args.stage
                    job["history"].append({"stage": args.stage, "at": stamp(),
                        "evidenceSha256": digest(path.parent / job["files"]["evidence"]),
                        "modelSha256": read(path.parent / job["files"]["model"]).get("sha256")})
                    write(path, job)
                    result["recordedStage"] = args.stage
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 0 if passed else 2
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        print(json.dumps({"status": "pending", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
