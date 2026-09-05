# 重点对象的资料、建模与并行交付契约

本流程把可重复的资料整理和建模拆成逐对象任务。当前工具是 `scripts/landmark_tasks.py`；它输出 JSON 与提示词、检查文件和状态，不自动控制 Grok bot、Cursor、ChatGPT 或其他 Codex 实例。

2026-09-05 主集成人员已在本机核对 `ChatGPT.app`、`Cursor.app` 和 `Grok Bot.app` 存在；尚未验证 Composer 或 Grok 的无界面 Agent 调用入口。Cursor 的编辑器启动器不等于已验证的 Composer API。本轮先使用当前 Codex 会话内的子 Agent 完成证据、建模、流程三项工作，其他应用接收相同任务包时仍执行同一文件与验收契约。

## 可执行入口

在项目根目录执行：

```sh
.venv/bin/python scripts/landmark_tasks.py generate
.venv/bin/python scripts/landmark_tasks.py generate --place tencent --agent codex
.venv/bin/python scripts/landmark_tasks.py status --job artifacts/landmark-jobs/tencent/job.json
```

第一条读取 `data/landmarks/priority-places.json` 的 `places` 数组，给每个地点建立任务。`--place` 可重复；无该参数则全部生成。不存在清单、地点重复、非法 id 或选中地点不存在会以退出码 2 报告 pending，不生成假地点。第二次生成保留已有任务，包括原执行者标签；新一轮使用 `--output artifacts/landmark-jobs-round2`。

每个对象目录固定包含：

| 文件 | 内容与责任 |
| --- | --- |
| `job.json` | 源记录快照及清单 SHA256、派工标签、坐标规则、预算、文件所有权、阶段历史 |
| `prompt.md` | 可原样复制给执行者的中文任务；标签不代表已启动该 Agent |
| `evidence.json` | 来源、地点身份、坐标、形体观察、不确定度与 blocker；证据整理者填写 |
| `model.json` | 实存 GLB、源码与各自 SHA256、实际构建命令、仍为估计的参数 |
| `validation.json` | 绑定模型/证据 SHA256 的逐项具名验收，每项引用本地文件 |

`job.json` 保留清单当时的 `sourceRecord`，新的清单不会悄悄改写正在执行的任务。重查地点、变更范围或更换源数据时，由主集成人员明确建立新一轮任务或审查更新；不把旧照片自动当成当前外观。

## 状态定义

| 状态 | 实际检查 | 不能据此声称 |
| --- | --- | --- |
| `planned` | 已有独立任务；模板默认 unknown | 已获取完整资料或已有真实模型 |
| `evidence-ready` | 身份和 WGS84 中心已确认；必要形体观察有来源及不确定度；没有未解决 blocker | 所有尺寸实测、图片已授权作贴图 |
| `modelled` | 前序通过，GLB 非空且格式有效；模型和模块 SHA256 匹配；填写实际构建命令 | 视觉符合现实或实机性能达标 |
| `verified` | 前序通过；八项具名评审均有本地证据；绑定当前模型和证据；GLB 三角形/材质/文件预算通过 | 测绘级、所有视角与细节完全复原 |

`status` 是只读查询，同时输出 `recordedStage` 和重新计算的 `currentStage`。证据文件缺失、源码或 GLB 改动、SHA256 不一致会降低可达到的当前阶段。`check --stage ... --record` 只有通过时记录阶段事件及证据/模型哈希；失败退出码为 2，保留原历史。已记录状态并不是免检凭证。

已明确首轮范围的证据可用 `scope` 说明交付边界，未完成子范围放入 `pendingSubscopes`。这不表示原场所已全部完成；主范围仍不明或没有足够核心证据时必须保留 `blockers`。填写 `sourceSnapshots` 时，用本地文件路径映射 SHA256，工具会阻止已变化的来源快照继续通过。

## 证据填写格式

`evidence.json` 会复制源清单的 `sources`。每条引用来源至少有 `id`、`url`、`publisher`、`accessedAt`；建议增加 `title`、`sourceDate`、`license`、`localPath`、`sha256`、`use`。本地下载应保留原始来源 URL，私有照片不填造假的公开地址。自有照片不能单独通过当前“公开来源”检查，可作为补充文件并由主集成人员扩展来源类型后使用。

地点身份与定位格式：

```json
{
  "identity": {"status": "confirmed", "sourceIds": ["existing-source-id"]},
  "location": {
    "crs": "EPSG:4326",
    "center": [113.0, 22.0],
    "status": "confirmed",
    "sourceIds": ["existing-source-id"]
  }
}
```

上面的坐标仅演示字段，**不是任何目标地点的坐标**。必须替换为可追溯真实值。来源 ID 必须存在，来源要确实支持对应主张；检查程序只能核对字段和引用完整性，内容由评审核对。

一条形体观察：

```json
{
  "kind": "footprint",
  "value": {"width": 0, "depth": 0},
  "unit": "m",
  "basis": "estimated",
  "sourceIds": ["existing-source-id"],
  "uncertainty": "待填写具体比例推算方法和误差范围；本示例不能直接用于验收"
}
```

零值是模板示意，不能当作有效建筑尺寸。`value` 允许数值、坐标数组或结构化描述；字段非空不等于可信，因此必须检查其实际含义。`basis` 只接受 `reported`、`measured`、`estimated`，`unknown` 不通过。`measured` 应在不确定度说明中附测量方法，`reported` 不要改写成实测。照片推算还须记录视角、透视影响及标尺来源。

必需观察类别：单栋/楼群为 `footprint`、`height`、`orientation`、`silhouette`；山体为 `extent`、`elevation_profile`、`silhouette`；片区为 `extent`、`layout`、`silhouette`。街区内精修建筑继续拆成新对象，明确边界，避免整个园区共用一个模糊立方体。

地形剖面须说明绝对海拔与模型基面的关系；DSM 的树冠和楼顶不当作裸地。地形采样间距、插值和掩膜写入处理产物。位置不明、核心楼栋数量冲突等阻塞留在 `blockers`，不能只为推进状态清空。

## 建模边界与坐标

最新接入约定以 `scripts/build_landmark_details.py` 的实际模块调用为准。对象模块使用 `scripts/city_mesh.py` 的 B API，由总构建器初始化 Blender 场景、材质并导出；工作 Agent 不自行清空共享场景或重复导出整座城市。

首轮腾讯样板入口为 `scripts/landmarks/tencent.py` 的 `build(b, lm, spec, scale=0.6)`，输入 `data/landmarks/tencent.json`，由调用者 finish/export。财富广场、七街公馆与万象天地首轮目前合用 `scripts/landmarks/priority.py`，该文件属于主集成；后续逐对象任务不能同时修改它，应新增独立模块后由主集成接入。

源数据保留 WGS84 经纬度和真实米制参数。当前城市为原点 `[114.025,22.536]` 的东/北平面，水平和垂直各缩放 0.60 一次；计算见 [SKILL.md](../../skills/landmark-reconstruction/SKILL.md)。EPSG:32649 是早期地理研究空间，不能直接当游戏米坐标。地标形体的长宽高保持同一缩放，塔楼朝向须从地图足印确认。

山体先构建完整轮廓、起伏和坡脚，建筑先构建数量、比例、朝向、退台、连桥与入口，再加材质和幕墙节奏。模型的辨识度优先于窗格数量；临时轮廓块只作内部检查，不把它当最终精细成果。

每个任务只写自身 `scripts/landmarks/<id>.py`、任务目录、`artifacts/landmarks/<id>/`。其他必要改动写入任务目录的 `integration-notes.md`，由主集成人员串行接入。主集成人员拥有总清单、运行时源码、地形准备、共享资产和构建脚本。同一个 id 同时只能有一个写入者；不同应用不能对同一文件并发建模。

当前三个可并行方向是不同对象的证据调查、已定参数的对象建模、已完成对象的独立评审；同一对象的证据到建模是依赖关系，不盲目并行。Cursor Composer 可处理证据齐全的参数录入、B API 模块、重复视角检查；模糊地名、冲突尺寸、地形基准和最终集成由能审查来源与代码的执行者处理。模型标签不替代质量门槛。

## 构建、哈希与验收

当前增量流程命令：

```sh
.venv/bin/python scripts/prepare_landmark_terrain.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_landmark_details.py
node scripts/optimize_landmark_details.mjs
```

最终增量包只含重点对象网格，不复制 `detail_block_*` 普通楼体。总清单 `public/city/landmark-detail.json` 的 `baseBuildingIds` 驱动基础楼体排除，`buildings.glb` 和近处立面 `facades.glb` 都必须排除对应旧楼。首次接入、排除 ID 改变或基础楼体重建时，由主集成人员依次运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_city_facades.py
node scripts/optimize_city.mjs buildings facades
node scripts/finalize_city_assets.mjs
.venv/bin/python scripts/validate_landmark_details.py
```

`build_city_facades.py` 真正跳过旧楼，最后的 finalize 只为交付产物记录 ID 与 SHA256，不代替几何重建。排除 ID 未变且基础文件仍与 `public/city/building-exclusions.json` 的哈希一致时，直接运行最后的验证命令复用基础资产。当前排除 8 个旧楼要素；以清单为准，不在每个对象模块中复制一份硬编码列表。

启动 `npm run dev` 后执行 `node scripts/check_landmark_details.mjs`，再执行 `npm test` 和 `npm run build`。`tests/landmark-detail.test.ts` 检查当前数据的旧楼移除、到达点和楼体内部碰撞；实机接近、绕行与坡面行驶仍单独验收。成功与否以本轮实际执行日志为准。完整重建 `npm run assets` 属于另一条全城流程，不应由单对象 Agent 随意运行；它可能覆盖共享资产。地形缓存复现使用 `prepare_landmark_terrain.py --offline`，缓存缺失应失败。

`model.json` 的 `artifactPath` 默认是对象自己的 GLB。主集成使用共享 `public/city/landmark-detail.glb` 时可同时填 `artifactMeshPrefix`，值必须严格是本任务的 `detail_<id>_`，例如 `detail_tencent_`。工具读取真实 GLB 网格名，统计该对象的三角形与所用材质，保留 `wholeFileTriangles` 和整包文件大小；找不到对应网格会失败。没有前缀时统计整个文件。它不会伪造独立 GLB，也不能借用别的对象的网格通过检查。没有实际单独或共享导出时，只交付模块的对象停在 `evidence-ready`。

填写模型与源码哈希、绑定验收时，可使用：

```sh
shasum -a 256 public/city/landmark-detail.glb scripts/landmarks/tencent.py artifacts/landmark-jobs/tencent/evidence.json
```

将真实输出分别填写 `model.sha256`、`model.sourceModuleSha256`、`validation.artifactSha256`、`validation.evidenceSha256`。`model.buildCommand` 是本轮确实执行过的命令。不得只修改哈希来掩盖未重新构建或未复核。

`validation.checks` 有八项：`scale`、`orientation`、`silhouette`、`context`、`collision`、`browser`、`performance`、`provenance`。每项结构一致：

```json
{
  "status": "unknown",
  "evidencePaths": [],
  "reviewedBy": null,
  "reviewedAt": null,
  "notes": "待评审；通过后才填 pass，写明核对对象、误差和限制"
}
```

`evidencePaths` 为项目根目录相对路径或绝对路径。截图至少覆盖俯视、主要天际线和街面高度；形体评审应在本地报告中写参考来源、视角、对应结构、发现差异和结论，单张截图存在不等于通过。碰撞包含接近和绕行，浏览器项记录加载与控制台错误，性能项记录构建、设备、视口、同一路线与基线比较。`provenance` 核对模型对应来源、估计项、图片是否被打包以及所用资产许可。

## 初始增量预算

预算是保守的起点，不能替代当前设备和浏览器实测。旧城已包含大量建筑和树木，因此不要因为 64GB 内存而无条件提高模型面数。

| 对象 | 三角形上限 | 材质上限 | GLB 上限 | 贴图边长 |
| --- | ---: | ---: | ---: | ---: |
| 单栋或紧凑建筑组 | 25,000 | 12 | 8 MiB | 2,048 |
| 山体或分区首轮 | 60,000 | 12 | 12 MiB | 2,048 |

先把同屏新增部分约束在 150,000 三角形和 60 次额外 draw call 以内，再由主集成人员测量。任务 CLI 自动核对 GLB 的三角形、材质和文件大小；贴图尺寸、draw call、LOD/分区裁剪效果由实机报告核对。每个窗口不拆独立网格，重复构件实例化或合并。当前接入没有实现某项 LOD 或按距离加载时，只能标待办，不能写成已具备。

若确需突破预算，在任务历史或评审报告记录理由、实测结果和新预算，由主集成人员统一修改。报告必须区分“轮廓更接近现实”“公开来源支持尺寸”与“实测高精度”，不得互相替换。
