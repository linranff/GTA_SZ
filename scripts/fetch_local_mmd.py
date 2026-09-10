"""Fetch original character sources + pinned importer into ignored LOCAL dirs.
Does not upload, publish or grant a license. Prints the original usage rules.
"""
import hashlib,pathlib,urllib.request,zipfile
BASE=pathlib.Path(__file__).resolve().parents[1]
RAW=BASE/'data/raw/local-mmd';RAW.mkdir(parents=True,exist_ok=True)
PREFIX='https://activity.hdslb.com/blackboard/static/20220525/c84ef0977c17fb1198f6887261fea35f/'
SOURCES={'kuki':PREFIX+'sWn1QvNF82.zip','yelan':PREFIX+'PEhFH0is3N.zip','mmd-tools':'https://codeload.github.com/MMD-Blender/blender_mmd_tools/zip/29d1478cf4385945b1c011d4c1e6adda7ad7cf70'}
for asset,url in SOURCES.items():
    target=RAW/(asset+'.zip')
    if not target.exists():
        request=urllib.request.Request(url,headers={'User-Agent':'Local-Character-Validation/1.0'})
        with urllib.request.urlopen(request,timeout=90) as response:target.write_bytes(response.read())
    print(asset,'sha256',hashlib.sha256(target.read_bytes()).hexdigest())
    with zipfile.ZipFile(target) as archive:
        for item in archive.infolist():
            if item.is_dir() or item.filename.startswith('__MACOSX/'):continue
            name=item.filename
            if not item.flag_bits&2048:
                try:name=name.encode('cp437').decode('utf8')
                except UnicodeError:pass
            path=pathlib.Path(name)
            if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe ZIP path')
            if asset=='mmd-tools':path=pathlib.Path('blender_mmd_tools-main',*path.parts[1:])
            destination=RAW/asset/path;destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(archive.read(item))
            if destination.suffix=='.txt':
                raw=destination.read_bytes()
                for encoding in ['utf-8-sig','utf-16','gb18030']:
                    try:print(raw.decode(encoding));break
                    except UnicodeError:pass
wheel=next((RAW/'mmd-tools').rglob('*.whl'))
with zipfile.ZipFile(wheel) as archive:archive.extractall(RAW/'deps')
print('Sources prepared locally. Review their rules before running prepare_local_mmd.py.')
