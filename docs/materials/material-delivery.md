# 材质与招牌交付

2026-09-06 的用户定向修订见 [窗光与地标夜景复核](../graphics/landmark-night-lighting-2026-09-06.md)：异色窗降至四分之一并关闭日间发光，春笋格栅和腾讯窗灯/顶标接入艺术照明，财富广场字牌改到内凹弧面。下文“两牌/不发光”的资源与验收数字保留为前一轮历史记录；当前招牌层为 3 张活动纹理、4 meshes、80 triangles，最终哈希与昼夜截图以新复核为准。

本轮优先手工制作重点建筑的真实文字、色系和有证据的夜间照明。八类手工 atlas、第二组 UV 和 OSM 类型恢复已应用到当前普通楼体，并完成首轮有限视角 GPU 检查；用户对全楼主色与柔光的新反馈仍在调整，最终材质视觉尚未冻结。此前三张生成底材仍作为原型/备用资源，其中两套底图与窗 mask 的引用继续常驻 GPU，显示采样由手工 atlas 覆盖；这部分仍占预算。不再新增 imagegen，既有重点几何构建流程保持不变。

## 当前产物与状态

| 产物 | 已有证据 / 完成范围 | 仍待完成 |
|---|---|---|
| `data/materials/shenzhen-palette.json` | 重点材料分工、来源和艺术近似色值；详见 [调色参考](./shenzhen-palette-references.md) | 实机中性光与黄昏下的色调复核；色号不是现场校色 |
| `artifacts/materials/buildings-tinted.glb` | 离线 COLOR_0 上游候选，已用于后续 atlas/UV2 资产；覆盖 99.9224% 顶点，详见 [颜色审计](./color-export-audit.md) | 继续检查重叠足印归属；此中间文件不等于当前 public 最终字节 |
| `data/materials/architecture-textures.json` | 三张 512×512 原型底材及哈希；其中办公/住宅两张备用引用仍常驻 GPU | 八类 atlas 覆盖显示采样，备用引用的资源释放仍需跟踪 |
| `data/materials/architecture-windows.json` | 三张配套 256×256 原型 mask；其中两张仍常驻 GPU | atlas 使用独立 stencil，不复用这些原型图案；真实房间亮灯分布未知 |
| `artifacts/materials/facade-diversity/` | 八类手工 atlas、UV2 与 OSM 分类已接入；当前 public GLB 与该目录报告输出 SHA 一致 | 全楼主色、柔光和最终视觉继续调整；长时段与全城性能未验证 |
| `public/city/landmark-signage.json` | 四张手工 PNG；腾讯顶标、七街西凹口入口两处已应用并通过字向/落位检查 | 腾讯低层与万象入口承载面仍 pending；完整入口和最终材质仍需继续细化 |

颜色候选仅改变 COLOR_0：41,711,664 字节，比输入增加约 3.37%；12 种颜色，15,378 个真实 ID / 16,070 个足印分片均有匹配。部分楼共用索引，同色组最大 27 个 ID，未匹配的 4,600 顶点保留原色。不要把颜色覆盖率当作逐栋材质真实性。完整输入/输出与解码几何 SHA 在 `artifacts/materials/buildings-tinted.report.json`。

当前 `public/city/buildings.glb` 为 42,262,408 字节，SHA256 `3e3a62701058e0aa3bf5981f7bd60014d62d4a5df44e64f86c9239abdd49f17b`，与 `artifacts/materials/facade-diversity/buildings-varied.report.json` 一致。该步骤新增 `TEXCOORD_1`，保留 POSITION、NORMAL、TEXCOORD_0、COLOR_0、indices、mesh 名、node 变换和材质；处理 1,318,939 个有纹理顶点，其中 1,392 个未匹配。分类依据为 11,759 个 OSM building 标签及 3,619 个形态艺术 fallback，后者不能称为恢复的真实用途。

## 真实文字、字形与安装分开核对

文字来源在 `data/materials/landmark-signage.json`，原图观察与未知项见 [招牌参考](./signage-references.md)。`exactText` 核对字符、大小写、繁简和换行；`textAssetReady` 表示可以制作文字；`renderReady` 表示有可供复核的模型承载面方案。它们不等同于实景位置、官方字体或最终渲染均已验证。

| 手工资产 | 内容 | 本轮安装状态 |
|---|---|---|
| tencent-south-roof | `Tencent`，首 T 大写、其余小写，白/银白 | 已进入 placements；南塔顶面位置、尺寸与朝向为照片解释估计；旧光照、单牌版本实机已确认正向可读无遮挡；夜光未知，发光值为 0 |
| tencent-low-link-bilingual | `Tencent 腾讯`，蓝色 | 文字已核对；低层铜棕连接体的具体承载面未配准，暂不加载 |
| qijie-entry-bilingual | `七街公館` 与 `SEVENTH AVENUE RESIDENCE`，金色双行 | 西侧中部凹口与薄雨篷已实机可见，字向正确、无明显穿模；位置、尺寸、字形仍有近似，入口门洞与地面细节未完成；不能移到屋顶 |
| mixc-street-link-entry | `the miXc 万象天地`，保留小 the、大 X、下移 c 和金色强调 | 低层入口文字已核对；具体入口承载面未配准，暂不加载；不能贴到 B/C/D 塔顶 |

四张 PNG 合计 **44,934 字节**。腾讯南塔顶为 512×96、11,620 字节；低层双语为 512×128、15,120 字节；七街和万象分别为 8,501 / 9,693 字节、512×128。当前活动两张为腾讯顶标与七街，合计 **20,121 字节**；两块文字 plane 加一块薄雨篷 box 共 **3 meshes、16 triangles、0 新灯**。仅腾讯低层、万象入口两个条目继续 pending，不通过遍历 artwork 自动加载。

七街的西面入口陈述、实景凹口与 OSM 轮廓组合证据见 [承载面补证](./signage-placement-followup.md)。据此 `renderReady=true`、`placementStatus=photo_interpretation_estimated`；雨篷承载体已补上，不能再称为无承载面，但不能把位置升级为实测。字牌底与雨篷顶均为游戏高度 3.3，字牌中心为 `[146.90674,3.84,1633.70791]`（east/up/north）；朝向和尺寸仍按补证文档的误差边界复核。

`src/landmark-signage.ts` 的异步 API 已应用，返回 `meshes / setNight / stats / dispose`。当前 module SHA256 为 `e734fdfcce17c153d08aec87ee75721dabbee9bcd35dfbec1f8c502a92f321fa`，manifest SHA256 为 `ce62c2b0caf9fea651eb77c29209cf35beb088920f7d067f9d1ead1a74dbf7c1`。`artifacts/materials/signage-candidate/module-validation.json` 记录严格 tsc 与 NullEngine 检查通过，覆盖法线、alpha、雨篷接触、未知发光为 0、无效输入拒绝与资源释放；纹理就绪/失败回调为 CPU 模拟，不是七街 GPU 验收。

腾讯两张已改用 2017 腾讯品牌实际轮廓，不再使用 Arial 代理。来源为 [Commons 的 Tencent logo 2017](https://commons.wikimedia.org/wiki/File:Tencent_logo_2017.svg)，该页记录原始来源为 [Tencent](https://www.tencent.com/en-us/)，并带 `PD-textlogo` 与 `Trademarked` 标签；来源、标签和哈希保存在 `data/materials/tencent-logo-source.json`。发布的 SVG 实际内嵌 RGBA PNG，已无重采样抽取至 `data/raw/materials/tencent-logo-2017-source.png`。生产脚本采用原 alpha 轮廓，手工布局、重着实景观察色，再缩小到有界运行纹理。品牌轮廓来源不能替代官方实景照片对招牌安装位置、尺寸或夜光的证明。

腾讯两份 SVG 编辑稿现在嵌入有界 PNG，供编辑布局；七街、万象仍用本机 Arial / Arial Unicode 手工排版并保留 `<text>`。它们都不是完整的矢量路径资产。七街书法、万象字形轮廓仍为近似，跨机器的 `<text>` 外观依赖字体；PNG 固定保存本次栅格结果。不能把“文字正确”写成“字形精确还原”。需要更精确时逐字手工描轮廓、保存路径版本，并保留可读文本作为核对依据。

两牌版本的具名视觉复核已记录在 `artifacts/materials/signage-visual-review.json`：`output/playwright/visual-upgrade/second-integrated/qijie-west-sign-no-hud.png` 显示七街金字和薄雨篷；同目录 `tencent-sign-dusk.png` / `tencent-sign-night.png` 确认腾讯标识方向与透明底正常。`qijie-signage.json` 中两纹理 ready、3 meshes、16 triangles、errors=[]。本次只通过招牌可读性与相对落位，七街门洞仍未细化，腾讯玻璃棋盘与普通楼整体主色/窗光还在调整；不将这些截图当作最终写实或性能达标。

## 手工制作与接入步骤

1. 先匹配真实建筑及牌所在的立面、屋顶、入口或连桥。记录目视来源、照片时间的未知项、文字、色系、安装对象与发光观察。官方导航名、备案名、建筑昵称、独立公司 Logo 文件均不能替代楼顶字牌证据。看不清的文字保留 null。
2. 手工制作小透明 PNG / SVG。用明确字符和独立元素布局，不用图像生成代写文字，不裁照片或水印作为贴图。颜色为照片解释或艺术近似时保留标注。
3. 把照片承载面对应到锁定几何，记录物理尺寸、相对北向的面外法线和高度。位置未知保持 pending，不默认朝南；物理米只统一乘一次 0.60。腾讯南塔当前安装位置是估计，不升级为实测。
4. 仅将有承载面方案的条目加入 placements。runtime 使用透明文字面、共享资源、距离可见性与既有灯光。未知夜间发光保持 0；夜景看见发亮最多支持“发光标识”，不能自动判定为霓虹管，也不能据此添加灯管、全楼泛光或新动态灯。
5. 主集成任务在最终资产上检查正反面、镜像/上下翻转、字符裁切、穿模、深度闪烁、距离可读性和日夜颜色。夜间发光只在字形 alpha 范围内，不能出现整块亮矩形。性能检查绑定最终资源哈希、固定视角和浏览器运行条件。

并行工作先在独立候选目录生产招牌：

```sh
.venv/bin/python scripts/prepare_landmark_signage.py \
  --output-dir artifacts/materials/signage-candidate \
  --review-dir artifacts/materials/signage-candidate/review
```

脚本读取招牌证据、锁定模型参数与腾讯品牌 PNG，在 `--output-dir` 下写 `textures/signage/*.png` 和 `landmark-signage.json`，在 `--review-dir` 写 SVG，审查拼图位于 review 目录的父目录。不同 Agent 选不同候选目录，避免相互覆盖。省略目录参数仍默认写 public，仅由主集成任务在源与资产冻结后串行执行。依赖 Pillow；七街和万象另依赖本机 Arial 字体，来源图、字体或 Pillow 版本变化后重新核对哈希与排版。

只需复现逐栋颜色候选时：

```sh
node scripts/colorize_architecture.mjs --self-test
node scripts/colorize_architecture.mjs \
  --input public/city/buildings.glb \
  --output artifacts/materials/buildings-tinted.glb \
  --city public/city/city.json \
  --exclusions public/city/building-exclusions.json
```

已存在候选不会被默认覆盖。重跑前先确认最终 atlas 流程是否仍以该候选为输入，由主集成任务决定使用独立输出路径还是显式 `--overwrite`。不能在另一个任务打包、分块或测试同一资产时运行写出。

## 资源预算与最终验收

下载字节、解码纹理显存和 draw call 分开记录。三张原型底材合计 1,134,641 字节，全部加载约 4 MiB RGBA8+mip；三张原型 mask 合计 1,615 字节，全部加载约 1 MiB。**当前其中办公/住宅两套 512 底图 + 256 mask 仍被备用引用持有，约 3.33 MiB 常驻**，不能写成原型没有在用或已经释放。手工 atlas 覆盖其显示采样，但不自动解除 GPU 资源引用。

当前手工 atlas 是一张 1024 底图与一张 512 窗 mask，约 6.67 MiB RGBA8+mip；与上述备用引用合计约 **10 MiB**，不含招牌、环境与其他纹理。当前 atlas-report 记录两图 94,388 / 2,431 字节。两张活动招牌约 0.583 MiB RGBA8+mip，所有四张若都加载约 1.25 MiB；两个 pending 图不分配 runtime 资源。以上是按格式/尺寸的显存估算，非 GPU 分配实测或性能结论。

普通楼颜色和 atlas 不逐栋增加材质，不额外堆叠立面几何；招牌当前增加两面文字与一块必要承载雨篷，共 16 triangles。无可靠 UV 的面先保持纯 PBR，不强贴底材。原型未新增 normal/metallic 图；不通过新增灯、全楼自发光、SSAO 或后处理来弥补材质问题。

`artifacts/city/asset-upgrade-final-check.json` 记录首轮八类 GLSL 编译与真实 1920×1080、Metal Chrome 152 检查，errors 为空。预热并排除初始 120 帧后，9 秒键盘驾驶样本 mean 59.57 FPS、8.4 秒移动无人机样本 mean 60.01 FPS。这些只覆盖所记录的短时视角，不支持全城、长时间或当前新光照版本达标。`artifacts/city/assets-final-tencent-front.png` 已检查腾讯顶字正向可读无遮挡，属于旧光照、仅一个牌的版本，也不覆盖新七街招牌。

主集成任务需要在完成后补齐以下记录，缺失项维持 pending：

| 最终项目 | 状态 / 待填证据 |
|---|---|
| 普通楼手工 atlas 与 OSM 类型恢复接口 | 已接入八类、TEXCOORD_1；类型来源与 fallback 数见上方报告，最终全楼主色/柔光仍在调整 |
| 当前 GLB、atlas、窗 mask、招牌 manifest | 当前版本、字节与 SHA 已记录；后续视觉调整或资产重打包时更新，不能沿用旧验收 |
| 几何及分块依赖 | pending；核对 POSITION / indices 保留范围、旧楼排除和最终分块哈希；新 UV2 不得冒用颜色步骤的所有属性不变结论 |
| 腾讯字牌视角 | 两牌版本的新环境黄昏/夜间近景均正向可读、透明底正常；未知照明仍为0；后续改变字牌或材质时重新复核 |
| 七街字牌与雨篷 GPU | **通过有限范围**：西入口近景文字可读、非镜像、无白底和明显穿模，雨篷可见；入口主体仍简化。具名复核与截图哈希见 `artifacts/materials/signage-visual-review.json` |
| 加载、资源释放与性能 | 当前两牌版本实机 `signage.state=ready`、3 meshes/16 triangles、2 ready textures、errors=[]；第二轮浏览器视觉/控制报告0 errors/0 warnings。该轮不是性能验收，最终材质和长时段仍待复核；备用纹理引用仍占约 3.33 MiB |
