# 建筑颜色导出审计与离线修复

2026-09-05 的只读审计确认：普通楼体的逐栋颜色在 Blender 导出阶段已丢失。`buildings.glb` 和 `facades.glb` 的 `COLOR_0` 全为白色，若干纯色材质也缺少 `baseColorFactor`，因此 glTF 默认白色使屋顶和实体墙失去材料区分。重点地标的底色仍然存在，但运行时进一步压暗玻璃。重复立面还来自两套重复的程序图和统一 UV 尺度。以上问题不能仅靠提高曝光解决。

本次离线工具只补普通楼的逐栋色调，读取真实建筑 ID、足印、高度和稳定 seed，写入实际 `COLOR_0`。它不修改 Blender 来源脚本，不增加材质、网格、顶点、三角形或 draw call。材料底色、反射、生成贴图和日夜窗光由运行时按资产与材料角色分别处理。

## 审计证据

以下是本轮运行时修复、资产分块和颜色后处理之前的资产快照。后续资产重打包可能改变字节数和 mesh 数；后处理报告中的输入 SHA 和解码几何 SHA 才是单次运行的对应证据。

| 资产 | 字节数 | meshes / materials | UV 覆盖 | 顶点色与底色 |
|---|---:|---:|---|---|
| buildings.glb | 40,351,392 | 882 / 6 | 291 个 primitive 有 UV；591 个无 UV | 6 个材质各自的所有顶点只有一种颜色：白色；concrete、darkglass、roof、steel 缺少 baseColorFactor |
| facades.glb | 29,815,904 | 443 / 3 | 443 个全部无 UV | concrete、silver、steel 的顶点色均为白色，且缺少 baseColorFactor |
| landmarks.glb | 2,266,028 | 38 / 14 | 9 个有 UV；29 个无 UV | 无 COLOR_0；原始材料底色存在 |
| landmark-detail.glb | 1,375,748 | 27 / 12 | 4 个有 UV；23 个无 UV | 无 COLOR_0；原始材料底色存在 |

对 GLB 使用 `@gltf-transform/core` 与 `MeshoptDecoder` 解码后遍历全部颜色顶点，得到上表；并读取未压缩备份的材质 JSON 和颜色 accessor，发现其首个颜色同样为 Uint8 `(255,255,255,255)`，纯色材质也已缺少底色。未压缩备份 buildings / facades 分别为 353,151,272 / 338,506,588 字节。颜色丢失不能归因于 Meshopt 解码或 Babylon 的颜色归一化。

`scripts/build_city_facades.py` 原本选择逐栋 palette，并通过 `FLOAT_COLOR` / `CORNER` 属性 `Color` 与 `ShaderNodeMixRGB MULTIPLY` 接入材质。该声明与导出结果不一致。`scripts/city_mesh.py` 声明的 roof `(0.22,0.27,0.28)`、concrete `(0.57,0.61,0.59)` 等值未进入普通楼 GLB，但在重点地标资产中仍有对应材料底色。本轮保留这些建模来源文件的哈希，修复采用可独立复现的资产后处理。

原始 buildings 的三角形按角色为：concrete 1,227,238；darkglass 329,784；office 175,356；residential 484,212；roof 1,006,270；steel 87,678。原始 facades 为 concrete 93,556；silver 3,276,622；steel 281,254。这也说明细部成本主要是几何，不能通过增加每楼材质来获得颜色变化。

## 运行时修复边界

- `setupReflections()` 曾把所有同名 `landmarkglass` 从原始 `(0.14,0.28,0.35)` 覆盖为 `(0.045,0.11,0.17)`，明显压暗。原始环境贴图是 128 像素、Uint8 RGB 的低动态范围立方体。暖色低角度日光、contrast 1.14 和 SSAO strength 0.65 也可能增强暗面；本审计未用 GPU 分离测量各项贡献。
- `setupReflections()` 曾让 office / residential / stone 的窗光在昼夜都保持 emissiveIntensity 2.6。日夜切换只改灯光和环境强度，纹理窗格与发光模式因而重复。实体墙无需整体自发光。
- 同名材料横跨多个资产：concrete、darkglass、office、roof、steel、silver、landmarkglass、gold、pavement、park。它们不是天然共用的同一实例。按全 scene 材料名统一覆盖会误伤已有正确地标；建议按加载资产和材料角色标记、使用少量可共享材料。禁止逐栋 clone 材料。
- glTF loader 给纹理设置 `invertY: false`；直接 `new Texture(url, scene)` 的默认方向不同。替换生成纹理时显式保留 `invertY: false`、sampler 和 UV 通道，不应同时翻转图像和 UV。
- 无 UV 的 roof / concrete / silver 等面只能先使用纯 PBR 材料。直接给它们加照片或生成纹理会采样错误；补 UV 或三平面映射需单独验收，并计入 GPU 成本。
- 所有来源建筑外环在审计时均为顺时针，`B.footprint` 当前边墙绕序依赖双面显示。现有 glTF `doubleSided` 与 Babylon 双面光照补偿这一点。未修正法线和绕序前，不可直接打开 back-face culling 作为性能优化。

## 贴图与尺度证据

`scripts/make_city_materials.py` 只区分 office 与 else 两个分支，并重复使用 seed 48。`residential.jpg` 和 `stone.jpg` 均为 183,094 字节且 SHA 相同；两者 emissive PNG 也相同。当前 `city.json` 有 office 3,991 栋、residential 12,085 栋，没有 stone 样式建筑。新 stone 图可作为之后的材质族，不能宣称它已经用于全城。

原始 1024 像素图采用 8×8 窗格。`B.footprint` 用墙长 / 24 和高度 / 24 作为 UV，因此每窗约 3 个游戏米，即世界缩放 0.60 下约 5 个现实米；住宅图与来源约 3.3 个现实米的估计层高不一致。每面墙还从 U=0 开始，缺少逐栋变体。普通办公楼金属竖线间距 4 个游戏米，与纹理窗格也不同步。新增颜色只能降低整城同色感，不能自动纠正窗格、层高或幕墙真实性。

公开照片仅供材料分工、色族和形状参考。具体普通楼色调是艺术近似，不是现场校色或对每栋楼材料的事实断言。材质参考与来源见 [shenzhen-palette-references.md](./shenzhen-palette-references.md)。

## 固定后处理命令

环境使用项目已有 Node 依赖，不调用 Blender，不占用 GPU。先跑小 fixture：

```sh
node scripts/colorize_architecture.mjs --self-test
```

固定输入资产准备完毕、其他任务不再写入该资产后，再串行生成候选：

```sh
node scripts/colorize_architecture.mjs \
  --input public/city/buildings.glb \
  --output artifacts/materials/buildings-tinted.glb \
  --city public/city/city.json \
  --exclusions public/city/building-exclusions.json
```

默认产生 `artifacts/materials/buildings-tinted.report.json`。仅匹配和审计、不写候选文件时加 `--dry-run`。输出已存在时明确使用 `--overwrite`；工具拒绝 input 和 output 相同，也拒绝 report 覆盖输入、城市数据或输出。`--report` 可指定报告路径。不要在构建、Meshopt 优化、分块或性能测试正在读取/写入同一资产时运行全量步骤。

默认上限是未匹配顶点占比 1%、共索引同色组最多 64 栋、空间哈希格边长 64 个游戏米。可通过 `--max-unmatched-fraction`、`--max-group-size`、`--cell-size` 显式调整；出现覆盖不足或巨大同色组时，先检查坐标、排除清单和归属原因，不应单纯放宽阈值以获得成功。

候选报告和固定视角验证通过之后，由主集成任务把候选接入最终资产流水线，再更新最终资产哈希、派生分块与排除清单等依赖。若后续步骤简化或重新量化几何，必须另验其几何变化，不能继续引用本颜色步骤的“不变 SHA”。本工具不会自行覆盖 public 资产或宣称已经接入运行时。

## 归栋与色调算法

1. 读取排除重点地标旧楼体后的 `city.json` 建筑，并按 ID 和足印排序。使用第一个足印外环，与当前普通楼建模范围一致；高度、足印已经是游戏米。来源坐标不再额外乘 0.60。城市来源有 195 个重复 ID，来自道路留空裁切后的多个 Polygon：共 887 个分片记录，一个 ID 最多 33 片。工具支持这些合法分片，并强制同 ID 同色；同 ID 的 style / seed 冲突则失败。报告把真实 ID 数与足印分片数分开。
2. 解码 POSITION，应用 glTF node 世界变换，把 Y-up `(X,Y,Z)` 转回 `(east=X,north=-Z,height=Y)`。以 64 米空间哈希取得小范围候选，三角形重心与足印内点/边距匹配；墙面方向、高度与屋顶附属部分的容差辅助消除共享边歧义。缓存相近 XZ 查询，避免全城逐三角扫描全部建筑。
3. 用一份全局建筑色表保证同一归属建筑在墙、檐和屋顶 primitive 上使用同一个 tint。根据真实 ID 与 seed 稳定选择低饱和色族，并优先避开 12 游戏米范围内已选的邻栋颜色。office 是蓝青、银灰和浅暖；residential 是暖白、砂米、浅陶和灰绿；stone 只有输入出现该样式时才使用奶油石、花岗灰和浅赭。色值是线性 RGB 乘色，不是 sRGB HEX。
4. 若原 GLB 的不同建筑三角形共用同一个索引顶点，单个 COLOR_0 无法同时取两种颜色。工具把这些建筑合并为整组同色，并报告数量和最大组尺寸；它不拆顶点、不改 indices。此时相邻共索引建筑无法全都异色，这是保持几何的明确约束。独立邻栋尽量不同色；palette 耗尽产生的邻接冲突也单独统计。
5. 写 normalized Uint8 VEC4 `COLOR_0`，原 alpha 保留至 8 位精度。未匹配顶点保留原色并计数，超阈值直接失败。几何归属是来源数据辅助的空间估计，不应把 `paintedVertices` 等同于实景材质准确率。重叠足印、共墙和屋顶需要候选视角检查。
6. 不执行 weld、prune、重排、简化或增加材质。先比较内存中所有 POSITION、indices、其他 attributes、mesh 名与 node 变换，再写临时 GLB 并解码复核相同 SHA；验证通过后才重命名候选。压缩文件本身 SHA 改变是预期结果。

报告包含 `paintedVertices`、`unmatched`、`unmatchedTriangles`、`paintedBuildings`、`uniqueColors`、`weldedColorGroups`、`maxWeldedGroupSize`、`mixedStyleWeldedGroups`、`adjacentPaletteConflicts`、输入/输出/城市/排除清单 SHA，以及每栋的 group 和 RGB。`before` / `verifiedGeometry` 中的 `positionAndIndicesSha256`、`otherAttributesAndStructureSha256` 是解码内容哈希，不是 GLB 文件哈希。

## 已完成与待验证

小 fixture 自测已通过：78 顶点全部匹配，产生 3 种颜色；一对共索引建筑同色，其余独立邻栋异色；同栋跨墙/屋顶颜色一致；带 node 平移和非均匀缩放的坐标转换正确；输出再读后的 POSITION / NORMAL / UV / indices / mesh 名 / 变换 SHA 不变；重复执行的归属和颜色确定；原地覆盖及未知位置超阈值被拒绝。临时 fixture 文件已清理。

2026-09-05 全量候选已串行生成并复核。`artifacts/materials/buildings-tinted.glb` 为 41,711,664 字节，较 40,351,392 字节输入增加 1,360,272 字节（约 3.37%）。15,378 个真实 ID、16,070 个足印分片全部有着色匹配；5,924,681 / 5,929,281 个顶点着色，覆盖率约 99.9224%，剩余 4,600 顶点保留原色。另有 3,541 个三角形重心未找到归属，计数单独保留；部分顶点可通过后备点匹配找到归属，不能将其当成所有三角形都精确归栋。实际使用 12 种颜色，stone 未使用。

全量输出保持 882 个 mesh、3,310,538 个三角形。672 个同色组涉及多个真实 ID，最大 27 个 ID；其中 249 组跨 office / residential 样式。这些组来自共享索引与空间归属，在不拆几何的约束下整组取一种颜色，不能宣称每栋相邻楼都不同色。另有 579 个 palette 邻接冲突。固定视角尚需主集成任务检查真实重叠足印归属与远近效果。

| 证据 | SHA256 |
|---|---|
| 输入 buildings.glb | `79ca0d4dbe6d616671c203aad7eb2a30ad7ba8d7904b0bea2c9f5c2c514f2dda` |
| 输出候选 buildings-tinted.glb | `2fdb394416a59fd547b1eaa0b98f1633ea1f928b6406ba4f7901e6b43728e44d` |
| 输入、内存修改后、写出再解码的 POSITION + indices | `d73a2a06b45daff37c8626bcc44d1678484b4d8a53147da626ece3a33de8db07` |
| 输入、内存修改后、写出再解码的其他 attributes + 结构 | `818a04d92f6bb15e39570271589638033b0c132c2edcc33ae766912adc800b1d` |

完整归属和来源哈希在 `artifacts/materials/buildings-tinted.report.json`。本子任务没有启动 GPU，也没有把候选部署到 public。
