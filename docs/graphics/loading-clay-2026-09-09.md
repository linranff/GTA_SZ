# 春笋冷暖光影循环加载页 · 2026-09-09

用当前游戏的春笋大厦、周边建筑和水面生成低饱和冷暖色建筑环绕影片，替换较模糊的旧夜间航拍。白模仅用于加载视频，不改变可玩城市的材质和光照。

## 镜头与循环

- 中心为游戏坐标 (-5146, 0, -1216.62)，相机半径 365、高度 195，24 秒匀速环绕 360°，30 fps。偏移构图为左侧文字留出空间。
- 建筑使用暖米色、蓝灰玻璃、灰绿地景和青蓝水面，暖色斜光与冷色环境补光；原有水面保留淡色反射。全场景冻结，不放入车辆、人物、字幕或 HUD。
- 相机轨迹及朝向首尾闭合；取样区间 [0,24)，不重复终止帧，不使用交叉淡化。0 秒与 24 秒原始 PNG 的哈希完全一致。
- 编码后 320×180 灰度帧平均绝对差：首相邻帧 1.645，末相邻帧 1.630，循环接点 1.732（0–255）。衔接处与正常运动步长接近。

## 交付与加载

`public/city/loading/bamboo-clay-loop.mp4`：1920×1080、30 fps、24 秒、720 帧，H.264 / yuv420p，静音、faststart，6,773,529 bytes。首帧海报约 150 KB。帧率以加载视频的解码成本为准，不改变游戏 1080p60 目标。

`bamboo-clay-source.json` 记录镜头、素材哈希、编码参数和接缝检查。旧夜景已移出 public，备份在 `output/playwright/loading-clay/prior/`。

加载页改为浅色遮罩和深色字，保留真实加载进度、重试、减少动态效果、节省流量和隐藏页暂停。视频在进入游戏后释放，不需要实时渲染第二个城市。

## 验证与复现

- `python3 scripts/check-loading-clay.py`：编码尺寸、帧数、帧率、单视频流及循环接点通过；检查时 FFmpeg 解码整段视频。
- `LOADING_REVIEW_OUT=output/playwright/loading-clay/ui node scripts/inspect-loading-media.mjs`：19 项通过，包括实际 4173 游戏加载与视频释放。
- `npm run build` 通过，保留既有大包体提示。桌面、手机与夜景替换后的海报回退均已视觉检查。
- 离线录制：`node scripts/record-loading-clay.mjs`；场景为 `scripts/loading-clay-scene.ts`。录制用独立浏览器，不控制用户正在玩的标签页。
- H.264 原始片段经 FFmpeg libx264、preset slow、CRF 23、maxrate 2200k、bufsize 4400k、30 fps、GOP 60、faststart 压缩。

预览：`output/playwright/loading-clay/review.html`。检查截图与报告：`output/playwright/loading-clay/ui/`。

## 同日第二轮：色彩与建筑透视修复

上一版换材质时仅关闭 `useVertexColors`，73 个原建筑网格的 `hasVertexAlpha` 标记仍然存在。Babylon 默认材质仍会据此将网格判定为透明，导致部分表面排序和遮挡异常。仅在离线影片场景中关闭顶点透明标记，明确 PBR opaque、alpha=1、深度写入，以及统一绘制组；原游戏材质不受影响。

四个环绕角度各选三处可见建筑表面，在后方设置测试平面并交替渲染洋红/绿色。12 处前景像素差全部为 0，建筑成功遮住后方测试物。完整结果在 source manifest 的 `capture.info.occlusionChecks`，不透明状态检查在 `opacityAudit`。

降低加载页白色遮罩强度；媒体 URL 添加 `?v=2`，使已打开页面刷新时获取修订版。
