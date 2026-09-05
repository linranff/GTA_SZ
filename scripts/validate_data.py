"""Validate produced layer counts/geometry/IDs and the archived source checksum."""
import hashlib
import json
from pathlib import Path
from shapely.geometry import shape

ROOT=Path(__file__).resolve().parents[1]
report=json.loads((ROOT/'data/processed/coverage_report.json').read_text())
checks={'snapshot':report['source_snapshot_utc'],'layers_checked':0,'features_checked':0,'invalid':0,'duplicate_ids':0}
for region,info in report['regions'].items():
    for layer,count in info['counts'].items():
        data=json.loads((ROOT/f'data/processed/{region}/{layer}.geojson').read_text())
        fs=data['features']
        assert len(fs)==count,(region,layer)
        ids=[f['id'] for f in fs]
        checks['duplicate_ids']+=len(ids)-len(set(ids))
        for f in fs:
            geom=shape(f['geometry'])
            checks['invalid']+=not geom.is_valid or geom.is_empty
        checks['layers_checked']+=1
        checks['features_checked']+=len(fs)
manifest=json.loads((ROOT/'data/raw/guangdong.manifest.json').read_text())
with (ROOT/'data/raw/guangdong.osm.pbf').open('rb') as stream:
    checks['source_sha256_verified']=hashlib.file_digest(stream,'sha256').hexdigest()==manifest['sha256']
checks['source_geometry_errors_skipped']=report['geometry_failures']
checks['passed']=checks['source_sha256_verified'] and checks['invalid']==0 and checks['duplicate_ids']==0
(ROOT/'artifacts').mkdir(exist_ok=True)
(ROOT/'artifacts/data_validation.json').write_text(json.dumps(checks,indent=2))
print(json.dumps(checks,indent=2))
assert checks['passed'],checks
