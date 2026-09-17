#!/usr/bin/env node
// 把 public/ 下的大文件同步到 Cloudflare R2，并写出 cloudflare/r2-manifest.json 供 Worker 路由。
//
//   node scripts/cloudflare/sync-r2.mjs            # 增量同步（按 sha256 跳过未变文件）
//   node scripts/cloudflare/sync-r2.mjs --dry-run  # 只打印计划
//   node scripts/cloudflare/sync-r2.mjs --force    # 全部重传
//   --min-size=262144   进入 R2 的最小字节数（默认 256 KiB，约 120 个文件 / 350 MiB）；更小的文件留在 Workers 静态资源里
//   --concurrency=6
//   --local             写到 wrangler 本地模拟存储（配合 `wrangler dev` 验证 Worker），不联网
//
// 前置：npx wrangler login；npx wrangler r2 bucket create shenchengji-city
// 可压缩类型（glb/json/hdr/bin）会另存一份 <key>.br，Worker 按 Accept-Encoding 选择。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');
const MANIFEST = path.join(ROOT, 'cloudflare', 'r2-manifest.json');
const BUCKET = 'shenchengji-city';
// 只考虑这些顶层目录；其余（favicon、licenses）始终是静态资源。
const PREFIXES = ['city/', 'characters/', 'assets/'];
// 构建中间产物：部署时没有任何代码请求它们，不上传也不当静态资源。
const SKIP = new Set(['city/street-surfaces.json', 'city/facades.glb']);
const BROTLI_EXT = new Set(['.glb', '.json', '.hdr', '.bin']);
const MIME = {
  '.glb': 'model/gltf-binary', '.json': 'application/json', '.hdr': 'application/octet-stream',
  '.bin': 'application/octet-stream', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain',
};

const args = new Map(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const dryRun = args.has('dry-run');
const force = args.has('force');
const minSize = Number(args.get('min-size') ?? 256 * 1024);
const local = args.has('local');
// 本地模拟存储是单个 sqlite，并发写会互相冲突。
const concurrency = local ? 1 : Number(args.get('concurrency') ?? 6);

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full); else if (entry.isFile()) yield full;
  }
}

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

function wrangler(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'wrangler', ...argv], {
      cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`wrangler ${argv.slice(0, 3).join(' ')} 退出码 ${code}\n${out}`)));
  });
}

async function put(key, file, contentType, contentEncoding) {
  const argv = ['r2', 'object', 'put', `${BUCKET}/${key}`, local ? '--local' : '--remote', '-c', 'cloudflare/wrangler.jsonc',
    '--file', file, '--content-type', contentType,
    '--cache-control', 'public, max-age=0, must-revalidate'];
  if (contentEncoding) argv.push('--content-encoding', contentEncoding);
  await wrangler(argv);
}

const previous = JSON.parse(await fs.readFile(MANIFEST, 'utf8').catch(() => '{"objects":{}}'));
const candidates = [];
for await (const file of walk(PUBLIC)) {
  const key = path.relative(PUBLIC, file).split(path.sep).join('/');
  if (!PREFIXES.some(p => key.startsWith(p)) || SKIP.has(key)) continue;
  const stat = await fs.stat(file);
  if (stat.size < minSize) continue;
  const buffer = await fs.readFile(file);
  if (buffer.length < 200 && buffer.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error(`${key} 仍是 Git LFS 指针，请先 git lfs pull`);
  }
  candidates.push({ key, file, size: stat.size, sha256: sha256(buffer), buffer });
}
candidates.sort((a, b) => b.size - a.size);

const objects = {};
const todo = [];
for (const c of candidates) {
  const prev = previous.objects?.[c.key];
  if (!force && prev && prev.sha256 === c.sha256) { objects[c.key] = prev; continue; }
  todo.push(c);
}
const totalMiB = candidates.reduce((s, c) => s + c.size, 0) / 1048576;
console.log(`R2 对象 ${candidates.length} 个，共 ${totalMiB.toFixed(1)} MiB；需要上传 ${todo.length} 个。`);
for (const c of todo) console.log(`  ${(c.size / 1048576).toFixed(2).padStart(7)} MiB  ${c.key}`);
if (dryRun) process.exit(0);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'shenchengji-r2-'));
let done = 0;
async function upload(c) {
  const ext = path.extname(c.key).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const entry = { size: c.size, sha256: c.sha256, contentType, br: false };
  await put(c.key, c.file, contentType);
  if (BROTLI_EXT.has(ext)) {
    const compressed = brotliCompressSync(c.buffer, { params: {
      [zlib.BROTLI_PARAM_QUALITY]: 10, [zlib.BROTLI_PARAM_LGWIN]: 24, [zlib.BROTLI_PARAM_SIZE_HINT]: c.size } });
    if (compressed.length < c.size * 0.9) {
      const brFile = path.join(tmp, c.sha256 + '.br');
      await fs.writeFile(brFile, compressed);
      await put(c.key + '.br', brFile, contentType, 'br');
      await fs.unlink(brFile);
      entry.br = true; entry.brSize = compressed.length;
    }
  }
  objects[c.key] = entry;
  done += 1;
  console.log(`[${done}/${todo.length}] ${c.key}${entry.br ? ` (br ${(entry.brSize / 1048576).toFixed(2)} MiB)` : ''}`);
}

const queue = [...todo];
const failures = [];
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) {
    const c = queue.shift();
    try { await upload(c); } catch (error) { failures.push(c.key); console.error(String(error.message).split('\n').filter(l => l.trim() && !/Proxy environment/.test(l)).slice(0, 12).join('\n')); }
  }
}));
await fs.rm(tmp, { recursive: true, force: true });

const manifest = { version: 1, bucket: BUCKET, generatedAt: new Date().toISOString(), minSize, skipped: [...SKIP],
  objects: Object.fromEntries(Object.entries(objects).sort(([a], [b]) => a.localeCompare(b))) };
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`已写入 ${path.relative(ROOT, MANIFEST)}：${Object.keys(objects).length} 个对象。`);
if (failures.length) { console.error(`失败 ${failures.length} 个：\n  ${failures.join('\n  ')}`); process.exit(1); }
