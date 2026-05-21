"""
import_new_refs.py — Promote new_references entries from material JSONs into
references/index.json.

Usage:
    python tools/import_new_refs.py                    # dry-run: show what would be added
    python tools/import_new_refs.py --write            # merge into references/index.json
    python tools/import_new_refs.py path/file.json     # single file, dry-run
    python tools/import_new_refs.py path/file.json --write  # single file, write

Exits with code 0 always (this is a promotion tool, not a validator).
"""

import json
import glob
import argparse
from pathlib import Path

ROOT = Path(__file__).parent.parent
REFERENCES_PATH = ROOT / "references" / "index.json"
MATERIALS_GLOB = str(ROOT / "materials" / "**" / "*.json")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def collect_new_refs(files):
    """Scan files for new_references entries; return {key: (entry, source_path)}."""
    found = {}
    for filepath in files:
        path = Path(filepath)
        if path.name == "index.json":
            continue
        try:
            data = load_json(path)
        except (json.JSONDecodeError, OSError):
            continue
        for key, entry in data.get("new_references", {}).items():
            if key not in found:
                found[key] = (entry, path)
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", help="Material JSON paths (default: all materials)")
    parser.add_argument("--write", action="store_true", help="Write changes to references/index.json")
    args = parser.parse_args()

    files = args.files if args.files else glob.glob(MATERIALS_GLOB, recursive=True)
    new_refs = collect_new_refs(files)

    if not new_refs:
        print("No new_references found in any material file.")
        return

    index = load_json(REFERENCES_PATH)
    to_add = []
    to_skip = []

    for key, (entry, source) in sorted(new_refs.items()):
        rel = source.relative_to(ROOT)
        if key in index:
            to_skip.append(key)
            print(f"SKIP  {key}  (already in index)  [{rel}]")
        else:
            to_add.append((key, entry))
            print(f"ADD   {key}  [{rel}]")

    print(f"\n{len(to_add)} to add, {len(to_skip)} already present", end="")

    if not args.write:
        print(" — dry run, pass --write to apply")
        return

    print()

    for key, entry in to_add:
        index[key] = entry

    index = dict(sorted(index.items()))
    with open(REFERENCES_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Written {REFERENCES_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
