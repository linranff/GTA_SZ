---
name: landmark-reconstruction
description: 用公开地图、地形、建筑资料和参考照片，逐个重建深城纪的重点山体、建筑和街区；导出可交给不同 Agent 的独立任务包，验证证据、坐标、轮廓、模型和实机结果。
---

# 重点对象实景建模

适用于《深城纪》当前浏览器城市。用户指定重点对象时使用；不把整个深圳都扩展为精细建模范围。首次应用本 Skill 时告知用户正在使用它。完整任务契约、证据格式与状态检查见 [agent-workflow.md](../../docs/landmarks/agent-workflow.md)。

## 先辨认对象，再决定建模范围

读取 `data/landmarks/priority-places.json`、目标 `data/landmarks/<id>.json`（若有）、现有 `scripts/landmarks/<id>.py` 和当前 `public/city/city.json` 的 `meta`。保留清单中的地点歧义与 blocker。当前用户指的是**七街公馆、哈尔滨大厦附近**；不要继续沿用早期误听的“企业公馆”。只记录公开建筑与街区资料，不把用户住所描述写入公开模型。

建筑先确认地块、楼栋数、足印、塔楼高度与高低关系、朝向、退台和连桥。山体先确认山脚覆盖、山脊走向、地形剖面和相对高差，禁止用单个小椭球代表整座山。街区先拆分可辨识的楼群、广场、道路和开放空间，不把“科技园”直接当作一栋建筑。

## 获取证据

1. 优先复用项目固定版本的 OSM / Overture 数据；查看原始 manifest、source feature ID 与坐标系。数据不覆盖目标时再获取对应区域，保留 URL、下载日期、版本和哈希。
2. 地形调用 `scripts/prepare_landmark_terrain.py`。检查输出的栅格来源、格距、海拔基准、处理参数和缺失值。公开 DEM/DSM 能支持大山体起伏，不能证明台阶、路沿或树下地面精度。无有效高程就保留 pending，不把插值或合成曲面写成实测地形。
3. 搜索建筑师、建设单位、运营方和政府公开资料，支持尺寸与主体结构。参考照片至少覆盖两个不同方向；辨别效果图、施工期和现状照片，记录观察日期未知项。照片数量不足时可以继续整理证据，但不能宣称完成全侧立面复原。
4. 每条判断写入任务包 `evidence.json`，区分 `reported`（来源陈述）、`measured`（写明测量方法）、`estimated`（写明比例推算和误差范围）、`unknown`。相互矛盾的证据保留差异与取舍依据。
5. 网页照片默认仅作视觉参考。只有明确的许可支持目标用途时才能下载为贴图、裁剪、打包发布；记录作者、来源、许可与修改。资料公开可看不等于图片可任意再分发。

网络检索与模型任务分开交付，固定已有数据的哈希后再开并行建模。可以使用当前可调用的工具；未核验 Grok bot、Cursor Composer 或 ChatGPT 的控制方式时，仅生成并交付提示词，不虚构自动调用。

## 导出并分派任务

在项目根目录执行：

```sh
.venv/bin/python scripts/landmark_tasks.py generate
.venv/bin/python scripts/landmark_tasks.py status --job artifacts/landmark-jobs/tencent/job.json
```

生成 `artifacts/landmark-jobs/<id>/job.json`、`prompt.md`、`evidence.json`、`model.json`、`validation.json`。现有任务保留，不覆盖研究或评审结果。需要不同执行者标签或新一轮任务时，使用独立目录，例如：

```sh
.venv/bin/python scripts/landmark_tasks.py generate --place mixc-world --agent cursor-composer --output artifacts/landmark-jobs-round2
```

将该任务的 `prompt.md` 发给执行者。一次只给一个对象的文件所有权；同一对象的证据整理与建模按顺序执行。不同对象可以并行。主集成人员负责共享脚本、资源总清单和网页加载。执行者只提交对象模块、参数和证据，不能各自重写 `src/city-world.ts` 或总 GLB。

## 保持坐标和尺度一致

当前游戏使用 WGS84 / EPSG:4326 原始坐标，原点 `[114.025, 22.536]`，等距近似的 local east/north/up：

```text
east  = (lon - 114.025) * 102850 * 0.60
north = (lat - 22.536) * 111320 * 0.60
up    = relative_height_metres * 0.60
```

保留真实米制尺寸，进入游戏时统一缩放一次。Blender X/Y/Z 为东/北/上；现有 glTF 导出器负责 Y-up 转换，网页加载器已有方向处理，不再额外旋转整个对象。旧地理研究使用的 EPSG:32649 和其他局部原点不等同于这套游戏坐标。GCJ-02、BD-09、未知坐标来源不能直接当 WGS84。

高度应区分海拔、建筑相对高度、地面基准和游戏高度；不得在 0.60 倍地面上放入未缩放塔高。当前道路有原型扁平化处理，山地入口衔接和碰撞需要单独检查。

## 构建与验收

先跑证据门槛，然后使用 `scripts/city_mesh.py` 的 `B.box / face / loft / tube / footprint` 等接口制作有来源的主体结构。不要单独导入 `city_mesh.py` 来检查数据：它依赖 Blender，并在导入时初始化场景和材质。总构建器负责加载对象模块及导出。复杂细节优先复用材质与几何，整面幕墙格栅不逐窗堆叠高面数物体。

当前增量样板的执行命令如下。先检查相应脚本确实存在；命令失败就报告失败，不能把本文当作构建已通过的证据。

```sh
.venv/bin/python scripts/prepare_landmark_terrain.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_landmark_details.py
node scripts/optimize_landmark_details.mjs
```

有缓存后，地形复现使用 `.venv/bin/python scripts/prepare_landmark_terrain.py --offline`。它不能替代缓存缺失时的获取流程。

最终增量 GLB 只包含五处 `detail_<id>_*`，不再复制周围的 `detail_block_*` 普通楼体。`landmark-detail.json.baseBuildingIds` 中的旧楼必须从 `buildings.glb` 和 `facades.glb` 同时排除，否则会叠楼。主集成人员首次接入、增加排除 ID 或重建基础楼体时，串行执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_city_facades.py
node scripts/optimize_city.mjs buildings facades
node scripts/finalize_city_assets.mjs
```

这三步写共享基础资产，不交给每个对象 Agent 并发执行。`finalize_city_assets.mjs` 记录排除 ID 和两份基础 GLB 的 SHA256；它本身不删除几何，不能单独调用来掩盖没有排除旧楼的构建。已有排除记录与当前基础资产匹配、且排除 ID 没变时可复用基础楼体。最后运行 `.venv/bin/python scripts/validate_landmark_details.py`，检查 `public/city/building-exclusions.json` 的 ID 及当前资产哈希。

主集成人员在独立终端启动 `npm run dev`，再执行：

```sh
node scripts/check_landmark_details.mjs
npm test
npm run build
```

`tests/landmark-detail.test.ts` 用当前数据检查旧楼替换、到达点、楼体内部碰撞和原圆形排斥的移除。它提供数据层的碰撞证据；实机接近、绕行及坡面行驶仍需浏览器检查，不能仅凭单元测试将碰撞项标为完整通过。

构建器输出 `public/city/landmark-detail.glb`，地形准备输出 `public/city/terrain-detail.json`；以脚本的实际产物与日志为准。独立模块不一定已独立导出 GLB；没有文件时任务状态必须停在实际完成阶段。

验收顺序为尺度和轮廓、近景结构、周边衔接、碰撞、实机加载和性能。俯视、道路人眼高度、远处天际线至少各保存一张实机截图，并和记录了视角/来源的参考资料逐项核对。自动检查不能替代图片形体判断。

```sh
.venv/bin/python scripts/landmark_tasks.py check --job artifacts/landmark-jobs/tencent/job.json --stage evidence-ready --record
.venv/bin/python scripts/landmark_tasks.py check --job artifacts/landmark-jobs/tencent/job.json --stage modelled --record
.venv/bin/python scripts/landmark_tasks.py check --job artifacts/landmark-jobs/tencent/job.json --stage verified --record
```

各命令只有在该阶段及所有前置阶段通过时才记录状态。不能为消除报错批量填 `pass`。`verified` 表示约定范围的证据与实机验收完成，不表示取得测绘精度。模型、源码或证据变化后必须重新构建/复核相应阶段。

交付时说明完成对象、可核对产物、已核实部分、仍属估计的尺寸与未通过项。只有实际测试结果支持时才报告性能达标。

## 材质、真实文字与招牌

以下“两牌”等内容保留为首轮交付记录。当前已包含后续招牌与夜景照明更新，实际状态以 `public/city/landmark-signage.json`、[材质交付](../../docs/materials/material-delivery.md)、[地标夜景复核](../../docs/graphics/landmark-night-lighting-2026-09-06.md) 和 [城市细节恢复](../../docs/graphics/city-quality-sport-2026-09-06.md) 为准，不按历史条目覆盖现有材质。

形体与尺度成立后再做材质和字牌。读取 `data/materials/shenzhen-palette.json`、`data/materials/landmark-signage.json` 和 [material-delivery.md](../../docs/materials/material-delivery.md)，按其中的实际交付状态继续。当前用户优先手工纹理，不再新增 imagegen。八类手工 atlas、UV2 与 OSM 类型恢复已应用，首轮有限视角 GPU 无错误；全楼主色与柔光仍在调整，最终材质视觉未冻结。已有生成底材中的办公/住宅两套备用纹理引用仍常驻 GPU，显示采样由 atlas 覆盖，不能漏记这部分资源。保留上方既有几何流程。

文字、字形、安装和发光分开记录：`exactText` 核对字符、大小写、繁简和换行；系统字体起稿的 Logo / 书法轮廓仍可是近似。`textAssetReady` 只表示可画文字；只有承载面已对应模型、位置估计明确的条目才进入 placements。官方导航名、备案名、昵称与独立公司 Logo 不能当作屋顶字牌证据；未知文字保留 null，未知方向与表面配准保留 pending。

用手工 SVG 或小透明 PNG 重现可确认的字牌，避免图生错字和整块发亮底板。当前四张图共 44,934 字节：腾讯顶标 11,620、腾讯低层双语 15,120、七街 8,501、万象 9,693。当前 placements 为腾讯南塔顶和七街西侧中部凹口入口，活动两 PNG 共 20,121 字节；两文字 plane 与七街一块薄雨篷 box 共 3 meshes、16 triangles。七街补证与估计误差见 [signage-placement-followup.md](../../docs/materials/signage-placement-followup.md)，已 `renderReady=true` 但不是实测，西入口 GPU 近景已通过字向/落位/雨篷可见性检查；门洞和地面仍简化。仅腾讯低层双语、万象入口继续 pending，不加载。`七街公館` 的「館」与英文第二行按参考保留，不能挪到屋顶。

腾讯两张采用 2017 腾讯品牌实际 alpha 轮廓，来源记录在 `data/materials/tencent-logo-source.json`；Commons 来源页注明原网站 Tencent，并记录 `PD-textlogo` / `Trademarked` 标签。源 SVG 实际内嵌 PNG，已无重采样抽取，再手工布局、按观察色重着并缩小，不能称为完整矢量路径。腾讯 SVG 编辑稿嵌入有界 PNG；七街、万象保留依赖本机字体的 `<text>`，书法与字形轮廓仍近似。品牌素材只证明所用字形来源，不能证明楼上安装位置、尺寸或霓虹效果。

夜景可见发亮不自动证明霓虹管；日光金属字不证明任何发光。腾讯与七街当前均为 `illuminationVerified=false`，黄昏与夜间发光为 0。新增灯、灯管或更强发光须有对应观察与单独实机验证，不能替未知事实补效果。

并行任务使用独立候选目录生产招牌，避免写入冻结的 public：

```sh
.venv/bin/python scripts/prepare_landmark_signage.py \
  --output-dir artifacts/materials/signage-candidate \
  --review-dir artifacts/materials/signage-candidate/review
```

它读取证据、锁定模型参数与已记录来源的品牌 PNG，在 output 目录写纹理/manifest，在 review 目录写 SVG，review 父目录写审查拼图。不同 Agent 使用不同候选目录；省略目录参数默认写 public，只由主集成任务串行执行。依赖 Pillow，七街和万象另依赖本机 Arial 字体，换环境后重新核对字形与哈希。

`src/landmark-signage.ts` 的异步 `loadLandmarkSignage(scene)` 已应用，返回 `meshes / setNight / stats / dispose`。两牌加雨篷版本通过严格 tsc 与 NullEngine 检查，证据在 `artifacts/materials/signage-candidate/module-validation.json`；CPU 模拟的纹理回调不替代 GPU 验收。腾讯在旧光照、单牌版本已实机确认正向可读无遮挡，截图为 `artifacts/city/assets-final-tencent-front.png`；随后两牌版本在新环境下也完成：七街西入口近景、腾讯黄昏/夜间字向与可见性由主 Agent 直接看图核对；`artifacts/materials/signage-visual-review.json` 记录范围与截图哈希。该检查不等于完整入口或最终材质画质通过。对象 Agent 不各自改总场景或并发重写 manifest。

若需要逐栋颜色后处理，使用 `scripts/colorize_architecture.mjs` 与交付文档中的独立候选命令，不重写 Blender 来源来破坏已有来源哈希。该步骤只写 COLOR_0；后续 UV2 / atlas 改动必须有自己的属性与资源校验，不能继承“全部其他属性不变”的验收结论。

资源按下载字节、RGBA8+mip 估算和实际活动纹理分别记账。当前原型办公/住宅两套 512 底图+256窗 mask 的备用引用约 3.33 MiB，手工 atlas 1024+512 约 6.67 MiB，合计约 10 MiB，不含招牌与其他纹理；不能因显示采样被替换就写成原型已释放。活动两招牌约 0.583 MiB，3 meshes、16 triangles、0 新灯；两个 pending 图不分配 runtime 资源。无 UV 的面先用纯 PBR，普通楼颜色/atlas 不逐栋增材质或几何。

`artifacts/city/asset-upgrade-final-check.json` 的首轮范围是 1920×1080 Metal Chrome、预热后排除初始120帧：9秒驾驶 mean59.57 FPS、8.4秒移动无人机 mean60.01 FPS，八类 GLSL 无错误。这是旧光照、单牌版本的短时样本，不支持全城或长时间达标。最终确认字形、承载面、昼夜、远近截图和资源后再报告完成；当前两牌已实机ready且无招牌错误，七街字向/雨篷与腾讯黄昏/夜间标识通过有限视觉检查；最终建筑主色、玻璃与柔光仍由主集成任务继续调整。
