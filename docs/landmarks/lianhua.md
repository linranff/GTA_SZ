# 莲花山：公开地形数据驱动的区域山体

本轮将原先的小型山丘近似，替换为莲花山公园边界内的完整地表起伏。模型横向范围来自 OSM 公园边界，高程来自已下载并固定 SHA256 的 Copernicus GLO-30。它改善山体的覆盖范围、整体高差和坡势；不是裸地测绘、摄影测量或逐台阶复原。

## 来源与可复现输入

| 输入 | 本轮记录 |
| --- | --- |
| 公园边界 | [OSM way/41281446](https://www.openstreetmap.org/way/41281446)，本地 `data/processed/shenzhen_study/green.geojson` |
| 地形瓦片 | `Copernicus_DSM_COG_10_N22_00_E114_00_DEM`，AWS 托管的 Copernicus DEM 2021 发布数据 |
| 来源模型 | GLO-30，约 30m / 1 弧秒 DSM；水平 WGS84，垂直 EGM2008，米 |
| 下载日期 | 2026-09-05，时间、URL、体积及哈希见 `data/raw/landmarks/Copernicus_DSM_COG_10_N22_00_E114_00_DEM.manifest.json` |
| 来源 SHA256 | `b950ab75642d6684fe08c82b6aa3bb087c1d35acd229ef0e6e6586e1b0868fa3` |

DSM 包含建筑、基础设施和植被表面；产品名称中的 DEM 不代表已去除树冠的裸地 DTM。[产品说明与坐标基准](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)。AWS 分发记录明确使用 2021 发布的 Cloud Optimized GeoTIFF；本轮下载日期不是采集日期。[AWS 数据登记](https://registry.opendata.aws/copernicus-dem/)。

## 形体与尺度

本轮数据统计写入 `data/landmarks/lianhua.json` 和 `public/city/terrain-detail.json`：

| 量 | 真实米制或来源值 | 当前游戏值 |
| --- | ---: | ---: |
| 公园东西范围 | 1,864.54 m | 1,118.72 m |
| 公园南北范围 | 1,269.32 m | 761.59 m |
| 处理后相对起伏 | 93.202 m | 55.921 m |
| 来源海拔采样范围 | 3.567–110.951 m | 不直接作为游戏地面高度 |
| 网格采样间隔 | 15 m，来自 30m DSM 插值 | 9 m |

公园 OSM 边界投影面积约 188.05 公顷；[深圳市政府介绍](https://www.sz.gov.cn/szzt2010/gysz/csgy/content/post_10776567.html)给出公园面积约 181 公顷、山顶海拔约 100m。边界面积、官方海拔、DSM 表面最高值和处理后相对起伏的口径不同，模型保留这些差异，没有强行缩放成同一数值。

15m 是插值后的建模网格间隔，**不代表 15m 数据精度**。真实高度与水平尺寸同乘 0.60；没有单独夸大竖向山势。原始海拔减去公园边缘高程下四分位基准 17.749m 后，再进行道路、湖岸和边缘衔接处理。

## 几何处理

`scripts/prepare_landmark_terrain.py` 校验缓存哈希，裁出公园附近的小窗口，在像元中心进行双线性采样。它按 OSM 公园边界掩膜，在公园边缘、周边道路和莲花湖边缘平滑接回当前城市平面，并把园内道路和园路放到地形高度上。服务道路不能作为平面切槽穿过山顶，否则会错误削低主峰。

这些衔接是游戏处理，会改变边缘及道路邻域的表面，不是对现场地面的测量。源高程、处理后的网格、园路和道路记录分别保留在地形 JSON 内。非有限高程和缺失数据应直接失败；不补造任意小山。

## 构建与检查

在项目根目录执行：

```sh
.venv/bin/python scripts/prepare_landmark_terrain.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_landmark_details.py
node scripts/optimize_landmark_details.mjs
.venv/bin/python scripts/validate_landmark_details.py
```

缓存复现使用 `.venv/bin/python scripts/prepare_landmark_terrain.py --offline`。缓存或 manifest 缺失、哈希改变时会失败，不重新写一个假基线。启动 `npm run dev` 后使用 `node scripts/check_landmark_details.mjs` 核查网页。

首次接入或旧楼排除清单变化时，应先按 [工作流的基础楼体步骤](agent-workflow.md) 重建 `buildings.glb` / `facades.glb` 并记录 `building-exclusions.json`，再运行上述验证。最终重点增量包只包含五处地标网格，不复制周围普通楼体。

待核查内容包括远景山体轮廓、山脚与周围建筑的比例、主要园路贴地、周边车道不被山面覆盖、观景镜头和地面采样一致。任务包 `artifacts/landmark-jobs/lianhua/` 保存证据及阶段检查；实际构建与视觉检查由主集成人员完成后写入，不因文档存在就标 verified。

后续提高近景精度，需要更细的裸地高程或明确尺度的现场资料，重点补山顶平台、台阶、栏杆、挡墙和入口。单纯继续细分现有网格不会增加来源精度。

## 署名

完整地理数据记录见 [data/ATTRIBUTION.md](../../data/ATTRIBUTION.md)，随城市资源分发的说明见 [LANDMARK_ATTRIBUTION.md](../../public/city/LANDMARK_ATTRIBUTION.md)。本轮将提供方要求的派生数据署名保留在地形 metadata 及资源说明中。
