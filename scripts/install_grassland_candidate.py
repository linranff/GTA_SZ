"""Install only an audited grassland candidate; does not rebuild or touch roads."""
from pathlib import Path
import hashlib, json, shutil

ROOT=Path(__file__).resolve().parents[1]
CANDIDATE=ROOT/'artifacts/city/grassland-v2-candidate'
def read(name): return json.loads((CANDIDATE/name).read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
audit=read('validation.json');manifest=read('manifest.json');meadow=read('meadow.json')
assert not audit['errors'], 'Candidate failed its independent audit'
assert sha(CANDIDATE/'relief-mesh.bin')==audit['checks']['meshSHA256']
assert sha(CANDIDATE/'ground-cover.png')==audit['checks']['macroSHA256']
assert sha(CANDIDATE/'meadow.json')==audit['checks']['meadowSHA256']
for relative,expected in meadow['sourceSHA'].items():
    assert sha(ROOT/relative)==expected, 'Source changed after audit: '+relative
assert manifest['budgets']['triangles']<=200000 and len(manifest['tiles'])<=100
for tile in meadow['tiles']:
    source=CANDIDATE/tile['url']
    assert source.stat().st_size==tile['bytes'] and sha(source)==tile['sha256'], tile['id']
installed={}
def copy(source,destination):
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,destination)
    installed[str(destination.relative_to(ROOT))]={'bytes':destination.stat().st_size,'sha256':sha(destination)}
for name in ['manifest.json','relief-mesh.bin','ground-cover.png']:
    copy(CANDIDATE/name,ROOT/'public/city/ground-relief'/name)
copy(CANDIDATE/'meadow.json',ROOT/'public/city/grassland-v2/meadow.json')
for tile in meadow['tiles']:
    source=CANDIDATE/tile['url'];assert source.stat().st_size==tile['bytes']
    copy(source,ROOT/'public/city/grassland-v2'/tile['url'])
# Remove only stale generated masks from the preceding grassland candidate.
expected={str((ROOT/'public/city/grassland-v2'/t['url']).resolve()) for t in meadow['tiles']}
for stale in (ROOT/'public/city/grassland-v2/meadow').glob('*.bin'):
    if str(stale.resolve()) not in expected: stale.unlink()
report={'files':installed,'relief':manifest['budgets'],'validationSHA256':sha(CANDIDATE/'validation.json')}
out=ROOT/'artifacts/grassland-v2/install.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'files':len(installed),'bytes':sum(x['bytes'] for x in installed.values()),'meshSHA256':audit['checks']['meshSHA256']}))
