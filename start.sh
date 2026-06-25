#!/bin/bash
# 剧本杀 · 一键启动
# 用法: ./start.sh          (构建 + 启动)
#       ./start.sh --dev    (跳过构建,直接启动)

set -e
cd "$(dirname "$0")"

if ! command -v pnpm &>/dev/null; then
  echo "Error: pnpm is not installed. Install it with: npm i -g pnpm" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example to .env and fill in your keys." >&2
  exit 1
fi

if [ "$1" != "--dev" ]; then
  echo "Building client..."
  pnpm --filter @mmg/client build
fi

echo "Starting server at http://localhost:8080"
echo "Press Ctrl+C to stop."
echo ""
pnpm --filter @mmg/server dev
