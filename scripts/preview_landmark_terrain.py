"""Export an auditable plan/profile figure for the Lianhua reconstruction."""
import json
import os
import tempfile
from pathlib import Path
cache = tempfile.TemporaryDirectory(prefix='shenchengji-relief-plot-')
os.environ['MPLCONFIGDIR'] = cache.name
os.environ['XDG_CACHE_HOME'] = cache.name
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse
from landmarks.lianhua import height_at

R = Path(__file__).resolve().parents[1]
t = json.loads((R/'public/city/terrain-detail.json').read_text())
city = json.loads((R/'public/city/city.json').read_text())
old = next(m for m in city['landmarks'] if m['id']=='lianhua')
g, s = t['grid'], t['horizontalScale']
heights = np.array(g['heights']).reshape(g['rows'], g['columns'])/s
xspan = (g['columns']-1)*g['dx']/s
zspan = (g['rows']-1)*g['dz']/s
fig, axes = plt.subplots(1, 2, figsize=(13, 5), gridspec_kw={'width_ratios':[1.4,1]})
im = axes[0].imshow(heights, origin='lower', extent=[0,xspan,0,zspan], cmap='gist_earth', vmin=0, vmax=100)
axes[0].add_patch(Ellipse(((old['x']-g['x0'])/s,(old['z']-g['z0'])/s), 260/s, 260*.68/s,
                          facecolor='none',edgecolor='#f44d79',linewidth=2,label='Previous artistic hill footprint'))
axes[0].scatter([(t['peak']['x']-g['x0'])/s],[(t['peak']['z']-g['z0'])/s],s=35,color='white',edgecolors='black',label='OSM main-peak location')
axes[0].set(title='Lianhuashan | mapped park + source-led relief',xlabel='East from patch origin (real metres)',ylabel='North (real metres)')
axes[0].legend(loc='lower left',fontsize=8)
fig.colorbar(im,ax=axes[0],fraction=.028,pad=.02,label='Adapted relief (real metres)')
xs = np.linspace(g['x0'],g['x0']+(g['columns']-1)*g['dx'],300)
profile = [height_at(g,x,t['peak']['z'])/s for x in xs]
axes[1].fill_between((xs-g['x0'])/s,profile,color='#5f9077',alpha=.5)
axes[1].plot((xs-g['x0'])/s,profile,color='#284f42')
axes[1].set(title='East-west profile through main peak',xlabel='East (real metres)',ylabel='Height above adapted city datum (metres)',ylim=(0,110))
axes[1].grid(alpha=.2)
fig.suptitle('30 m Copernicus DSM • 15 m interpolated mesh • no vertical exaggeration',fontsize=13)
fig.text(.5,.02,'Park edge, lake and perimeter roads blend into the prototype flat city. DSM includes canopy; this is not a surveyed DTM.',ha='center',fontsize=9)
fig.tight_layout(rect=(0,.05,1,.95))
fig.savefig(R/'artifacts/city/lianhua-relief-audit.png',dpi=150)
plt.close(fig)
cache.cleanup()
