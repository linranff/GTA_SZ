# 角色接入与部署：久岐忍 / 夜兰

本机开发入口：`http://127.0.0.1:5173/`。在项目目录运行 `npm run dev -- --port 5173 --strictPort`，刷新页面。

- 车辆停稳后按 F：久岐忍下车。WASD 行走，Shift 奔跑，鼠标拖动环视、滚轮缩放；C 切换第一 / 第三人称。
- 走到车辆门旁按 F 上车，T 在车内切换轿车 / 坦克。步行状态不响应坦克射击。
- 月白咖啡馆中的知夏、望舒使用夜兰外观，各自拥有独立骨架；晓岚的 JK 外观保留。店员继续巡走、在附近招手，既有对话身份不变。
- 角色后台加载。失败时汽车仍可驾驶，底部出现重试按钮；咖啡馆加载失败时保留原店员。F 也可重试主角加载。

## 来源及使用范围

[原配布页](https://www.bilibili.com/blackboard/activity-FEYTyCHYZo.html)

[久岐忍原包](https://activity.hdslb.com/blackboard/static/20220525/c84ef0977c17fb1198f6887261fea35f/sWn1QvNF82.zip) · [夜兰原包](https://activity.hdslb.com/blackboard/static/20220525/c84ef0977c17fb1198f6887261fea35f/PEhFH0is3N.zip)

署名：**模型提供 miHoYo，MMD 模型改造 观海**。

2026-09-10 读取了两个包各自的 `readme【一定要看】.txt`。说明允许有限修改，禁止商业用途、二次配布、拆取部件改造其他模型，以及列出的不当作品用途。免费配布不是开源授权，也不能由本次本地转换推导出公开游戏、Steam 或模型再发布授权。

项目目前为非商业游戏原型，与 miHoYo / HoYoverse 无隶属或官方合作关系。仓库中的代码许可不覆盖这些第三方模型；本项目没有取得或宣称获得超出原包说明的额外许可。署名、非商业用途和私有仓库均不改写原条款。

## 正常检出、运行和构建

运行时资产已纳入 `public/characters/`：两个 GLB 由 Git LFS 管理，清单和署名说明由普通 Git 管理。开发与生产均默认读取 `/characters/`，不再依赖本机忽略目录或开发专用中间件。

```sh
git lfs install
git lfs pull
npm ci
npm run dev -- --port 5173 --strictPort
```

正常生产构建即可带上角色：

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

`npm run build:characters` 保留为普通构建的兼容别名。Vite 会把 `public/characters/` 原样复制到 `dist/characters/`，不需要额外的本机模型目录或 Blender。CI 在安装依赖和构建前也必须拉取 Git LFS 文件；例如 GitHub Actions 的 `actions/checkout` 设置 `lfs: true`。

```text
public/characters/ → dist/characters/
  kuki.glb
  yelan.glb
  manifest.json
  CREDITS.txt
```

两个 GLB 合计约 24 MiB，已嵌入贴图、骨架和动画。`prebuild` 自动检查文件大小、SHA256、GLB 格式和步态参数；遇到缺失文件或仅有 LFS 指针时明确失败。部署使用整个 `dist/`。原始 ZIP、PMX 与可编辑 Blender 工程继续保留在忽略目录，运行与构建不需要它们。

可通过 `VITE_CHARACTER_ASSET_BASE` 覆盖运行时资源目录，默认不需要设置。如果使用跨域资源服务器，应配置 CORS；`VITE_*` 会进入客户端，不可填写私钥或长期访问令牌。当前仓库为私有，推送到仓库并不等于已发布到公共网站。

正式构建验证：预览启动在 `4174` 时执行 `node scripts/check-character-deployment.mjs`。该脚本检查静态构建实际加载、完整模型哈希、失败后仍可驾驶、重试后久岐忍下车，以及两个夜兰独立骨架。结果保存在 `output/playwright/character-deployment/`。

## 重新制作角色资产

正常检出无需重新转换。需要编辑模型时，可执行：

```sh
python3 scripts/fetch_local_mmd.py
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python scripts/prepare_local_mmd.py
```

原包在 `data/raw/local-mmd/`，转换输出和可编辑文件在 `local-only/characters/`。更新发布资产时只替换 `public/characters/` 中相应的 GLB 与清单字段，并保留来源和署名记录；SHA256、文件大小、步态参数必须与输出一致。运行 `node scripts/check-character-assets.mjs` 验证后再构建。

转换使用 Blender 5.2 和 [MMD Tools](https://github.com/MMD-Blender/blender_mmd_tools) 4.5.14，固定提交 `29d1478cf4385945b1c011d4c1e6adda7ad7cf70`。工具及其依赖只解压到项目忽略目录，不安装系统插件。原包、转换结果的 SHA256 记录在本地 manifest 中。

导入保留原网格、UV、蒙皮和表情形态。修复已核实的 `tex/уЉ.png` → `tex/髪.png` 文件名，不把缺失贴图随意映射为同一张。MMD 黑底头发高光层在 Babylon 中使用加法混合，避免遮住底色。

动画直接针对模型原骨架制作：D 骨链蒙皮映射到对应 FK 关节，腿部使用离线双骨 IK 和足底接触，保留原局部骨轴、绑定矩阵和膝盖方向；手臂在解算后自然下垂。行走和跑步共享步态相位，按实际移动速度调整周期，不使用外部 Mixamo 动作。角色尺寸统一为 1.72 游戏单位，是项目设定，不是官方身高。

## 修改入口与验证

- `scripts/prepare_local_mmd.py`：本地转换、原骨架适配、动作烘焙。
- `src/city-local-characters.ts`：可配置资源地址、载入进度、材质和资源生命周期。
- `src/city-rider.ts` / `src/city-cafe-characters.ts`：主角和两个咖啡馆外观替换。
- `src/city-walk.ts` / `src/city-world.ts`：角色与车辆状态、出口、移动、跟随镜头。
- `src/city-character-hud.ts`：加载与重试；`public/characters/`：已纳入版本管理的运行资源。
- `scripts/check-character-assets.mjs`：普通构建前自动校验角色文件与清单。

运行 `npm test`、`npm run build`、`node scripts/check-local-characters.mjs`、`node scripts/check-character-surfaces.mjs`。

首次角色接入验证：218 项单元检查通过；18 项角色实机检查和 4 项真实道路 / 桥面 / 台阶 / 墙边镜头检查通过。行走足底采样偏差约 -0.007～0.004 单位，跑步腾空阶段约 0.054 单位。这些结果来自当前本地资产，不代表全城所有极端坡面都逐点验收；最新部署结果见独立的 `character-deployment/report.json`。

浏览器检查会模拟下载失败，检查贴图、关节弯曲、实际蒙皮足底高度、坦克炮火、连续上下车资源计数、咖啡馆独立骨架及招手。检查报告及截图只保存在忽略目录 `output/playwright/local-characters/`。

## 已知限制

- 未接入 MMD 头发 / 衣服刚体物理；披风与发束跟随骨架。表情形态保留，但没有增加对话口型或完整表情控制。
- 移动沿项目现有高度采样器：道路、桥面、坡道与小台阶；没有运行时逐脚地形 IK，陡坡 / 复杂台阶仍可能出现局部接触误差。
- 本次检查的当前分支只有坦克 / 飞机弹道及爆炸效果，未找到建筑摧毁状态或瓦砾碰撞系统。因此保留并验证炮火和命中效果，不能宣称已验证“建筑破坏后的碰撞更新”。角色每步查询同一碰撞对象，没有另建静态建筑碰撞缓存；将来实现破坏时应更新该共享碰撞源。
