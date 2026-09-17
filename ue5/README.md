# 深城纪 Unreal Engine 5

主工程：`ue5/Shenchengji/Shenchengji.uproject`  
默认地图：`/Game/Maps/ShenzhenCity`（海湾生活驿站开局）。  
引擎：本机 UE 5.5。计划见 `docs/ue5/migration-plan.md`。网页 Babylon 仍保留到 UE 对应系统可验证为止，但不再当作主客户端。

## 打开

```bash
scripts/ue5/open-editor.sh
```

或双击 `Shenchengji.uproject`。第一次会编 `ShenchengjiEditor`。独立战斗试验场：`scripts/ue5/open-combat-lab.sh`（不加载都市生活）。

## 导出城市骨架

```bash
node scripts/ue5/export-city-skeleton.mjs
```

写入 `Content/City/city-skeleton.json`。故事文案在 `Content/City/bay-last-delivery.json`，与 `src/city-story-content.ts` 对齐。

## 验证

```bash
node --experimental-transform-types --test tests/ue5-city-skeleton.test.ts
```

独立运行（不开编辑器，直接进海湾驿站）：

```bash
scripts/ue5/open-editor.sh -game -windowed -ResX=1600 -ResY=900 -log
```

进游戏后按 `` ` `` 打开控制台，`HighResShot 1600x900` 截图到 `Saved/Screenshots/MacEditor/`。
2026-09-16 M1 Max 实测：2174 个导入网格全部放置、车身 26 件挂上、HUD 正常，约 35 fps。
`verify-city.py` 的 `-unattended` 截图没有视口，会是全黑，不能当外观证据。

灯光由 `UShenchengjiCitySubsystem::EnsureLighting` 在 BeginPlay 兜底：地图里用 Python 生成的太阳
因 `unreal.Rotator(roll, pitch, yaw)` 参数顺序写反而朝天（整城只剩发光窗），会被停用并由代码太阳替代；
天光只在开局捕获一次。Lumen 在没有距离场时无法追踪且把帧率拖到 2–5 fps、触发 Metal 命令缓冲超时，
`DefaultEngine.ini` 已改为无 GI + 屏幕空间反射。

## 试玩键

- `J` 《最后一单》
- `E` 到站交互（须停稳；剧情要求先 `F` 下车）
- `F` 上下车（速度 < 1 游戏米/秒；上车距离 5 米）
- `1` / `2` 剧情分支
- `3`–`8` 接六份职业合约（热饭 / 两站 / 十分钟 / 准点离开 / 雨后巡检 / 亮灯）

## 导入现有 GLB

路网/楼体/地标带 meshopt，须先解码再进 Interchange：

```bash
node scripts/ue5/decode-city-glbs.mjs
scripts/ue5/import-city-assets.sh
```

解码写到 `artifacts/ue5-import/`（不改 `public/city`）。清单在 `Content/City/mesh-layout.json`。不删 Babylon 源文件。

不要删除 `src/` 或 `public/city/`。网页是对照基线，主客户端是本工程。

战斗试验场用 `ShenchengjiCombatLabGameMode`，不加载城市。距离场默认关闭，避免第一次 PIE 为 1700+ 网格建 DF。目标机仍是 RTX 3060 / 1080p；Mac 只证明本机。
