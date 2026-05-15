"""
import_bibtex.py — Import BibTeX entries into references/index.json.

Dry-run by default: shows what would be added or skipped without writing.
Pass --write to merge entries into references/index.json.
Pass --force to overwrite entries that already exist.

Usage:
    python tools/import_bibtex.py refs.bib
    python tools/import_bibtex.py refs.bib --write
    python tools/import_bibtex.py a.bib b.bib --write --force
"""

import json
import sys
from pathlib import Path

try:
    import bibtexparser
    from bibtexparser.bwriter import BibTexWriter
    from bibtexparser.bibdatabase import BibDatabase
except ImportError:
    print("ERROR: bibtexparser not installed. Run: pip install -r tools/requirements.txt")
    sys.exit(1)

ROOT = Path(__file__).parent.parent
REFERENCES_PATH = ROOT / "references" / "index.json"

# ── BibTeX parsing ────────────────────────────────────────────────────────────

def parse_bib_file(path):
    """Return list of parsed entry dicts from a .bib file."""
    with open(path, encoding="utf-8") as f:
        db = bibtexparser.load(f)
    return db.entries


def entry_to_short_label(entry):
    """Generate 'LastName YYYY' from author + year fields."""
    author = entry.get("author", "").strip()
    year   = entry.get("year",   "").strip()

    last = ""
    if author:
        # Take first author, handle "Last, First" and "First Last" forms
        first_author = author.split(" and ")[0].strip()
        if "," in first_author:
            last = first_author.split(",")[0].strip()
        else:
            last = first_author.split()[-1] if first_author.split() else first_author

    if last and year:
        return f"{last} {year}"
    if last:
        return last
    if year:
        return f"{entry['ID']} {year}"
    return entry["ID"]


def entry_to_bibtex_str(entry):
    """Serialize a single parsed entry back to a BibTeX string."""
    db = BibDatabase()
    db.entries = [entry]
    writer = BibTexWriter()
    writer.indent = "  "
    writer.order_entries_by = None
    return writer.write(db).strip()


def build_ref_object(entry):
    """Convert a bibtexparser entry dict to a references/index.json value."""
    doi = entry.get("doi", "").strip() or None
    url = entry.get("url", "").strip() or None
    # Prefer explicit url; fall back to DOI URL if only a DOI is present
    if not url and doi:
        url = f"https://doi.org/{doi}"

    return {
        "short_label": entry_to_short_label(entry),
        "doi":    doi,
        "bibtex": entry_to_bibtex_str(entry),
        "url":    url,
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    write = "--write" in args
    force = "--force" in args
    bib_paths = [a for a in args if not a.startswith("--")]

    if not bib_paths:
        print("Usage: python tools/import_bibtex.py file.bib [--write] [--force]")
        sys.exit(1)

    # Load existing references
    try:
        with open(REFERENCES_PATH, encoding="utf-8") as f:
            index = json.load(f)
    except FileNotFoundError:
        index = {}

    # Parse all input files
    all_entries = []
    for bib_path in bib_paths:
        try:
            entries = parse_bib_file(bib_path)
            print(f"Parsed {len(entries)} entry/entries from {bib_path}")
            all_entries.extend(entries)
        except Exception as e:
            print(f"ERROR reading {bib_path}: {e}")
            sys.exit(1)

    if not all_entries:
        print("No entries found.")
        sys.exit(0)

    print()

    counts = {"added": 0, "skipped": 0, "overwritten": 0}
    pending = {}  # key → ref object, to be merged on --write

    for entry in all_entries:
        key = entry["ID"]
        ref = build_ref_object(entry)

        if key in index:
            if force:
                pending[key] = ref
                counts["overwritten"] += 1
                print(f"OVERWRITE  {key}  ({ref['short_label']})")
            else:
                counts["skipped"] += 1
                print(f"SKIP       {key}  — already exists (use --force to overwrite)")
        else:
            pending[key] = ref
            counts["added"] += 1
            action = "ADD" if write else "WOULD ADD"
            print(f"{action:<10} {key}  ({ref['short_label']})")

    print(f"\n{counts['added']} to add, {counts['overwritten']} to overwrite, {counts['skipped']} skipped", end="")

    if not pending:
        print()
        return

    if write:
        index.update(pending)
        with open(REFERENCES_PATH, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  — written to {REFERENCES_PATH.relative_to(ROOT)}")
    else:
        print("\nRun with --write to apply.")


if __name__ == "__main__":
    main()
