# 首轮剧情运行时：《最后一单》

2026-09-12。玩法执行者交付。本文记录状态机、DOM 体验和总控接入面。不代表主世界已接线，也不代表 10–15 分钟时长或 60 fps 已实测。

## 所有权

| 文件 | 所有者 | 说明 |
| --- | --- | --- |
| `src/city-story-contract.ts` | 总控 | 只读契约。内容与运行时不得改接口。 |
| `src/city-story-content.ts`、`docs/gameplay/story-bible.md`、`docs/gameplay/first-story-script.md` | 叙事 | 正式 `CITY_STORY_CONTENT`。运行时不写、不等待、不顶替。 |
| `src/city-story.ts`、`src/city-story-experience.ts`、`src/city-story.css`、`tests/city-story.test.ts`、本文 | 玩法 | 纯状态核心、可接入 DOM、存档、奖励重试。 |
| `src/main.ts`、`src/city-world.ts`、`src/city-career.ts`、钱包与公共资产 | 总控 | 串行接线。本模块不改职业、钱包或 public。 |

共享 checkout 下本任务未切分支、未提交。另一个叙事任务提供内容后，总控把同一 `CityStoryContent` 传入即可。

## 可测试核心

`src/city-story.ts` 不读 DOM、localStorage、真实时钟，也不调用在线 NPC。

```ts
import {StoryGame, createStoryRuntime, readStorySave, STORY_SAVE_KEY} from './city-story.ts';
import type {CityStoryContent, StoryHooks} from './city-story-contract.ts';

const game = new StoryGame(content, hooks.places, readStorySave(raw));
game.start(frame);
game.tick(frame);
game.prompt(frame);
game.interact(frame);          // 到达后停稳、下车、按 E；一次只推进当前步骤
game.skip(frame);              // 跳到本段最后一句，不跨站
game.choose(choiceId, frame);  // 校验选项与 next
game.retryStep(frame);         // debugEpoch / 瞬移后的重试
game.cancel();
game.confirmPayout(ok);        // 只有 ok===true 才能记已结算
```

`createStoryRuntime(content, hooks, storage?)` 叠一层幂等存档、单次导航和钱包重试，供测试和 DOM 层共用。`storage` 省略时才碰 `localStorage`；测试传入内存即可。

### 帧与互斥

`StoryFrame` 由总控每帧提供：

- `paused`：地图 / 手账 / 外部暂停。禁止**开始**和**赶路交互**。对白一旦打开，`setModalOpen(true)` 会让总控把 `world.paused` 设为 true；继续、跳过、分支、领取结算必须仍可用，不能把自己锁死。
- `blocked`：职业任务、摄影、飞行、坦克或其他独占模式。禁止开始与交互，推进冻结，**不改写导航**。对白期遇到外部 blocked 仍禁用。解除后如目的地仍在，只会补一次导航。
- `inVehicle`：到站后必须下车才能 `interact`。
- `debugEpoch`：与接段时不一致，或单帧位移超过 45 游戏米，记为调试跳转。不能当作本段驾驶完成。`retryStep` 要求先离开标记再实际开回；也可以 `cancel` 后重来。

到达判定与职业合约对齐：地点 28 米内、绝对速度 &lt; 1。不在这里发明坐标；只用 hooks 传入的 hub / bay / office / park / workshop。

### 存档

键：`shenchengji-city-story-v1`。`version !== 1` 或 `id !== 'bay-last-delivery'`、步骤 ID 对不上当前内容，都回到安全空档。进行中的步骤会恢复（与职业“刷新丢当前合约”不同）。取消清空进度。若奖励已到账，重开会话不把 `payout` 改回未结算。

非法存档字段会被丢掉，不会把未知 phase / 未知选项 / 非有限数字写进运行态。

### 奖励

金额来自 `content.reward`，只通过 `hooks.credit('bay-last-delivery', amount)`。返回 `false` 或抛错：保持 `payout: 'pending'`，可点「领取结算」或再按 E 重试。在 hook 返回 `true` 之前，核心不会写成已结算。总控把已到账的同 ID 视作 `true`；本侧只重试失败，不把失败写成已结算，成功后不再请求。

本模块不改职业钱包实现。place 只用契约语义（含 `park` = 公园城市养护站到达点），不自编坐标。

## 总控接入

```ts
import {createStoryExperience} from './city-story-experience.ts';
import {CITY_STORY_CONTENT} from './city-story-content.ts'; // 叙事文件，本任务未写

const story = createStoryExperience(CITY_STORY_CONTENT, {
  places: career.game.places, // 或与职业同一套可达点
  frame: () => ({
    x: world.actor.x, z: world.actor.z, speed: world.actor.speed,
    inVehicle: !world.walk?.active,
    paused: mapOpen || journalOpen || world.paused,
    blocked: !!career?.game.active || world.observer.active || !!world.photoTarget,
    debugEpoch: world.debugEpoch,
  }),
  navigate: (point, title) => { /* 只收 point + title，不要每帧调用 */ },
  clearRoute: () => {},
  toast, setModalOpen: (open) => { /* 对白打开时暂停输入 */ },
  credit: (id, amount) => career.game.creditLegacy(id, amount).ok, // 示例：必须幂等
});

world.onTick = (dt) => { story.tick(dt); /* 提示：story.prompt() */ };
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') story.interact();
});
```

`createStoryExperience` 返回：

| 成员 | 含义 |
| --- | --- |
| `tick(dt)` | 推进到达检测、按需存档与导航、节流刷新 DOM |
| `interact(): boolean` | 无 `prompt` 且对白不可见时返回 false（旅行远处或 blocked），把 E 让给咖啡馆 / 职业。只在真正处理故事时消费 |
| `prompt(): string \| null` | 给现有 `#ride-prompt` 或等价提示。外部 paused / blocked 时为 null；自己打开的对白不受 paused 影响 |
| `dispose()` | 卸 DOM 与键盘，不删存档 |
| `active` / `view` | getter。`view.destination` 即当前导航 |

`main.ts` 已按 `createStoryExperience(content, hooks)` 与 `tick` / `interact` / `prompt` / `view` 接线。Esc 收起后可把车开走；继续、跳过、选分支和重开都要再次停稳下车并在交接点内，否则只提示回去、对白进度不动。快捷键只在对话框可见且可交互时消费，blocked / 已隐藏时把 Escape 留给地图。`tryPayout` 成功当帧 `setModalOpen(false)`，不等下一 tick。`park` 只用职业养护站到达点；`office-spare` 与上一站同地。

内容校验失败时体验层降级为空操作并 toast，不抛死主循环。步骤 `next` / 选项 `next` / 终止态都会校验；未知 ID 不会跳转。

## 验证

```
node --experimental-transform-types --test tests/city-story.test.ts
npx tsc --noEmit
```

测试覆盖：非法存档、刷新恢复与取消重来、外部暂停 / 阻断、自开对白在 paused 下仍可继续与选分支、旅行远处 / blocked 的 E 让行、走开后继续与选项不改进度、收起后车内不重开对白、快捷键只在可见可交互对白上消费、结算当帧放暂停、停车下车与一次操作不跨步、跳过对白、重复点击分支、两条分支地点与结尾不同、正式稿同地 office-spare、奖励失败重试、非法输入、debugEpoch 重试路径、运行时单次导航与钱包重试。

## 待集成（未完成，勿当已验收）

- `main.ts` 已 mount，浏览器操作与同屏避让由总控验收；本侧没有新的实测截图。
- 没有 10–15 分钟时长样本，也没有本机或 RTX 3060 的 60 fps 证据。
- 正式 `CITY_STORY_CONTENT` 已用只读导入做地点/同站 office-spare 校验；浏览器流程仍归总控。
