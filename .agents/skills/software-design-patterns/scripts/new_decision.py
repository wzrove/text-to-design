#!/usr/bin/env python3
"""Create a new design-decision record and update the index.

Usage:
    python3 scripts/new_decision.py "用 Strategy 替换支付渠道分支"
    python3 scripts/new_decision.py "..." --dir docs/design-decisions
    python3 scripts/new_decision.py "..." --supersedes 0003
    python3 scripts/new_decision.py --status 0003 已采纳
    python3 scripts/new_decision.py --status a1b2c3d4 已采纳

Only stdlib (Python 3.8+).

标识分两套并存（用户 2026-10-11 定案，见决策记录 a1b2c3d4）：
- 旧记录：0001–0039 的 4 位数字，文件名与引用一律不动；
- 新记录：`uuid4` 前 8 位十六进制。多人各自从同一基线开分支时，
  `max+1` 必然撞号，而 id 由随机数决定，跨分支不共享计数器所以不会撞。
占号用 `O_CREAT|O_EXCL`：同一分钟内两人各跑一次也只有一个赢家。
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
import sys
import uuid
from pathlib import Path

# 与 references/decision-log.md 的候选顺序一致，新增项目级目录时两处同步改。
CANDIDATE_DIRS = ("docs/design-decisions", "docs/adr", "docs/decisions", "ADR")
TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "decision-record-template.md"
# assets/decision-record-template.md 的状态取值，是封闭词表：写错状态会让日志无法被扫。
VALID_STATUSES = ("提议", "已采纳", "已被取代", "已废弃")
INDEX_HEADER = (
    "# 设计决策索引\n\n"
    "| 编号 | 标题 | 状态 | 影响范围 | 最后更新 |\n|---|---|---|---|---|\n"
)
LEGACY_RE = re.compile(r"^0*(\d{1,4})(?=[-. ]|$)")
SHORT_ID_RE = re.compile(r"^[0-9a-f]{8}$")
# 行首既可能是裸号 `| 0039 |`，也可能是带链接的 `| [0039](0039-xxx.md) |`：
# 只认前者会让新行一律掉到文件末尾（实测踩过），所以链接形态必须匹配。
ROW_RE = re.compile(r"\|\s*\[?(\d+|[0-9a-f]{8})\]?(?:\]\([^)]*\))?\s*\|")
STATUS_RE = re.compile(r"(?m)^(-\s*\*\*状态：\*\*\s*).*$")


def today() -> str:
    return datetime.date.today().isoformat()


def normalize_ident(value: str) -> str | None:
    """把用户写的各种形态归一成 id 字符串：`7`/`0007`/`0007-标题.md` -> `0007`；短 id 原样。"""
    v = str(value).strip().lower()
    if SHORT_ID_RE.match(v):
        return v
    match = LEGACY_RE.match(v)
    return f"{int(match.group(1)):04d}" if match else None


def ident_of(filename: str) -> str | None:
    """从文件名取标识：`a1b2c3d4-标题.md` -> `a1b2c3d4`，`0007-标题.md` -> `0007`。"""
    stem = filename.split(".md")[0]
    short = re.match(r"^([0-9a-f]{8})-", stem)
    if short:
        return short.group(1)
    return normalize_ident(stem)


def slug(title: str) -> str:
    """Filesystem-safe file-name fragment; keeps CJK, drops separators."""
    name = re.sub(r"[\s　]+", "-", title.strip())
    name = re.sub(r'[<>:"/\\|?*]', "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-.")
    return name or "decision"


def resolve_dir(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    for candidate in CANDIDATE_DIRS:
        if Path(candidate).is_dir():
            return Path(candidate)
    return Path(CANDIDATE_DIRS[0])


def claim_record(directory: Path, title: str) -> Path:
    """随机短 id + 独占创建：撞号（跨分支同 id 落到同一目录）就换一个重试。"""
    for _ in range(20):
        ident = uuid.uuid4().hex[:8]
        path = directory / f"{ident}-{slug(title)}.md"
        try:
            fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            continue
        os.close(fd)
        return path
    raise RuntimeError("连续 20 次短 id 都撞上了，检查目录里是不是已有同名文件")


def find_record(directory: Path, ident: str) -> Path | None:
    for path in sorted(directory.glob("*.md")):
        if path.name.startswith("INDEX"):
            continue
        if ident_of(path.name) == ident:
            return path
    return None


def set_record_status(directory: Path, ident: str, status: str) -> Path | None:
    """Flip a record's 状态 line. Returns the record path, or None if not found."""
    record = find_record(directory, ident)
    if record is None:
        return None
    text = record.read_text(encoding="utf-8")
    updated = STATUS_RE.sub(lambda m: m.group(1) + status, text, count=1)
    if updated != text:
        record.write_text(updated, encoding="utf-8")
    return record


def render(template: str, ident: str, title: str, supersedes: str | None) -> str:
    related = f"取代 {supersedes}" if supersedes else "N/A"
    return (template
            .replace("{序号}. {标题}", f"{ident}. {title}")
            .replace("{序号}", ident)
            .replace("{标题}", title)
            .replace("{YYYY-MM-DD}", today())
            .replace("{被取代的记录号，或 N/A}", related))


def row_ident(line: str) -> str | None:
    match = ROW_RE.match(line)
    if not match:
        return None
    raw = match.group(1)
    return raw if SHORT_ID_RE.match(raw) else f"{int(raw):04d}"


def set_index_status(directory: Path, ident: str, status: str) -> bool:
    """Rewrite the 状态 cell of one index row. False if INDEX/row missing."""
    index = directory / "INDEX.md"
    if not index.exists():
        return False
    lines = index.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, line in enumerate(lines):
        if row_ident(line) != ident:
            continue
        cells = line.rstrip("\n").split("|")
        # ['', 编号, 标题, 状态, 影响范围, 最后更新, '']
        if len(cells) < 6:
            return False
        cells[3] = f" {status} "
        lines[i] = "|".join(cells) + "\n"
        index.write_text("".join(lines), encoding="utf-8")
        return True
    return False


def update_index(directory: Path, ident: str, title: str) -> None:
    """Insert the row inside the table body — never after later sections.

    数字行按号插到该在的位置；短 id 行没有可比顺序，一律追加到表尾。
    """
    index = directory / "INDEX.md"
    if not index.exists():
        index.write_text(INDEX_HEADER, encoding="utf-8")
    row = f"| {ident} | {title} | 提议 | 待补充 | {today()} |\n"
    lines = index.read_text(encoding="utf-8").splitlines(keepends=True)

    insert_at = None
    last_row = None
    numeric = not SHORT_ID_RE.match(ident)
    for i, line in enumerate(lines):
        raw = row_ident(line)
        if raw is None:
            continue
        last_row = i
        if numeric and not SHORT_ID_RE.match(raw) and int(raw) > int(ident):
            insert_at = i
    if insert_at is None:
        # 没有更大的号：落在最后一行之表尾，仍在后续小节之前。
        insert_at = last_row + 1 if last_row is not None else len(lines)
    lines.insert(insert_at, row)
    index.write_text("".join(lines), encoding="utf-8")


def run_status(directory: Path, ident_arg: str, status: str) -> int:
    """Promote / retire an existing record without creating a new one."""
    if status not in VALID_STATUSES:
        print(f"error: 状态必须是 {' / '.join(VALID_STATUSES)}，收到 {status!r}", file=sys.stderr)
        return 1
    ident = normalize_ident(ident_arg)
    if ident is None:
        print(f"error: 标识应为 4 位数字或 8 位短 id，收到 {ident_arg!r}", file=sys.stderr)
        return 1
    record = set_record_status(directory, ident, status)
    if record is None:
        print(f"error: 找不到记录 {ident}（目录 {directory}）", file=sys.stderr)
        return 1
    print(f"status:  {record} (状态 -> {status})")
    if set_index_status(directory, ident, status):
        print(f"index:   {directory / 'INDEX.md'} (行状态已同步)")
    else:
        print(f"warning: {directory / 'INDEX.md'} 里没有 {ident} 这一行，请手工补",
              file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a design-decision record.")
    parser.add_argument("title", nargs="?", help="Decision title, in the project's language")
    parser.add_argument("--dir", help="Log directory (default: docs/design-decisions)")
    parser.add_argument("--supersedes", help="Id of the record this one replaces (数字或短 id)")
    parser.add_argument("--status", nargs=2, metavar=("标识", "状态"),
                        help="只改既有记录的状态，不新建：--status 0003 已采纳")
    args = parser.parse_args()

    if args.status:
        if args.title or args.supersedes:
            print("error: --status 不能与标题或 --supersedes 同时使用", file=sys.stderr)
            return 1
        return run_status(resolve_dir(args.dir), args.status[0], args.status[1])

    if not args.title:
        parser.error("缺少标题（或改用 --status 标识 状态）")

    if not TEMPLATE.exists():
        print(f"error: template not found at {TEMPLATE}", file=sys.stderr)
        return 1

    directory = resolve_dir(args.dir)
    directory.mkdir(parents=True, exist_ok=True)

    supersedes = args.supersedes
    if supersedes is not None:
        supersedes = normalize_ident(supersedes)
        if supersedes is None:
            print(f"error: --supersedes expects a record id, got {args.supersedes!r}",
                  file=sys.stderr)
            return 1

    path = claim_record(directory, args.title)
    ident = ident_of(path.name)
    path.write_text(render(TEMPLATE.read_text(encoding="utf-8"), ident, args.title, supersedes),
                    encoding="utf-8")
    update_index(directory, ident, args.title)

    if supersedes is not None:
        replaced = set_record_status(directory, supersedes, "已被取代")
        if replaced is None:
            print(f"warning: record {supersedes} not found; mark it 已被取代 by hand",
                  file=sys.stderr)
        else:
            set_index_status(directory, supersedes, "已被取代")
            print(f"superseded: {replaced} (状态 -> 已被取代)")
    print(f"created: {path}")
    print(f"index:   {directory / 'INDEX.md'}")
    print("next: fill in 压力 / 候选与排除 / 结论 / 实施方案 / 成本与退出条件 / 验证 / 变更历史")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
