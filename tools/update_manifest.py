"""
update_manifest.py — Regenerate materials/index.json from all material files.

Run this after merging any new material PR:
    python tools/update_manifest.py

The manifest is a lightweight summary used by the browse page to render
material cards without fetching every individual material file.
"""

import json
import glob
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).parent.parent
MATERIALS_GLOB = str(ROOT / "materials" / "**" / "*.json")
MANIFEST_PATH = ROOT / "materials" / "index.json"


def extract_entry(data, filepath):
    """Pull the fields needed for the browse page manifest."""
    rel_path = Path(filepath).relative_to(ROOT).as_posix()
    ident = data.get("identification", {})
    mech  = data.get("mechanical_common", {})
    phys  = data.get("physical", {})

    def val(section, key):
        prop = section.get(key)
        return prop.get("value") if isinstance(prop, dict) else None

    return {
        "slug":                 ident.get("slug"),
        "path":                 rel_path,
        "name":                 ident.get("name"),
        "category":             ident.get("category"),
        "fabrication_processes":ident.get("fabrication_processes", []),
        "common_forms":         ident.get("common_forms", []),
        "usage_frequency":      ident.get("usage_frequency", "Common"),
        "youngs_modulus":         val(mech, "youngs_modulus"),
        "yield_strength":         val(mech, "yield_strength"),
        "tensile_strength":       val(mech, "tensile_strength"),
        "density":                val(phys, "density"),
        "magnetic_classification": phys.get("magnetic_classification", {}).get("value"),
    }


def main():
    files = glob.glob(MATERIALS_GLOB, recursive=True)
    files = [f for f in files if Path(f).name != "index.json"]

    if not files:
        print("No material files found.")
        return

    entries = []
    errors  = []

    for filepath in sorted(files):
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
            entries.append(extract_entry(data, filepath))
        except Exception as e:
            errors.append(f"  SKIP  {filepath}: {e}")

    manifest = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "materials": entries,
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Generated materials/index.json — {len(entries)} material(s):")
    for e in entries:
        flag = "" if e["usage_frequency"] == "Common" else f"  [{e['usage_frequency'].lower()}]"
        print(f"  {e['slug']:40s} ({e['category']}){flag}")

    for err in errors:
        print(err)


if __name__ == "__main__":
    main()
