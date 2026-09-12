# 深城纪：开源与首发传播方案

2026-09-10。本文是发布建议与待审阅文案，没有修改仓库可见性、授予新许可证或向任何平台发帖。所有写着“代码已开源”的文案，须在许可证、资产范围和公开仓库实际就绪后使用。

## 建议采用的路线

先使用个人账号 `linranff`，不为首发建立 Org。对外名称使用“深城纪 / Shenzhen Open Roads”，用“深圳版 GTA”解释灵感，不把 GTA 6 当作正式产品名。先把深圳湾的一段驾驶体验与一份日常工作展示清楚，再讲 AI 协作过程。

GitHub Organization 适合团队、权限分工与多项目管理；不是开源的必要条件。等出现共同维护者或需要独立项目品牌时再迁移。[GitHub：Organizations](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations)

核心介绍：**一款可以在浏览器中驾驶、步行和飞行的深圳城市探索原型。**

情绪表达：**下班了，去游戏里的深圳湾兜一圈。**

技术介绍：Babylon.js + TypeScript + Blender，使用开放地图数据、程序化建模、第三方资产和 AI 辅助开发。不要写成 UE5、Three.js、全城一比一重建、全部资产原创、全流程无人参与或全设备稳定 60fps。

## 当前检查结果与公开步骤

本轮只读检查：

- `linranff/GTA_SZ` 为私有仓库，GitHub 未识别到项目顶层许可证；Issues 已启用。
- 仓库首页指向 `https://gtasz.vercel.app`。已核实网页返回 HTTP 200、包含当前游戏构建入口，角色清单与久岐忍 GLB 也可公开请求。本轮没有重新验收整座线上城市或跨网络加载表现。
- 久岐忍和夜兰运行资产已进入 Git/LFS 历史，源码公开会同时涉及历史里的模型。
- 已有中、英、日 README；“最新”内容仍写 117 项测试和早期截图，应在首发前更新成与发布版本对应的内容。
- OSM、车辆、部分天空和植物已有来源文件；这不等于所有资产都完成了再分发核查。

建议顺序：

1. **确定公开版的资产范围。** 两个 MMD 原包明确写有禁止二次配布与商业用途。README 署名不会改变这些条款，私有仓库也不会自动带来再分发许可。建议公开演示默认使用来源和再分发许可明确的角色；不能自动认定此前 Tripo 输入或其他用户提供资产已满足条件。网站和仓库应同步处理。
2. **为有权授权的项目代码选择许可证。** 如果目标是降低使用和参与门槛，建议 MIT，明确其仅覆盖本项目有权授权的代码。第三方模型、HDR、纹理和地理数据继续适用各自条款。MIT 允许商业使用；“我现在不收费”与“别人能否商用代码”是不同决策。如果禁止他人商用，就不应称作符合 OSI 定义的开源。[GitHub 许可证说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)、[MIT](https://choosealicense.com/licenses/mit/)、[OSI 定义](https://opensource.org/osd)
3. **准备可以公开的历史。** 仅删除当前分支中的模型，不会删除旧提交中的文件。对于现在尚无公开 Star 的仓库，可保留现有工作仓库私有，另建经过整理、保留第三方归属的新公开快照；这比把私人研发历史一并开放更容易审查。若坚持原仓库公开，需要检查所有对外分支、标签、LFS 对象引用、发布附件和 Actions 日志。不要在未经审查时执行历史重写。
4. **让新用户检出即可运行。** 给出 Node/npm/Git LFS 步骤，确保 CI 拉取 LFS；保证替换受限角色后 `prebuild` 与加载器也支持公开版。不能只删文件而让当前必需角色校验失败。让一名没有开发环境的试玩者从新浏览器打开链接，另一名开发者按 README 从新目录启动。
5. **补齐仓库入口。** 顶层 LICENSE、各类资产清单、CONTRIBUTING、问题模板、短路线图；README 首屏放一句介绍、真实实机片段、试玩按钮与最短启动步骤。把“已实现”和“计划”分开。
6. **发布快照。** 公开后建立一个有说明的版本 Tag/Release，记录原型限制。若采用原仓库，按钮路径为 `Settings → General → Danger Zone → Change repository visibility → Public`，按 GitHub 提示完成确认。公开会使代码和 Actions 历史等内容可见。[GitHub 官方流程](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)

数据许可应保持独立：OSM 使用 ODbL，署名及衍生数据库义务不能用 MIT 代替；Poly Haven 素材页面的 CC0 也不能覆盖来源不同的角色。[OSM](https://www.openstreetmap.org/copyright)、[Poly Haven](https://polyhaven.com/license)

## 首发只制作一组核心素材

- 一段 45～60 秒、16:9 的实机预告。
- 一段 3～5 分钟 B 站中文介绍；同素材做英文字幕版用于 YouTube。
- 三段 15～30 秒竖屏剪辑：雨后海湾、地面到空中的视角变化、日落到夜景。
- 六张原始游戏截图：海湾驾驶、地标、夜景、地图、步行、一个日常工作画面。
- 两种封面：深圳湾 + 车 + 天际线；开发前后对比。不要把生成概念图包装成当前实机。
- 一页媒体资料：一句介绍、作者署名、当前玩法、技术栈、试玩/仓库链接、可引用截图、已知限制、实际联系方式。

预告分镜建议：

| 时间 | 画面 | 字幕 / 作用 |
|---|---|---|
| 0～3 秒 | 最好的深圳湾驾驶镜头，马上移动 | “如果深圳能自由探索？” |
| 3～12 秒 | 雨后路面、海景、能辨认的地标 | 建立深圳辨识度 |
| 12～22 秒 | 从开车到下车，再接回驾驶 | 证明是可交互实机 |
| 22～32 秒 | 一个真实可完成的小任务 | 说明除了看风景还能做什么 |
| 32～43 秒 | 同地点白天、黄昏、夜间切换 | 展示美术表现 |
| 43～52 秒 | 飞机绕过天际线 | 视觉变化；避免整条片子都在远景转镜头 |
| 52～60 秒 | 项目名、试玩入口、仓库入口 | “你想先开去哪一站？” |

电脑网页游戏的宣传会被手机用户看到：落地页宜先展示视频和明确的“电脑体验”入口，避免让手机直接进入重型 WebGL 场景后失败。本项是建议，尚未实现。

## 发布渠道与优先级

这是针对本项目的传播判断，不是平台算法保证。

| 优先级 | 渠道 | 发什么 | 希望得到什么 |
|---|---|---|---|
| 第一轮 | B 站 | 3～5 分钟：深圳场景、实机玩法、开发过程 | 中文玩家、深圳城市共鸣 |
| 第一轮 | X | 20～35 秒原生视频 + 简短英文帖 | 海外开发者、图形和 AI 创作者的交流 |
| 第一轮 | Babylon.js 社区 | 试玩、技术选择、两个具体问题 | 能帮助项目改善的技术反馈 |
| 第二轮 | YouTube | 4～6 分钟英文演示 + 2～3 条 Shorts | 长期可检索的项目介绍 |
| 第二轮 | 机核投稿 / 游戏开发社区 | 城市叙事、打工生活玩法、开发日志 | 对独立游戏感兴趣的玩家 |
| 有可直接体验的公开版后 | Show HN | 可试玩作品、个人动机与技术取舍 | 开源使用者与贡献者 |
| 素材已有反馈后 | 深圳本地 UP 主、小红书/视频号城市创作者 | “这条路你认得吗”“在虚拟深圳下班兜风” | 地方传播与地点建议 |
| 有可核实的制作过程后 | AI 开发类作者、量子位等科技媒体 | AI 做了哪些、哪些失败了、人怎样修正 | 开发方法的传播 |

Babylon.js 的 [Demos and projects](https://forum.babylonjs.com/c/demos/9) 是明确的作品展示分区；机核有[官方投稿指南](https://www.gcores.com/articles/167778)。量子位是可尝试的 AI 科技媒体方向，可从其[官方介绍](https://www.qbitai.com/%E5%85%B3%E4%BA%8E%E6%88%91%E4%BB%AC)核对现行联系入口；不把商务联系方式当成保证能发稿的渠道。

Show HN 要提供别人能实际体验的作品，鼓励低门槛试玩；不要只发宣传页面或向朋友索要投票。[Show HN 规则](https://news.ycombinator.com/showhn.html)

itch.io 可作为后续游戏页面，但当前 `public/` 已有约 3,493 个受版本管理的文件，且应用有站点根路径引用。其 HTML5 默认上传上限为 1,000 个解压文件，并要求正确处理相对路径，不能直接认为当前包可原样上传。首发先使用现有试玩站。[itch.io 官方说明](https://itch.io/docs/creators/html5)

## B 站文案

标题首选：**我把深圳湾做进了游戏，还能直接用浏览器开车**

第二个标题用于另一条内容，而非重复投同一视频：**和 AI 一起做“深圳版 GTA”，最后真的能玩了**

封面大字建议：“深圳，能玩了”或“下班去深圳湾”。画面主角是海湾、道路和城市，不是工具 Logo。

简介草稿：

> 我一直想做一个能在深圳街头自由探索的游戏，所以开始做《深城纪》。
>
> 现在可以在浏览器里开车、下车走走，也可以飞到天际线上方。雨后的深圳湾、南山和福田的部分街区，是这一版最想让你体验的地方。
>
> 这是仍在开发的城市探索原型，基于 Babylon.js、Blender 和开放地图数据，开发中使用了 AI 辅助。画面是当前版本的实机录屏，场景对城市布局做了压缩和改编。
>
> 电脑试玩：https://gtasz.vercel.app
> 项目源码：{PUBLIC_REPO_URL}
>
> 如果让你在游戏里下一站去一个深圳地点，你会选哪里？欢迎同时告诉我想在那里做什么。

置顶评论草稿：

> 操作：WASD 驾驶，停稳后 F 下车，M 地图，G 无人机，B 飞机，L 切换光照。建议先用电脑 Chrome 体验。
> 遇到问题请带上浏览器、地点和复现步骤；也欢迎发你在深圳湾拍到的游戏截图。
> 试玩与代码见简介。第三方资产分别保留来源与条款。

正文结构：前 15 秒给实机结果；随后演示一段可完成的路线/工作；中段讲“地图怎样变成可玩的城市”和一个具体返工；结尾征集一个地点和一个玩法。不要长时间展示提示词或聊天滚动截图。

## X 英文帖

第一条配 20～35 秒实机视频：

> I’m building Shenzhen as a playable browser city.
>
> Drive along the bay after rain, walk the streets, or fly above the skyline.
>
> Built with Babylon.js + Blender, with AI-assisted development. Still a prototype.
>
> Where would you drive first?

紧接的一条回复，待公开版本就绪后发布：

> Play on desktop: https://gtasz.vercel.app
> Source: {PUBLIC_REPO_URL}
>
> The code is open source; third-party assets keep their own licenses.
> I’d especially love feedback on driving feel and the first few minutes.

另一天发布技术内容：

> One of the hardest parts was keeping wet-road reflections, the skyline and vehicle controls working together—not generating one pretty frame.
>
> Here’s a before/after from the project, plus what I changed: {DEVLOG_URL}

最后一条中的 before/after 必须有对应实录。不要编造耗时、花费、全部由 AI 完成的比例或成功率。链接放正文或紧接的回复均可；这里的拆分是为了可读性，不声称能绕过任何推荐算法。

## YouTube 文案

标题：**I Built a Playable Shenzhen in the Browser — Shenzhen Open Roads**

备选（用于开发过程片）：**Building a Shenzhen-Inspired Open World with AI, Blender and Babylon.js**

说明草稿：

> Explore a Shenzhen-inspired city in your browser: rainy waterfront roads, recognizable landmarks, driving, walking and flying.
>
> Play on desktop: https://gtasz.vercel.app
> Source code: {PUBLIC_REPO_URL}
>
> Shenzhen Open Roads is an independent, noncommercial prototype built with Babylon.js, TypeScript and Blender, using open map data and AI-assisted development. The layout is compressed and adapted for gameplay.
>
> This video shows the current playable build. Game text is mainly Simplified Chinese. Development is ongoing; browser and hardware performance vary.
>
> Third-party assets retain their original terms. Credits: {PUBLIC_CREDITS_URL}
>
> What location—or everyday city activity—should I build next?

片头英文旁白：

> What if you could take a drive through Shenzhen without leaving your browser? I’m building a small open-world prototype around that idea. Let me show you what actually works—and what still needs work.

Shorts 标题建议：**A rainy drive through Shenzhen… in a browser.**

Shorts 用竖屏重剪，将车和地标留在画面内。通过“相关视频”引导到长视频或频道链接；不要只在 Shorts 简介粘贴试玩 URL 并指望用户能点击。YouTube 官方说明 Shorts 简介与评论中的 URL 不可点击；长视频外链等功能涉及频道高级功能权限。[YouTube 链接规则](https://support.google.com/youtube/answer/13748639?hl=en)

## 社区与媒体投稿草稿

Babylon.js 标题：**Shenzhen Open Roads — a browser city with driving, walking and flight**

正文要点：试玩链接、代码链接、10 秒视频；说明 OSM 输入、Blender 资产流程、Babylon.js 渲染；提出“哪些加载问题最影响首次体验”和“第三人称相机在哪类场景失效”两项具体问题。不要只写求 Star。

Show HN 标题：**Show HN: A playable Shenzhen-inspired city in the browser**

作者首评草稿：

> I wanted to explore a city I care about as a playable space, so I built this prototype around Shenzhen Bay and nearby districts. You can drive, walk and fly through it.
>
> It uses Babylon.js, Blender and open map data, with AI-assisted development. The city is compressed for gameplay and the text is currently mostly Chinese. Source and setup instructions: {PUBLIC_REPO_URL}
>
> I’d like feedback on the first-run experience and what would make a short drive worth returning to.

给游戏或深圳城市创作者的短私信草稿（未发送）：

> 你好，我在做《深城纪》，一个以深圳湾及周边城区为背景的浏览器游戏原型。可以开车、步行和飞行，重点是雨后海湾与城市生活的体验。
>
> 想邀请你试玩，并听听你对“{结合对方最近内容填写的具体角度}”的看法。这里有 45 秒实机、电脑试玩和项目资料：{PRESSKIT_URL}。
>
> 项目仍在开发，资料中列出了已实现功能和限制。若你的读者感兴趣，我可以提供制作过程和可引用的原始实机画面。

给 AI 科技作者的角度：提供一项完整案例，从目标、AI 输出、出错、人工判断、代码或模型修正到实机结果。报告可核对的事实；不要把“发过很多提示词”当作文章主体。

## 首发七天安排与反馈

以下是建议安排，不是自动定时发布任务。

| 阶段 | 工作 |
|---|---|
| 发布前 | 整理可公开资产与历史、确认代码许可证，更新 README；从空目录检出验证；录制实机 |
| 第一天 | 公开版与试玩对应更新；B 站主视频 + X 短片；作者在线回复 |
| 第二天 | Babylon.js 展示帖；修复首次体验中最集中的问题 |
| 第三天 | YouTube 英文长视频 + 一条 Shorts |
| 第四天 | 地标/城市共鸣短片；定向联系少量深圳创作者 |
| 第五天 | 发布一篇有实质内容的开发日志；尝试机核或 AI 技术媒体 |
| 第六天 | 确认陌生人可正常试玩后发 Show HN；不要组织刷票 |
| 第七天 | 公布本周修复与下一项具体目标；把高质量建议整理为可认领任务 |

不以某个 Star 数或播放量作为承诺。先看：进入试玩的人是否成功进入城市、是否愿意玩到一次下车或完成一份工作、卡在哪一步、有没有再次访问、有没有具体反馈和实际贡献。分别保留 B 站/X/YouTube 的来源参数，用同口径比较；不要把视频播放量直接当成游戏玩家数。

README 的贡献入口先给少量明确任务，例如地名英译、可复现的浏览器兼容问题、路线和任务文案改进。公开问题不能包含访问令牌、他人私人资料或未经授权的资产包。
