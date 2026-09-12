# 战斗手感试验场

2026-09-12。独立 Babylon 靶场，只验证一种虚构训练手枪的瞄准、射击间隔、换弹、后坐力回正和命中反馈。它不是主城内容，也不代表 GTA 级枪战、警察或犯罪系统已经存在。

## 真实运行

当前仓库根目录：`/Users/fenglinran/Documents/ChatGPT/深城纪`。

不要改 `package.json` 或 Vite 配置。若本机已有预览/开发服务，另开专用端口，不要关掉它们。

```bash
# 逻辑测试（不启动浏览器、不加载主城）
node --experimental-transform-types --test tests/combat-core.test.ts

# 专用开发端口示例；占用时换端口
npx vite --host 127.0.0.1 --port 5287 --strictPort
```

浏览器打开：

- `http://127.0.0.1:5287/combat-lab.html`

验证截图用查询参数，只用于取证，不是正式玩法：

- `?capture=started`：跳过 pointer lock / 音频，直接进入第一人称
- `?capture=inspect`：近距查看训练手枪网格

本轮实际开发服务：`http://127.0.0.1:5287/combat-lab.html`（专用 Vite，未关闭 4173/5173 等已有服务）。截图、测试输出和本机帧率样本在 `artifacts/gameplay-pilot/combat/`。性能数字只是当时那台电脑的样本，不能当作 RTX 3060 / 1080p/60 通过。

## 操作

1. 先看到靶场概览和开始卡片。此时不锁定鼠标，也不开声音。
2. 点击「开始训练」后才 `requestPointerLock` 并解锁本地 `AudioContext`。
3. 鼠标移动瞄准，左键点射。这是半自动：按住不会连发。
4. `R` 换弹。空仓不能射击，换弹过程中也不能射击。
5. `T` 或「重置靶场」清零成绩、弹药和靶位置。
6. `Esc` 由试验场自己暂停（不依赖浏览器原生解锁）。暂停后必须再点「继续训练」才会 `requestPointerLock`；失败会显示可重试提示，不会吞掉。点画面不会在暂停时重新锁定或开枪。
7. 窗口失焦或页面隐藏同样走暂停。恢复手势只认「开始训练」/「继续训练」，松开鼠标后再射击，避免后台恢复连发。
8. 总控复用时调用 `releaseControl(timeMs)`，不要只靠原生 Escape。

武器是场景里的网格：握把、套筒、套筒齿纹、枪管、扳机护圈、弹匣底板和训练用准星分区材质。移动靶是几何训练假人（躯干、头、肩、环靶和滑轨），不引用人物 GLB 或其他 agent 的资源。

## 限制

- 不接入 `main.ts`、城市世界、现有飞机/坦克或职业任务。
- 弹道、后坐、换弹时间都是游戏手感参数，不是真实枪械数据。
- 没有武器商店、警察、伤害系统、第三人称角色持枪或网络同步。
- 音效全部本机振荡器/噪声合成，没有下载或付费枪声。
- 窗口 `resize` 与 DPR 上限为 1.5，像素预算 1920×1080。离开页面会 `dispose`。
- 当前人物候选可能占用 Blender；本试验场不启动整城，也不再开第二个重型浏览器场景。

## 总控后续接入点

共享逻辑在 `src/combat-core.ts`，场景与输入在 `src/combat-lab.ts`。

总控若以后要把手感带进主世界，只应复用 `CombatCore`：

- `start` / `setPaused` / `reset`
- `look` 或 `setLook`
- `setTrigger`（按下/松开）和 `reload`
- `tick(dt, timeMs)` 与只读 `view`
- `releaseControl(timeMs)`：Esc / 失焦 / 丢锁时暂停并解除扳机；`disarmTrigger()` 防止恢复时自动开火

不要把 `CombatLab` 挂进 `DrivingWorld`。武器网格、音效和 pointer lock 所有权要由集成者接到现有输入栈。是否把战斗写进主线仍是单独决策；本靶场保持虚构训练题材。

页面会在 `window.__combatLab` 暴露 `core`、`fire`、`inspectWeapon`、`samplePerf`、`dispose`，只供本机取证。

## 文件

| 路径 | 职责 |
| --- | --- |
| `src/combat-core.ts` | 纯逻辑：弹药、间隔、换弹、后坐回正、射线命中、暂停/重置、`releaseControl` |
| `src/combat-lab.ts` | 独立场景、武器/靶网格、pointer lock、合成音、UI |
| `src/combat-lab.css` | 试验场界面 |
| `combat-lab.html` | Vite 入口 |
| `tests/combat-core.test.ts` | 空弹、换弹中不能打、间隔、计分、重置/暂停、Esc 释放后恢复不连发 |
| `docs/gameplay/combat-lab.md` | 本文 |
| `artifacts/gameplay-pilot/combat/` | 本机截图、测试输出、性能样本 |
