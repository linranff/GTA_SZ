#!/usr/bin/env python3
"""Look up Wikipedia WGS84 coordinates and Commons File: titles.

Writes artifacts/landmark-research only. Does not download photos or edit
public/city. Coordinates are reported encyclopedia values, not surveys.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/landmark-research"
UA = "ShenChengJiLandmarkRefs/0.1 (local visual-reference research; no redistribution)"
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"

QUERIES = {
    "civic": {"wiki": "Shenzhen Civic Center", "commons": "Shenzhen Civic Center"},
    "guomao": {"wiki": "Guomao Building", "commons": "Guomao Building Shenzhen"},
    "seg": {"wiki": "SEG Plaza", "commons": "SEG Plaza"},
    "stock-exchange": {"wiki": "Shenzhen Stock Exchange", "commons": "Shenzhen Stock Exchange Building"},
    "concert-hall": {"wiki": "Shenzhen Cultural Center", "commons": "Shenzhen Concert Hall"},
    "library-center": {"wiki": "Shenzhen Library", "commons": "Shenzhen Library"},
    "mocata": {"wiki": "MoCA Shenzhen", "commons": "Museum of Contemporary Art and Planning Exhibition"},
    "convention-futian": {"wiki": "Shenzhen Convention and Exhibition Center", "commons": "Shenzhen Convention and Exhibition Center"},
    "book-mall": {"wiki": "Shenzhen Book City", "commons": "Shenzhen Book City"},
    "youth-palace": {"wiki": "Shenzhen Children's Palace", "commons": "Shenzhen Children's Palace"},
    "bay-sports": {"wiki": "Shenzhen Bay Sports Center", "commons": "Shenzhen Bay Sports Center"},
    "bay-one": {"wiki": "One Shenzhen Bay", "commons": "One Shenzhen Bay"},
    "hanking": {"wiki": "Hanking Center", "commons": "Hanking Center"},
    "coco-park": {"wiki": "COCO Park", "commons": "COCO Park Shenzhen"},
    "mixc-luohu": {"wiki": "MixC", "commons": "MixC Shenzhen Luohu"},
    "coastal-city": {"wiki": "Coastal City", "commons": "Coastal City Shenzhen"},
    "oct-harbour": {"wiki": "OCT Harbour", "commons": "OCT Harbour Shenzhen"},
    "window-world": {"wiki": "Window of the World", "commons": "Window of the World Shenzhen"},
    "futian-station": {"wiki": "Futian railway station", "commons": "Futian Station Shenzhen"},
    "guanshanyue": {"wiki": "Guan Shanyue Art Museum", "commons": "Guan Shanyue Art Museum"},
    "grand-theater": {"wiki": "Shenzhen Grand Theater", "commons": "Shenzhen Grand Theater"},
    "shanghai-hotel": {"wiki": "Shanghai Hotel Shenzhen", "commons": "Shanghai Hotel Shenzhen"},
    "lizhi": {"wiki": "Lizhi Park", "commons": "Lizhi Park Shenzhen"},
    "central-park": {"wiki": "Shenzhen Central Park", "commons": "Shenzhen Central Park"},
    "bijia": {"wiki": "Bijia Hill", "commons": "Bijia Hill Park Shenzhen"},
    "mangrove": {"wiki": "Futian Mangrove Ecological Park", "commons": "Futian Mangrove Shenzhen"},
    "lianhua": {"wiki": "Lianhuashan Park", "commons": "Lianhua Hill Shenzhen"},
    "baypark": {"wiki": "Shenzhen Bay Park", "commons": "Shenzhen Bay Park"},
    "talent": {"wiki": "Shenzhen Talent Park", "commons": "Shenzhen Talent Park"},
    "xiangmi": {"wiki": "Xiangmi Park", "commons": "Xiangmi Park Shenzhen"},
    "sea-world": {"wiki": "Sea World (Shekou)", "commons": "Minghua ship Shekou"},
    "design-society": {"wiki": "Sea World Culture and Arts Center", "commons": "Sea World Culture and Arts Center"},
    "airport-t3": {"wiki": "Shenzhen Bao'an International Airport", "commons": "Shenzhen Baoan Airport T3"},
    "universiade": {"wiki": "Shenzhen Universiade Sports Centre", "commons": "Shenzhen Universiade Sports Centre"},
    "happy-harbor": {"wiki": "Shenzhen Bay Park", "commons": "Bay Glory Ferris wheel"},
    "shenzhen-north": {"wiki": "Shenzhen North railway station", "commons": "Shenzhen North Station"},
}


def request_json(url: str, params: dict) -> dict:
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(
                url + "?" + urllib.parse.urlencode(params),
                headers={"User-Agent": UA},
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 — research helper retries
            last = error
            wait = 20 * (attempt + 1)
            if getattr(error, "code", None) == 429:
                wait = 45 * (attempt + 1)
            time.sleep(wait)
    raise last


def wiki_coords(title: str) -> dict:
    data = request_json(WIKI, {
        "action": "query",
        "format": "json",
        "prop": "coordinates|info",
        "inprop": "url",
        "titles": title,
        "redirects": 1,
    })
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        coords = page.get("coordinates") or []
        if coords:
            return {
                "title": page.get("title"),
                "page": page.get("fullurl"),
                "lat": coords[0].get("lat"),
                "lon": coords[0].get("lon"),
                "globe": coords[0].get("globe"),
                "basis": "reported",
            }
        return {"title": page.get("title"), "page": page.get("fullurl"), "lat": None, "lon": None, "basis": "unknown"}
    return {"title": title, "lat": None, "lon": None, "basis": "unknown"}


def commons_files(query: str, limit: int = 12) -> list[dict]:
    data = request_json(COMMONS, {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srnamespace": 6,
        "srlimit": str(limit),
    })
    titles = [hit["title"] for hit in ((data.get("query") or {}).get("search") or [])]
    if not titles:
        return []
    info = request_json(COMMONS, {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime",
        "titles": "|".join(titles),
    })
    rows = []
    for page in (info.get("query") or {}).get("pages", {}).values():
        imageinfo = (page.get("imageinfo") or [None])[0] or {}
        meta = imageinfo.get("extmetadata") or {}
        license_name = ((meta.get("LicenseShortName") or {}).get("value") or "")
        rows.append({
            "title": page.get("title"),
            "page": imageinfo.get("descriptionurl"),
            "license": license_name,
            "author": ((meta.get("Artist") or {}).get("value") or "")[:160],
        })
    return rows


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "wikipedia-commons.json"
    report = {"accessedAt": date.today().isoformat(), "places": {}}
    if path.is_file():
        report = json.loads(path.read_text(encoding="utf-8"))
        report.setdefault("places", {})
    for place_id, query in QUERIES.items():
        existing = report["places"].get(place_id) or {}
        if existing.get("wikipedia") and existing.get("commons") is not None:
            continue
        print(place_id, flush=True)
        report["places"][place_id] = {
            "wikipedia": wiki_coords(query["wiki"]),
            "commons": commons_files(query["commons"]),
        }
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        time.sleep(8)
    print("wrote", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
