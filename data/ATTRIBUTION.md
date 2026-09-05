# 地理数据来源与使用记录

## OpenStreetMap

© OpenStreetMap contributors

数据使用 Open Database License (ODbL) 1.0：
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

分发源：Geofabrik GmbH，广东省提取包（包含香港和澳门）。
原始数据在 `raw/guangdong.osm.pbf`，时间、SHA-256、校验记录见 `raw/guangdong.manifest.json`。
处理结果位于 `processed/`。研究矩形包括邻近行政区域，不能称为深圳行政边界内的完整数据。
道路计数是 OSM way/片段计数；建筑包括 building 和 building:part，不等于独立楼栋数量。

## Overture Buildings

Overture Maps Foundation / Buildings theme，发行批次 2026-08-19.0。
主题许可 ODbL 1.0，具体来源记录保存在每个 feature 的 sources 中。
完整归属清单：https://docs.overturemaps.org/attribution/

本次下载范围为深圳湾研究框，原始记录保存在 `raw/shenzhen_bay_overture_buildings.geojson`。
不得把 Overture 和 OSM 建筑数简单相加。二者包含共同来源、不同粒度的轮廓和可能的识别误差。
合并候选需要人工复核，不能因为有公开轮廓就宣称建筑当前状态或外观已核实。

## 深圳官方测绘目录

目录来源：深圳市规划和自然资源局，2026-04-28 公告。
https://www.sz.gov.cn/szzt2010/wgkzl/glgk/jgxxgk/gtzy/content/post_12759230.html

仅下载公开目录供研究。目录列出的高精度数据、模型和影像尚未获得，亦未申请。
公开目录不赋予目录中资产的下载、改编或游戏内再分发权。

## 发布之前

当前是本地制作资料。最终游戏署名、地图产物和衍生数据库的处理方式应按实际数据使用方式落实。
本说明不把游戏代码、美术资产与衍生地理数据库视为同一许可对象，也不声称本地归档已完成发行许可审核。
本项目没有抓取商业地图三维瓦片、街景照片或把参考照片制作成可分发纹理。

## Copernicus GLO-30：莲花山地形增量（2026-09-05）

使用 AWS 托管的 Copernicus DEM 2021 GLO-30 数据，瓦片为 `Copernicus_DSM_COG_10_N22_00_E114_00_DEM`。下载时间、URL、SHA256 与垂直基准见 `raw/landmarks/Copernicus_DSM_COG_10_N22_00_E114_00_DEM.manifest.json`。数据登记：[Copernicus DEM on AWS](https://registry.opendata.aws/copernicus-dem/)。产品和使用说明：[Copernicus Data Space](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)。

来源是约 30m 的数字表面模型，包含植被与建筑；本项目裁切、插值、移除局部游戏高程基准，并处理山脚、湖岸和道路衔接。15m 插值网格不是 15m 实测精度。公园边界及园路衍生自 OpenStreetMap，仍保留其来源与 ODbL 署名。

按提供方要求，改编的 GLO-30 地形保留以下署名：

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

派生产物为 `../public/city/terrain-detail.json` 与地形相关 GLB 网格；公开资源署名另保存在 `../public/city/LANDMARK_ATTRIBUTION.md`。处理方法、范围与精度限制见 `../docs/landmarks/lianhua.md`。

## 重点建筑的照片与项目页面参考（2026-09-05）

腾讯滨海大厦、万象天地、财富广场、七街公馆 / 哈尔滨大厦的出处分别保存在 `landmarks/tencent.json`、`landmarks/priority-places.json` 及逐对象任务的 `evidence.json`。建筑师、业主、顾问、公开项目页面和照片用于核对楼栋、比例、连桥、退台与外部构造；照片未被用作本轮发布贴图。

本轮模型由程序几何及项目已有材质构建。地图足印、来源陈述和照片估计分别记录，不能把公开参考图或楼层数估计宣称为测绘/BIM结果。图片作者和平台仍保有原图片权利；将来若直接使用图片资产，应在该资产条目记录具体许可和用途。

## 深圳湾对岸地形增量（2026-09-06）

扩展使用 GLO-30 的 N22E113 和 N22E114 瓦片；原始瓦片由 `scripts/fetch_coastal_dsm.py` 下载并校验固定 SHA-256。派生远岸模型按 70 游戏米抽样，垂直缩放 0.60，只用于远景地势。公共资产及署名见 [海湾地形来源](../public/licenses/coastal-terrain.md)。桥面坡道、护栏、灯位为游戏重建，不能当作实测高程或真实设备清单。
