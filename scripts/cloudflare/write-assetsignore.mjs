#!/usr/bin/env node
// 根据 cloudflare/r2-manifest.json 生成 dist/.assetsignore：已进 R2 的大文件和构建中间产物不再作为 Workers 静态资源上传。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'cloudflare', 'r2-manifest.json'), 'utf8'));
const keys = [...Object.keys(manifest.objects ?? {}), ...(manifest.skipped ?? [])].sort();
const lines = ['# 由 scripts/cloudflare/write-assetsignore.mjs 生成；这些路径由 Worker 从 R2 提供或不部署。', ...keys.map(k => '/' + k)];
const target = path.join(ROOT, 'dist', '.assetsignore');
await fs.writeFile(target, lines.join('\n') + '\n');
console.log(`写入 ${path.relative(ROOT, target)}：忽略 ${keys.length} 个路径。`);
if (!Object.keys(manifest.objects ?? {}).length) console.warn('警告：r2-manifest.json 还没有对象，请先运行 node scripts/cloudflare/sync-r2.mjs。');
