"""
check_docs.py — Check that README.md/SPEC.md material counts match
materials/index.json.

This is a *check*, not a generator. README.md's "Material Coverage" table is
hand-curated prose grouping related alloys together (e.g. "Steel 1018
(Cold-Drawn)/4130 (Normalized)/4340/..."), which reads far better than
anything easily auto-generated from the flat manifest list — so the table
itself stays hand-maintained. What this catches is the actual failure mode
observed twice already: someone adds/removes a material and forgets to touch
the doc counts (found stale at 61 vs. 62 during the 2026-08-21 repo review).

This deliberately does NOT try to verify that every material's name is
mentioned in the prose — slugs like "steel-4130-normalized" don't literally
appear as "steel-4130-normalized" in a sentence like "Steel ...4130
(Normalized).../Spring 5160", so a substring check would be too fragile to
trust (constant false positives/negatives). Counts are precise and cheap to
check reliably; prose-matching isn't, so it's out of scope here.

Usage:
    python tools/check_docs.py

Exits 0 if all counts match, 1 otherwise (with what's wrong and where).
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
MANIFEST_PATH = ROOT / "materials" / "index.json"
README_PATH = ROOT / "README.md"
SPEC_PATH = ROOT / "SPEC.md"

# schema category -> README table label (README abbreviates/pluralizes)
CATEGORY_LABELS = {
    "Metal": "Metals",
    "Plastic": "Plastics",
    "Ceramic": "Ceramics",
    "Composite": "Composites",
    "Elastomer": "Elastomers",
    "Glass": "Glass",
    "Natural Material": "Natural",
}


def load_manifest_counts():
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        materials = json.load(f)["materials"]
    total = len(materials)
    per_category = {}
    for m in materials:
        per_category[m["category"]] = per_category.get(m["category"], 0) + 1
    return total, per_category


def check_readme(total, per_category, errors):
    text = README_PATH.read_text(encoding="utf-8")

    heading = re.search(r"Material Coverage \((\d+) materials?\)", text)
    if not heading:
        errors.append("README.md: couldn't find the 'Material Coverage (N materials)' heading")
    elif int(heading.group(1)) != total:
        errors.append(
            f"README.md: heading says {heading.group(1)} materials, manifest has {total}"
        )

    for category, expected in per_category.items():
        label = CATEGORY_LABELS.get(category, category)
        row = re.search(rf"\|\s*{re.escape(label)}\s*\((\d+)\)\s*\|", text)
        if not row:
            errors.append(f"README.md: no table row found for category '{label}' ({category})")
        elif int(row.group(1)) != expected:
            errors.append(
                f"README.md: table says {label} ({row.group(1)}), manifest has {expected}"
            )


def check_spec(total, errors):
    text = SPEC_PATH.read_text(encoding="utf-8")
    # Only lines with an actual digit count — SPEC.md also has a literal
    # "All N materials" template line describing the format, which has no
    # digit to check and is correctly skipped by this pattern.
    for m in re.finditer(r"All (\d+) materials — no pre-filters applied", text):
        if int(m.group(1)) != total:
            errors.append(
                f"SPEC.md: 'All {m.group(1)} materials' example is stale, manifest has {total}"
            )


def main():
    # See parse_refs.py's main() for why: legacy Windows console codepages
    # can't encode the em-dashes below, which otherwise crashes the print
    # with UnicodeEncodeError even though the check itself completed.
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(errors="replace")

    total, per_category = load_manifest_counts()
    errors = []
    check_readme(total, per_category, errors)
    check_spec(total, errors)

    if errors:
        print(f"Doc counts are out of date (manifest has {total} materials):")
        for e in errors:
            print(f"  - {e}")
        print("\nFix: update the counts by hand (the material list/table itself stays")
        print("hand-curated — see this script's docstring for why).")
        sys.exit(1)

    print(f"OK: README.md and SPEC.md material counts match the manifest ({total} materials)")


if __name__ == "__main__":
    main()
