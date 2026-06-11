#!/bin/bash
# 剧本杀 · 分发给朋友(一键公网)
# 双击运行:构建前端 → 起本地服务器 → 开 Cloudflare 隧道 → 复制公网链接给朋友
#
# 朋友只需点你拿到的 https://*.trycloudflare.com 链接,浏览器即玩,无需安装。
# 关闭:本窗口按 Ctrl+C,服务器与隧道一并退出。

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
CF_BIN="$HOME/.mmg/cloudflared"          # 本地私有安装,不污染系统
TUNNEL_LOG="$(mktemp -t mmg-tunnel.XXXXXX)"
SERVER_PID=""
TUNNEL_PID=""

# ── 统一清理:无论何种方式退出,都收掉子进程 + 临时文件 ──────────────
cleanup() {
  echo ""
  echo "🧹 正在关闭..."
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  # 兜底:确保端口释放
  lsof -ti:"$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
  rm -f "$TUNNEL_LOG" 2>/dev/null || true
  echo "✅ 已停止。"
}
trap cleanup EXIT INT TERM

echo "🎭 剧本杀 · 分发给朋友"
echo ""

# ── 0. 前置检查:pnpm ────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  echo "❌ 未找到 pnpm,请先安装:npm i -g pnpm"
  echo "按 Enter 关闭..."; read -r; exit 1
fi

# ── 1. 确保 cloudflared 就绪 ─────────────────────────────────────────
ensure_cloudflared() {
  # 已装(系统级或本地级)直接用
  if command -v cloudflared &>/dev/null; then
    CF_BIN="$(command -v cloudflared)"
    echo "✅ cloudflared (系统)就绪。"
    return
  fi
  if [ -x "$CF_BIN" ]; then
    echo "✅ cloudflared 就绪。"
    return
  fi

  echo "📥 首次使用,正在下载隧道工具 cloudflared(约 20MB,仅此一次)..."
  mkdir -p "$(dirname "$CF_BIN")"

  # 判断 CPU 架构
  local arch tgz_url
  arch="$(uname -m)"
  if [ "$arch" = "arm64" ]; then
    tgz_url="cloudflared-darwin-arm64.tgz"
  else
    tgz_url="cloudflared-darwin-amd64.tgz"
  fi

  local tmp_tgz
  tmp_tgz="$(mktemp -t cloudflared.XXXXXX).tgz"

  # 尝试多个下载源:GitHub 直连 → GitHub Mirror → Cloudflare 官方包仓库
  local -a urls=(
    "https://github.com/cloudflare/cloudflared/releases/latest/download/${tgz_url}"
    "https://ghgo.xyz/https://github.com/cloudflare/cloudflared/releases/latest/download/${tgz_url}"
    "https://pkg.cloudflare.com/${tgz_url}"
  )
  local downloaded=false
  for url in "${urls[@]}"; do
    echo "   尝试: ${url%%/*}/${url#*//}"  # 只显示域名部分
    if curl -fSL# --connect-timeout 10 --max-time 120 "$url" -o "$tmp_tgz" 2>&1; then
      downloaded=true
      break
    fi
    echo "   ✗ 此源失败,换下一个..."
    rm -f "$tmp_tgz"
  done

  if ! $downloaded; then
    echo ""
    echo "❌ 自动下载失败(可能网络受限)。请手动下载 cloudflared:"
    echo "   方式1:浏览器打开 https://github.com/cloudflare/cloudflared/releases/latest"
    echo "          下载 ${tgz_url},解压后把 cloudflared 放到:"
    echo "          ${CF_BIN}"
    echo "   方式2:安装 Homebrew (https://brew.sh) 后运行 brew install cloudflared"
    echo ""
    echo "按 Enter 关闭..."; read -r; exit 1
  fi

  tar -xzf "$tmp_tgz" -C "$(dirname "$CF_BIN")"
  rm -f "$tmp_tgz"
  chmod +x "$CF_BIN"
  # macOS Gatekeeper:移除隔离属性,避免首次运行被拦
  xattr -d com.apple.quarantine "$CF_BIN" 2>/dev/null || true
  echo "✅ cloudflared 就绪。"
  echo ""
}
ensure_cloudflared

# ── 2. 构建前端 ──────────────────────────────────────────────────────
echo "🔨 构建前端..."
pnpm --filter @mmg/client build
echo ""

# ── 3. 清理旧进程,后台起服务器 ──────────────────────────────────────
lsof -ti:"$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1
echo "🚀 启动本地服务器(localhost:$PORT)..."
PORT="$PORT" pnpm --filter @mmg/server dev &
SERVER_PID=$!

# 等服务器真正起来(最多 ~20s)
echo -n "   等待服务器就绪"
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/" -o /dev/null 2>/dev/null; then
    echo " ✓"; break
  fi
  echo -n "."; sleep 0.5
done
echo ""

# ── 4. 开隧道,抓取公网 URL ──────────────────────────────────────────
echo "🌐 开启公网隧道..."
"$CF_BIN" tunnel --no-autoupdate --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# 从日志里抓 https://*.trycloudflare.com(最多等 ~30s)
PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)"
  [ -n "$PUBLIC_URL" ] && break
  sleep 0.5
done

if [ -z "$PUBLIC_URL" ]; then
  echo "❌ 未能获取公网链接。隧道日志:"
  cat "$TUNNEL_LOG"
  exit 1
fi

# 复制到剪贴板
printf '%s' "$PUBLIC_URL" | pbcopy 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ 开局成功!把下面这个链接发给朋友:"
echo ""
echo "      $PUBLIC_URL"
echo ""
echo "  📋 链接已复制到剪贴板,可直接粘贴到群里。"
echo "  💡 朋友点开 → 输昵称 → 建房/输房间码即可加入。"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  ⚠️  保持本窗口开着、电脑别休眠,游戏才在线。"
echo "  ⚠️  按 Ctrl+C 结束(链接随之失效)。"
echo ""

# 本机也开一个,房主自己用
open "$PUBLIC_URL" 2>/dev/null || true

# ── 5. 守着,直到 Ctrl+C(任一子进程意外退出也一并收场)────────────
# 注:macOS 自带 Bash 3.2 不支持 wait -n,用 kill -0 轮询替代
while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$TUNNEL_PID" 2>/dev/null; do
  sleep 1
done
echo ""
echo "⚠️  某个进程已退出,正在收尾..."
