# 工作包：按 Top50 清单收参考图

执行模型：Cursor Grok 4.6 / Extra High。根目录：`/Users/fenglinran/Documents/ChatGPT/深城纪`。

请执行本 handoff，只做其中一个 `id`。先读 `docs/landmarks/shenzhen-top50.md`、`data/landmarks/shenzhen-top50.json` 和项目 `AGENTS.md`。不要重做已确认研究，也不要接手别人已占用的对象。

## 本轮范围

1. 从 catalog 选一个 `owner=unassigned` 且 `coverage=in_bbox` 的对象。腾讯、财富广场、七街、万象、预览工具目录只读。
2. 用 Wikimedia Commons 或其他许可可核对的来源找至少两个不同方向的现状照片。效果图、施工期、夜景必须标出来。
3. 把 Commons 文件名写入该条 `commonsFiles`（只改这一条），再运行：

```sh
.venv/bin/python scripts/landmarks/fetch_reference_photos.py --place <id>
```

4. 实际打开下载图，写 `artifacts/landmark-references/<id>/observations.md`：轮廓、材料分区、入口、光线；尺寸一律 `reported` / `estimated` / `unknown`。不能只交搜索摘要。
5. 缺图或身份冲突就停，列缺口。不要猜背面，不要改 `priority.py`、`tencent.py`、`src/`、`public/`。

## 不要做

- 把网上 JPG 当成立面贴图或打进 GLB
- 为地图外对象填写游戏坐标
- 同时开建第二栋
- 宣称高精度完成或已达 GTA V

## 交回

一屏摘要：id、下了几张、许可、看见图的结构、三个未知项。本地产物在 `artifacts/landmark-references/<id>/`（gitignore）。catalog 与脚本改动留给集成人员串进清单。
