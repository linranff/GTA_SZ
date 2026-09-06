# 水面抗摩尔纹与俯瞰光柱 · 2026-09-06

本次在 v0.2 最新工作区继续修改；没有改动城市建筑、天空资产、立面细节或全局画质。

## 使用

按 G 进入无人机，或在城市地图选择“俯瞰此处”。左键或单指在地点上停留约 650ms，出现青绿光柱与落点环。短按、拖动、Shift 平移和右键环绕沿用原功能；V 看车不启用选点。

浮层支持命名、收藏和“移动到此地”。右上“收藏地点”可重访或移除，最多 24 个，保存在当前浏览器的 localStorage，刷新后仍可使用。Esc 先关闭光柱/收藏列表，再次按下才退出无人机。移动会把主角车停在所选地点 300m 内经过车身占位检查的道路；水面可收藏，不能落车。收藏坐标和实际落车点分开保存；移动时重新验证当前道路与障碍。跳转不增加行驶里程，沿用既有任务跳转校验。

## 水面处理

四组固定世界坐标正弦波缺少屏幕采样过滤，原有距离衰减最远仍保留 55% 振幅。高空/掠射角下，细波纹小于像素，产生条纹和闪烁；规则直线波峰又形成大面积重复交叉条带。

现在对每组未包裹的波相位计算屏幕导数，在 0.35–1.80 rad/pixel 渐隐；被过滤波纹的斜率方差转成粗糙度。两层低频相位弯曲与风区调幅打散规则波峰，80–1100m 逐渐减弱远海波纹。现有镜面改三线性 mip 过滤，并为 Babylon 的显式反射 LOD 加上投影后像素采样范围的下限。

继续使用原 512×512 镜面与刷新策略，没有新增反射纹理、RTT 或全局抗锯齿通道。光柱使用 3 个不投影、不反射、不可拾取网格，共 152 三角形；无需新灯光或纹理。射线选点只在长按完成时执行。

## 验证

- 全量 `npm test`：106/106 通过。随后追加鼠标多键边界修复，并对水面、手势/存储、落车选择重新运行 17 项定向测试，全部通过。
- 最终 `npm run build` 通过；仅现有包体大小提示。水面测试实际经过 Babylon PBR 插件预处理，浏览器另行验证 GPU 编译。
- `scripts/check-observer-beacons.mjs`：18 条实际浏览器操作检查通过，包括输入名称不触发游戏键、收藏按钮聚焦时切换光照、跨刷新收藏、复访、移动归零车速且不增加里程、水面禁用移动、天空无落点、鼠标多键、单触摸/拖动/多触摸取消。
- `scripts/check-water-aliasing.mjs`：同机位修改前后白天、夜间、低角度及高空截图，最终浏览器错误 0。

Codex / root 直接复核 `water-final/day-bay.png`、`day-grazing.png`、`day-high.png`、`night-bay.png`：远海交叉栅格明显消退，海面以天空倒影为主，夜间高光保留柔和起伏。复核 `interaction-final/night-beacon.png` 与 `saved-beacon-after-refresh.png`：光柱昼夜可辨、落点正确，浮层与现有帮助文字互不遮挡。

1920×1080、Chrome Metal，每组约 4.5 秒短样本；下表只代表这些机位，不是整城持续帧率保证。

| 最终水面机位 | 平均 FPS | p95 帧时 | >50ms 帧 |
| --- | ---: | ---: | ---: |
| day-bay | 56.81 | 21.4 ms | 0 |
| day-grazing | 59.71 | 18.0 ms | 0 |
| day-high | 59.72 | 18.9 ms | 0 |
| night-high | 59.57 | 19.1 ms | 0 |
| night-bay | 59.17 | 20.7 ms | 0 |
| night-turn | 56.04 | 32.6 ms | 0 |


光柱同机位开关复测（每组 5.5 秒）为：closed-before 60.01 FPS / p95 16.8ms；beam-visible 60.01 FPS / p95 16.9ms；closed-after 59.72 FPS / p95 18.7ms。这一组未见明显帧率下降，原始记录在 `beacon-performance.json`。另一次完整交互流程的夜间/白天光柱机位分别为 52.43 / 49.67 FPS，说明实际机位和运行负载仍会影响帧率，不能由单次开关测试推广到整城。

原始记录与当前源码 SHA256 在 `output/playwright/water-beacons/evidence.json`。水面前后对照分别位于 `water-before/` 与 `water-final/`；完整交互证据位于 `interaction-final/`。

复现：

```sh
npm run build
npm run preview -- --port 5173 --strictPort
node scripts/check-water-aliasing.mjs http://127.0.0.1:5173/ output/playwright/water-beacons/water-final
node scripts/check-observer-beacons.mjs http://127.0.0.1:5173/ output/playwright/water-beacons/interaction-final
```
