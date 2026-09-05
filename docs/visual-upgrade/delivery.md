# 参考图画质升级 · 集成交付记录

本轮把 Blender 车辆与景观资产、建筑主题、新 HUD 和实时光照合入同一个 Babylon.js 可玩城市。目标设备是用户当前的 Apple M1 Max（24 核 GPU），目标实际渲染分辨率 1920×1080、60 fps。参考图是美术方向，不是深圳道路或楼宇布局的测绘依据。

## 已接入

- 4K 摄影 HDR 天空与共享 PBR 环境，1024 cube face；冷色天空、暖色低角度太阳、受控的车身高光。HDR 仅在加载时预滤，天空与环境共用底层 cube 纹理。
- 扫描沥青法线、连续干湿粗糙度、现有平面反射。修复莲花山沥青被加入自身反射目标而触发的 framebuffer feedback loop。
- 低机位追踪镜头、深色车漆和车窗、贴合原车表面的“深城纪”牌照。保留授权 CarConcept 车型与原尾灯，未假称已建成参考图中的同款轿车。
- 左上疏排品牌、左下透明圆形导航、右下开放式仪表与窄斜体数字。导航沿用真实道路数据，HUD 不新增第二个 3D 相机。
- 普通楼按建筑元数据组统一配色、局部暖白窗光。修复随机种子在像素插值中波动导致的碎窗；修复图集接缝的 mip 采样。具名地标保留独立材质角色，腾讯玻璃和连接体另行校准。
- 无人机 WASD 平移、方向键在相机原位转头、QE 升降；按住左键拖移、右键或 Alt 拖拽环绕。失焦、取消和松手会结束拖拽。只有浏览器实际传入多触点时，三指分支才能识别；系统合成的鼠标事件不含手指数。
- Retina 按实际像素预算提高渲染清晰度；路牌字体加大并保留原文，纹理使用各向异性过滤。

## 当前证据

- `npm test`：17 项行为测试通过；生产构建通过。
- `output/playwright/visual-upgrade/second-integrated/report.json`：按住/松手、方向键转头、右键环绕、七街/Tencent实际机位、Retina 共 8 项检查通过，0 errors / 0 warnings。该轮验证覆盖新相机操作与字牌，不代表之后美术版本的性能。
- Retina CSS 1115×874、DPR 2：实际 canvas/engine 为 1626×1274；截图为 2230×1748。截图像素与内部渲染尺寸分别记录。
- `output/playwright/visual-upgrade/third-integrated/report.json`：4K 天空与第二版建筑主题的同机位黄昏/夜景，0 errors / 0 warnings。开发路线任务具名复核：黄昏碎窗明显消除、整栋主色统一，夜窗恢复暖色局部柔光；远处夜窗密度仍有调整空间。
- `artifacts/materials/signage-visual-review.json`：地标任务具名复核七街西入口中文字向、两行落位和薄雨篷，以及腾讯透明招牌。该结论不涵盖七街完整门洞或商场首层。
- `output/playwright/visual-upgrade/controller-calibration-60s/report.json`：60.101秒驾驶1,015.031个游戏距离单位，0停车/0恢复/0错误/0警告；rAF平均59.969 fps、P95 16.7ms、P99 16.8ms；engine原始帧间隔P95 17.4ms。实际1920×1080、Chrome 152 / Metal / M1 Max。此项只证明一分钟路段表现。
- `output/playwright/visual-upgrade/final-300s-low-speed/report.json`：300.125秒低速连续驾驶1,886.441个游戏距离单位，预声明巡航上限6.5 units/s（HUD约23.4km/h），停车0.32秒、约0.1%，0复位、0错误/警告/网络失败。rAF均值59.996 fps、P95 16.7ms、P99 16.8ms；Engine均值59.989 fps、P95 17.3ms、P99 17.6ms。加载到ready为5.593秒（本地生产服务、未清OS/GPU缓存）。GPU逐秒均值采样中位约10.09ms，P95约12.30ms，这不是逐帧GPU百分位。
- **严格总验收尚未通过。** Engine摘要记录1次超过50ms，独立rAF序列为0次；旧脚本先导出rAF再取Engine摘要，可能纳入尾端导出开销，但现有证据无法精确归因。三个大响应因Chrome inspector缓存被驱逐，原报告保留 `fail`，没有补写成通过。
- `output/playwright/visual-upgrade/frozen-large-response-corroboration.json`：道路GLB、建筑GLB、4K HDR在冻结dist、public、归档清单中的SHA256全部相同。这是本地服务文件侧证，不能冒充已恢复的HTTP响应正文。
- 60秒较高速路段与300秒低速路段单独记录，均不外推全城、68km/h或新一轮画质。旧10秒测试后半段卡在车流处，已作控制器诊断样本；改进后的真实按键跟车/绕行通过60秒实跑，未降低运动和复位门槛。
- 后续测试脚本已加入专用CDP大缓存、同一次evaluate冻结rAF/Engine/state、同时检查两组帧率与长帧。此脚本修复仅通过语法检查，未再次占用GPU，下一轮需要实跑。

## 新一轮交接

用户在开发路线任务追加了火烧云、建筑间灯光强度与色温差异、绿地起伏和远近草坪、自然边界积水（坡地无积水），以及普通拖动旋转、只有 Shift 拖动平移。共享源码已交回该任务继续实现；本文记录的第三版仍采用上一轮按住左键平移规则，是冻结的性能基线，不代表新一轮验收。

## 与参考图仍有的差距

这轮是完整可玩的画面升级，尚未达到参考图的照片感。商业首层、道路边缘的生活细节、连续的街道树冠、具名建筑近景构造仍需要更细的资产；当前多数建筑保留简化几何。春笋在默认出生点是远景，参考图中的主塔尺度和道路布局也没有被硬搬成虚假的现实位置。后续取景候选只从现有真实道路筛选。

## 资产与复现

- `public/city/delivery-manifest.json`：最终资产清单、字节数和 SHA256；文件存在不等于启动时全量加载。
- `data/materials/cinematic-environment.json`：Poly Haven Belfast Sunset (Pure Sky)，CC0，4K 来源与校验。
- `data/materials/road-cinematic.json` / `scripts/prepare_cinematic_road.py`：CC0 Asphalt Floor 扫描来源与粗糙度生成规则。
- `public/licenses/carconcept-CC-BY-4.0.md`：CarConcept 授权署名；游戏内保留入口。
- `scripts/check-visual-controls.mjs --only opening`：快速黄昏/夜间同机位图；默认模式包含无人机、地标字牌和 Retina。
- `scripts/check-cinematic-upgrade.mjs --duration 300`：当前生产包的持续驾驶、资源响应哈希、帧时序与运动门禁。
