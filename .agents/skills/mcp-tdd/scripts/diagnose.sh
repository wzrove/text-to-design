#!/usr/bin/env bash
# text-to-design MCP 连接层排查：health / 端口 / 进程 / 日志，并给出分流结论
#
# 只读：不改文件、不重启任何进程、不联网（只打本机端口）。
# 依赖：bash、curl（可选）、ss 或 lsof 或 netstat（可选，缺失时降级为「无法确认监听」）。

usage() {
  cat <<'EOF'
diagnose.sh — text-to-design MCP 连接层排查（只读）

用法：
  diagnose.sh [-h|--help]

选项：
  -h, --help  显示本帮助

环境变量：
  TEXT_TO_DESIGN_MCP_HTTP_PORT   daemon HTTP 端口，默认 47820
  TEXT_TO_DESIGN_MCP_PORT        插件桥 WS 端口，默认 47812
  TEXT_TO_DESIGN_MCP_LOG         日志路径，默认 /tmp/text-to-design-mcp.log

退出码：
  0  daemon health 可达（注意：daemon 在线 ≠ 插件在线，仍需 jsd_ping 确认）
  1  daemon 不可达，或两个端口都没有监听（需按输出分流处理）
  2  用法错误

示例：
  diagnose.sh
  TEXT_TO_DESIGN_MCP_HTTP_PORT=47820 diagnose.sh
EOF
}

for arg in "$@"; do
  case "$arg" in
  -h | --help)
    usage
    exit 0
    ;;
  *)
    printf '未知参数: %s\n\n' "$arg" >&2
    usage >&2
    exit 2
    ;;
  esac
done

set -uo pipefail

HTTP_PORT="${TEXT_TO_DESIGN_MCP_HTTP_PORT:-47820}"
WS_PORT="${TEXT_TO_DESIGN_MCP_PORT:-47812}"
LOG="${TEXT_TO_DESIGN_MCP_LOG:-/tmp/text-to-design-mcp.log}"

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_BAD=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=''; C_BAD=''; C_WARN=''; C_DIM=''; C_OFF=''
fi
hdr() { printf '\n== %s ==\n' "$*"; }
dim() { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }

HEALTH_BODY=''
HEALTH_OK=0

hdr "1. daemon HTTP health (127.0.0.1:${HTTP_PORT}/health)"
if command -v curl >/dev/null 2>&1; then
  HEALTH_BODY="$(curl -sS -m 3 "http://127.0.0.1:${HTTP_PORT}/health" 2>&1)"
  if [ $? -eq 0 ] && [ -n "$HEALTH_BODY" ]; then
    HEALTH_OK=1
    printf '%s✓ health 可达%s\n' "$C_OK" "$C_OFF"
    dim "  $HEALTH_BODY"
  else
    printf '%s✗ health 不可达%s\n' "$C_BAD" "$C_OFF"
    dim "  $HEALTH_BODY"
  fi
else
  printf '%s! 未找到 curl，跳过%s\n' "$C_WARN" "$C_OFF"
fi

hdr "2. 端口监听 (:${HTTP_PORT} MCP HTTP / :${WS_PORT} 插件桥 WS)"
LISTEN=''
if command -v ss >/dev/null 2>&1; then
  LISTEN="$(ss -ltnp 2>/dev/null | grep -E ":(${HTTP_PORT}|${WS_PORT})[[:space:]]" || true)"
elif command -v lsof >/dev/null 2>&1; then
  LISTEN="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E ":(${HTTP_PORT}|${WS_PORT})" || true)"
elif command -v netstat >/dev/null 2>&1; then
  LISTEN="$(netstat -ltnp 2>/dev/null | grep -E ":(${HTTP_PORT}|${WS_PORT})" || true)"
fi
if [ -n "$LISTEN" ]; then
  printf '%s✓ 有进程在监听%s\n' "$C_OK" "$C_OFF"
  printf '%s\n' "$LISTEN" | while IFS= read -r l; do dim "  $l"; done
else
  printf '%s✗ 两个端口都没有监听（或缺少 ss/lsof/netstat）%s\n' "$C_WARN" "$C_OFF"
fi

hdr "3. 相关进程"
# 只认本项目进程；排除 AI 会话自身（其命令行里可能含 --mcp-config 里的同名字符串），
# 并把命令行截断，避免把无关的长参数刷到屏幕上。
PROCS="$(ps -eo pid,ppid,etime,args 2>/dev/null |
  grep -E 'text-to-design|mcp-server/dist/index\.js' |
  grep -v -E 'grep|electron|codebuddy|/opt/workbuddy/' |
  cut -c1-160 || true)"
if [ -n "$PROCS" ]; then
  printf '%s✓ 找到进程%s\n' "$C_OK" "$C_OFF"
  printf '%s\n' "$PROCS" | while IFS= read -r l; do dim "  $l"; done
  dim "  提示：daemon 为常驻单例；shim 每个 AI 会话一个。"
else
  printf '%s✗ 没有找到 daemon / shim 进程%s\n' "$C_WARN" "$C_OFF"
fi

hdr "4. 日志尾部 ($LOG)"
if [ -r "$LOG" ]; then
  dim "$(tail -30 "$LOG")"
  OCCUPIED="$(grep -c '被非 text-to-design MCP 服务占用' "$LOG" 2>/dev/null || true)"
  [ -z "$OCCUPIED" ] && OCCUPIED=0
else
  printf '%s! 日志不存在或不可读%s\n' "$C_WARN" "$C_OFF"
  OCCUPIED=0
fi

hdr "5. 结论与下一步"
if [ "$HEALTH_OK" = "1" ]; then
  printf '%s→ daemon 在线。%s\n' "$C_OK" "$C_OFF"
  dim "  但 daemon 在线 ≠ 插件在线。请调用 jsd_ping 确认："
  dim "    connected:true  → 正常，继续查代码层（references/troubleshooting.md Step 3）"
  dim "    工具表为空/只有 jsd_ping → 插件离线：去即时设计「插件 → 开发 → 重新运行」"
  dim "      加载 packages/ui/dist/jsdesign/manifest.json"
else
  printf '%s→ daemon 不可达。按顺序判断：%s\n' "$C_WARN" "$C_OFF"
  if [ "$OCCUPIED" != "0" ]; then
    dim "  日志出现 ${OCCUPIED} 次「端口被非 text-to-design MCP 服务占用」："
    dim "    先等 6s 重试（DAEMON_REPLACE_MS 替换窗口），不要立刻判定外来占用。"
  fi
  dim "  仍是不可达 → 直接发起一次 MCP 调用会按需拉起 daemon（shim 自动接管）。"
  if [ -z "$LISTEN" ] && [ -z "$PROCS" ]; then
    dim "  无进程且无监听：daemon 确实没起。检查 Node 可用性与 dist 是否构建过（pnpm build）。"
  else
    dim "  有进程/监听但 health 不通：可能是启动中或端口被别的服务占用，看上面第 2、4 段。"
  fi
fi
printf '\n'
dim "提醒：改了 shared/ 或 ui/ 后，只重启 daemon 完全无效——必须 pnpm build + 在即时设计重载插件。"

# 退出码：0 health 可达；1 不可达（无监听也算）
if [ "$HEALTH_OK" = "1" ]; then
  exit 0
fi
exit 1
