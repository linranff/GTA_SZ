"""Fetch hash-pinned GLO-30 tiles for the existing coastal rebuild pipeline."""
from pathlib import Path
import hashlib, json, urllib.request
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data/raw/landmarks'
SOURCES={113:('074e13244e6da6745bcf76150fdc6e06f774140a7aac796785922fce962eacbb',36641041),114:('b950ab75642d6684fe08c82b6aa3bb087c1d35acd229ef0e6e6586e1b0868fa3',25030462)}
NOTICE='produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved'
def valid(path,digest,size):return path.exists() and path.stat().st_size==size and hashlib.sha256(path.read_bytes()).hexdigest()==digest
for lon,(digest,size) in SOURCES.items():
 name=f'Copernicus_DSM_COG_10_N22_00_E{lon}_00_DEM';url=f'https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif';p=DEST/(name+'.tif');DEST.mkdir(parents=True,exist_ok=True)
 if not valid(p,digest,size):
  part=p.with_suffix('.tif.part')
  with urllib.request.urlopen(url,timeout=90) as response,part.open('wb') as out:
   while block:=response.read(1024*1024):out.write(block)
  if not valid(part,digest,size):raise ValueError(f'Checksum mismatch: {part}; existing file unchanged')
  part.replace(p)
 manifest=p.with_suffix('.manifest.json')
 if not manifest.exists():
  manifest.write_text(json.dumps({'url':url,'sha256':digest,'bytes':size,'type':'DSM','nativeGridArcSeconds':1,'nominalResolutionMeters':30,'horizontalCRS':'EPSG:4326','verticalDatum':'EGM2008','release':'AWS Copernicus DEM 2021','derivativeNotice':NOTICE},ensure_ascii=False,indent=2)+'\n')
 print(f'Verified {name}: {digest}')
