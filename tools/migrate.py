"""
migrate.py — Migrate all material JSON files to the current schema version.

Dry-run by default: prints what would change without writing.
Pass --write to apply migrations to disk.

Usage:
    python tools/migrate.py               # dry-run: show what would change
    python tools/migrate.py --write       # apply migrations in place
    python tools/migrate.py path/to/file.json --write  # single file

To add a migration when bumping the schema to v2:
    1. Increment CURRENT_VERSION to 2.
    2. Append a migration to MIGRATIONS:
           {"from": 1, "migrate": migrate_v1_to_v2}
    3. Define the migration function below.
    4. Make the same change in js/core/schema.js.

WARNING: --write re-serializes each touched file with json.dump(), which
does NOT preserve materials/'s hand-formatted compact style (single-line
valued_property objects, blank-line grouping, etc.) — unlike
tools/compare_refs.py's patch_material(), a structural migration can't be
applied as a narrow text patch. Review `git diff` and reformat touched
files to match their siblings before committing.
"""

import json
import sys
import glob
import copy
from pathlib import Path

ROOT = Path(__file__).parent.parent
MATERIALS_GLOB = str(ROOT / "materials" / "**" / "*.json")

# ── Version table ────────────────────────────────────────────────────────────

CURRENT_VERSION = 1

# Each entry: {"from": N, "migrate": callable(obj) -> obj}
# The callable receives a deep copy and must set schema_version to N+1.
MIGRATIONS = [
    # Example for future use:
    # {"from": 1, "migrate": migrate_v1_to_v2},
]

# ── Migration functions ───────────────────────────────────────────────────────

# def migrate_v1_to_v2(obj):
#     obj["schema_version"] = 2
#     obj["new_field"] = None
#     return obj

# ── Core logic ────────────────────────────────────────────────────────────────

def migrate_to_latest(data):
    """Return a migrated copy of data, or the same object if already current."""
    obj = copy.deepcopy(data)
    version = obj.get("schema_version", 1)

    # Loop to a fixed point rather than a single pass over MIGRATIONS, so a
    # multi-step chain (v1->v2->v3->...) applies fully regardless of the
    # order migrations were appended. Capped at len(MIGRATIONS) iterations —
    # each migration must advance schema_version at least once, so that's a
    # safe upper bound and guards against an infinite loop if one doesn't.
    # Keep this in sync with js/core/schema.js's migrateToLatest().
    for _ in range(len(MIGRATIONS)):
        if version >= CURRENT_VERSION:
            break
        step = next((s for s in MIGRATIONS if s["from"] == version), None)
        if step is None:
            break
        obj = step["migrate"](obj)
        version = obj.get("schema_version", version)

    return obj


def process_file(path, write=False):
    """
    Migrate a single file.
    Returns (status, message) where status is 'ok', 'migrated', or 'error'.
    """
    path = Path(path)
    try:
        with open(path, encoding="utf-8") as f:
            original = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        return "error", str(e)

    version = original.get("schema_version", 1)

    if version == CURRENT_VERSION:
        return "ok", f"already v{CURRENT_VERSION}"

    if version > CURRENT_VERSION:
        return "error", f"schema_version {version} is newer than CURRENT_VERSION {CURRENT_VERSION}"

    migrated = migrate_to_latest(original)
    new_version = migrated.get("schema_version", version)

    if write:
        # NOTE: this is a full json.dump() round-trip, which does NOT preserve
        # the hand-formatted compact style used throughout materials/ (single-
        # line valued_property objects, deliberate blank lines, etc.) — a real
        # migration (structural add/rename/remove) can't be applied as a
        # narrow text patch the way compare_refs.py's single-value patcher
        # can. Every file this touches WILL need a manual formatting pass
        # (`git diff` + reformat to match sibling files) before committing.
        with open(path, "w", encoding="utf-8") as f:
            json.dump(migrated, f, indent=2, ensure_ascii=False)
            f.write("\n")
        return "migrated", f"v{version} → v{new_version} (written — formatting NOT preserved, review git diff before committing)"
    else:
        return "migrated", f"v{version} → v{new_version} (dry-run, use --write to apply)"


def main():
    args = sys.argv[1:]
    write = "--write" in args
    paths = [a for a in args if not a.startswith("--")]

    if not paths:
        all_files = glob.glob(MATERIALS_GLOB, recursive=True)
        paths = sorted(f for f in all_files if Path(f).name != "index.json")

    if not paths:
        print("No material files found.")
        sys.exit(0)

    counts = {"ok": 0, "migrated": 0, "error": 0}

    for filepath in paths:
        rel = Path(filepath).relative_to(ROOT)
        status, msg = process_file(filepath, write=write)
        counts[status] += 1
        if status == "ok":
            print(f"OK        {rel}")
        elif status == "migrated":
            print(f"MIGRATED  {rel}  —  {msg}")
        else:
            print(f"ERROR     {rel}  —  {msg}")

    total = sum(counts.values())
    print(f"\n{total} file(s): {counts['ok']} current, {counts['migrated']} migrated, {counts['error']} error(s)", end="")

    if counts["migrated"] and not write:
        print("\nRun with --write to apply migrations.")
    else:
        print()

    if counts["error"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
