# 深城纪首轮可玩内容与协作目标

2026-09-12。用户授权继续操作 Cursor、设置 goal、推进现有任务。模型统一 Cursor Grok 4.6 / Extra High；最多四个执行任务同时运行，总控由当前 Codex 负责。本文是首轮执行规格，不代表完整 GTA V 内容已完成。

## 本轮交付

把已有城市生活和驾驶串成一条目标时长 10–15 分钟的完整试玩任务，实测时间后记录偏差，不用强制等待凑时长。同时完成一套原创配送员候选资产，以及一种武器的独立试验场；后两者不替换用户现有主角，也不擅自把犯罪题材写入主线。腾讯候选先复核再决定接入。

故事工作名《最后一单》，任务 ID `bay-last-delivery`：从驿站接到一次配送，在办公区与阿琳见面，面对是否为老陈绕路的选择，到滨海目的地完成交付，再回驿站结算。保留现有阿辉、阿琳、老陈身份，人物和事件均为虚构，不将真实企业写成犯罪组织。选择须改变至少一个后续目的地和结尾对白。主线偏都市驾驶与人情冲突；战斗体验独立验证，后续题材选择另记决策。

## 共同接口

`src/city-story-contract.ts` 由总控拥有，两个内容/玩法执行者只读。叙事导出 `CITY_STORY_CONTENT: CityStoryContent` 于 `src/city-story-content.ts`。运行时通过现有 career 的 hub/bay/office/park/workshop 位置适配，不虚构可达坐标。奖励只经唯一的钱包 credit 接口发放、重复结算幂等；新任务不破坏已有工作、导航、咖啡馆和存档。

每个步骤到达后应停稳、下车、交互阅读短对白；对话能跳过，选择能用鼠标和键盘完成。已有职业任务进行中不能抢走路线。地图/菜单/摄影模式下不误触发任务。中途退出、取消、刷新、重复点击均有清晰结果；存档非法内容按安全初始状态处理。

## 所有权与派工

| 执行者 | 独占文件 | 交付与结束条件 |
| --- | --- | --- |
| 叙事 | `src/city-story-content.ts`、`docs/gameplay/story-bible.md`、`docs/gameplay/first-story-script.md` | 同一任务的完整分支文案、旁白脚本、来源于现有设定的人物表；不写运行时代码 |
| 玩法 | `src/city-story.ts`、`src/city-story-experience.ts`、`src/city-story.css`、`tests/city-story.test.ts`、`docs/gameplay/story-runtime.md` | 任务状态/交互界面/存档/奖励重试；通过有意义测试，并提供总控接入接口 |
| 人物服装 | `artifacts/gameplay-pilot/courier/` 全部、`docs/gameplay/courier-candidate.md` | 原创配送员基础体型和两套衣服，候选 GLB、骨骼/动画、预览、统计；不改现有用户角色及 public |
| 战斗试验 | `src/combat-lab.ts`、`src/combat-core.ts`、`src/combat-lab.css`、`combat-lab.html`、`tests/combat-core.test.ts`、`docs/gameplay/combat-lab.md`、`artifacts/gameplay-pilot/combat/` | 独立 Babylon 靶场：一种虚构训练武器，瞄准/射击/换弹/反馈/可重置目标；不接入主世界 |
| 总控 | 本文、共同 contract、`main.ts`、共享世界/钱包/公共资产与派工记录 | 串行集成、查实际图、浏览器流程/回归测试、记录未通过项 |

执行者不可修改他人文件。共享 checkout 下不切分支、不 reset/clean；当前有大量未提交工作，不能假定远程 main 已包含它们。以后独立 worktree 必须先冻结当前可用输入。每个任务一版加最多两轮具体修复；不得自行再派 agent 或绕过已指定模型。

## 验收与负载

- 主任务：两条分支可完成，至少一个目的地和结尾不同；取消、刷新、重复结算、职业任务占用导航有测试与浏览器证据。
- 人物：候选与现有角色隔离，idle/walk/wave 实际存在，双服装不只是换色；脚不穿地，肘膝不明显断裂，来源明确。三角面≤15k/人物，材质≤6；超限实报。
- 战斗：启动需用户手势解锁声音/鼠标；Esc 释放控制，UI 可重置；弹药、换弹、射击间隔和命中反馈一致，背景恢复不连发。仅独立试玩，不声称完整枪战/警察系统已实现。
- Mac 同时最多一项 Blender 渲染、一个重浏览器场景；研究/编码可并行。人物任务优先占用 Blender；总控在其完成后构建总地标。现有两套低/中/高美术关系保持一致。
- 目标机器仍为 RTX 3060，1080p/60 fps。当前 Mac 的测试只证明本机结果，不能代替目标电脑性能通过。

## 当前状态（主集成复核）

四项均通过 Cursor 实际派发并检查 Grok 4.6 / Extra High，执行者已结束本轮写入。2026-09-12 后续切入 `codex/cursor-gameplay-pilot-20260912`；没有提交或推送。此前使用共享 main checkout 的文件分工，不是独立 worktree，不能把它描述成已完成多分支隔离。

- `Last delivery story development`：正式分支稿已修正实际地点名与前后交接关系，接入主城。
- `City story runtime implementation`：19 项状态/交互逻辑测试通过；主集成验证两条分支的真实 DOM 操作、路线接线、终止释放暂停和钱包幂等。移动使用每帧不超过 20 游戏米的位置夹具，未验证真实驾驶耗时、道路行车与整条路线碰撞。
- `Original courier character design`：两套衣服、骨骼/动画及源文件已交付；视觉未通过（肩缝、颈部比例、鞋裤衔接），不替换现有用户角色。
- `Combat lab trial setup`：独立训练场已交付，9 项逻辑测试通过；主集成实际点击开始、锁鼠、射击、换弹、Escape 暂停及按钮恢复通过。只有开发入口，没有接入城市战斗系统，也没有加入默认生产打包入口。

主城同时复核 Y 键雨天开关：道路 normal/ORM 已加载，雨天道路与积水使用原有反射，落雨/波纹已启用且可关闭。未改动原雨天实现以适配剧情。

证据在 `output/playwright/gameplay-pilot/city-review.json`、`combat-review.json` 和同目录截图。独立 QA 入口 `scripts/check-gameplay-pilot.mjs`，可用 `ONLY_CITY=1` / `ONLY_COMBAT=1` 分别验证，避免重复加载已通过部分。测试用隔离浏览器与存档。

完整 npm test 曾通过 250 项；最终靶场恢复修复后，相关剧情/靶场 28 项复跑通过。靶场 1080p 本机短样本约 60 fps，不能替代主城或 RTX 3060 性能验收。

腾讯候选工具 21 项测试由主集成复跑通过，最终俯视机位无裁切。腾讯模型候选 `run-20260912T113209Z` 保留为 partial：连廊开口改善、预算下降，但分格过粗和入口问题未通过，未替换公共资产。财富广场资料保留未知尺寸与背面缺口，未进入模型验收。

## 分支与恢复

- 当前集成分支只为承接现有工作；未提交改动仍属于工作目录，不能靠分支名称保证恢复。
- 改动恢复快照：`artifacts/checkpoints/20260912-203830/`，含 57 个当时已修改/未跟踪文件与 tracked patch；是工作期间快照，不是原子发行版。忽略的模型候选和媒体仍留在原 artifact 目录。
- 后续新派工必须先冻结可运行基线，再各建 `codex/...` 分支与独立 worktree；仅有不同分支名却共用一个目录不算隔离。
- 验证源码、必要数据和资产均已进入基线后才允许 worker 开始。共享渲染、钱包、总资产只由集成者合并，不在多个 worktree 同时改同一内容。
- 10–15 分钟实际驾驶、NPC 站位/演出、语音配音、人物视觉、目标机主城性能仍待后续轮次；当前只完成首轮功能接线与候选评审，不声称 GTA V 级成品。
