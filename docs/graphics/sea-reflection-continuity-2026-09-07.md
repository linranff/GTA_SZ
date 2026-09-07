# 海面反射圆弧修复 · 2026-09-07

用户截图中的海面在一条半圆边界两侧突然变色，白天、黄昏最明显。本轮已在当前城市资产中复现并消除该断层：远海继续得到天空反射，近岸建筑和水波倒影保持连续。

## 原因与改动

`atmosphere` 是跟随相机的半径 4000 m 天空球。平面反射将观察点移到海面以下，同时用 `MirrorTexture.mirrorPlane` 裁掉水下几何。远海的反射射线与这个有限天空球相交时，交点仍可能位于海面以下。`BackgroundMaterial` 继承场景裁剪面后，将这部分天空误裁掉，反射贴图该处只剩清屏底色，于是水面出现对应天空球截面的圆弧。

`src/city-sky-reflection.ts` 只为天空材质设置恒通过的裁剪方程，并跟随天空材质切换更新。场景中的建筑继续使用正常海面裁剪。入口在 `DrivingWorld.sky()`，加载占位天空、白天 HDR、黄昏 HDR、夜空材质均经过同一入口。

夜空自定义 shader 本来就没有该裁剪逻辑；本次同机复现中，夜景没有出现同样明显的圆弧。修复后仍复核了它的星空、岸边灯光倒影，以及往返切换白天/黄昏的结果。

水面沿用原有 512 × 512 平面反射、mipmap、动态刷新与静止降频。没有新增反射目标、纹理或场景渲染通道。上一轮的白天远海空气透视继续保留，本轮直接修正天空裁剪。

## 当前构建验收

- 修复前主包：`index-BZA6re7U.js`，SHA-256 `4adafa84f885e2cdd68bbf9478f5b9d9e7d43306c036440c9d18946b4361c82c`。
- 修复后主包：`index-pUEpy9TO.js`，SHA-256 `4070e6e8f2ba8e2159dab8216de667dc41c0ee9b4e6fac6ab2c7ff2c0b82c00e`。
- `npm test`：127 项通过。新增回归覆盖海面上方/下方几何裁剪、500–17000 m 反射射线、天空材质切换、Babylon 裁剪 uniform 绑定与 Background shader 集成、镜面回调恢复场景状态，以及原有反射预算。
- `npm run build`：通过。日志保留于下列证据目录；现有大包体提示仍在。
- Chrome Metal，1920 × 1080，DPR 1；修复前后各 11 张截图。六个高空视角的位置完全一致，低空岸边位置差小于 0.25 m。没有页面异常、HTTP 失败或 shader/反馈循环错误。

| 复核视角 | 结果 |
| --- | --- |
| `sunset-high-west` / `day-high-west` | 与用户截图同方向的海湾高空视角，旧圆弧消失，近远海颜色连续 |
| `sunset-high-south` / `day-high-south` | 换向观察另一段海湾，未出现另一条反射圆弧 |
| `night-high-west` / `night-high-south` | 夜海保持连续，切换模式无遗留黄昏反射 |
| 三种模式的 `coast-25m` | 近岸水波、楼体与天空倒影正常，远海未切换为一块清屏底色 |
| `day-coast-eye-height` | 2 m 视角，岸线和海面高度正常 |
| `day-return-road` | 回到驾驶镜头后，道路和水洼反射正常 |

在旧圆弧的 22 个无建筑遮挡截面上，使用相同像素位置对照，白天两侧 RGB 跳变中位数从 27.55 降至 2.89，黄昏从 14.68 降至 1.23。该指标只描述这些取样处的断层，不是全画面的视觉评分。

三个高空模式各采样 15 秒，修复前后均约 60.00 fps；修复后 P95 为 16.7 ms，P99 为 16.8 ms。回到白天驾驶镜头的静止采样约 60.00 fps。

Apple M1 Max（24 核 GPU、64 GB）上，当前主包的白天自动驾驶独立采样 183.91 秒、行驶 2.86 km，并抵达腾讯滨海大厦。平均 59.19 fps，P95 / P99 均为 16.8 ms，1 帧超过 50 ms，页面和渲染错误为 0。这是本机该次路线结果，不能把静止 60 fps 或平均驾驶帧率解释为每一帧都满足 16.67 ms。

## 证据与复现

证据根目录：`output/playwright/sea-reflection-continuity/`。

- `before/`、`after/`：具名 PNG 与 `report.json`，包括加载的主包哈希、相机、材质、帧时和错误记录。
- `drive/`：当前构建的自动驾驶帧时、遥测、起终点截图。
- `arc-probes.json`：旧圆弧位置、修复前后像素跳变及计算方法。
- `source-sha256.json`：本轮渲染源码和验收脚本哈希。
- `validation-tests.log`、`validation-build.log`：测试与构建结果。

```sh
npm test
npm run build
npm run preview -- --port 4173
node scripts/check-sea-reflection-continuity.mjs after
LIGHT_MODE=day DESTINATION_LIMIT=1 DRIVE_SECONDS=210 node scripts/check-city-rain-drive.mjs output/playwright/sea-reflection-continuity/drive
```

运行浏览器验收时，同机只开一个用于验收的渲染浏览器。当前证据使用项目已有 Chrome Metal 路径；其他系统需要调整浏览器路径。
