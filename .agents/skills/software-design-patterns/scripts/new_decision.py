#!/usr/bin/env python3
"""Create a new numbered design-decision record and update the index.

Usage:
    python3 scripts/new_decision.py "用 Strategy 替换支付渠道分支"
    python3 scripts/new_decision.py "..." --dir docs/design-decisions
    python3 scripts/new_decision.py "..." --supersedes 0003
    python3 scripts/new_decision.py --status 0003 已采纳

Only stdlib (Python 3.8+). Safe to run repeatedly: numbering is derived from
existing files, never reuses a number, never overwrites an existing record.
"""
from __future__ import annotations

import argparse
import datetime
import re
import sys
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
ROW_RE = re.compile(r"\|\s*(\d+)\s*\|")
STATUS_RE = re.compile(r"(?m)^(-\s*\*\*状态：\*\*\s*).*$")


def today() -> str:
    return datetime.date.today().isoformat()


def parse_number(value: str) -> int | None:
    """Accept 7, 007, 0007, '0007-title.md' -> 7."""
    match = re.match(r"0*(\d+)", str(value).strip())
    return int(match.group(1)) if match else None


def slug(title: str) -> str:
    """Filesystem-safe file-name fragment; keeps CJK, drops separators."""
    name = re.sub(r"[\s\u3000]+", "-", title.strip())
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


def next_number(directory: Path) -> int:
    numbers = [int(m.group(1)) for p in directory.glob("[0-9]*.md")
               if (m := re.match(r"(\d+)", p.name))]
    return max(numbers) + 1 if numbers else 1


def find_record(directory: Path, number: int) -> Path | None:
    for path in sorted(directory.glob("*.md")):
        if path.name == "INDEX.md":
            continue
        if parse_number(path.name) == number:
            return path
    return None


def set_record_status(directory: Path, number: int, status: str) -> Path | None:
    """Flip a record's 状态 line. Returns the record path, or None if not found."""
    record = find_record(directory, number)
    if record is None:
        return None
    text = record.read_text(encoding="utf-8")
    updated = STATUS_RE.sub(lambda m: m.group(1) + status, text, count=1)
    if updated != text:
        record.write_text(updated, encoding="utf-8")
    return record


def render(template: str, number: int, title: str, supersedes: str | None) -> str:
    related = f"取代 {supersedes}" if supersedes else "N/A"
    return (template
            .replace("{序号}. {标题}", f"{number:04d}. {title}")
            .replace("{序号}", f"{number:04d}")
            .replace("{标题}", title)
            .replace("{YYYY-MM-DD}", today())
            .replace("{被取代的记录号，或 N/A}", related))


def set_index_status(directory: Path, number: int, status: str) -> bool:
    """Rewrite the 状态 cell of one index row. False if INDEX/row missing."""
    index = directory / "INDEX.md"
    if not index.exists():
        return False
    lines = index.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, line in enumerate(lines):
        match = ROW_RE.match(line)
        if match and int(match.group(1)) == number:
            cells = line.rstrip("\n").split("|")
            # ['', 编号, 标题, 状态, 影响范围, 最后更新, '']
            if len(cells) < 6:
                return False
            cells[3] = f" {status} "
            lines[i] = "|".join(cells) + "\n"
            index.write_text("".join(lines), encoding="utf-8")
            return True
    return False


def update_index(directory: Path, number: int, title: str) -> None:
    """Insert the row inside the table body — never after later sections."""
    index = directory / "INDEX.md"
    if not index.exists():
        index.write_text(INDEX_HEADER, encoding="utf-8")
    row = f"| {number:04d} | {title} | 提议 | 待补充 | {today()} |\n"
    lines = index.read_text(encoding="utf-8").splitlines(keepends=True)

    insert_at = None
    last_row = None
    for i, line in enumerate(lines):
        match = ROW_RE.match(line)
        if not match:
            continue
        last_row = i
        if insert_at is None and int(match.group(1)) > number:
            insert_at = i
    if insert_at is None:
        # No larger number yet: stay inside the table, before any later section.
        insert_at = last_row + 1 if last_row is not None else len(lines)
    lines.insert(insert_at, row)
    index.write_text("".join(lines), encoding="utf-8")


def run_status(directory: Path, number_arg: str, status: str) -> int:
    """Promote / retire an existing record without creating a new one."""
    if status not in VALID_STATUSES:
        print(f"error: 状态必须是 {' / '.join(VALID_STATUSES)}，收到 {status!r}", file=sys.stderr)
        return 1
    number = parse_number(number_arg)
    if number is None:
        print(f"error: 编号应为数字，收到 {number_arg!r}", file=sys.stderr)
        return 1
    record = set_record_status(directory, number, status)
    if record is None:
        print(f"error: 找不到记录 {number:04d}（目录 {directory}）", file=sys.stderr)
        return 1
    print(f"status:  {record} (状态 -> {status})")
    if set_index_status(directory, number, status):
        print(f"index:   {directory / 'INDEX.md'} (行状态已同步)")
    else:
        print(f"warning: {directory / 'INDEX.md'} 里没有 {number:04d} 这一行，请手工补",
              file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a design-decision record.")
    parser.add_argument("title", nargs="?", help="Decision title, in the project's language")
    parser.add_argument("--dir", help="Log directory (default: docs/design-decisions)")
    parser.add_argument("--supersedes", help="Number of the record this one replaces")
    parser.add_argument("--status", nargs=2, metavar=("编号", "状态"),
                        help="只改既有记录的状态，不新建：--status 0003 已采纳")
    args = parser.parse_args()

    if args.status:
        if args.title or args.supersedes:
            print("error: --status 不能与标题或 --supersedes 同时使用", file=sys.stderr)
            return 1
        return run_status(resolve_dir(args.dir), args.status[0], args.status[1])

    if not args.title:
        parser.error("缺少标题（或改用 --status 编号 状态）")

    if not TEMPLATE.exists():
        print(f"error: template not found at {TEMPLATE}", file=sys.stderr)
        return 1

    directory = resolve_dir(args.dir)
    directory.mkdir(parents=True, exist_ok=True)

    supersedes = args.supersedes
    if supersedes is not None:
        supersedes_number = parse_number(supersedes)
        if supersedes_number is None:
            print(f"error: --supersedes expects a record number, got {supersedes!r}",
                  file=sys.stderr)
            return 1
        supersedes = f"{supersedes_number:04d}"

    number = next_number(directory)
    path = directory / f"{number:04d}-{slug(args.title)}.md"
    path.write_text(render(TEMPLATE.read_text(encoding="utf-8"), number, args.title, supersedes),
                    encoding="utf-8")
    update_index(directory, number, args.title)

    if supersedes is not None:
        supersedes_number = parse_number(supersedes)
        replaced = set_record_status(directory, supersedes_number, "已被取代")
        if replaced is None:
            print(f"warning: record {supersedes} not found; mark it 已被取代 by hand",
                  file=sys.stderr)
        else:
            set_index_status(directory, supersedes_number, "已被取代")
            print(f"superseded: {replaced} (状态 -> 已被取代)")
    print(f"created: {path}")
    print(f"index:   {directory / 'INDEX.md'}")
    print("next: fill in 压力 / 候选与排除 / 结论 / 实施方案 / 成本与退出条件 / 验证 / 变更历史")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
