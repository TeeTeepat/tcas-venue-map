#!/usr/bin/env bash
# Build the static site and publish it to the VPS nginx root (served via Cloudflare Tunnel
# at https://tcas.teerapatk.com). Usage: scripts/deploy-vps.sh [--pull]
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${1:-}" == "--pull" ]] && git pull --ff-only
npm ci --silent --no-audit --no-fund 2>/dev/null || npm install --silent --no-audit --no-fund
npm run build >/tmp/tcas-build.log 2>&1 || { tail -30 /tmp/tcas-build.log; exit 1; }
rsync -a --delete out/ /var/www/tcas/
echo "deployed $(git rev-parse --short HEAD) -> /var/www/tcas ($(find /var/www/tcas -type f | wc -l) files)"
