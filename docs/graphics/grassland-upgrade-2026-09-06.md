# 草坪与公园缓坡升级

本轮采用真实缓坡、连续草地材质、近景草叶三层组合。目标是在当前 MacBook Pro M1 Max（24 核 GPU、64 GB 内存）上保持 1920×1080、60 fps；最终性能以同一构建的实际 Chrome/Metal 报告为准。

## 已实现

- 全城合适的草地内布置 419 组缓坡，其中公园 250 组、普通绿地 169 组。54,973 个三角面分成 46 块；起伏只覆盖足够宽的安全地块，投影面积按游戏坐标计约 0.596 km²（按 0.60 比例折算约 1.66 km²），其余草地保留平面并使用新材质。
- 普通草坪的设计高度为实景尺度 0.15–0.6 m；较大公园为 0.5–2 m，少数完整地块增加 2–4 m 的丘顶。最高实际新增 3.52 m，最大坡度约 13°。浅谷是丘体之间的相对低处，不向基础地面下挖。
- 草色、裸土、少量枯叶由三套 CC0 材质混合，使用真实纹理、法线和粗糙度；世界坐标映射跨越原地面和缓坡接缝。宏观颜色变化已经收敛，避免俯瞰时出现过重的黄褐色斑块。
- 近处为弯曲的真实草叶，有根部明暗和轻微风动。每簇 7 片、35 个三角面；最多 2304 簇、80,640 个三角面。按 7/14/21/28 个游戏单位渐隐，镜头高于地面 16 单位时关闭。
- 草簇分散在离线证明安全的半径 2.9 单位圆内；127 万个安全圆按 128 单位分块加载。仅附近分块进入内存，缓存上限 12 块。草叶不新增纹理、灯光、阴影贴图或反射渲染通道，接收现有环境光与阴影。
- 草坪网格与车辆/植被高度采样共用同一组实际三角形。原莲花山 DSM、道路、建筑基底、水域、滨海步道和已定义的硬质广场保留。

这些公园缓坡属于景观美术改编，不应描述为公园实测高程。

## 素材与构建

材质来源是 [ambientCG Grass001](https://ambientcg.com/view?id=Grass001)、[Poly Haven Sparse Grass](https://polyhaven.com/a/sparse_grass)、[Poly Haven Leafy Grass](https://polyhaven.com/a/leafy_grass)。三套均为 CC0，作者、原始地址和逐文件 SHA-256 位于 `public/city/grassland-v2/materials.json`。

六张新 PBR 纹理共 4.48 MB；保守按 RGBA 展开并计入 mipmap 为 16.78 MB。宏观图另计 11.18 MB，包含 mipmap；草叶不使用透明贴片。

可复现入口：

```sh
.venv/bin/python scripts/prepare_city_ground_relief.py
.venv/bin/python scripts/check_city_grassland_candidate.py
.venv/bin/python scripts/prepare_grassland_materials.py
.venv/bin/python scripts/install_grassland_candidate.py
node --experimental-transform-types scripts/check_city_ground_relief.mjs artifacts/city/grassland-v2-candidate
npm test
npm run build
```

材质准备脚本需要已校验的原始下载文件，位置为 `artifacts/grassland-v2/sources/`。安装器只发布独立审计通过且源数据 SHA 未变化的候选，并清理上一个候选遗留的草叶 mask。

## 验证

离线安全审计通过：完整三角形与受保护区域相交 0、越出陆地 0、DSM 改动 0、网格缝隙高度异常 0；127 万个安全圆违规 0，3162 个采样分块哈希与数量一致。

运行时高度契约通过：54,973 个三角形采样误差小于 0.002；108,516 个道路样点、181,233 个建筑边界样点、761 个岸线样点以及 10,836 个原 DSM 样点全部通过。`npm test` 共 58 项通过，`npm run build` 通过。

实际 Chrome/Metal 验收已完成：深圳湾、香蜜公园、人才公园的低视角、俯视图和夜间草坪通过具名视觉复核。香蜜第一次测试镜头取样偏移，已修正并单独补拍，原报告明确标记被替代。

同一构建的升级前/后对照，各取六段约 20 秒定点样本：

| 位置 | 升级前平均 fps | 升级后平均 fps | 升级后 P95 / P99 |
| --- | ---: | ---: | ---: |
| 开场驾驶镜头 | 60.00 | 60.00 | 16.8 / 16.8 ms |
| 深圳湾缓坡 | 60.00 | 60.00 | 16.7 / 16.8 ms |
| 深圳湾近景草叶 | 60.00 | 60.00 | 16.8 / 16.8 ms |
| 香蜜公园缓坡 | 60.00 | 60.00 | 16.8 / 16.8 ms |
| 人才公园缓坡 | 60.00 | 60.00 | 16.7 / 16.8 ms |
| 人才公园夜间 | 60.00 | 60.00 | 16.7 / 16.8 ms |

这三次最终测试没有脚本、HTTP 或 WebGL 错误；镜头抬高后草叶实例为 0，近处最高 2304 簇、2 次额外绘制。首次迭代曾出现两条启动期 MRT 警告，保留原报告，最终三次测试未复现，没有过滤错误。

完整数据与主包 SHA 位于 `artifacts/grassland-v2/acceptance.json`。截图在 `output/playwright/grassland-v2/enhanced/` 和 `enhanced-xiangmi/`，对照图在 `baseline/`。实际主包为 `index-BooVVmu1.js`，SHA-256 为 `233ea5648a62116137a4830dabc697a156e606c4aa7ef39b0cf9a8eedc882da8`。

最终整合版本又完成了夜间连续驾驶：出生点 → 腾讯滨海大厦 → 深圳湾公园，两次自动到达，共记录 440.07 秒、约 6.17 游戏公里。平均 59.96 fps，P95 为 16.7 ms、P99 为 16.8 ms，26,387 帧中只有 1 帧超过 50 ms。脚本、资源加载和 WebGL 错误均为 0。

抵达后六张草坪纹理全部就绪；草叶缓存 12 块，待加载/失败分块为 0，高度采样拒绝为 0。此时附近草叶 189 簇、1 次绘制，最后一次分布更新耗时 0.1 ms。这里只描述末尾状态，不把它当作整段路程的峰值。

完整驾驶报告为 `output/playwright/coastal-final-drive/report.json`；最终主包 `index-DLruOMuD.js` 的 SHA-256 为 `f1067452c9911da0bc82ad6f7c34810824242d19f51ffebd974739fc461c533d`。整合时车辆负责人为车窗材质增加了窄范围的着色器热切换防护，保留透明度与深度预通道；修正后无诊断日夜复测和上述长驾均无错误。草坪源码和资产与 A/B 测试保持一致。

结论：本次测试的三处草坪及完整驾驶路线达到接近 60 fps 的目标，仍不等于所有路线和任意系统负载下每帧都锁定 60 fps。
