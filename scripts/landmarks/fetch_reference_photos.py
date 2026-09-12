#!/usr/bin/env python3
"""Download clearly licensed Wikimedia Commons stills as visual references.

Does not scrape realtor albums or use photos as facade textures. Only Commons
files whose license short name is in the allow-list are written. Re-run from
the catalog; artifacts/ is local and gitignored.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data/landmarks/shenzhen-top50.json"
OUT_ROOT = ROOT / "artifacts/landmark-references"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "ShenChengJiLandmarkRefs/0.1 (local visual-reference research; no redistribution)"
MAX_EDGE = 1280
ALLOWED_LICENSE_KEYS = {
    "ccby40",
    "ccbysa40",
    "ccby30",
    "ccbysa30",
    "ccby25",
    "ccbysa25",
    "cc0",
    "cc010",
    "publicdomain",
    "pd",
    "pdm",
}


def normalize_license(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def license_allowed(short_name: str) -> bool:
    key = normalize_license(short_name)
    if key in ALLOWED_LICENSE_KEYS:
        return True
    return key.startswith("cc0") or key.startswith("publicdomain")


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def load_catalog(path: Path = CATALOG) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def place_by_id(catalog: dict, place_id: str) -> dict:
    for place in catalog.get("places", []):
        if place.get("id") == place_id:
            return place
    raise SystemExit(f"catalog has no place: {place_id}")


def request_json(params: dict) -> dict:
    last_error = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(
                API + "?" + urllib.parse.urlencode(params),
                headers={"User-Agent": USER_AGENT},
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {429, 503} or attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))
    raise last_error


def commons_query(titles: list[str]) -> dict:
    params = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|size|sha1|mime|extmetadata",
        "iiurlwidth": str(MAX_EDGE),
        "titles": "|".join(titles),
    }
    return request_json(params)


def ext(meta: dict, key: str) -> str:
    block = (meta.get("extmetadata") or {}).get(key) or {}
    return strip_html(str(block.get("value") or ""))


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_error = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as response:
                dest.write_bytes(response.read())
            return
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {429, 503} or attempt == 4:
                raise
            time.sleep(8 * (attempt + 1))
    raise last_error


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_place(place: dict, output: Path, accessed_at: str) -> dict:
    titles = list(place.get("commonsFiles") or [])
    if not titles:
        raise SystemExit(f"{place['id']} has no commonsFiles in the catalog")
    query = commons_query(titles)
    pages = (query.get("query") or {}).get("pages") or {}
    rows = []
    skipped = []
    for page in pages.values():
        title = page.get("title") or ""
        if page.get("missing") is not None or not page.get("imageinfo"):
            skipped.append({"title": title, "reason": "missing"})
            continue
        info = page["imageinfo"][0]
        license_name = ext(info, "LicenseShortName")
        if not license_allowed(license_name):
            skipped.append({"title": title, "reason": "license-not-allowed", "license": license_name})
            continue
        thumb = info.get("thumburl") or info.get("url")
        if not thumb:
            skipped.append({"title": title, "reason": "no-url"})
            continue
        raw = re.sub(r"[^A-Za-z0-9._-]+", "_", title.replace("File:", ""))
        if len(raw) > 80:
            suffix = Path(raw).suffix
            raw = raw[:48] + "_" + raw[-24:]
            if suffix and not raw.endswith(suffix):
                raw = raw + suffix
        dest = output / "images" / raw
        if dest.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            dest = dest.with_suffix(".jpg")
        if not (dest.exists() and dest.stat().st_size > 0):
            try:
                download(thumb, dest)
                time.sleep(10)
            except urllib.error.HTTPError as error:
                skipped.append({"title": title, "reason": f"http-{error.code}"})
                time.sleep(20)
                continue
        rows.append({
            "id": Path(raw).stem.lower()[:40],
            "title": title,
            "page": info.get("descriptionurl"),
            "author": ext(info, "Artist") or "unknown",
            "license": license_name,
            "licenseUrl": ext(info, "LicenseUrl"),
            "sourceDate": ext(info, "DateTime") or "unknown",
            "kind": "field_photo_reference",
            "use": "visual_reference_not_texture",
            "localPath": str(dest.relative_to(ROOT)),
            "bytes": dest.stat().st_size,
            "sha256": sha256(dest),
            "commonsSha1": info.get("sha1"),
            "originalWidth": info.get("width"),
            "originalHeight": info.get("height"),
            "thumbWidth": info.get("thumbwidth") or info.get("width"),
            "accessedAt": accessed_at,
        })
    manifest = {
        "schemaVersion": 1,
        "placeId": place["id"],
        "name": place["name"],
        "accessedAt": accessed_at,
        "licensePolicy": "Commons allow-list only; reference, not facade textures",
        "files": rows,
        "skipped": skipped,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        f"# {place['name']} 参考图索引",
        "",
        f"下载日期：{accessed_at}。只收 Wikimedia Commons 允许再分发的许可。网页照片默认不当贴图。",
        "",
        "| 文件 | 作者 | 许可 | 日期 | 本地 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| [{row['title']}]({row['page']}) | {row['author']} | {row['license']} | {row['sourceDate']} | `{row['localPath']}` |"
        )
    if skipped:
        lines.extend(["", "## 未下载", ""])
        for item in skipped:
            lines.append(f"- {item.get('title')}: {item.get('reason')} {item.get('license', '')}".rstrip())
    (output / "reference-index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--place", action="append", required=True)
    parser.add_argument("--catalog", default=str(CATALOG))
    parser.add_argument("--output-root", default=str(OUT_ROOT))
    args = parser.parse_args(argv)
    catalog = load_catalog(Path(args.catalog))
    today = date.today().isoformat()
    for place_id in args.place:
        place = place_by_id(catalog, place_id)
        dest = Path(args.output_root) / place_id
        manifest = fetch_place(place, dest, today)
        print(f"{place_id}: downloaded {len(manifest['files'])}, skipped {len(manifest['skipped'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
