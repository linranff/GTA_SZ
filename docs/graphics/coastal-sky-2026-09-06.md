# 远山接海与清蓝天空

用户图中的悬空山片来自两个实际缺口：`opposite_shore_terrain` 只有 DSM 顶面，1812 条开放边没有侧面；其 X 范围约 [-9500,9470]，超过原海面的 [-6788.1,6788.1]。天空从没有海面遮盖的山脚下方露出。

`city-coastal-horizon.ts` 在实际 GLB 世界坐标下提取开放边，以 1 mm 容差焊接位置来排除顶点拆分造成的假边，共增加一个网格、3624 个三角形，下沿为 -1.25 m（海面为 -0.25 m）。原始顶面和 DSM 高度不变；裙边与山体共用材质，并一起参与场景雾。裙边仅进入已有反射列表，不加入阴影投射列表。原 DSM、基础城市和地标资产未重新导出。

`city-bay-water.ts` 在原海面世界包围框外补四个无重叠矩形，组成覆盖到 X/Z ±50 km 的海面环。只增加一个网格、8 个三角形，与原海面同高、共用波纹材质和既有反射纹理；没有新增贴图、反射纹理或逐帧渲染通道。岸距贴图范围外按深水处理，避免夹取边缘浅水颜色。新增海面也排除车灯照射，并且不进入自己的反射列表。

白天使用 [Poly Haven / Rustig Koppie (Pure Sky)](https://polyhaven.com/a/rustig_koppie_puresky) 的 CC0 4K HDR，取代密集积云源。源图像素未编辑；官方文件清单的字节数和 MD5 校验通过，SHA-256 记录于 `data/materials/daylight-environment.json`。蓝天占大部分上半球，白云稀疏，有柔软纹理和低空层次。可见天空和 PBR 反射仍共用 1024 px HDR 立方体；海面镜像也看到同一天空。太阳方向重新从新 HDR 最亮太阳像素采样，再应用既有旋转的逆变换。新资产约 15.3 MB，小于旧素材约 20.7 MB。

验证入口 `node scripts/check-coastal-sky.mjs`，通过普通地图/无人机控制复现，截图和性能采样时均隐藏 UI。最终 `npm test` 84 项通过，`npm run build` 通过，浏览器错误 0；所有水面世界高度均保持 -0.25 m。

| 1920×1080 Chrome Metal，10 秒短时采样 | 修改前 FPS / P95 | 修改后 FPS / P95 |
| --- | ---: | ---: |
| 春笋高空朝南海岸 | 60.0 / 17.9 ms | 60.0 / 17.4 ms |
| 深圳湾白天海岸 | 60.0 / 18.0 ms | 60.0 / 17.4 ms |

两处最终采样均无超过 50 ms 的帧。计数器在不同反射刷新帧上的 draw/triangle 数会变化，不据此推导精确开销百分比；以上是当前机器的短时结果，不是长时间驾驶或其他硬件的性能保证。

具名视觉复核：`after/sunset-mountain-west.png` 与用户截图相同方向的悬空区域已被连续海面和山脚填齐；`sunset-mountain-south.png` 验证另一朝向。`day-sea-open.png` 可见连贯远岸与蓝色反射；`day-sky-south.png`、`day-sky-east.png`、`day-sky-north.png` 显示以清蓝为主的天空、薄云纹理和低空小云；`night-after-cycle.png` 验证银河和夜景切换。原始记录与源码/资产/构建哈希见 `output/playwright/coastal-sky/review.json`。
