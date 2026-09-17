# 深城纪 → Cloudflare（Workers 静态资源 + R2）

目标：把 Vercel 上按流量计费的大文件（GLB / HDR / JSON / 视频）改由 R2 提供（R2 不收出站流量），
网页和小文件走 Workers 静态资源。游戏代码里的 `/city/...` 路径保持同源不变，`src/` 不需要改。

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| `wrangler.jsonc` | Worker 配置 | 静态资源目录 `../dist`，R2 绑定 `CITY` → 桶 `shenchengji-city` |
| `worker.ts` | 路由 | `r2-manifest.json` 里列出的键走 R2（支持 ETag 304、Range、预压缩 br），其余回落到静态资源 |
| `r2-manifest.json` | 由 `sync-r2.mjs` 生成 | 记录已上传对象的 sha256，增量同步与 `.assetsignore` 都依赖它。**要提交** |
| `scripts/cloudflare/sync-r2.mjs` | 上传 | `public/` 下 ≥256 KiB 的文件（约 120 个 / 350 MiB）；glb/json/hdr/bin 另存 `<key>.br` |
| `scripts/cloudflare/write-assetsignore.mjs` | 部署前 | 生成 `dist/.assetsignore`，避免 25 MiB 单文件上限 |
| `scripts/cloudflare/deploy.sh` | 一键 | 同步 R2 → `npm run build` → `wrangler deploy` |

## 首次部署

```bash
npx wrangler login                                   # 浏览器完成 Cloudflare OAuth
npx wrangler r2 bucket create shenchengji-city
scripts/cloudflare/deploy.sh                         # 约 5 分钟；输出 https://shenchengji.<account>.workers.dev
```

之后改了模型只需再跑一次 `scripts/cloudflare/deploy.sh`，未变化的文件按 sha256 跳过。
`city/street-surfaces.json` 与 `city/facades.glb` 是构建中间产物，运行时没有代码请求，不上传也不部署。

## 线上状态

2026-09-17 10:46 首次 `wrangler deploy` 完成，地址 **https://shenchengji.gtasz.workers.dev**；桶 `shenchengji-city` 含 118 个对象（285 MiB，另有 97 MiB br 副本），`sync-r2.mjs --dry-run` 显示与当前 `public/` 一致。
同日 11:0x 用无头 Chrome 从该地址完整启动游戏：31 s 进入可玩，182 个请求 / 121 MiB，26 个 br 对象来自 R2，无 4xx/5xx 与页面错误；角色加载、开车正常，约 53 fps。
`curl` 抽查：`buildings.glb` `content-encoding: br` 13.45 MiB，带 ETag 重验证返回 304；`bamboo-clay-loop.mp4` Range 返回 206；未列入清单的小文件与 `assets/textures/polyhaven/*.jpg` 均 200；`city/facades.glb` 按预期 404。

## 切换前验证

1. 打开 workers.dev 地址，完整跑一遍开车、下车、驿站交互、角色加载。
2. DevTools Network 里确认 `buildings.glb` 为 `content-encoding: br`、约 13 MiB，二次刷新为 304。
3. 确认后再把自定义域名指到 Worker，Vercel 项目保留一段时间作为回退。

## 本地验证（不联网）

```bash
node scripts/cloudflare/sync-r2.mjs --local --min-size=6000000   # 写入 .wrangler/ 本地模拟 R2
node scripts/cloudflare/write-assetsignore.mjs
npx wrangler dev -c cloudflare/wrangler.jsonc --port 8790
```

本地验证结束后把 `r2-manifest.json` 还原（`git checkout cloudflare/r2-manifest.json`），它此时只指向本地对象。
2026-09-17 已用此流程确认：游戏从本地 Worker 正常启动，`buildings.glb` 经 R2 以 br 传输 12.8 MiB，
条件请求返回 304，视频 Range 返回 206，未列入清单的文件由静态资源返回。

## 免费额度

R2：10 GB 存储、每月 100 万次写、1000 万次读、出站流量不计费。当前对象约 350 MiB + br 副本。
Workers：每日 10 万次请求。`run_worker_first` 让所有 `/city/*` 请求先进 Worker（一次首载约 90 次），
即每天约 1,000 次首次进入游戏；超过后要么升级 Workers 付费档（5 美元/月），要么把 `run_worker_first` 收窄到
清单里真正的大文件路径。
