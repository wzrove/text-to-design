#!/usr/bin/env bash
# 分层验证 text-to-design 改动：typecheck -> 增量 lint -> smoke-split -> 基线比对
#
# 依赖：bash、git、pnpm、本地 tsx（仓库已装则无需 npx 联网）。
#       不联网、不交互；任何需要联网或确认的步骤都会直接失败并给出提示。

set -uo pipefail

usage() {
  cat <<'EOF'
verify.sh — 分层验证 text-to-design 的改动

用法：
  verify.sh [MODE] [--dry-run] [--json]

MODE（默认 all）：
  all         typecheck + lint + smoke（= 默认）
  typecheck   三包 tsc --noEmit（只查不产出）
  lint        只 lint 本次改动的文件（全仓 lint 有大量既有告警，别跑）
  smoke       跑 smoke-split，解析输出里的 `✗` 行
  baseline    用 git stash 跑「改动前」冒烟，diff 出**新增失败**

选项：
  --dry-run   预演 baseline 的 stash 流程，不真的 stash（仅对 baseline 有意义）
  --json      人类可读报告改走 stderr，stdout 只留一行 JSON 结论，便于程序消费
  -h, --help  显示本帮助

环境变量：
  JSD_REPO=/path/to/js-app   指定仓库根（默认从脚本位置向上找 pnpm-workspace.yaml）

退出码：
  0  验证通过（无失败项）
  1  验证失败（见输出里的 ✗ 与失败项列表）
  2  用法错误或环境错误（仓库根找不到、未知参数）

示例：
  verify.sh                        # 全量静态验证
  verify.sh smoke                  # 只跑冒烟
  verify.sh baseline               # 判定「既有失败」还是「本次引入」
  verify.sh baseline --dry-run     # 先看它打算做什么
  verify.sh all --json | jq .      # 结构化结论
EOF
}

MODE=""
DRY=0
JSON=0

for arg in "$@"; do
  case "$arg" in
  -h | --help)
    usage
    exit 0
    ;;
  --dry-run) DRY=1 ;;
  --json) JSON=1 ;;
  all | typecheck | lint | smoke | baseline) MODE="$arg" ;;
  *)
    printf '未知参数: %s\n\n' "$arg" >&2
    usage >&2
    exit 2
    ;;
  esac
done
MODE="${MODE:-all}"

# 人类可读报告走哪个 fd：默认 stdout；--json 时改走 stderr，把 stdout 留给 JSON
REPORT_FD=1
[ "$JSON" = "1" ] && REPORT_FD=2

if [ "$REPORT_FD" = "1" ] && [ -t 1 ]; then
  C_OK=$'\033[32m'; C_BAD=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
elif [ "$REPORT_FD" = "2" ] && [ -t 2 ]; then
  C_OK=$'\033[32m'; C_BAD=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=''; C_BAD=''; C_WARN=''; C_DIM=''; C_OFF=''
fi

note() { printf '%s\n' "$*" >&"$REPORT_FD"; }
ok() { printf '%s✓ %s%s\n' "$C_OK" "$*" "$C_OFF" >&"$REPORT_FD"; }
bad() { printf '%s✗ %s%s\n' "$C_BAD" "$*" "$C_OFF" >&"$REPORT_FD"; }
warn() { printf '%s! %s%s\n' "$C_WARN" "$*" "$C_OFF" >&"$REPORT_FD"; }
dim() { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF" >&"$REPORT_FD"; }

# ---------- 定位仓库根 ----------
find_root() {
  if [ -n "${JSD_REPO:-}" ]; then
    printf '%s\n' "$JSD_REPO"
    return
  fi
  local d
  d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while [ "$d" != "/" ]; do
    if [ -f "$d/pnpm-workspace.yaml" ]; then
      printf '%s\n' "$d"
      return
    fi
    d="$(dirname "$d")"
  done
}

ROOT="$(find_root)"
if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  printf '✗ 找不到仓库根（未发现 pnpm-workspace.yaml）。\n  用 JSD_REPO=/path/to/js-app 指定。\n' >&2
  exit 2
fi
note "仓库根: $ROOT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILED=()
PLAN_ONLY=0

# ---------- tsx 解析：优先本地，避免 npx 联网/交互挂起 ----------
# npx 在包缺失时会问 "Ok to proceed?" 并阻塞；非交互环境下必须避免。
resolve_tsx() {
  local c
  for c in "$ROOT/packages/mcp-server/node_modules/.bin/tsx" "$ROOT/node_modules/.bin/tsx"; do
    [ -x "$c" ] && {
      printf '%s\n' "$c"
      return 0
    }
  done
  return 1
}
TSX="$(resolve_tsx || true)"

# ---------- 1. typecheck ----------
run_typecheck() {
  note ""
  note "== 1/3 typecheck (pnpm run typecheck) =="
  (cd "$ROOT" && pnpm run typecheck) >"$TMP/typecheck.txt" 2>&1
  local rc=$?
  if [ $rc -eq 0 ]; then
    ok "typecheck 通过"
  else
    bad "typecheck 失败 (exit=$rc)"
    grep -E 'error TS|Error:' "$TMP/typecheck.txt" | head -30 | while IFS= read -r l; do dim "  $l"; done
    FAILED+=(typecheck)
  fi
}

# ---------- 2. 增量 lint ----------
run_lint() {
  note ""
  note "== 2/3 lint（仅改动文件，别跑全仓）=="
  local files=()
  while IFS= read -r f; do
    [ -n "$f" ] && files+=("$f")
  done < <({
    git -C "$ROOT" diff --name-only HEAD --diff-filter=ACMR 2>/dev/null
    git -C "$ROOT" ls-files -o --exclude-standard 2>/dev/null
  } | sort -u |
    grep -E '\.(ts|tsx|mts|cts|js|mjs|json|jsonc)$' |
    grep -v -E '(^|/)dist/|node_modules/' || true)

  if [ "${#files[@]}" -eq 0 ]; then
    warn "没有待 lint 的改动文件（工作区干净？），跳过"
    return
  fi
  note "改动文件:"
  printf '%s\n' "${files[@]}" | while IFS= read -r f; do dim "  $f"; done

  (cd "$ROOT" && pnpm exec biome check "${files[@]}") >"$TMP/lint.txt" 2>&1
  local rc=$?
  if [ $rc -eq 0 ]; then
    ok "biome check 通过"
  else
    bad "biome check 失败 (exit=$rc)"
    tail -30 "$TMP/lint.txt" | while IFS= read -r l; do dim "  $l"; done
    FAILED+=(lint)
  fi
}

# ---------- 3. smoke-split ----------
# smoke-split.ts 没有 process.exit，失败只体现在输出里的 `✗` 行，所以解析输出而非退出码。
smoke_once() {
  local out="$1" rc
  if [ -z "$TSX" ]; then
    printf '✗ 找不到可执行的 tsx（试过 packages/mcp-server/node_modules/.bin/tsx 与 node_modules/.bin/tsx）。\n  先在同一仓库执行 pnpm install，不要依赖 npx 联网下载。\n' >"$out"
    printf '127'
    return
  fi
  (cd "$ROOT/packages/mcp-server" && "$TSX" smoke-split.ts) >"$out" 2>&1
  printf '%s' "$?"
}

run_smoke() {
  local out="${1:-$TMP/smoke.txt}" quiet="${2:-0}"
  local rc bad_n
  rc="$(smoke_once "$out")"
  bad_n="$(grep -c '✗' "$out" 2>/dev/null || true)"
  [ -z "$bad_n" ] && bad_n=0

  if [ "$quiet" = "1" ]; then
    # tsx 缺失时不能报 0（会被 baseline 误判成「零失败」），用 127 显式区分
    if [ "$rc" = "127" ]; then
      printf '127'
    else
      printf '%s' "$bad_n"
    fi
    return
  fi

  note ""
  note "== 3/3 smoke-split（入参→下发 method/params）=="
  if [ "$rc" = "127" ]; then
    bad "tsx 不可用，冒烟未执行"
    head -3 "$out" | while IFS= read -r l; do dim "  $l"; done
    FAILED+=(smoke)
    return
  fi
  if [ "$bad_n" = "0" ] && [ "$rc" = "0" ]; then
    ok "smoke-split 全通过（0 个 ✗）"
  else
    bad "smoke-split 有 $bad_n 个 ✗（进程退出码 $rc）"
    grep '✗' "$out" | head -20 | while IFS= read -r l; do dim "  $l"; done
    FAILED+=(smoke)
  fi
  note ""
  dim "  末段输出:"
  tail -12 "$out" | while IFS= read -r l; do dim "  $l"; done
  dim "  完整输出: $out（本脚本退出后临时目录会被清理）"
}

# ---------- 基线比对 ----------
STASH_MSG="jsd-verify-baseline"

run_baseline() {
  note ""
  note "== baseline：用 git stash 跑改动前基线，diff 出新增失败 =="

  # tsx 不可用时前后签名都会是空的，会硬得出「无新增失败」的假结论——先挡掉
  if [ -z "$TSX" ]; then
    bad "找不到可执行的 tsx，无法取基线（跑 baseline 会得出假结论）"
    dim "  先在同一仓库执行 pnpm install，再重跑。"
    FAILED+=(baseline)
    return
  fi

  local dirty
  dirty="$(git -C "$ROOT" status --porcelain 2>/dev/null)"
  if [ -z "$dirty" ]; then
    warn "工作区干净，无改动可比对；只跑一次当前 smoke"
    run_smoke
    return
  fi

  # 幂等守卫：上次若未恢复，直接停下，避免多层 stash 叠在一起（比「先 stash 再说」安全）
  if git -C "$ROOT" stash list 2>/dev/null | grep -q "$STASH_MSG"; then
    bad "已存在名为 $STASH_MSG 的 stash —— 上次很可能没恢复成功"
    dim "  先处理，再重跑："
    dim "    git -C $ROOT stash list"
    dim "    git -C $ROOT stash pop      # 确认改动回来后，删掉该 stash"
    FAILED+=(baseline)
    return
  fi

  if [ "$DRY" = "1" ]; then
    note "（--dry-run）将执行："
    dim "  1) git -C $ROOT stash push --include-untracked -m $STASH_MSG"
    dim "  2) 跑一次 smoke-split，记录 ✗ 签名作为「改动前」基线"
    dim "  3) git -C $ROOT stash pop   # 立刻恢复改动"
    dim "  4) 再跑一次 smoke-split，diff 出**新增失败**"
    dim "  未改动任何东西。去掉 --dry-run 即真的执行。"
    PLAN_ONLY=1
    return
  fi

  warn "即将 git stash 全部改动（含未跟踪文件）以获取基线，随后立即 git stash pop。"
  warn "若脚本被中断，用 'git stash list' 找到 $STASH_MSG 并手动 pop。"

  git -C "$ROOT" stash push --include-untracked -q -m "$STASH_MSG" >"$TMP/stashpush.txt" 2>&1
  if [ $? -ne 0 ]; then
    bad "git stash push 失败，放弃基线比对"
    dim "  $(cat "$TMP/stashpush.txt")"
    FAILED+=(baseline)
    return
  fi

  smoke_once "$TMP/smoke-before.txt" >/dev/null
  grep '✗' "$TMP/smoke-before.txt" 2>/dev/null | sed -E 's/[0-9]+/N/g' | sort -u >"$TMP/before.sig"
  local before_n
  before_n="$(wc -l <"$TMP/before.sig" | tr -d ' ')"

  git -C "$ROOT" stash pop -q >"$TMP/stashpop.txt" 2>&1
  if [ $? -ne 0 ]; then
    bad "git stash pop 失败！改动可能仍在 stash 中。"
    dim "  $(cat "$TMP/stashpop.txt")"
    dim "  手动恢复: git -C $ROOT stash list  ->  git -C $ROOT stash pop"
    FAILED+=(baseline)
    return
  fi
  ok "改动已恢复（stash pop）"

  smoke_once "$TMP/smoke-after.txt" >/dev/null
  grep '✗' "$TMP/smoke-after.txt" 2>/dev/null | sed -E 's/[0-9]+/N/g' | sort -u >"$TMP/after.sig"
  local after_n new_n
  after_n="$(wc -l <"$TMP/after.sig" | tr -d ' ')"
  new_n="$(comm -13 "$TMP/before.sig" "$TMP/after.sig" | wc -l | tr -d ' ')"

  note ""
  dim "  改动前 ✗ 签名: $before_n 条"
  dim "  改动后 ✗ 签名: $after_n 条"
  if [ "$new_n" = "0" ]; then
    ok "无新增失败（改动前后失败集合一致）"
    dim "  既有失败属历史问题，超出本次范围，不要顺手改。"
  else
    bad "新增 $new_n 条失败："
    comm -13 "$TMP/before.sig" "$TMP/after.sig" | while IFS= read -r l; do dim "  $l"; done
    FAILED+=(baseline)
  fi
}

# ---------- 主流程 ----------
case "$MODE" in
all)
  run_typecheck
  run_lint
  run_smoke
  ;;
typecheck) run_typecheck ;;
lint) run_lint ;;
smoke) run_smoke ;;
baseline) run_baseline ;;
esac

# ---------- 结论 ----------
if [ "${#FAILED[@]}" -eq 0 ]; then
  note ""
  if [ "$PLAN_ONLY" = "1" ]; then
    # 预演不是验证，别给出「无失败项」这种会被误读的结论
    ok "仅预演：未执行验证、未改动工作区"
    [ "$JSON" = "1" ] && printf '{"mode":"%s","ok":true,"planned":true,"failed":[]}\n' "$MODE"
    exit 0
  fi
  ok "验证结束：无失败项"
  note ""
  note "下一步（别忘了第 5 步）："
  note "  1) 改过 shared/ 或 ui/ → 在即时设计里「插件 → 开发 → 重新运行」重载插件"
  note "     加载 packages/ui/dist/jsdesign/manifest.json"
  note "  2) 跑一次最小 MCP 调用实测（jsd_ping 起步）"
  note "  3) 记账（handle）并补 platform-limits 清单 —— 见 references/bookkeeping.md"
  note "     台账主库碍事时才另跑 archive（独立节奏，不是每轮动作）"
  if [ "$JSON" = "1" ]; then
    printf '{"mode":"%s","ok":true,"failed":[]}\n' "$MODE"
  fi
  exit 0
fi

note ""
bad "验证结束：失败项 ${FAILED[*]}"
if [ "$JSON" = "1" ]; then
  failed_json=""
  for f in "${FAILED[@]}"; do
    [ -n "$failed_json" ] && failed_json="$failed_json,"
    failed_json="$failed_json\"$f\""
  done
  printf '{"mode":"%s","ok":false,"failed":[%s]}\n' "$MODE" "$failed_json"
fi
exit 1
