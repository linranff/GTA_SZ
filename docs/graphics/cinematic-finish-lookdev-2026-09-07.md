# 质感与观感升级：光比、后处理链与立面浮雕

针对“建筑和场景像未贴图的粗模、缺少精致感”的反馈，本轮不新增资产、贴图或渲染通道，只改光比、后处理链和现有立面着色器，并用四机位固定截图与基线做 A/B。所有数值来自当前工作区的 `npm run build` 产物（`vite preview`），基线是 `HEAD` 的构建。

## 根因

复看基线并用 `finish()` 逐项开关后，"糙"主要来自三处，而不是模型本身：

1. 后处理链顺序：SSAO 管线的 `SSAOOriginalSceneColor` 被排到默认管线之后，SSAO 在色调映射与调色之后叠加，MSAA 也落在错误的通道上；每次重建管线（切模式、切无人机）顺序都会回到这个状态。中途曾怀疑 bloom 合成在半分辩率输出，用尺寸断言排除了，Babylon 的 `bloomScale .5` 只影响模糊输入。
2. 场景目标是 RGB8：日落 HDR 天空的反日侧被截成两三阶，立面高光在 bloom 前就已剪切。
3. 光比过平：日落 `sun 1.12 / hemi .54 / environment .53`，直射与补光比不到 1.4，立面没有转折；夜景地面亮于天空，窗光饱和度压过一切。

## 改动

### 光比与环境（`src/city-cinematic.ts`、`src/city-sunset-environment.ts`）

- 三套 `CINEMATIC_LOOK` 预设集中为数据：日落 `sun 1.4 / hemi .12 / environment .40`，夜景 `sun .30 / hemi .08 / environment .55`，白天 `sun 3.0 / hemi .28 / environment .78`。每套带自己的雾色、曝光、对比、bloom 阈值和 `grade`（阴影偏蓝、高光偏暖、整体减饱和）。`tune()` 调试钩子直接覆写这些字段。
- 日落环境立方体的反日侧不再是黑：未受光分支保持约十分之一受光云亮度的深靛蓝（`contrast .70+.68*lit`），这也是背光面唯一的补光。显示用 RGB8 立方体改为 gamma 编码（`encodeSunsetDisplayByte`，`gammaSpace=true`，`level=SUNSET_DISPLAY_RANGE`），5% 以下保留约 60 阶而不是 3 阶。
- 白天 `hemi .22→.28`：白天立面基部由天空可见度 AO 压暗后，需要更多未遮挡补光代表晴天地面反弹。

### 夜景（`src/city-architecture-materials.ts`、`src/city-facade-diversity.ts`、`src/city-landscape-lighting.ts`）

- 地标自发光 `night 2.0→1.35`、`dusk 1.5→.45`；普通窗 `NIGHT_EMISSION_GAIN 1.55→1.10`、`DUSK_EMISSION_GAIN 2.40→.55`。黄昏立面仍有直射阳光，室内灯只在天黑后接管。
- `NIGHT_GROUND_FLOOR.lights` 保持 6：半球 + 月光 + 两盏车灯 + 最近两盏路灯。之前压到 4 时，Babylon 按场景顺序填灯位，被丢掉的是路灯光池而不是车灯，草坪和山坡夜里整片发黑。

### 调色板（`src/city-facade-diversity.ts` `FACADE_THEMES`）

墙面色度降到原来的 55%、玻璃 75%，亮度基本不变。城市主体是灰白瓷片、米色涂料和蓝绿玻璃，颜色来自光、招牌和少数强调楼，而不是每一面墙。

### 后处理链（`src/city-cinematic.ts`、`src/city-world.ts`、`tests/city-post-chain.test.ts`）

- `CINEMATIC_FINISH`：MSAA 4×、FXAA 关、锐化关、颗粒 6.5、暗角 `weight 1 / stretch 1`（椭圆）、色散 1.8 且集中在边缘（`aberrationRadial .8`）。锐化在全分辩率下没有可见收益只放大颗粒，保留参数供调试开关。暗角从 1.35/0.15 收回：那组参数让画幅左右边缘的楼体减亮 26%，白天读成脏墙。
- `syncPostChain()`：保证 `SSAOOriginalSceneColor` 是相机第一个通道，只有第一个通道带 MSAA，其余为 1；调用发生在切模式、切无人机和重建管线之后。测试覆盖排序、幂等、`bloomMerge` 半分辩率模糊输入与全分辩率输出。
- 场景目标在 `textureHalfFloatRender` 可用时为半浮点，天空与 bloom 不再在 8 位上剪切。
- 无人机模式 `AERIAL_FINISH`：MSAA 1 + FXAA。从空中可见的锯齿是亚像素窗格与灯排的着色闪烁，MSAA 不处理这类问题，FXAA 便宜且有效。

### SSAO（`src/city-world.ts` `STREET_AO`）

- `radius 2.5 / maxZ 130 / strength .65 / base .1`，G-buffer 与 AO 都是半分辩率（`bufferRatio .5 / aoRatio .5`）。不再走全分辩率 MRT prepass。
- G-buffer `renderList` 只放相机 `maxZ + listMargin(100)` 内的网格，加上车辆、交通和行人，不含天空；无人机模式清空列表并把 `contact-shading` 管线从相机卸下。`diagnostics().contactShading` 报告挂接状态和 G-buffer 网格数。

### 立面浮雕（`src/city-facade-diversity.ts` `FACADE_RELIEF`、`tests/city-facade-relief.test.ts`）

全部是现有墙面绘制上的逐像素 ALU，不新增贴图、顶点属性、灯或通道。高度用 `(1-TEXCOORD_0.y)*24`；测试从 `public/city/buildings.glb` 读 UV 验证了 glTF V 翻转后的这一约定，原先按 `uv.y*24` 算高度是上下颠倒的。

- 接地：9 m 到底商顶之间墙面反射率降到 72%。
- 天空可见度：基于图像的漫反射与反射在基部降到 42%、28 m 恢复；只乘 `finalIrradiance` 与 `finalRadianceScaled`，不动直射与半球。白天地板改为 62%（uniform `cityFacadeSkyFloor`，按模式绑定），代表晴天路面与对面楼的反弹；黄昏和夜里没有这项反弹，维持 42%。
- 设备层：55% 的办公楼每 9–13 行有一层实心百叶带，反射率 78%，夜里不亮。
- 窗洞：玻璃后退 10 cm，用 glazing 高度场的屏幕导数做表面梯度法线，窑框和窗洞在低角度阳光下有明暗；每块已解析窗格随机偏转 ±0.45°，玻璃塔反射天空成马赛克而不是一整面镜子。远处像素足迹变大时效果自行淡出。
- 过梁下条带失去 42% 玻璃色与图像光。

### 山地（`src/city-mountains.ts`、`src/city-grass-material.ts`）

`applyGrassMaterial` 之前直接覆写 `surfaceAlbedo`，山体顶点色从未生效；现在在 `VERTEXCOLOR` 下乘 `vColor.rgb`。新增 `forest` 标志：林冠色 `[.66,.74,.58]` 与两种尺度的团簇噪声，只对山体开启，公园草地不受影响。

## 验证

- `npm test`：124 通过，其中新增 `tests/city-post-chain.test.ts`、`tests/city-facade-relief.test.ts`。`npm run build` 通过（`tsc --noEmit` + vite）。
- 截图脚本 `scripts/check-lookdev.mjs <label>`：九张固定机位（日落出生点、夜路、白天路、莲花山北望、腾讯白天/日落/夜景无人机、日落反日点天空、返回驾驶），输出到 `output/playwright/lookdev/<label>/`，附 `report.json` 性能。当前与基线各三轮：`final-current{,-2,-3}` 与 `final-baseline{,-2,-3}`。
- 具名视觉复核（当前 vs 基线，同机位）：日落出生点天空顶部保留蓝紫渐变而非整片橙；受光立面不再过曝；夜路地面归黑、窗光退到次要；白天右侧近景立面在 1.35 暗角下测得亮度 33.5（基线 62.5），改为 1.0/1.0 与白天天空地板 .62 后为 38.5，画面中央 183 不变；反日点天空为深靛蓝而不是黑；莲花山与远山有林冠团簇而不是单色绿。

### 性能（同一台机器，三轮交替，负载 17–27）

| 机位 | 当前平均 FPS（三轮） | 基线平均 FPS（三轮） | 当前 p95 ms | 基线 p95 ms |
| --- | --- | --- | --- | --- |
| driving-sunset | 54.1（51.4/51.6/59.2） | 53.1（57.3/47.0/55.0） | 26.5 | 25.6 |
| driving-night | 51.0（48.7/47.1/57.2） | 57.7（57.3/55.7/60.0） | 31.7 | 22.4 |
| drone-day-lianhua | 40.3（37.8/39.5/43.7） | 43.1（40.5/41.2/47.5） | 34.6 | 33.4 |
| drone-sunset-tencent | 46.8（45.5/45.7/49.3） | 42.6（46.1/46.7/35.2） | 30.4 | 35.7 |

- 测试期间系统负载平均 17–27（外部进程），单轮之间同一构建的差异高达 11 FPS，以上只能作为方向：日落街道与日落无人机持平；夜间街道约 -12%；白天无人机约 -6%。
- `report.json` 的 `gpuMs` 来自 `EXT_disjoint_timer_query`，在共享 GPU 下包含其他进程的占用（59 FPS 的一轮报 33.8 ms），本轮不用它下结论。
- 半分辩率 G-buffer 后，街道 G-buffer 网格数约 180；无人机模式为 0。
- 加载的静态开销未变：没有新增贴图、网格或每帧 CPU 工作，`updateMs` 约 1.1 ms。

## 降级开关

全部在运行时可关，都在 `window.__SHENCHENGJI_CITY__.finish()`（调试）或对应常量：

- `CINEMATIC_FINISH.msaa 4→2`：最省的一档，边缘质量略降。
- `STREET_AO`：把 `contact-shading` 卸下相机即关 SSAO；街道夜景最受益。
- `FACADE_RELIEF.recess=0` 与 `paneTilt=0` 关掉窗洞法线和窗格偏转；高度场那次 `textureGrad` 采样在 `CITY_FACADE_GRADIENT` 分支内，要省掉它需去掉该分支。
- 颗粒与色散各占一个 1080p 全屏通道，暗角在图像处理内不单独占通道；关掉对观感影响最小的是色散。

## 边界

- 未改任何模型、贴图或城市数据；`public/city/*` 与 Blender 流程不受影响。
- 夜间街道的性能差异在负载正常的机器上应重新测一次再定是否降档；本文档不把负载 27 下的一轮当成结论。
- 立面浮雕只作用于走 `CityFacadeDiversityPlugin` 的普通墙面；`landmark-detail.glb` 的重点地标沿用各自材质。
- 临时脚本（`/tmp/lookdev-tune.mjs`、`/tmp/finish-cost.mjs` 等）不在仓库内；仓库只保留 `scripts/check-lookdev.mjs`。
