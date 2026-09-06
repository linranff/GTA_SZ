# 窗光、地标夜景和地点提示复核 · 2026-09-06

## 最新回调：保持密度，适度提高窗光

用户体验降亮版后反馈过暗，因此只提高单窗亮度，不恢复高亮窗密度。普通窗夜间发光增益 `1.3 → 1.8`（提高 38.5%）、暮色 `1.8 → 2.4`；局部漫反射近似增益 `.10 → .12`。夜间 Bloom 权重 `.20 → .24`、暮色 `.16 → .19`，模糊核仍为 56，阈值和整体曝光不变。

备用纹理窗光夜间 `1.5 → 2.0`、暮色 `1.15 → 1.5`；腾讯窗光 HDR 夜间 `1.2 → 1.5`、暮色 `.45 → .55`。日间自发光仍为 0，招牌与春笋格栅参数不变。CPU 普通窗夜间点亮率仍为 31.307%，异色窗占全部窗格的 1.5625%。

Playwright 当前 WebGL2 画面 `output/playwright/building-glow/night-middle-road.png`、`night-middle-skyline.png` 已逐图复核：窗光有所回升，楼面仍有暗窗和明暗层次，未恢复大范围光晕。运行时 gain/night=1.8、Bloom weight=.24、kernel=56、failures=[]。立面检查、3 项地标照明回归、构建通过。以下为前两档参数和历史截图，不代表最新亮度。

## 后续观感修订：减少亮窗与眩光

用户反馈全城亮窗过多、亮度刺眼后，再次调整运行时参数。以下原始交付记录中的亮窗密度、窗户强度和源码哈希属于调整前状态；本节为降亮档记录，最新值以顶部回调记录和源码为准，地标模型与招牌位置没有变化。

- 普通窗补充点亮概率：夜间 `.46 → .14`、暮色 `.34 → .08`。保留楼层/房间分组，120 个建筑种子、每种 24×16 窗格的 CPU 抽样中，非异色窗夜间点亮率由 **56.916% 降至 31.307%**；不是全城逐栋测量。异色窗维持全部窗格的 **1.5625%**，普通白光仍占亮窗主体。
- 普通窗夜间发光增益 `3.2 → 1.3`（降低 59.4%），暮色 `4 → 1.8`；局部漫反射近似增益 `.18 → .10`。每窗少量离散光学变化保持不变。
- 夜间 Bloom 权重 `.46 → .20`、阈值 `1.05 → 1.30`；暮色权重 `.38 → .16`、阈值 `1.15 → 1.35`。两者模糊核 `112 → 56`。不通过降低整体曝光来压暗道路或天空。
- 备用纹理窗光夜间 `3.8 → 1.5`、暮色 `2.6 → 1.15`、白天统一为 0。腾讯可用窗格的点亮门限改为名义 32%（原 46%），HDR 夜间 `1.8 → 1.2`、暮色 `.65 → .45`；Tencent 顶标和春笋格栅自身的发光参数保留。

已用 Playwright 在当前 WebGL2 开发版（1600×1000）检查：`output/playwright/building-glow/night-rebalanced-road.png` 与 `night-rebalanced-skyline.png` 中楼体保留暗部、亮窗不再连成大光团；`night-rebalanced-windows.png` 中普通白光与少量彩色窗并存、窗框仍可见；同机位的 `day-rebalanced-windows.png` 无自发光，`sunset-rebalanced-windows.png` 亮窗更少、更柔和。

最终重新加载后，`night-rebalanced-tencent.png` 中腾讯楼体亮暗窗分离，Tencent 顶标仍发光；运行时确认夜间窗光 HDR 为 1.2、春笋格栅仍为 2.8。浏览器控制台无错误。

`scripts/check_facade_diversity.mjs`、3 项地标照明回归、`npm run build` 和 `git diff --check` 通过。此次没有新增灯、纹理、网格或渲染通道，也没有进行新的性能采样，不据此宣称帧率改善。

## 原始交付记录

本轮按用户游戏观感反馈调整。春笋格栅、腾讯窗灯及 Tencent 顶标的照明是用户明确要求的艺术参数，不代表实测灯具或现场亮灯分布。沿用实景建模 Skill 的坐标与承载面核对方式；没有重建或替换基础城市及地标 GLB。

## 改动

- 普通楼异色窗从 6/96 减至 6/384，即 1.5625%，恰为之前的四分之一。每个 24×16 窗格周期保留红、蓝、绿各两处，按建筑种子错开。普通白/暖白灯的分组点亮逻辑保持不变，CPU 抽样普通窗点亮率为 56.916%。
- 白天 `cityFacadeGlow` 两通道均为 0，关闭异色窗和普通窗的自发光及局部光晕；原有轻微离散 HDR/Bloom/预滤波参数继续用于暮色、夜景。
- 春笋现有 silver 竖向与锯齿格栅采用独立冷白发光材质，夜间 HDR 2.8、暮色 1.2、白天 0。平安金融中心未应用这套格栅灯效。
- 当前腾讯 GLB 的实心玻璃没有 UV。按索引连通分量恢复 5,994 块窗玻璃的局部坐标，在顶点附加四个浮点量；大面积背板和屋顶屏风不参与亮窗。夜间 HDR 1.8、暮色 0.65、白天 0。南塔顶部招牌所在区域留出暗色背景。
- Tencent 顶标夜间 HDR 3、暮色 1.1、白天 0，仍只在文字 alpha 内发光。
- 财富广场四字移到 A 座内凹、庭院侧弧面顶部，使用 `arcFits[1]` 和指向庭院的法线。文字贴面按半径 28.305 游戏单位分成 32 段，避免平面字牌两端穿墙；尺寸和落位仍是照片/模型估计。
- 顶部地点提示采用与左上角标题相同的 Songti 字体和字号范围，桌面 30–45px，手机 22–30px。保留 1 秒淡入淡出，移除 blur 与位移动画，仅留小阴影。无人机时按相机位置判定地点。

## 当前实机证据

浏览器 WebGL2，视口 1600×1000，本地开发版本。主 Agent 直接逐图核对：

| 截图 | 观察结果 |
| --- | --- |
| `output/playwright/fortune-signage/11-fortune-courtyard-night.png` | 内凹弧面顶部金色四字正向可读，无矩形亮底或明显穿墙 |
| `output/playwright/fortune-signage/12-bamboo-final-night.png` | 竖线及锯齿格栅有冷白 HDR 发光，玻璃主体保持不同明度 |
| `output/playwright/fortune-signage/13-bamboo-day-no-accent-glow.png` | 普通楼异色窗的发光消失，春笋新增格栅灯关闭 |
| `output/playwright/fortune-signage/14-sharp-location-title.png` | 真实切换地点触发“福田 · 竹子林 · 财富广场”；37.6px、filter:none、opacity:1 |
| `output/playwright/fortune-signage/15-tencent-balanced-night.png` | 腾讯窗灯可见，白色 Tencent 顶标正向可读且独立发光 |
| `output/playwright/fortune-signage/16-tencent-day.png` | 同一腾讯视角白天窗灯和顶标 HDR 关闭，保留材质反射 |

最终刷新后的控制台无错误；signage.state=ready、errors=[]。昼夜循环后腾讯、财富广场顶标白天 emissiveIntensity 均为 0，腾讯窗灯和春笋格栅日间 HDR 均为 0。

`npm test` 最终 85/85 通过；`npm run build`、`scripts/check_facade_diversity.mjs`、`scripts/validate_landmark_details.py` 均通过。新增回归覆盖无 UV 玻璃、昼夜切换、限定春笋格栅发光、内凹字牌曲率与正面法线。

腾讯夜景固定视角 5 秒短采样：mean 52.36 FPS，p95 24.6ms，1600×1000、433 draw calls。没有同条件基线，不据此宣称性能提升或全城 60 FPS 达标。腾讯新增顶点属性 388,096 字节，不增窗户 mesh、纹理或灯；字牌层合计 4 meshes、80 triangles、3 活动纹理，曲面字牌比原平面增加 62 triangles。

## 绑定哈希

- `public/city/landmark-signage.json`: `d15c4326d459d59116a54a00a0ee3fafcf769f618e2d45836bc9b43e4ba5a5f1`
- `src/city-landmark-lighting.ts`: `642cb3bcc282fa53c85d75627d2ca4b17ef4e882d71eaf34f885e97374ca689c`
- `src/city-facade-diversity.ts`: `00721aaed7e5ac595aa6c9f1d4254af2c29985d83730bd6af0b148d7bc464d0e`
- 腾讯最终夜景截图: `bff0e35a76e82849f6bb2d38cec878dbc64f4f544053670214cfea88ae7105cd`
- 财富内弧面截图: `031061f6f7da5002de023f658b5a8ca0b54d07de48c19c46c77d301133054d3d`
