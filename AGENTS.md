# 深城纪：项目事实与资产入口

本文件只补充项目事实；沟通与执行沿用当前全局 `AGENTS.md`。

当前可玩场景是 Babylon.js 浏览器城市，入口 `src/main.ts` / `src/city-world.ts`。
Blender 负责模型，`scripts/city_mesh.py` 提供共享网格 API。该模块导入会初始化 Blender 场景，不用于普通 Python 数据检查。

重点对象的资料收集、建模和验收使用 [实景建模 Skill](skills/landmark-reconstruction/SKILL.md)。
可执行任务契约和派工入口见 [并行工作流](docs/landmarks/agent-workflow.md)。
原始轮廓/来源清单在 `data/landmarks/`，不能把照片估计或 OSM 标签自动当作实测值。

当前游戏坐标为原点 `[114.025,22.536]`，WGS84 经度差乘 `102850`、纬度差乘 `111320`，水平/垂直统一缩放 `0.60`。
Blender 东/北/上 → GLB Y-up → 网页加载；保留现有根节点方向处理。
早期 EPSG:32649 研究坐标与本游戏坐标不同，不能直接混用。

`public/city/city.json` 是基础城市；`landmark-detail.json` 是重点地标增量，运行时合并。
`landmark-detail.glb` 替换旧地标；基础楼体和近景立面依据 `baseBuildingIds` 排除重复对象。
`building-exclusions.json` 记录被排除ID及基础资产哈希，`terrain-detail.json` 是莲花山高度场。
优先使用 `build_landmark_details.py` 增量构建，不为单个地标重跑/覆盖整座城市。
`build_city_detail_assets.py` 属于道路、车辆、基础地标的另一条构建流程。
高大林冠层（六树种 10–30 m）由 `scripts/build_canopy_trees.py` 建模并 `--prepare` 布点，运行时在 `src/city-canopy.ts`；与 8 m 原有植被 `planting.json` 并存，不改其哈希。公园内部为全高混植；trunk/primary 主干道两侧 24 m 内（含公园边缘、草地、中央分隔带）改用 `STREET_TIERS` 的 8–20 m 低/中/点景三档，成簇留窗、两侧独立，不再一种树等距成排。
路口红绿灯由 `scripts/build_traffic_signals.py` 建模并 `--prepare` 从 OSM 干道共享节点聚合路口（`public/city/signals/`），运行时 `src/city-traffic-signals.ts` 按两相位周期亮灯，`holdDistance` 让 NPC 车流、电动车与自动驾驶在红灯停线前等候。
电动摩托/电动自行车由 `scripts/build_ebikes.py` 建模并 `--prepare` 在地铁口、公交站和密集街区路缘排成停车排（`public/city/ebikes/`），运行时 `src/city-ebikes.ts` 负责停车排与沿路骑行的 NPC；车身颜色按实例着色。
不同 Agent 只能并行改独立对象模块；共享渲染源码、数据和总资产由一个集成人员串行修改。

本轮重点为莲花山、腾讯滨海大厦、七街公馆/哈尔滨大厦、财富广场、万象天地的塔楼部分。
科技园是片区，后续需要拆分街段；万象天地塔楼改善不代表商场、开放街区与装置均已完成。
当前 Copernicus 数据为 30m DSM，插值网格不提高实测分辨率；地形边界和原型平路接合属于游戏改编。

验证入口：`npm test`、`npm run build`、`scripts/validate_landmark_details.py`、
`scripts/inspect_landmark_details.mjs`、`scripts/check_landmark_details.mjs`。
截图在 `output/playwright/landmark-details/`，模型与来源校验在 `artifacts/city/landmark-detail-*.json`。
不得只凭构建成功宣称外观或性能通过；具名视觉复核和性能结果须来自当前资产。
