#!/usr/bin/env bash
# 历史归档查看器：定位冻结的 BUG 记录 / 已修复归档，列条目、统计行数，
# 并汇总 mcp-tdd 台账的未决 / 复发 / 已闭环计数。
#
# 只读：不改文档、不移动条目、不写台账。依赖：bash、grep、find（可选）、node（可选）。
# 记账的唯一写入通道是 scripts/mcp-tdd.mjs —— 本脚本不承担写入职责。

usage() {
  cat <<'EOF'
buglog.sh — 查看冻结归档 + 汇总台账状态（只读）

用法：
  buglog.sh [--limit N]

选项：
  --limit N   每个文档最多列 N 条条目（默认 40；仅为控制输出体积，不影响统计）
  -h, --help  显示本帮助

环境变量：
  T2D_DOC_DIR=/path       指定归档文档所在目录（优先于自动查找）
  MCP_TDD_ROOT=/path      台账根目录（默认仓库根，台账在 <root>/docs/mcp-errors）
  T2D_NO_LEDGER=1         跳过台账汇总（不跑 node）

退出码：
  0  至少找到一份文档（统计与提醒已完成）
  1  两份文档都没找到（用 T2D_DOC_DIR=/path 指定目录）
  2  用法错误

示例：
  buglog.sh
  buglog.sh --limit 10
  T2D_DOC_DIR=/path/to/docs buglog.sh
EOF
}

LIMIT=40
while [ "$#" -gt 0 ]; do
  case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
  --limit)
    if [ -z "${2:-}" ] || ! printf '%s' "$2" | grep -q '^[0-9][0-9]*$'; then
      printf '错误：--limit 需要一个非负整数，收到 "%s"\n\n' "${2:-<空>}" >&2
      usage >&2
      exit 2
    fi
    LIMIT="$2"
    shift 2
    ;;
  *)
    printf '未知参数: %s\n\n' "$1" >&2
    usage >&2
    exit 2
    ;;
  esac
done

set -uo pipefail

DOC_DIR="${T2D_DOC_DIR:-}"

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_BAD=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=''; C_BAD=''; C_WARN=''; C_DIM=''; C_OFF=''
fi
hdr() { printf '\n== %s ==\n' "$*"; }
dim() { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }

BUG_NAME='text-to-design-mcp-BUG记录.md'
ARCH_NAME='text-to-design-mcp-已修复归档.md'

locate_doc() {
  local name="$1" d
  if [ -n "$DOC_DIR" ]; then
    [ -f "$DOC_DIR/$name" ] && { printf '%s\n' "$DOC_DIR/$name"; return; }
  fi
  # 技能目录下的 archive/ → 技能目录 → 仓库 docs/ → 仓库根 → 当前目录
  # （归档唯一副本在 <skill>/archive/；不再搜个人目录，避免出现「看不见的第二份真相」）
  local self
  self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for d in "$self/../archive" "$self/.." "$self/../../../../docs" "$self/../../../.." "$PWD" "$PWD/docs"; do
    if [ -f "$d/$name" ]; then
      # 归一化输出路径(消掉候选里的 ../),报告里可读
      (cd "$d" && printf '%s/%s\n' "$(pwd)" "$name")
      return
    fi
  done
}

BUG="$(locate_doc "$BUG_NAME")"
ARCH="$(locate_doc "$ARCH_NAME")"

hdr "归档文档定位（冻结只读）"
if [ -n "$BUG" ]; then
  printf '%s✓ 历史待修记录(冻结): %s%s\n' "$C_OK" "$BUG" "$C_OFF"
else
  printf '%s✗ 未找到 %s（用 T2D_DOC_DIR=/path 指定目录）%s\n' "$C_BAD" "$BUG_NAME" "$C_OFF"
fi
if [ -n "$ARCH" ]; then
  printf '%s✓ 历史已修复归档(冻结): %s%s\n' "$C_OK" "$ARCH" "$C_OFF"
else
  printf '%s! 未找到 %s%s\n' "$C_WARN" "$ARCH_NAME" "$C_OFF"
fi
[ -z "$BUG$ARCH" ] && exit 1

report() {
  local label="$1" path="$2"
  [ -n "$path" ] || return
  local lines entries
  lines="$(wc -l <"$path" | tr -d ' ')"
  entries="$(grep -cE '^#{2,3} P[0-9]+' "$path" 2>/dev/null)"
  [ -n "$entries" ] || entries=0
  hdr "$label  ($path)"
  dim "  行数: $lines    条目数: $entries"
  # 条目列表按 LIMIT 截断，避免归档变长后把输出顶到工具截断阈值
  ENTRIES="$(grep -nE '^#{2,3} P[0-9]+' "$path" 2>/dev/null || true)"
  if [ -n "$ENTRIES" ]; then
    printf '%s\n' "$ENTRIES" | head -n "$LIMIT" | sed -E 's/^/  /' | while IFS= read -r l; do dim "$l"; done
    if [ "$entries" -gt "$LIMIT" ]; then
      dim "  …还有 $((entries - LIMIT)) 条未列出（--limit $entries 可全列）"
    fi
  fi
}

report "历史待修主体（冻结）" "$BUG"
report "历史已修复归档（冻结）" "$ARCH"

if [ -n "$BUG" ] && [ -n "$ARCH" ]; then
  hdr "疑似重复条目（待修与归档同号）"
  BUG_IDS="$(grep -oE '^#{2,3} P[0-9]+' "$BUG" 2>/dev/null | grep -oE 'P[0-9]+' | sort -u)"
  ARCH_IDS="$(grep -oE '^#{2,3} P[0-9]+' "$ARCH" 2>/dev/null | grep -oE 'P[0-9]+' | sort -u)"
  DUP="$(comm -12 <(printf '%s\n' "$BUG_IDS") <(printf '%s\n' "$ARCH_IDS") | grep -v '^$' || true)"
  if [ -n "$DUP" ]; then
    printf '%s! 以下编号同时出现在待修与归档中，确认是否漏移：%s\n' "$C_WARN" "$C_OFF"
    printf '%s\n' "$DUP" | while IFS= read -r l; do dim "  $l"; done
  else
    printf '%s✓ 无同号冲突%s\n' "$C_OK" "$C_OFF"
  fi
fi

hdr "台账状态（唯一记账通道）"
if [ "${T2D_NO_LEDGER:-}" = "1" ]; then
  dim "  已跳过（T2D_NO_LEDGER=1）"
else
  CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mcp-tdd.mjs"
  if [ ! -f "$CLI" ]; then
    printf '%s! 未找到 %s，跳过台账汇总%s\n' "$C_WARN" "$CLI" "$C_OFF"
  elif ! command -v node >/dev/null 2>&1; then
    printf '%s! 未找到 node，跳过台账汇总%s\n' "$C_WARN" "$C_OFF"
  else
    SUMMARY="$(node "$CLI" list 2>/dev/null | head -n 1)"
    if [ -n "$SUMMARY" ]; then
      printf '%s%s%s\n' "$C_OK" "$SUMMARY" "$C_OFF"
    else
      printf '%s! 台账不可读或未初始化（node %s init）%s\n' "$C_WARN" "$CLI" "$C_OFF"
    fi
    dim "  明细: node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs list"
  fi
fi

hdr "记账口径"
dim "  1. 报错只进 docs/mcp-errors 台账（record / handle），不再手写 md。"
dim "  2. 本脚本只看不改：archive/ 两份 md 已冻结，行数只增不减即异常。"
dim "  3. 已修复并回归通过的指纹由 handle 闭环；平台限制清单在 references/platform-limits.md。"
dim "  4. 字段对照与历史遗留见 references/bookkeeping.md。"
printf '\n'
