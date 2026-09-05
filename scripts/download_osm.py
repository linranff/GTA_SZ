"""Download a bounded Geofabrik snapshot, with length/checksum/provenance checks."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
RAW.mkdir(parents=True, exist_ok=True)
URL = 'https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf'
TARGET = RAW / 'guangdong.osm.pbf'
LIMIT = 250 * 1024 * 1024

def fetch(url):
    return urlopen(Request(url, headers={'User-Agent': 'Shenchengji-data-preparation/0.1'}), timeout=60)

def main():
    if TARGET.exists():
        print('Already downloaded:', TARGET)
        return
    with fetch(URL + '.md5') as r:
        checksum_text = r.read(4096).decode()
    expected = checksum_text.split()[0].lower()
    if len(expected) != 32 or any(c not in '0123456789abcdef' for c in expected):
        raise ValueError('Invalid source checksum')
    part = TARGET.with_suffix('.part')
    md5, sha = hashlib.md5(), hashlib.sha256()
    total = 0
    with fetch(URL) as response, part.open('wb') as output:
        headers = dict(response.headers)
        content_length = int(response.headers.get('Content-Length', 0))
        if content_length > LIMIT:
            raise ValueError('Download exceeds 250 MiB budget')
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > LIMIT:
                raise ValueError('Download exceeds 250 MiB budget')
            md5.update(chunk)
            sha.update(chunk)
            output.write(chunk)
            if total % (20 * 1024 * 1024) == 0:
                print(f'Downloaded {total // (1024 * 1024)} MiB', flush=True)
    if content_length and content_length != total:
        raise ValueError('Incomplete response')
    if md5.hexdigest() != expected:
        raise ValueError('Checksum mismatch; latest snapshot may have changed, .part retained')
    part.replace(TARGET)
    manifest = {
        'source_url': URL, 'source_page': 'https://download.geofabrik.de/asia/china/guangdong.html',
        'downloaded_utc': datetime.now(timezone.utc).isoformat(),
        'source_last_modified': headers.get('Last-Modified'), 'bytes': total,
        'md5': expected, 'sha256': sha.hexdigest(), 'checksum_verified': True,
        'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
        'license_url': 'https://www.openstreetmap.org/copyright',
        'crs': 'EPSG:4326 (WGS84)',
        'note': 'Download time is not the survey date of every feature. Coverage is incomplete.'
    }
    (RAW / 'guangdong.manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    (RAW / 'guangdong.osm.pbf.md5').write_text(checksum_text)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
