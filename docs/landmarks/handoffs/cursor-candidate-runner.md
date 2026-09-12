# 交给 Cursor Grok 4.6：单对象候选导出与预览工具

2026-09-12 用户最新指定：本轮在 Cursor 使用 Grok 4.6、Extra High 推理档位。沿用此文件名以保留任务链接，不再使用 Composer 执行。

以下可整体复制。工作根目录为`/Users/fenglinran/Documents/ChatGPT/深城纪`；使用项目已有Python、Blender和依赖，不安装新服务。

你是《深城纪》的资产工具执行者。本轮完成一个有边界的工具：将现有腾讯滨海大厦对象模块在独立Blender进程中导出到候选目录，并生成固定视角图、实读统计与输入输出哈希。它将用于后续批量资产任务；本轮不重新设计腾讯、不改任何游戏画质或总资产。

先读AGENTS.md、`docs/landmarks/external-agent-handbook.md`，再按需查看`scripts/city_mesh.py`、`scripts/landmarks/tencent.py`、`data/landmarks/tencent.json`、`scripts/build_landmark_details.py`中腾讯调用部分。总构建器只作为调用样板，禁止导入/执行，因为它会构建多个对象并写public。`city_mesh.py`导入会初始化Blender场景，只能在新的候选Blender子进程中执行。

允许创建/修改：

- `scripts/landmark_candidate.py`：宿主入口/子进程工具。
- `scripts/landmarks/candidate_preview.py`：需要时用于Blender预览环境；不得由运行时/总构建器隐式导入。
- `docs/landmarks/candidate-preview.md`：实测使用方法与限制。
- `artifacts/landmark-candidates/tencent-runner-pilot/`：本轮输出与日志。
- 必要的针对该工具的测试文件`tests/landmark-candidate.test.py`，不修改现有测试。

这些新文件若已经存在先确认内容与所有权，有冲突则报告而不覆盖。其他文件只读。不得修改city_mesh.py、tencent.py、priority.py、src/、public/、总manifest、坐标或资产排除记录。

接口目标是明确的输入参数：对象ID、模块、规格、输出目录。先只支持腾讯样板；其他对象签名未统一时明确unsupported，不做动态猜测适配。现有build接口是`build(b,lm,spec,scale=0.6)`；lm、spec从当前数据读取，不硬编码假坐标。输出目录必须限定在项目artifacts/landmark-candidates，解析真实路径防止误写public或覆盖源码。未传输出参数就失败；已有非空目录不能静默覆盖，使用新的运行子目录。

2026-09-12 主集成反馈补充：在仍只支持腾讯 build 契约的前提下，模块/规格可为现有 canonical 文件，或解析后位于 artifacts/landmark-candidates 内的 .py / .json 候选文件。必须真正按请求路径加载，不可把参数写进报告后仍硬编码原模块。测试路径逃逸、后缀和模块选择；只在 runner-pilot 做试验，不写精修者目录。

一次实际成功运行交付：

1. 独立GLB，命名遵循对象前缀；调用B.finish收集本次对象。不要使用会默认写public的export便利函数，不把灯/相机/地面误导入模型。
2. 固定前/后/左/右/俯视/街面三分之四的图片，共6个视角；保存相机、灯光、渲染设置和Blender版本。中性背景/光照，不使用电影滤镜或景深掩盖缺陷。灰模与材质预览分开，不能修改源模型材质文件。
3. 直接从交付GLB统计三角形、mesh、材质、文件字节；记录模型、源模块、规格输入SHA256及完整实际命令；不要复制旧manifest数值。
4. `report.json`、简短`review.md`与真实日志。明确预览不等于游戏碰撞/浏览器/3060性能通过。

完成前记录public/city全部文件的路径与SHA256，运行后再次比较；检查输入源码与数据也未变化。不一致就失败并报告，不用回滚或改哈希掩盖。`city_mesh.py`可能创建输出目录，但不得产生或改变任何公共资产文件。

测试应覆盖真正的写入边界和失败行为：缺模块/缺输入、禁止输出路径、已存在目录、子进程失败不生成成功报告；然后做一次腾讯真实导出，检查GLB和6个视角。不要每改文档就重建全城或跑全游戏。若本地Blender不可用，交实现及未执行项，不伪造成功与图片；同类错误两次修复仍失败就交最小复现。

最终报告：变更文件、实际可复制命令、public未变的证据、导出统计/图片路径、未通过项。最多一屏摘要；不提交/推送/发布，不自行启动更多Agent。
