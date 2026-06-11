#!/bin/bash
cd "$(dirname "$0")"
echo "🎭 剧本杀 · 启动中..."
echo ""

# 检查 pnpm
if ! command -v pnpm &>/dev/null; then
  echo "❌ 未找到 pnpm，请先安装: npm i -g pnpm"
  echo "按 Enter 关闭..."
  read
  exit 1
fi

# 首次需要安装依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  pnpm install
  echo ""
fi

# 构建 client
echo "🔨 构建前端..."
pnpm --filter @mmg/client build
echo ""

# 清理旧进程
lsof -ti:8080 | xargs kill 2>/dev/null; sleep 1

# 启动
echo "✅ 服务器启动: http://localhost:8080"
echo "   浏览器将自动打开"
echo "   按 Ctrl+C 停止"
echo ""

# 自动打开浏览器
open http://localhost:8080 2>/dev/null || true

pnpm --filter @mmg/server dev
