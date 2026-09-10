# GTA_SZ · 深城纪

**一款以深圳为背景的浏览器城市驾驶与日常生活原型。**

[English](README.md) · **简体中文** · [日本語](README.ja.md)

[最新源码](https://github.com/linranff/GTA_SZ/tree/main) · [v0.2 历史发布](https://github.com/linranff/ShenChengJi/releases/tag/v0.2) · Babylon.js · TypeScript · Blender

驾驶靛蓝色概念 GT 沿海湾前行，步行探索城市，接一份小工作，或飞到天际线上方。深城纪将深圳湾、南山、福田和罗湖的部分区域压缩为一条可以游玩的城市走廊。

游戏界面目前主要使用简体中文。这三个语言版本只涵盖项目文档，并非游戏内语言包。

## main 最新改动

- 晴天日照略偏暖，收敛玻璃和车漆上的强白色高光。
- 补出北侧连续山脊、公园丘陵与草坪起伏，保留道路和楼基高度。
- 改善高空海面的稳定性；无人机模式长按可放置光柱、收藏地点，或移动到附近合适的道路。

最新版已通过 **117 项测试**。复核记录：[光照与山体](docs/graphics/daylight-mountains-2026-09-06.md)、[水面深度修复](docs/graphics/sea-depth-2026-09-06.md)、[无人机光柱](docs/graphics/water-observer-beacons-2026-09-06.md)。下方截图记录的是此前 v0.2 版本。

![当前游戏中的夜间驾驶](docs/images/v0.2-night-driving.png)

## v0.2 的内容

- **三种光照模式：**疏云蓝天、实拍日落，以及带有银河和柔和发亮薄云的夜空。海湾水面和路边积水会反射周围环境。
- **更完整的城市观感：**高空视角保留原有建筑立面和材质，细节与局部照明跟随正在观察的区域。暗楼层、独立窗户和少量克制的彩色窗光，让夜间天际线保有层次。
- **主角 GT：**新增尾翼、四个金属排气口和冷白色 HDR 车灯，并保留原有座舱、可工作的仪表和刹车灯倒影。
- **自由探索：**驾驶、步行、无人机观察、可搜索的地图、路线预览、导航，以及支持手动接管的自动驾驶。
- **日常工作：**可重复承接的配送、载客和维护合同，以及升级、角色对话与选择和住房储蓄目标。进度保存在当前浏览器中；刷新页面后，未完成的合同需要重新接取。
- **逐层搭建的城市：**基于 OSM 的道路和建筑轮廓、部分地标模型、海岸地形、桥梁、植被、街道设施、交通车辆与行人。

![GT 的尾翼与四个排气口](docs/images/v0.2-sport-gt.png)

以上均为游戏运行时未经修改的截图。项目仍处于原型阶段：交通和碰撞经过简化，建筑高度与立面包含艺术估计，住房储蓄目标也不会解锁已建模的公寓。本项目并非对整个深圳进行测绘级精度的重建。

## 本地运行

需要 **Node.js 24**、npm、Git LFS，以及支持 WebGL2 的桌面浏览器。目前的视觉检查使用 macOS 上的 Chrome。

```sh
git lfs install
git clone --branch main https://github.com/linranff/GTA_SZ.git
cd GTA_SZ
git lfs pull
npm ci
npm run dev
```

打开 Vite 输出的地址，通常为 `http://127.0.0.1:5173/`。大型模型、HDR 环境和图片保存在 **Git LFS** 中；如果下载的源码仅包含 LFS 指针，游戏将无法运行。仓库处于私有状态时，需要相应的仓库访问权限。

预览生产构建：

```sh
npm run build
npm run preview -- --port 4173
```

本机准备过久岐忍 / 夜兰资源后，使用 `npm run build:characters` 代替上面的 `npm run build`，即可生成包含这两个角色的完整 `dist/`。原始模型不进 Git，运行时 GLB 会进入该部署构建；命令不会上传文件。资源准备、独立托管和使用范围见[角色接入与部署](docs/characters/local-mmd.md)。

开发服务器关闭了热更新与轮询，以保持长时间游玩的稳定性。修改后请手动刷新。使用现有资产游玩**不需要** Blender，也不需要下载原始地形数据。

## 操作

| 输入 | 操作 |
| --- | --- |
| W A S D / 方向键 | 驾驶：加速、转向、刹车/倒车 |
| Space | 手刹 |
| C | 切换跟车、座舱和远景驾驶镜头 |
| F | 靠近车辆且停车时上下车；退出观察视角 |
| V | 检视车辆；再次按下返回 |
| G | 进入/退出无人机观察 |
| 鼠标拖动 / 滚轮 | 在观察视角中环绕/缩放 |
| 无人机：W A S D / 方向键 | 移动/转头 |
| 无人机：Q / E / Shift | 下降/上升/加速移动 |
| 无人机：Shift + 拖动 | 平移视角 |
| M / Tab | 地图：搜索、选择地点，再选择导航或观察操作 |
| L | 切换日落 → 夜间 → 白天 |
| J / E | 打开城市手账/停止移动后与附近目标互动 |
| H | 鸣笛 |
| R | 将车辆返回附近道路 |
| Esc / P | 关闭菜单或暂停/显示帧率面板 |

步行时，使用 W A S D 移动，拖动鼠标或使用方向键转头，按住 Shift 加快步行速度。自动驾驶过程中，驾驶输入或 Space 可以接回控制权。暂停菜单提供音效和音乐设置；首次点击或按键后开始播放声音。

## 开发与检查

```sh
npm test
npm run build
```

v0.2 候选版本已通过 **90 项测试**和生产构建。当前截图与短时性能测试记录见[城市画质与 GT 运动套件](docs/graphics/city-quality-sport-2026-09-06.md)。这些测量结果并不代表游戏在所有电脑或整座城市中都能维持稳定帧率。

启动本地服务器后，可使用以下命令重新执行最新的视觉检查：

```sh
node scripts/check-distant-city.mjs http://127.0.0.1:5173/
node scripts/check-city-sport-details.mjs http://127.0.0.1:5173/
```

这些脚本目前使用 macOS 的 Chrome 可执行文件路径。截图和完整诊断结果生成于 `output/playwright/`，不随源码检出提供。

| 范围 | 入口 |
| --- | --- |
| 浏览器应用与场景 | `src/main.ts`、`src/city-world.ts` |
| 驾驶与城市生活规则 | `src/driving.ts`、`src/city-career.ts` |
| 基础城市与地标增量 | `public/city/city.json`、`public/city/landmark-detail.json` |
| 近景立面流式加载 | `src/city-facade-stream.ts` |
| GT 运动细节 | `src/city-sport-details.ts` |
| Blender 网格辅助工具 | `scripts/city_mesh.py` |

精细立面按 640 米分块流式加载：1,050 米内预加载、700 米内显示、超过 1,500 米卸载。基础建筑和道路以完整资产加载。高空视角保留原始建筑网格，并通过视锥体裁剪减少绘制；移动期间会降低高开销局部更新的频率。

资产重建是一套独立流程。重新生成资产前，请阅读[资产重建与交付保护](docs/资产重建与交付保护.md)、[地标交付](docs/landmarks/delivery.md)和[海岸实现](docs/coastal/implementation.md)。`npm run assets -- --plan` 会输出拟执行的构建计划；完整的全量重建尚未通过端到端验证。`scripts/city_mesh.py` 在导入时会初始化 Blender 场景，因此不要将它用于普通数据检查。

## 数据、资产与致谢

- 道路、建筑轮廓和地理要素：**© OpenStreetMap contributors**；参见[数据来源声明](data/ATTRIBUTION.md)。
- 主角车辆：基于 **Khronos CarConcept**，参见 [CC BY 4.0 署名说明](public/licenses/carconcept-CC-BY-4.0.md)。
- 白天 HDR：来自 Poly Haven 的 **Rustig Koppie (Pure Sky)**；参见[环境资产来源](public/licenses/daylight-environment.md)。
- 地形与地标：[海岸地形来源](public/licenses/coastal-terrain.md)和[地标来源声明](public/city/LANDMARK_ATTRIBUTION.md)。
- 其他资产与运行时依赖：[开放资产来源](public/licenses/open-city-assets.md)及 [public/licenses](public/licenses/) 中的声明。

代码、第三方美术资产和地理数据各有来源；资产声明不等于对整个仓库授予统一许可。地理输入、推断尺寸和艺术调整分别记录。多数详细开发文档目前使用中文。
