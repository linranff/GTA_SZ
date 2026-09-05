# 深城纪 · 一路向海

当代深圳的浏览器城市驾驶与生活原型。Blender 制作外景资产，Babylon.js / TypeScript / Vite 运行；先做城市与人物的日常，后续再拓展职业、住房与关系系统。

当前 v0.3 进入后直接驾驶：深圳湾、南山、福田、罗湖的压缩城市走廊，红霞黄昏、靛蓝概念 GT、环境车流和行人。原 v0.1 单街日结玩法保存在 `archive/v0.1/`，不再是当前入口。

## 运行

```sh
npm install
npm run dev
```

打开终端给出的本机地址。生产版：`npm run build`，然后 `npm run preview -- --port 4173`。开发服务器默认关闭热重载与文件轮询，修改后手动刷新；长期试玩优先使用生产预览。

| 按键 | 功能 |
|---|---|
| WASD / 方向键 | 油门、刹车/倒车、转向 |
| 空格 | 手刹 |
| C / 鼠标拖动 | 追踪、驾驶舱、远景镜头切换 / 环绕 |
| M | 城市地图；搜索地点与片区，缩放、拖动、选点预览路线 |
| 地图地点列表 | 自动驾驶、手动导航、瞬移到附近道路、俯瞰此处；行驶中 WASD / 方向键 / 空格随时接管 |
| V / F | 近处看车 / 返回驾驶 |
| G | 无人机观景 / 返回驾驶；与地图观景、V 看车使用同一镜头 |
| 观景时 WASD / Q E / Shift | 前后左右平移 / 降低升高 / 加速；拖动环绕，Shift + 拖动平移，滚轮远近 |
| L | 黄昏 / 夜色 |
| J / E | 城市手账 / 停稳后接人、交谈和送达 |
| R / Esc / P | 回到道路 / 暂停 / 实际帧率 |
| H / Esc 内声音设置 | 喇叭 / 分别调节音效、BGM 与静音 |

首次点击或按键启用音效和原创合成 BGM《海湾晚风》。驾驶舱包含实时速度、挡位、里程与灯光状态；车尾为“深城纪”牌照，尾灯与刹车灯会照亮后方路面。

“下班顺路”包含三段虚构人物行程。接人和送达时停车按 E，实际行驶后结算收入；钱包与完成记录保存在本浏览器。调试跳转可用于检查现场，使用跳转的载客行程不累计收益，手账里可重新接单。

## 本轮改进与边界

- 修复道路重叠、远景海面覆盖陆地、路牌强眩光、车灯照亮海面、车流父节点及导航错误吸附。
- 具有真实叶纹的 CC0 阔叶树、棕榈及近远 LOD；草束、花灌木、观赏草、长椅及路面井盖/格栅。新树位经过路网、冠幅、水体和建筑离线过滤；地图选点后可规划路线或使用常驻的瞬移／俯瞰按钮。
- 采用 Khronos CarConcept 的 CC BY 4.0 派生车辆，Blender 整理靛蓝车漆、轮胎/轮毂、灯组及正确轮轴和转向刹车。它是双门概念 GT，并非 SU7。
- 普通建筑八类手绘窗格/墙面图集、稳定楼栋相位、逐窗亮灯、玻璃/墙面粗糙度区分；保留原 OSM 轮廓和实体立面。具名地标仍使用各自材质。
- 重点地标增量包括腾讯、莲花山地形、七街公馆、财富广场与万象天地部分塔楼；另有春笋、平安、市民中心等基础地标。

普通建筑立面、高度缺失部分与城市比例包含艺术化估计；除莲花山地形增量外，高架/隧道仍压平。交通、碰撞和人物动画仍简化。画面与玩法仍需打磨，不是完整 GTA 规模产品或全深圳精确复刻。

[驾驶体验与画质升级](docs/驾驶体验与画质升级-2026-09-05.md) · [质量审查与优先级](docs/质量审查与改进-v0.3.md) · [重点地标精度与来源](docs/landmarks/delivery.md)

## 验证与资产

```sh
npm test
npm run build
npm run test:city
npm run test:city-life
npm run benchmark:city
```

浏览器测试脚本默认使用本机 Chrome；`GAME_URL` 可指定预览地址。性能报告必须匹配当前构建、分辨率和硬件，不能沿用 v0.1 五分钟报告。本轮资产与无人机短测见 `artifacts/city/asset-upgrade-final-check.json`、`artifacts/city/observer-check.json`；短截图测试不能证明全城稳定 60fps。

精细立面保留 Blender 几何，拆成 150 个 640 米分区：附近 1,050 米预取、700 米显示、1,500 米外卸载；原 `facades.glb` 是构建输入，不再整包载入。基础楼体与道路仍整包加载。页面隐藏或城市尚未初始化时不渲染。

`scripts/rebuild_city_assets.mjs` 在隔离候选目录编排离线资产构建（`npm run assets`，`-- --plan` 只读查看），不会自动覆盖当前试玩；全新重建流程尚未端到端执行。详见 [交付保护](docs/资产重建与交付保护.md)；已有城市数据、地标参数和地形缓存是输入。单个资产修改可单独运行对应脚本，避免全量重建。立面变更后先运行 `scripts/split_city_facades.mjs`，压缩后运行 `scripts/finalize_city_assets.mjs` 更新交付哈希及地标排除校验。

- `artifacts/city/vehicle-candidate/indigo-gt.blend`：当前玩家车辆；[车型来源与署名](public/licenses/carconcept-CC-BY-4.0.md)。
- `artifacts/city/landscape-candidate/subtropical-landscape.blend`：当前植物及道路细节。
- `artifacts/city/shenzhen-detail-art.blend`：旧车辆原型、行人、道路与基础地标。
- `artifacts/city/city-facade-art.blend`：逐栋配色及实体外立面。
- `artifacts/city/coast-and-ground.blend`：海岸与互斥海陆网格。
- `artifacts/city/landmark-details.blend`：按来源细化的重点对象。
- `public/city/delivery-manifest.json`：实际压缩后资产字节数和 SHA-256。
- `public/city/building-exclusions.json`：基础楼体排除精细地标的 ID 与资产哈希。
- `artifacts/city/art-pass/`、`output/playwright/landmark-details/`：实机截图。
- `output/art-direction/04-city-driving-target.png`：目标概念图，不是游戏截图。

## 数据

[数据归属与许可](data/ATTRIBUTION.md)。道路、建筑轮廓、水体与绿地主要来自本地固定快照的 OpenStreetMap 数据。运行时坐标是 WGS84 局部东/北平面，水平与垂直缩放 0.60；早期研究用的 EPSG:32649 坐标不能直接混用。地标与 DSM 的实际来源、分辨率和估计边界见 `data/landmarks/` 与 `docs/landmarks/`。
