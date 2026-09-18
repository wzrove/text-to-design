#!/usr/bin/env python3
"""Create a new numbered design-decision record and update the index.

Usage:
    python3 scripts/new_decision.py "用 Strategy 替换支付渠道分支"
    python3 scripts/new_decision.py "..." --dir docs/design-decisions
    python3 scripts/new_decision.py "..." --supersedes 0003

Only stdlib. Safe to run repeatedly: numbering is derived from existing files,
never reuses a number, never overwrites an existing record.
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

CANDIDATE_DIRS = ("docs/design-decisions", "docs/decisions", "docs/adr")
TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "decision-record-template.md"


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


def render(template: str, number: int, title: str, supersedes: str | None) -> str:
    today = datetime.date.today().isoformat()
    related = f"取代 {supersedes}" if supersedes else "N/A"
    return (template
            .replace("{序号}. {标题}", f"{number:04d}. {title}")
            .replace("{序号}", f"{number:04d}")
            .replace("{标题}", title)
            .replace("{YYYY-MM-DD}", today)
            .replace("{被取代的记录号，或 N/A}", related))


def update_index(directory: Path, number: int, title: str) -> None:
    index = directory / "INDEX.md"
    if not index.exists():
        index.write_text(
            "# 设计决策索引\n\n"
            "| 编号 | 标题 | 状态 | 影响范围 | 最后更新 |\n|---|---|---|---|---|\n",
            encoding="utf-8")
    row = f"| {number:04d} | {title} | 提议 | 待补充 | {datetime.date.today().isoformat()} |\n"
    lines = index.read_text(encoding="utf-8").splitlines(keepends=True)
    insert_at = len(lines)
    for i, line in enumerate(lines):
        if re.match(r"\|\s*(\d{4})\s*\|", line) and int(re.match(r"\|\s*(\d{4})", line).group(1)) > number:
            insert_at = i
            break
    lines.insert(insert_at, row)
    index.write_text("".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a design-decision record.")
    parser.add_argument("title", help="Decision title, in the project's language")
    parser.add_argument("--dir", help="Log directory (default: docs/design-decisions)")
    parser.add_argument("--supersedes", help="Number of the record this one replaces")
    args = parser.parse_args()

    if not TEMPLATE.exists():
        print(f"error: template not found at {TEMPLATE}", file=sys.stderr)
        return 1

    directory = resolve_dir(args.dir)
    directory.mkdir(parents=True, exist_ok=True)

    number = next_number(directory)
    path = directory / f"{number:04d}-{args.title.replace(' ', '-')}.md"
    path.write_text(render(TEMPLATE.read_text(encoding="utf-8"), number, args.title, args.supersedes),
                    encoding="utf-8")
    update_index(directory, number, args.title)

    print(f"created: {path}")
    print(f"index:   {directory / 'INDEX.md'}")
    print("next: fill in 压力 / 候选与排除 / 结论 / 最小落地 / 成本与退出条件 / 验证")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
