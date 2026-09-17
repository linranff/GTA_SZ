#!/bin/zsh
# 深城纪 → Cloudflare：构建网页，大文件同步到 R2，其余作为 Workers 静态资源部署。
# 用法：scripts/cloudflare/deploy.sh [--skip-sync]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export WRANGLER_SEND_METRICS=false

if [[ "${1:-}" != "--skip-sync" ]]; then
  node scripts/cloudflare/sync-r2.mjs
fi
npm run build
node scripts/cloudflare/write-assetsignore.mjs
npx --yes wrangler deploy -c cloudflare/wrangler.jsonc
