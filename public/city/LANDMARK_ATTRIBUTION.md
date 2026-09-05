# 深城纪重点地标资源来源

## 地图与建筑足印

© OpenStreetMap contributors，使用 [Open Database License 1.0](https://www.openstreetmap.org/copyright)。原始分发来自 Geofabrik 广东数据，逐对象来源 ID 和处理记录保存在项目 `data/landmarks/`。Overture 派生记录如引用同一 OSM 要素，不视为独立测量。

## 莲花山地形

使用 AWS 托管的 Copernicus DEM 2021 GLO-30 瓦片 `Copernicus_DSM_COG_10_N22_00_E114_00_DEM`，于 2026-09-05 获取。[数据登记](https://registry.opendata.aws/copernicus-dem/) · [产品与使用说明](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)。

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

本项目对地形进行了裁切、插值、游戏尺度变换和边缘衔接。来源约 30m DSM 含植被与建筑表面，15m 网格是插值结果。模型不代表裸地测绘精度。

## 建筑外观参考

腾讯滨海大厦参考腾讯、NBBJ、WSP、Inhabit 与承建方的公开项目资料；万象天地参考华阳国际和华润公开项目资料；财富广场与七街公馆 / 哈尔滨大厦结合公开地点资料、照片和 OSM 足印。逐来源 URL、事实与估计项见项目 `data/landmarks/tencent.json`、`data/landmarks/priority-places.json`。

照片仅作为本轮几何和材质观察参考，没有作为贴图打包。模型采用程序几何及项目材质，不是摄影测量、竣工模型或逐尺寸实测结果。对幕墙、连桥位置、屋顶、入口及未公布高度的近似，在对象证据中单独标注。
