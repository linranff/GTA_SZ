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

原包在 `data/raw/local-mmd/`，转换后的 GLB、可编辑 Blender 文件及骨架记录在 `local-only/characters/`。两者均被 Git 忽略。**Git 是否跟踪资产，与部署包是否包含资产相互独立。** Vite 的开发中间件只向本机回环连接提供 `manifest.json`、`kuki.glb`、`yelan.glb`，拒绝提供原 PMX、ZIP 和 Blender 文件。

生产加载器也支持新角色，不再用 `import.meta.env.DEV` 禁止角色接入。下面的构建步骤在本机生成部署产物，不上传资源，也不代表已获得公开使用授权。公开使用与发布方式仍需核实。

## 带角色的完整构建

本机已准备过角色资源时，运行：

```sh
npm run build:characters
npm run preview -- --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173/`。生成的 `dist/` 是完整游戏构建，新增目录只含：

```text
dist/characters/
  kuki.glb
  yelan.glb
  manifest.json
  CREDITS.txt
```

这两个 GLB 合计约 24 MiB，已嵌入贴图、骨架和动画。原始 ZIP、PMX、Blender 工程不会进入部署包。部署时必须提供整个 `dist/`，不能只提供 Git 仓库里的文件；干净的 CI 工作区需先通过单独的资产存储提供 `local-only/characters/` 中的清单和两个 GLB。构建脚本先验证文件大小、SHA256、GLB 格式和步态参数，缺少资产时明确失败，不会悄悄产出没有新角色的版本。

`npm run build:characters` 将运行地址设为 `/characters`，适用于当前游戏的站点根目录部署。`dist/` 仍被 Git 忽略，这是构建产物的正常处理。**后续再运行普通 `npm run build` 会清理并覆盖 `dist/`**；普通构建没有配置角色资源地址时沿用原有模型，因此验收、部署新角色版本应使用 `build:characters`。

## 单独存放角色资源

若服务器或对象存储已提供上述运行文件，也可以构建一个不重复打包 GLB 的客户端：

```sh
VITE_CHARACTER_ASSET_BASE=https://你的资产域名/characters npm run build
```

也可在 `.env.production.local` 设置此变量，示例见 `.env.example`。该地址是**目录地址**，清单和两个 GLB 应处于同一目录；跨域服务器须允许游戏域名的 CORS 请求。推荐同源 `/characters` 路径，方便服务器统一控制访问。`VITE_*` 会进入客户端，不可填写私钥或长期访问令牌。

私人部署若要限制访问，应在服务器保护整个游戏及 `/characters/`，并校验会话；本地预览命令、忽略目录、难猜 URL 或 CORS 本身都不是访问控制。当前没有配置远程服务器，也没有上传这些角色。

正式构建验证：预览启动在 `4174` 时执行 `node scripts/check-character-deployment.mjs`。该脚本检查静态构建实际加载、完整模型哈希、失败后仍可驾驶、重试后久岐忍下车，以及两个夜兰独立骨架，不使用开发资源接口。结果保存在 `output/playwright/character-deployment/`。

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
- `src/city-local-characters.ts`：可配置资源地址、载入进度、材质和资源生命周期。
- `src/city-rider.ts` / `src/city-cafe-characters.ts`：主角和两个咖啡馆外观替换。
- `src/city-walk.ts` / `src/city-world.ts`：角色与车辆状态、出口、移动、跟随镜头。
- `src/city-character-hud.ts`：加载与重试；`vite.config.ts`：本地资源服务。
- `scripts/build_character_deployment.mjs`：校验运行资产并生成带角色的部署构建。

运行 `npm test`、`npm run build`、`node scripts/check-local-characters.mjs`、`node scripts/check-character-surfaces.mjs`。

首次角色接入验证：218 项单元检查通过；18 项角色实机检查和 4 项真实道路 / 桥面 / 台阶 / 墙边镜头检查通过。行走足底采样偏差约 -0.007～0.004 单位，跑步腾空阶段约 0.054 单位。这些结果来自当前本地资产，不代表全城所有极端坡面都逐点验收；最新部署结果见独立的 `character-deployment/report.json`。

浏览器检查会模拟下载失败，检查贴图、关节弯曲、实际蒙皮足底高度、坦克炮火、连续上下车资源计数、咖啡馆独立骨架及招手。检查报告及截图只保存在忽略目录 `output/playwright/local-characters/`。

## 已知限制

- 未接入 MMD 头发 / 衣服刚体物理；披风与发束跟随骨架。表情形态保留，但没有增加对话口型或完整表情控制。
- 移动沿项目现有高度采样器：道路、桥面、坡道与小台阶；没有运行时逐脚地形 IK，陡坡 / 复杂台阶仍可能出现局部接触误差。
- 本次检查的当前分支只有坦克 / 飞机弹道及爆炸效果，未找到建筑摧毁状态或瓦砾碰撞系统。因此保留并验证炮火和命中效果，不能宣称已验证“建筑破坏后的碰撞更新”。角色每步查询同一碰撞对象，没有另建静态建筑碰撞缓存；将来实现破坏时应更新该共享碰撞源。
