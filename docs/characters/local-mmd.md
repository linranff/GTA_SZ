# 本地角色验证：久岐忍 / 夜兰

本机开发入口：`http://127.0.0.1:5173/`。在项目目录运行 `npm run dev -- --port 5173 --strictPort`，刷新页面。

- 车辆停稳后按 F：久岐忍下车。WASD 行走，Shift 奔跑，鼠标拖动环视、滚轮缩放；C 切换第一 / 第三人称。
- 走到车辆门旁按 F 上车，T 在车内切换轿车 / 坦克。步行状态不响应坦克射击。
- 月白咖啡馆中的知夏、望舒使用夜兰外观，各自拥有独立骨架；晓岚的 JK 外观保留。店员继续巡走、在附近招手，既有对话身份不变。
- 角色后台加载。失败时汽车仍可驾驶，底部出现重试按钮；咖啡馆加载失败时保留原店员。F 也可重试主角加载。

## 来源及本地边界

[原配布页](https://www.bilibili.com/blackboard/activity-FEYTyCHYZo.html)

[久岐忍原包](https://activity.hdslb.com/blackboard/static/20220525/c84ef0977c17fb1198f6887261fea35f/sWn1QvNF82.zip) · [夜兰原包](https://activity.hdslb.com/blackboard/static/20220525/c84ef0977c17fb1198f6887261fea35f/PEhFH0is3N.zip)

署名：**模型提供 miHoYo，MMD 模型改造 观海**。

2026-09-10 读取了两个包各自的 `readme【一定要看】.txt`。说明允许有限修改，禁止商业用途、二次配布、拆取部件改造其他模型，以及列出的不当作品用途。免费配布不是开源授权，也不能由本次本地转换推导出公开游戏、Steam 或模型再发布授权。

原包在 `data/raw/local-mmd/`，转换后的 GLB、可编辑 Blender 文件及骨架记录在 `local-only/characters/`。两者均被 Git 忽略；资源不在 `public/`，也不经源码 import。Vite 的开发中间件只向本机回环连接提供 `manifest.json`、`kuki.glb`、`yelan.glb`，拒绝提供原 PMX、ZIP 和 Blender 文件。

`npm run build` 不包含这些角色资源；发布构建沿用原有主角和咖啡馆模型。公开使用与发布方式需要另行核实授权，本次没有取得或宣称获得这种授权。

## 本地准备

本机已经生成资产，不需重新执行。干净检出不携带模型，需从作者原地址下载：

```sh
python3 scripts/fetch_local_mmd.py
# 阅读命令打印的原包使用说明后，仅作本地非商业验证：
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python scripts/prepare_local_mmd.py
npm run dev -- --port 5173 --strictPort
```

转换使用 Blender 5.2 和 [MMD Tools](https://github.com/MMD-Blender/blender_mmd_tools) 4.5.14，固定提交 `29d1478cf4385945b1c011d4c1e6adda7ad7cf70`。工具及其依赖只解压到项目忽略目录，不安装系统插件。原包、转换结果的 SHA256 记录在本地 manifest 中。

导入保留原网格、UV、蒙皮和表情形态。修复已核实的 `tex/уЉ.png` → `tex/髪.png` 文件名，不把缺失贴图随意映射为同一张。MMD 黑底头发高光层在 Babylon 中使用加法混合，避免遮住底色。

动画直接针对模型原骨架制作：D 骨链蒙皮映射到对应 FK 关节，腿部使用离线双骨 IK 和足底接触，保留原局部骨轴、绑定矩阵和膝盖方向；手臂在解算后自然下垂。行走和跑步共享步态相位，按实际移动速度调整周期，不使用外部 Mixamo 动作。角色尺寸统一为 1.72 游戏单位，是项目设定，不是官方身高。

## 修改入口与验证

- `scripts/prepare_local_mmd.py`：本地转换、原骨架适配、动作烘焙。
- `src/city-local-characters.ts`：资源范围、载入进度、材质和资源生命周期。
- `src/city-rider.ts` / `src/city-cafe-characters.ts`：主角和两个咖啡馆外观替换。
- `src/city-walk.ts` / `src/city-world.ts`：角色与车辆状态、出口、移动、跟随镜头。
- `src/city-character-hud.ts`：加载与重试；`vite.config.ts`：本地资源服务。

运行 `npm test`、`npm run build`、`node scripts/check-local-characters.mjs`、`node scripts/check-character-surfaces.mjs`。

本轮结果：218 项单元检查通过；构建通过且未包含受限角色资源；18 项角色实机检查和 4 项真实道路 / 桥面 / 台阶 / 墙边镜头检查通过。行走足底采样偏差约 -0.007～0.004 单位，跑步腾空阶段约 0.054 单位。这些结果来自当前本地资产，不代表全城所有极端坡面都逐点验收。

浏览器检查会模拟下载失败，检查贴图、关节弯曲、实际蒙皮足底高度、坦克炮火、连续上下车资源计数、咖啡馆独立骨架及招手。检查报告及截图只保存在忽略目录 `output/playwright/local-characters/`。

## 已知限制

- 未接入 MMD 头发 / 衣服刚体物理；披风与发束跟随骨架。表情形态保留，但没有增加对话口型或完整表情控制。
- 移动沿项目现有高度采样器：道路、桥面、坡道与小台阶；没有运行时逐脚地形 IK，陡坡 / 复杂台阶仍可能出现局部接触误差。
- 本次检查的当前分支只有坦克 / 飞机弹道及爆炸效果，未找到建筑摧毁状态或瓦砾碰撞系统。因此保留并验证炮火和命中效果，不能宣称已验证“建筑破坏后的碰撞更新”。角色每步查询同一碰撞对象，没有另建静态建筑碰撞缓存；将来实现破坏时应更新该共享碰撞源。
