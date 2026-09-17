# 深城纪：Babylon / Blender → Unreal Engine 5

2026-09-13。分支 `codex/ue5-engine-migration-20260913`，基线 commit `69cf88b`。这是引擎级改造计划，不是在网页引擎上继续打补丁。**在 UE5 对应系统可验证之前，不删除 Babylon 源码、`public/city` 或 Blender 构建脚本。**

本机已装 UE 5.5（`/Users/Shared/Epic Games/UE_5.5`）。默认 Xcode 26 不能编 Mac 目标；`scripts/ue5/build-editor.sh` 会改用 `/Applications/Xcode-16.app`。Mac 上打开/编译只证明本机，不代替目标机 RTX 3060 / 1080p。

## 产品不变

- 深圳城市驾驶与生活原型
- 现有地标、路网、职业线
- 首轮剧情《最后一单》`bay-last-delivery`，奖励固定 180，图结构与 step/choice ID 不变
- 阿辉 / 阿琳 / 老陈 / 玩家
- 唯一钱包 `credit(id, amount)`，重复结算幂等
- 枪械只在独立试验场，不进都市生活主线

## 坐标

沿用 `AGENTS.md`：原点 WGS84 `[114.025, 22.536]`，经度差 × 102850、纬度差 × 111320，水平/垂直 × 0.60。游戏 X=东、Z=北、Y=上。

UE5 映射（写在 `CoordinateBridge`）：

| 游戏 | Unreal |
| --- | --- |
| X（东，米） | X × 100 cm |
| Z（北，米） | Y × 100 cm |
| 高度 Y | Z × 100 cm |
| yaw（0 = +Z 北） | Rotator Yaw = 90° − degrees(yaw) |

1 个游戏米 = 100 Unreal 单位。这是玩法比例，不是把 0.60 再乘一遍。不要虚构不可达坐标。

## 地点（玩家找得到的）

由 `scripts/ue5/export-city-skeleton.mjs` 从 `public/city/city.json` 与 `life-sites.json` 导出：

| 键 | 正名 | 来源 |
| --- | --- | --- |
| hub | 海湾生活驿站 | life-sites.hub.arrival |
| office | 科苑下班驿站 | life-sites.office.arrival |
| park | 公园城市养护站 | life-sites.workshop.arrival |
| workshop | 公园城市养护站 | 同上。Babylon 职业层曾把 workshop 错接到 office，UE5 不复制这个错 |
| bay | 滨海路边交接点 | spawn 沿 yaw 950 米后贴最近道路，没有值班窗口 |

未建的写字楼门厅、值班室、排水口继续标待布景，不当导航目标。

## 工程

`ue5/Shenchengji/Shenchengji.uproject`，引擎 5.5。

| 模块 | 作用 |
| --- | --- |
| TP_VehicleAdv | Epic 载具模板。保留类名，以免蓝图断引用。当前可开车的客户端 |
| Shenchengji | 坐标、城市骨架、钱包、职业表、《最后一单》、独立战斗 GameMode |

启动后 `UShenchengjiCitySubsystem` 读 `Content/City/city-skeleton.json`，铺地面/路段/近景楼块，把车传送到海湾生活驿站。浏览器不再是主客户端；`src/main.ts` 仍是 Babylon 基线。

## 资产管线（替换 Blender → GLB → 网页）

1. `scripts/ue5/decode-city-glbs.mjs` 解开 meshopt，写出 `artifacts/ue5-import/` 与 `Content/City/mesh-layout.json`。
2. `scripts/ue5/import-city-assets.sh` 用 Interchange 导入路网/楼体/地标/地形/驿站/车到 `/Game/Imported`。
3. 运行时 `AShenchengjiImportedCityActor` 按游戏坐标放置；Blender 不再被网页或 UE 运行时加载。
4. 原 `scripts/build_landmark_details.py` 在对应 UE 资产可验证前保留。
5. 立面 `facades.glb`、Nanite 重做和 3060 画质档仍待做。

## 玩法迁移顺序

1. 开车、停稳、下车（Chaos 载具 + 步行 pawn，对标 F）— 已接 `F` / `E` / `J`
2. 钱包 + 《最后一单》到站交互（到达半径 28 游戏米，速度 < 1）— 逻辑已进 `FShenchengjiStoryGame`
3. 职业三身份六合约 — `FShenchengjiCareerGame` 已用现有地点名和钱包 credit；完整品质/升级仍待对齐
4. 独立 `AShenchengjiCombatLabGameMode`，不挂到城市 GameMode
5. Interchange 导入 `public/city/*.glb`（`scripts/ue5/import-city-assets.sh`），Blender 不再被网页运行时加载
6. 再谈完整地标美术与 3060 画质档（低/中/高对标 `city-graphics-quality.ts`）

## 验收

- 用 UE 5.5 打开 `Shenchengji.uproject`，编辑器能编过
- 开局在海湾生活驿站，能开车
- 骨架地点与导出 JSON 一致，故事 reward=180
- Babylon `src/`、`public/city/`、Blender 脚本仍在
- Mac 结果不写成 3060 性能通过

## 明确未完成

立面 `facades.glb`、职业品质/升级与 Babylon 完全对齐、独立战斗试验地图、Windows/3060 包体与性能通过。Mac 编辑器结果不能写成目标机通过。
