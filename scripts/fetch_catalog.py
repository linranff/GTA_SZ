"""Archive public metadata catalogue; does not request or download restricted GIS data."""
import hashlib
import json
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
dest = ROOT / 'data/references'
dest.mkdir(parents=True, exist_ok=True)
url = 'https://www.sz.gov.cn/attachment/1/1708/1708809/12759230.xlsx'
data = subprocess.run(['/usr/bin/curl', '--fail', '--location', '--silent', '--show-error',
                       '--max-time', '45', '--max-filesize', '5242880', url],
                      check=True, capture_output=True).stdout
if len(data) > 5 * 1024 * 1024:
    raise ValueError('Unexpected catalogue size')
path = dest / 'shenzhen_geodata_catalog_2026.xlsx'
path.write_bytes(data)
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rows = []
with zipfile.ZipFile(path) as archive:
    strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = [''.join(si.itertext()) for si in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    for name in archive.namelist():
        if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
            for row in ET.fromstring(archive.read(name)).findall('.//s:row', ns):
                values = []
                for c in row.findall('s:c', ns):
                    v = c.find('s:v', ns)
                    text = v.text if v is not None else ''.join(c.find('s:is', ns).itertext()) if c.find('s:is', ns) is not None else ''
                    if c.get('t') == 's' and text:
                        text = strings[int(text)]
                    if text:
                        values.append(f"{c.get('r')}: {text}")
                if values:
                    rows.append(' | '.join(values))
(dest / 'shenzhen_geodata_catalog_2026.txt').write_text('\n'.join(rows))
(dest / 'catalog.manifest.json').write_text(json.dumps({
    'source_url': url, 'source_page': 'https://www.sz.gov.cn/szzt2010/wgkzl/glgk/jgxxgk/gtzy/content/post_12759230.html',
    'downloaded_utc': datetime.now(timezone.utc).isoformat(),
    'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
    'purpose': 'Reference catalogue only; no permission to redistribute listed 3D/GIS datasets is inferred.'
}, ensure_ascii=False, indent=2))
print('\n'.join(rows))
