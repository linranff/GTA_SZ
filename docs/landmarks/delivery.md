# 第一批重点场所的实景校准

本轮已经把“公开资料 → 来源档案 → 参数模型 → 增量接入 → 实机检查”跑通。
照片用于观察和校核；地图约束位置与平面轮廓，工程资料补足塔高，公开高程补足山体。
模型保留可重复执行的 Python 源码，并把已知尺寸、来源陈述和估计分开记录。

## 已接入的对象

| 对象 | 主要改进 | 当前精度边界 |
| --- | --- | --- |
| 莲花山 | 从小型18层圆台，改为OSM公园边界内的Copernicus地形；98条园路贴地 | 30m DSM，15m插值网格；树下裸地、台阶、雕塑和平台尚未细模 |
| 腾讯滨海大厦 | 修正公交站定位；按两座真实足印、不同转角、248/194m来源塔高重做三组连桥及幕墙 | 主体尺度有来源；连桥外壳尺寸、分格、裙房和屋顶含照片估计 |
| 七街公馆 / 哈尔滨大厦 | 恢复H形全高楼体、竖向分段和窗格；新增可导航目的地 | 102m为楼层推算的估计，屋顶机房和入口仍简化 |
| 财富广场 | 恢复A/B楼关系、A座弧面、水平银白带和开放屋顶格栅 | A92/B84m为估计；弧面为有来源轮廓约束的照片解释，入口尚未配准 |
| 万象天地 | 恢复华润置地B/C/D三栋各三段高低不同的塔楼结构 | 高度来自未独立复核的OSM标签；商场、街区、店招和装置未精修 |

科技园作为片区保留独立待办，需要继续选定道路与楼群。首轮腾讯及万象天地塔楼不能代表科技园全部完成。

## 可核对产物

- 运行时增量：`public/city/landmark-detail.glb`、`landmark-detail.json`、`terrain-detail.json`。
- 可编辑Blender项目：`artifacts/city/landmark-details.blend`；逐对象源码：`scripts/landmarks/`。
- 图形尺度检查：`artifacts/city/lianhua-relief-audit.png`。
- 最终来源和坐标检查：`artifacts/city/landmark-detail-validation.json`。
- 解码GLB后的真实网格统计：`artifacts/city/landmark-detail-geometry.json`。
- 1920×1080实机截图与交互结果：`output/playwright/landmark-details/`。
- 逐处形体复核、参考来源、画面哈希和剩余问题：`artifacts/city/landmark-visual-review.json`。

最终增量包为 **1,375,748 bytes / 103,564三角形 / 27网格**，SHA256为
`04643a8c21dc74c30c2e80745b76e8ab69830d75d70b9db54c2d2d54aa548d00`。
五处在固定生产快照中完成导航、快速到达、短距离驾驶、环绕和退出，浏览器报告无脚本错误；共保存15张截图。
数据和解码几何校验通过，当前13项单元/集成测试通过，TypeScript与生产构建通过。
开发服务器热重载曾打断一次检查，最终通过记录来自独立静态快照。

五份任务保持 `modelled`。尺寸、方向、约定主体轮廓、场景接入、浏览器与来源已记录具名复核；
完整实机接近/绕行及持续GPU性能仍为pending，不把短驾驶检查当作完整验收。
万象塔楼与部分新玻璃立面在夕景偏暗；七街屋顶机房、入口和完整周边仍待下一轮。

GLB清单记录源文件和资产SHA256，源文件变更会使检查失败，不能沿用旧通过状态。
基础楼体与近景立面构建器按 `baseBuildingIds` 排除重复对象，保留其他普通建筑的新颜色与细节。
`public/city/building-exclusions.json` 绑定这些排除ID及基础资产哈希，避免日后重建时把旧楼体重新盖回来。
增量包只含五组重点对象；普通楼块由基础城市构建器维护。

## 后续如何分派

[Skill](../../skills/landmark-reconstruction/SKILL.md) 与 [任务契约](agent-workflow.md) 是固定入口。
`scripts/landmark_tasks.py generate` 已生成六个对象的独立JSON和提示词包。
本轮由当前Codex会话的三个子Agent分别承担腾讯、其他重点对象和流程整理；主Agent完成地形、集成与验收。

任务包能交给Cursor Composer、Grok Bot、ChatGPT或Codex；执行者必须遵守相同的文件所有权和验收格式。
目前已确认本机应用存在，尚未接通这些外部应用的自动调度接口。任务工具本身是可执行的派工包和状态检查器。

下一批可以直接复制 `artifacts/landmark-jobs/<id>/prompt.md` 给执行者。证据未齐时先做资料任务；
资料齐备后再并行做独立模型。完整片区的缺口写在 `pendingSubscopes`，不能因完成局部塔楼就清空。

## 复现

```sh
.venv/bin/python scripts/prepare_landmark_terrain.py --offline
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_landmark_details.py
node scripts/optimize_landmark_details.mjs
node scripts/inspect_landmark_details.mjs
.venv/bin/python scripts/validate_landmark_details.py
npm test
npm run build
```

启动 `npm run dev` 后，运行 `node scripts/check_landmark_details.mjs` 生成实机检查。
首次没有地形缓存时去掉 `--offline`，脚本下载公开瓦片并建立来源清单。
Python环境新增栅格库已固定在 `requirements.lock.txt`。
如果重点对象的 `baseBuildingIds` 发生变化，主集成人员还须运行基础楼体/近景立面的构建与压缩流程，
生成匹配的 `building-exclusions.json` 后再执行验证。普通楼体输出未更新时，检查会失败。

GPU性能必须独立测量；短时间的到达/环绕检查不等于持续60fps验收。
任务包中的 `verified` 只表示约定范围经过具名检查，不代表测绘级复原或全部照片细节完成。
