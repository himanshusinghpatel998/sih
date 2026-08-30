#!/usr/bin/env python3
"""
Recursively walk the current directory (or a given directory) and
strip emoji characters from every text file found.

Usage:
    python remove_emojis.py          # process current directory
    python remove_emojis.py /path/to/dir
    python remove_emojis.py --dry-run   # show what would change, don't write
"""

import os
import re
import sys

# Broad ranges covering most emoji blocks + variation selectors + ZWJ
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # regional indicators (flags)
    "\U00002700-\U000027BF"  # dingbats
    "\U0001F900-\U0001F9FF"  # supplemental symbols & pictographs
    "\U00002600-\U000026FF"  # miscellaneous symbols
    "\U0001FA70-\U0001FAFF"  # symbols & pictographs extended-A
    "\U0001F000-\U0001F0FF"  # mahjong / dominoes / playing cards
    "\U0001F200-\U0001F2FF"  # enclosed ideographic supplement
    "\U0001F780-\U0001F7FF"  # geometric shapes extended
    "\U0001F800-\U0001F8FF"  # supplemental arrows-C
    "\U0000FE00-\U0000FE0F"  # variation selectors
    "\U0000200D"              # zero-width joiner (used in combined emoji)
    "\U00002190-\U000021FF"  # arrows (optional, some emoji use these)
    "]+",
    flags=re.UNICODE,
)

# Directories to always skip
SKIP_DIRS = {".git", ".svn", ".hg", "node_modules", "__pycache__", ".venv", "venv"}


def remove_emojis(text: str) -> str:
    return EMOJI_PATTERN.sub("", text)


def process_file(filepath: str, dry_run: bool = False) -> bool:
    """Return True if the file was (or would be) changed."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except (UnicodeDecodeError, PermissionError, OSError, IsADirectoryError):
        # Binary file, unreadable, or some other issue -> skip silently
        return False

    new_content = remove_emojis(content)
    if new_content != content:
        if not dry_run:
            try:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
            except (PermissionError, OSError) as e:
                print(f"  [skip - write failed] {filepath}: {e}")
                return False
        return True
    return False


def main(root_dir: str = ".", dry_run: bool = False):
    changed_files = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # prune skip dirs in-place so os.walk doesn't descend into them
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            if process_file(filepath, dry_run=dry_run):
                changed_files.append(filepath)

    verb = "Would change" if dry_run else "Changed"
    print(f"\n{verb} {len(changed_files)} file(s):")
    for f in changed_files:
        print(f"  {f}")

    if not changed_files:
        print("No emojis found.")


if __name__ == "__main__":
    args = sys.argv[1:]
    dry_run_flag = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    root = args[0] if args else "."

    main(root, dry_run=dry_run_flag)
