"""
validate.py — Validate all material JSON files against schema/v1.json.

Usage:
    python tools/validate.py                  # validate all materials
    python tools/validate.py path/to/file.json  # validate a single file

Exits with code 0 if all files pass, 1 if any fail.
"""

import json
import sys
import glob
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install -r tools/requirements.txt")
    sys.exit(1)

ROOT = Path(__file__).parent.parent
SCHEMA_PATH = ROOT / "schema" / "v1.json"
MATERIALS_GLOB = str(ROOT / "materials" / "**" / "*.json")
REFERENCES_PATH = ROOT / "references" / "index.json"


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def validate_file(path, schema, reference_keys):
    errors = []
    path = Path(path)

    try:
        data = load_json(path)
    except json.JSONDecodeError as e:
        return [f"Invalid JSON: {e}"]

    # Schema validation
    validator = jsonschema.Draft7Validator(schema)
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        errors.append(f"Schema: {'.'.join(str(p) for p in error.path) or '(root)'}: {error.message}")

    # Check slug matches filename
    slug = data.get("identification", {}).get("slug")
    if slug and slug != path.stem:
        errors.append(f"Slug mismatch: slug='{slug}' but filename='{path.stem}.json'")

    # Keys embedded in new_references are valid for this file even if not yet
    # in references/index.json — this is the documented submit-form workflow.
    valid_keys = reference_keys | set(data.get("new_references", {}).keys())

    # Check all referenced keys exist in references/index.json (or new_references)
    for key in data.get("references", []):
        if key not in valid_keys:
            errors.append(f"Unknown reference key '{key}' — not found in references/index.json")

    # Check property-level ref keys also exist
    def check_refs(obj, path_str=""):
        if isinstance(obj, dict):
            if "ref" in obj and obj["ref"] is not None:
                if obj["ref"] not in valid_keys:
                    errors.append(f"Unknown reference key '{obj['ref']}' at {path_str}")
            for k, v in obj.items():
                check_refs(v, f"{path_str}.{k}" if path_str else k)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                check_refs(item, f"{path_str}[{i}]")

    check_refs(data)

    return errors


def main():
    schema = load_json(SCHEMA_PATH)

    # Load reference keys for cross-reference checking
    try:
        reference_keys = set(load_json(REFERENCES_PATH).keys())
    except FileNotFoundError:
        print("WARNING: references/index.json not found — skipping reference key validation")
        reference_keys = set()

    # Determine files to validate
    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        files = glob.glob(MATERIALS_GLOB, recursive=True)
        # Exclude index.json
        files = [f for f in files if Path(f).name != "index.json"]

    if not files:
        print("No material files found.")
        sys.exit(0)

    total = 0
    failed = 0

    for filepath in sorted(files):
        total += 1
        errors = validate_file(filepath, schema, reference_keys)
        rel = Path(filepath).relative_to(ROOT)
        if errors:
            failed += 1
            print(f"FAIL  {rel}")
            for e in errors:
                print(f"      {e}")
        else:
            print(f"OK    {rel}")

    print(f"\n{total - failed}/{total} files valid", end="")
    if failed:
        print(f" — {failed} failed")
        sys.exit(1)
    else:
        print()
        sys.exit(0)


if __name__ == "__main__":
    main()
