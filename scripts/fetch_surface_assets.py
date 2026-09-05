"""Fetch a small, fixed set of CC0 production textures. Powered by Poly Haven.
Runtime is fully local: the game never calls the Poly Haven API.
"""
from pathlib import Path
import urllib.request,json,hashlib,datetime
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/textures/polyhaven';OUT.mkdir(parents=True,exist_ok=True)
def request(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Shenchengji local asset preparation; Powered by Poly Haven'}),timeout=40)
records=[]
for asset in ['plastered_wall_05','wood_table_001']:
    with request('https://api.polyhaven.com/files/'+asset) as response: data=json.load(response)
    for channel in ['diff','nor_gl','rough']:
        file=data[{'diff':'Diffuse','nor_gl':'nor_gl','rough':'Rough'}[channel]]['1k']['jpg'];url=file['url'];path=OUT/(asset+'_'+channel+'.jpg')
        if not path.exists():
            with request(url) as response: path.write_bytes(response.read())
        records.append({'asset':asset,'channel':channel,'file':str(path.relative_to(ROOT)),'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
    print(asset,'downloaded',flush=True)
(OUT/'manifest.json').write_text(json.dumps({'license':'CC0-1.0','license_url':'https://polyhaven.com/license','credit':'Powered by Poly Haven','downloaded_at':datetime.datetime.now().astimezone().isoformat(),'files':records},ensure_ascii=False,indent=2))
