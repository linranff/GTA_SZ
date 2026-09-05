"""Render local GIS coverage and export a meter-based Blender guide payload."""
import json
import os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR', '/private/tmp/shenchengji-matplotlib')
os.environ.setdefault('XDG_CACHE_HOME', '/private/tmp/shenchengji-fontcache')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PatchCollection
from matplotlib.patches import Polygon as MplPolygon
from matplotlib.font_manager import FontProperties
from pyproj import Transformer
from shapely.geometry import shape, mapping, box
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
REPORT = json.loads((ROOT / 'data/processed/coverage_report.json').read_text())
REGIONS = json.loads((ROOT / 'config/regions.json').read_text())['regions']
TO_METERS = Transformer.from_crs(4326, 32649, always_xy=True)
FONT_PATHS = ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/System/Library/Fonts/STHeiti Light.ttc']
FONT = next((FontProperties(fname=p) for p in FONT_PATHS if Path(p).exists()), FontProperties())
COLORS = {'background': '#0d2024', 'roads': '#507177', 'buildings': '#637d7f',
          'green': '#244b40', 'water': '#153941', 'coastline': '#91cbbb', 'cycle': '#efb56b'}

def features(region, layer):
    return json.loads((ROOT / f'data/processed/{region}/{layer}.geojson').read_text())['features']

def pieces(geom):
    if hasattr(geom, 'geoms'):
        for g in geom.geoms:
            yield from pieces(g)
    else:
        yield geom

def plot_region(ax, region):
    for layer in ['water', 'green', 'buildings', 'roads', 'coastline']:
        lines, polys, cycles = [], [], []
        for f in features(region, layer):
            for geom in pieces(transform(TO_METERS.transform, shape(f['geometry']))):
                if geom.geom_type == 'Polygon':
                    polys.append(MplPolygon(list(geom.exterior.coords), closed=True))
                elif geom.geom_type == 'LineString':
                    if layer == 'roads' and f['properties']['tags'].get('highway') == 'cycleway':
                        cycles.append(list(geom.coords))
                    else:
                        lines.append(list(geom.coords))
        if polys:
            ax.add_collection(PatchCollection(polys, facecolor=COLORS[layer], edgecolor='none', alpha=.85))
        if lines:
            ax.add_collection(LineCollection(lines, colors=COLORS[layer], linewidths=.85 if layer == 'coastline' else .25, alpha=.9))
        if cycles:
            ax.add_collection(LineCollection(cycles, colors=COLORS['cycle'], linewidths=1.2))
    west,south,east,north = REGIONS[region]['bbox']
    xmin,ymin = TO_METERS.transform(west,south)
    xmax,ymax = TO_METERS.transform(east,north)
    ax.set(xlim=(xmin,xmax),ylim=(ymin,ymax),aspect='equal',facecolor=COLORS['background'])
    ax.set_xticks([]); ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)
    # True projected scale, independent of latitude.
    length = 500 if region == 'shenzhen_bay' else 10000
    x,y = xmin+(xmax-xmin)*.04,ymin+(ymax-ymin)*.055
    ax.plot([x,x+length],[y,y],color='#c5ddd8',lw=2)
    ax.text(x,y+(ymax-ymin)*.015, f'{length/1000:g} km',color='#c5ddd8',fontsize=9)
    ax.text(.95,.93,'N ↑',transform=ax.transAxes,color='#c5ddd8',fontsize=10,ha='right')

def main():
    fig = plt.figure(figsize=(17,10), facecolor=COLORS['background'])
    fig.text(.05,.94,'深城纪 / 城市数据底图',fontproperties=FONT,fontsize=26,color='#ecf1e9')
    fig.text(.05,.90,'开放地图实取数据 · 地理位置保留原比例 · 不是游戏画面或完整城市模型',fontproperties=FONT,fontsize=12,color='#9eb7b5')
    ax1 = fig.add_axes([.05,.22,.46,.62]); ax2 = fig.add_axes([.56,.20,.39,.66])
    plot_region(ax1,'shenzhen_study'); plot_region(ax2,'shenzhen_bay')
    pilot_path = ROOT/'data/processed/shenzhen_bay/pilot_route.geojson'
    if pilot_path.exists():
        pilot=json.loads(pilot_path.read_text())['features'][0]
        g=transform(TO_METERS.transform,shape(pilot['geometry']))
        xs,ys=g.xy
        ax2.plot(xs,ys,color='#f8ebc5',linewidth=3,zorder=10)
        mid=g.interpolate(.5,normalized=True)
        ax2.annotate('首段候选 · 600 m',(mid.x,mid.y),xytext=(8,42),textcoords='offset points',fontproperties=FONT,fontsize=10,color='#fff2ce',zorder=11,
            arrowprops={'arrowstyle':'-','color':'#fff2ce','lw':.6})
    for key in ['shenzhen_bay','tech_park','futian','xiangmihu','longhua','longgang']:
        b = REGIONS[key]['bbox']; x,y = TO_METERS.transform((b[0]+b[2])/2,(b[1]+b[3])/2)
        ax1.scatter([x],[y],s=16,color='#efb56b',zorder=8)
        label = {'shenzhen_bay':'01 深圳湾','tech_park':'02 科技园','futian':'03 福田','xiangmihu':'04 香蜜湖','longhua':'05 龙华','longgang':'06 龙岗'}[key]
        offsets = {'shenzhen_bay':(-30,-24),'tech_park':(-60,2),'futian':(10,-5),'xiangmihu':(-35,25),'longhua':(-5,12),'longgang':(12,7)}
        ax1.annotate(label,(x,y),xytext=offsets[key],textcoords='offset points',fontproperties=FONT,fontsize=10,color='#ecf1e9',zorder=9)
    # Plot named park / landmark anchors from data, without invented coordinates.
    desired = ['深圳人才公园','深圳湾公园','中国华润大厦','腾讯滨海大厦']
    seen = set()
    for item in json.loads((ROOT/'data/processed/landmarks.json').read_text()):
        name = item['name']
        if name not in desired or name in seen:
            continue
        b = REGIONS['shenzhen_bay']['bbox']
        if b[0] <= item['lon'] <= b[2] and b[1] <= item['lat'] <= b[3]:
            seen.add(name)
            x,y = TO_METERS.transform(item['lon'],item['lat'])
            ax2.scatter([x],[y],s=20,color='#f3d8ad',zorder=8)
            offset=(-40,-20) if name=='深圳湾公园' else (6,8)
            ax2.annotate(name,(x,y),xytext=offset,textcoords='offset points',fontproperties=FONT,fontsize=9,color='#e9ebe0',zorder=9)
    s = REPORT['regions']['shenzhen_bay']
    fig.text(.05,.13,'左：深圳及周边研究范围    右：深圳湾场景数据',fontproperties=FONT,fontsize=13,color='#ecf1e9')
    fig.text(.05,.095,f"深圳湾范围：{s['counts']['buildings']:,} 个建筑要素 / {s['counts']['roads']:,} 段道路要素 / {s['explicit_cycleway_km']} km 显式骑行道",fontproperties=FONT,fontsize=11,color='#9eb7b5')
    fig.text(.05,.06,'橙色 = OSM 标记的 cycleway；不代表所有允许骑行路线。研究范围包含邻近地区，非行政边界。',fontproperties=FONT,fontsize=10,color='#9eb7b5')
    fig.text(.05,.027,f"© OpenStreetMap contributors · ODbL 1.0 · openstreetmap.org/copyright · Source snapshot: {REPORT['source_snapshot_utc'] or 'see manifest'}",fontsize=9,color='#789996')
    fig.savefig(OUT/'city_data_overview.png',dpi=160,facecolor=fig.get_facecolor())
    plt.close(fig)

    origin_lon,origin_lat = 113.98,22.525
    ox,oy = TO_METERS.transform(origin_lon,origin_lat)
    payload = {'units':'meters','source_crs':'EPSG:4326','projection':'EPSG:32649',
        'origin_lon_lat':[origin_lon,origin_lat],'origin_projected_m':[ox,oy],
        'axes':'Blender +X East, +Y North, +Z Up',
        'note':'Non-rendering reference curves only. No building extrusions, no invented heights. Z=0 is a guide plane, not measured terrain.',
        'features':[]}
    for layer in ['roads','coastline','buildings','green']:
        for f in features('shenzhen_bay',layer):
            geom=transform(lambda x,y,z=None: ((TO_METERS.transform(x,y)[0]-ox),(TO_METERS.transform(x,y)[1]-oy)),shape(f['geometry']))
            payload['features'].append({'id':f['id'],'layer':layer,'name':f['properties']['name'],
                                       'tags':f['properties']['tags'],'geometry':mapping(geom)})
    if pilot_path.exists():
        f=json.loads(pilot_path.read_text())['features'][0]
        geom=transform(lambda x,y,z=None: ((TO_METERS.transform(x,y)[0]-ox),(TO_METERS.transform(x,y)[1]-oy)),shape(f['geometry']))
        payload['features'].append({'id':'pilot_600m','layer':'pilot','name':'600 m 滨海路线候选',
            'tags':f['properties'],'geometry':mapping(geom)})
    (OUT/'blender_map_guides.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
    print('Created preview and Blender meter-space guide payload.')

if __name__=='__main__':
    main()
