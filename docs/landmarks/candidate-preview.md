# 单对象候选导出与六视角预览

实测工具，不是总构建器包装。支持 `scripts/landmark_candidate.py` 里 `SUPPORTED` 列出的对象和 `build(b, lm, spec, scale)` 契约；未列入的对象会明确报 `unsupported`，不会猜测 `priority.py` 或其他签名。无 city.json 具名点的对象可用规格里的 reported WGS84 锚点换算游戏坐标。

`--module` 可以是规范模块 `scripts/landmarks/tencent.py`，或 `artifacts/landmark-candidates` 下经 `Path.resolve()` 校验的 `.py` 候选（例如精修者的 `tencent-visual-v1/tencent_candidate.py`）。Worker 按请求路径 `importlib` 加载，不再写死 `from landmarks import tencent`。`--spec` 默认为 `data/landmarks/tencent.json`；同目录下 `id` 匹配的候选 JSON 也可以。仓库外路径、错误后缀、`..` 逃逸和指向 `public/` 的解析结果都会失败。

宿主是普通 Python，不导入 `city_mesh.py`。几何构建和渲染只在独立 Blender 子进程里执行。`city_mesh.export()` 默认写 `public/city`，本工具不得调用。

## 命令

规范模块（本轮有效的裁顶修复渲染）：

```sh
.venv/bin/python scripts/landmark_candidate.py export \
  --id tencent \
  --module scripts/landmarks/tencent.py \
  --spec data/landmarks/tencent.json \
  --output artifacts/landmark-candidates/tencent-runner-pilot
```

精修候选模块（文件必须已存在；本工具不写精修者目录）：

```sh
.venv/bin/python scripts/landmark_candidate.py export \
  --id tencent \
  --module artifacts/landmark-candidates/tencent-visual-v1/tencent_candidate.py \
  --output artifacts/landmark-candidates/tencent-visual-v1
```

`--id`、`--module`、`--output` 必填。`--output` 必须解析到 `artifacts/landmark-candidates` 下；写到 `public/`、`src/`、`data/`、`scripts/` 或仓库外会失败。已有非空目录不会被覆盖，每次成功或失败都会新建 `run-UTC时间` 子目录。

可选：`--city public/city/city.json`（只读，读取真实 `lm`）、`--scale`（默认用 `city.json` 的 `horizontalScale`）、`--blender`（默认 `/Applications/Blender.app/Contents/MacOS/Blender`）。

边界测试：

```sh
.venv/bin/python tests/landmark-candidate.test.py
```

## 一次运行会写出什么

`run-…/` 内：

- `landmark_tencent.glb`：只含本次 `B.finish` 的网格；不含灯、相机、地面。
- `views/clay/{front,back,left,right,top,street_three_quarter}.png`
- `views/material/` 同六个文件名
- `report.json`、`review.md`、`worker.json`、`blender.log`
- 输入与 `public/city` 的前后哈希

`report.json` 的三角形、mesh、材质、字节来自交付 GLB 实读，不抄旧 `landmark-detail.json`。相机、灯光、渲染设置和 Blender 版本在 `worker.json` / `report.json` 的 `preview` 里。

前/后/左/右按对象包围盒的东(+X)/北(+Y)/上(+Z)，距离同时按水平/垂直视场留边，避免裁掉塔冠。俯视是包围盒上方的正交平面图，对准地面；`sensor_fit=HORIZONTAL` 时 `ortho_scale = max(size.x, size.y * aspect) * 1.32`，横纵都留边，避免 1280×960 把较深的一边裁掉。街面三分之四是西南低机位看向楼体下三分之一，允许裁掉塔冠。背景和日光是中性灰，Standard 视图变换，无景深、无电影 Look。灰模用 View Layer 材质覆盖，不改源码或 `public/city/textures`。

## 限制

- 预览不等于游戏碰撞、浏览器加载或 RTX 3060 性能通过。
- 本轮不重新设计腾讯，不跑 `build_landmark_details.py`，不发布共享资产。
- `city_mesh.py` 导入会初始化 Blender 场景，并可能创建 `artifacts/city`；不得因此改动任何 `public/city` 文件。
- 财富广场等其他对象不在本工具范围内，也不写入它们的资料目录。
- `tencent-visual-v1` 为独立精修者拥有的候选目录，现已存在；工具不会代写候选源码，传入不存在的模块仍报 `missing module`。
- 规范模块各版都保留，互不覆盖。最终有效渲染是 `run-20260912T112623Z`（正立面完整，俯视按 1280×960 横纵留边）。`run-20260912T111136Z` 机位过近；`run-20260912T111456Z` 正立面完整但俯视仍裁角；`run-20260912T112107Z` 只是 runner-pilot 探针模块，不是建筑交付。
