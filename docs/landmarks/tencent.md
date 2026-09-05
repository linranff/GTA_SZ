# 腾讯滨海大厦：可追溯外观模型 v1

本轮将旧版近方形、左右对称双塔替换为有地图轮廓依据的南北两片板式塔楼，并加入不同高度和位置的三组铜色连接体、塔端大窗、折面幕墙分格、裙房连接与内凹设备屋顶。轮廓和尺寸证据达到“地图轮廓 + 公开高度 + 参考照片外观”的级别；连桥细部仍是可替换的估计参数，不能称作竣工测绘或摄影测量模型。

## 已证实的主要参数

| 对象 | 当前采用 | 依据与限制 |
|---|---|---|
| 南塔高度 | 248 m | [腾讯业主声明](https://www.tencent.com/index.php/zh-cn/articles/80064.html)与[WSP完工项目页](https://www.wsp.com/zh-cn/projects/tencent-seafront-tower-shenzhen-china)一致；CTBUH/OSM另报245.8 m，口径差异保留在参数文件 |
| 北塔高度 | 194 m | 同上；CTBUH/OSM另报约194.8 m |
| 南塔包围尺寸 | 95.4383 × 32.6241 m | [OSM way 694152192](https://www.openstreetmap.org/way/694152192)逐边最小面积旋转矩形；[Inhabit幕墙顾问](https://inhabitgroup.com/project/tencent-seafront-tower-shenzhen-prc/)另独立说明南立面约95 m宽 |
| 北塔包围尺寸 | 79.3126 × 30.8075 m | [OSM way 694152193](https://www.openstreetmap.org/way/694152193)相同计算；正文尺寸用于理解，网格采用原多边形 |
| 长轴方向 | 南塔12.00°，北塔28.97° | 自东向北逆时针，由上述地图边缘推导；不是指南针现场测量 |
| 连桥 | 文化、健康、知识三组 | [NBBJ](https://www.nbbj.com/work/tencent-global-headquarters)和WSP；[中建施工记录](https://2bur.cscec.com/xwzx6/gskx6/201512/2733709.html)给出最大跨度51 m |
| 幕墙悬挑量级 | 最大1.2 m | Inhabit；模型把已发表的模块化折面原则简化成可批量构建的立面网格 |

每个模型尺寸在 [`data/landmarks/tencent.json`](../../data/landmarks/tencent.json) 中保存 `value / unit / evidence / sources / confidence`。`confidence` 是建模者用于排序待核项的判断值，不是统计测量误差。

## 定位与地图量测

旧版 `city.json` 的腾讯坐标 `(113.93108, 22.525955)` 对应[公交站 node 9017425342](https://www.openstreetmap.org/node/9017425342)，不是建筑中心。模型保留这个历史锚点，在锚点以西生成有依据的双塔。南塔中心偏移为 `(-53.9963, -50.0717)` m，北塔为 `(-86.4098, +15.7552)` m，坐标轴依次是 east、north。

投影统一使用项目的 `east_metres_per_degree=102850` 和 `north_metres_per_degree=111320`，之后才应用全城 `scale=0.60`。这些来自 `scripts/prepare_driving_city.py` 的城市坐标契约。OSM多边形先转换为本地米制坐标，再遍历各边方向求最小面积旋转矩形；长边方向即记录的旋转角度。网格本身使用11顶点的原始塔楼轮廓，保留非矩形的小偏折。

本地Overture文件中也有这两个轮廓，但它的来源仍是相同OSM记录，不能重复计作独立证据。OSM数据遵循ODbL-1.0；原始快照与原网站的时间可能不同，当前数值以仓库内快照为准。

## 照片核验与估计边界

2026-09-05用Chrome实际查看了NBBJ项目页的页首竣工黄昏照片。照片支持两片宽板双塔、不同高度、三组厚实铜色桥带、桥带包裹塔端、桥端大玻璃窗、平直塔冠这些关键轮廓判断。另查看了[Inhabit建设期照片](https://inhabitgroup.com/wp-content/uploads/2016/09/web3-900x594-1.jpg)，其中仍有塔吊，不能当作竣工测量资料。

同时查看了[Modlar转载的NBBJ概念总平面](https://www.modlar.com/photos/8029/tencent-seafront-towers-concept-designfloor-plan/)。它能辅助判断塔楼错位、角度和连接体拓扑；图中250/195 m塔高以及35/124/175 m屋顶标注属于概念阶段，未当作竣工实测。NBBJ的CTBUH论文旧下载链接本轮返回404，因此没有声称已阅读完整论文剖面。

桥壳底标高暂取14、103、158 m，高度21、21、20 m；它们是施工文字、概念图和照片共同约束的外观估计，底标高仍可能有约5 m偏差。中建报道的29/121/161 m含施工提升标高语境，不等于竣工桥壳顶或底。左右连接位置、宽度、塔端包裹形状、裙房连接、屋顶设备、幕墙逐块位置和玻璃颜色仍需更好的多视角资料校正。

参考照片只作观察，没有打包进公开素材，也没有当纹理贴到模型上。

## 接入

```python
from landmarks.tencent import build, ground_footprints

spec = json.loads((R / 'data/landmarks/tencent.json').read_text())
b = B()
report = build(b, lm, spec, scale=0.6)
objects = b.finish('landmark_tencent')
collision_polygons = ground_footprints(lm, spec, scale=0.6)
```

`build`无`bpy`依赖，不读写文件，不导出，不修改`lm/spec`，结束时恢复`b.frame`。它使用现有的8种材质。参数为真实米制，输出与全城坐标一致，不能再次缩放。如果主构建器把`lm.lon/lat`及其对应`x/z`移动到双塔中心，锚点差会自动抵消，建筑绝对位置不变。

`ground_footprints`返回scene坐标中的3个开放多边形环：南塔、北塔、底层连接裙房。运行时应分别构造碰撞，不能取三者凸包，也不能把上层连桥在地面的投影当成整块实体。原地标的60 scene units排除半径不够覆盖西侧塔端；应按这些轮廓或真实包围盒处理旧通用建筑排除。上层桥带的外伸不属于地面碰撞范围。

## 验证记录

- 真实B API生成成功，Blender 5.2后台Cycles完成隔离渲染。
- 28,738个三角形、8种材质，低于50,000预算。
- 最高点148.8 scene units，等于248 × 0.60；所有坐标有限。
- 测试历史锚点移动后输出绝对坐标不变；`b.frame`恢复成功。
- 地面碰撞为11、11、4个顶点的3个多边形；未扩大成错误的单圆碰撞。

共享GLB导出、资源清单和运行时接入由全城构建器负责；本模块并未声称已经单独发布GLB。
