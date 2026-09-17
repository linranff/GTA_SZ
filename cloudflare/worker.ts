// 深城纪 Cloudflare Worker：网页与小文件走 Workers 静态资源，r2-manifest.json 列出的大文件走 R2。
// 游戏代码里的 /city/... 路径保持同源不变，因此不需要改 src/ 里的任何加载逻辑，也没有 CORS。
import manifest from './r2-manifest.json';

interface R2Range { offset?: number; length?: number; suffix?: number }
interface R2Object {
  key: string; size: number; httpEtag: string; range?: R2Range;
  writeHttpMetadata(headers: Headers): void;
  body?: ReadableStream;
}
interface R2Bucket {
  get(key: string, options?: { onlyIf?: Headers; range?: Headers }): Promise<R2Object | null>;
}
interface Env { CITY: R2Bucket; ASSETS: { fetch(request: Request): Promise<Response> } }

// 键 → 是否另存了 <key>.br 预压缩版本（由 sync-r2.mjs 写入）。
const objects: Record<string, { br: boolean }> = (manifest as { objects: Record<string, { br: boolean }> }).objects;
// 浏览器侧与 Vercel 现状一致：每次会话用 ETag 重验证（304 不计流量），资源重新同步后立即生效。
const BROWSER_CACHE = 'public, max-age=0, must-revalidate';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const entry = objects[key];
    if (!entry || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);

    const acceptsBr = /(^|,)\s*br\s*(;|,|$)/.test(request.headers.get('accept-encoding') ?? '');
    const useBr = entry.br && acceptsBr && !request.headers.has('range');
    const object = await env.CITY.get(useBr ? key + '.br' : key, {
      onlyIf: request.headers,
      range: useBr ? undefined : request.headers,
    });
    if (!object) return env.ASSETS.fetch(request);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', BROWSER_CACHE);
    headers.set('accept-ranges', 'bytes');
    headers.set('vary', 'Accept-Encoding');
    if (useBr) headers.set('content-encoding', 'br');

    // 条件请求命中：R2 返回不带 body 的对象。
    if (!object.body) return new Response(null, { status: 304, headers });

    let status = 200;
    // R2 在整对象读取时也可能填充 range，因此只有客户端真的带了 Range 才回 206。
    if (object.range && request.headers.has('range')) {
      const { offset = 0, length, suffix } = object.range;
      const start = suffix !== undefined ? object.size - suffix : offset;
      const end = suffix !== undefined ? object.size - 1 : offset + (length ?? object.size - offset) - 1;
      headers.set('content-range', `bytes ${start}-${end}/${object.size}`);
      headers.set('content-length', String(end - start + 1));
      status = 206;
    } else {
      headers.set('content-length', String(object.size));
    }
    const body = request.method === 'HEAD' ? null : object.body;
    // encodeBody:'manual' 让 Cloudflare 原样透传已 brotli 压缩的字节，而不是再压一次。
    return new Response(body, { status, headers, encodeBody: useBr ? 'manual' : 'automatic' } as ResponseInit);
  },
};
