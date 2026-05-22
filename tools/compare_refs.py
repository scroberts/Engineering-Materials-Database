"""
compare_refs.py — Compare material JSON property values against parsed reference data.

For each material JSON matched by the pattern, reports:
  • Properties whose value is non-null but ref is null  (no source cited)
  • Properties whose cited reference has no parsed HTML file
  • Value mismatches between the material and its cited reference (>tolerance)

Where a mismatch is a simple numeric value the routine prompts y/n to update
the material JSON file in-place.

Usage:
    python tools/compare_refs.py aluminum-6061-t6.json  --refs-dir /path/to/parsed/
    python tools/compare_refs.py "aluminum*.json"        --refs-dir /path/to/parsed/
    python tools/compare_refs.py "*.json"                --refs-dir /path/to/parsed/
    python tools/compare_refs.py "*.json"  --refs-dir /path/to/parsed/ --tolerance 0.03
    python tools/compare_refs.py "*.json"  --refs-dir /path/to/parsed/ --no-fix
    python tools/compare_refs.py "*.json"  --refs-dir /path/to/parsed/ --verbose
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
MATERIALS_DIR = ROOT / "materials"

# ── Units for display ─────────────────────────────────────────────────────────

UNITS: dict[str, str] = {
    "mechanical_common.youngs_modulus":       "GPa",
    "mechanical_common.poissons_ratio":       "",
    "mechanical_common.yield_strength":       "GPa",
    "mechanical_common.tensile_strength":     "GPa",
    "mechanical_common.compressive_modulus":  "GPa",
    "mechanical_common.compressive_strength": "MPa",
    "mechanical_other.microyield_strength":   "GPa",
    "mechanical_other.creep_strength":        "GPa",
    "mechanical_other.fracture_toughness":    "MPa·m^0.5",
    "mechanical_other.hardness_vickers":      "HV",
    "mechanical_other.hardness_brinell":      "HB",
    "mechanical_other.hardness_rockwell":     "HR",
    "mechanical_other.hardness_shore":        "Shore",
    "mechanical_other.shear_strength":        "GPa",
    "mechanical_other.ductility":             "%",
    "physical.density":                       "g/cm³",
    "physical.electrical_conductivity":       "% IACS",
    "physical.vapour_pressure":               "",
    "physical.thermal_conductivity":          "W/m·K",
    "physical.specific_heat":                 "J/kg·K",
    "physical.thermal_diffusivity":           "cm²/s",
    "physical.melting_point_tm":              "°C",
    "physical.glass_transition_tg":           "°C",
    "physical.thermal_expansion":             "µm/m·K",
    "physical.magnetic_classification":       "",
}


def _fmt(val, path: str) -> str:
    unit = UNITS.get(path, "")
    if isinstance(val, float) or isinstance(val, int):
        f = float(val)
        if f == 0:
            s = "0"
        elif abs(f) >= 10000 or (abs(f) < 0.001 and f != 0):
            s = f"{f:.4g}"
        elif abs(f) >= 1000:
            s = f"{f:.1f}"
        elif abs(f) >= 100:
            s = f"{f:.2f}"
        elif abs(f) >= 10:
            s = f"{f:.3g}"
        else:
            s = f"{f:.4g}"
    else:
        s = str(val)
    return f"{s} {unit}".strip()


# ── Property extraction ───────────────────────────────────────────────────────

def extract_primary(prop: dict) -> tuple[object, bool]:
    """
    Return (value, is_simple) for a property dict.
    is_simple=True means the dict has a single "value" field that can be auto-patched.
    """
    if not isinstance(prop, dict):
        return None, False
    if "value" in prop:
        return prop["value"], True           # valued_property or thermal-table type
    if "typical" in prop:                    # ductility
        v = prop.get("typical")
        if v is None:
            v = prop.get("min")
        if v is None:
            v = prop.get("max")
        return v, False
    if "min" in prop and "max" in prop and "points" not in prop:
        return None, False                   # usable_temp_range — skip
    if "points" in prop:
        return None, False                   # fatigue_sn_curve — skip
    return None, False


def iter_props(mat: dict):
    """
    Yield (path, value, ref, is_simple) for every populated property.
    Skips intentionally null (value=null, ref=null) properties.
    """
    for section in ("mechanical_common", "mechanical_other", "physical"):
        sec = mat.get(section) or {}
        for prop_name, prop_data in sec.items():
            if not isinstance(prop_data, dict):
                continue
            path = f"{section}.{prop_name}"
            value, is_simple = extract_primary(prop_data)
            ref = prop_data.get("ref")
            if value is None and ref is None:
                continue         # intentionally unpopulated
            yield path, value, ref, is_simple


# ── Parsed reference loading ──────────────────────────────────────────────────

_parsed_cache: dict[str, dict | None] = {}


def load_parsed(ref_key: str, refs_dir: Path) -> dict | None:
    if ref_key in _parsed_cache:
        return _parsed_cache[ref_key]
    p = refs_dir / f"{ref_key}.json"
    if not p.exists():
        _parsed_cache[ref_key] = None
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        _parsed_cache[ref_key] = data
        return data
    except (json.JSONDecodeError, OSError):
        _parsed_cache[ref_key] = None
        return None


def get_parsed_value(parsed: dict, path: str) -> object | None:
    """Navigate path in a parsed ref JSON and return its primary value."""
    obj = parsed
    for part in path.split("."):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(part)
    if obj is None:
        return None
    value, _ = extract_primary(obj)
    return value


# ── Comparison ────────────────────────────────────────────────────────────────

def values_differ(a, b, tolerance: float) -> bool:
    """True if a and b differ beyond the relative tolerance."""
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return str(a) != str(b)
    if a == b == 0:
        return False
    denom = max(abs(float(a)), abs(float(b)), 1e-12)
    return abs(float(a) - float(b)) / denom > tolerance


# ── In-place JSON patching ────────────────────────────────────────────────────

def _compact_arrays(text: str) -> str:
    """Collapse short arrays of primitives to one line (preserves file style)."""
    PRIM = r'(?:"[^"\\]*(?:\\.[^"\\]*)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)'
    pattern = re.compile(
        r'\[\s*(?:' + PRIM + r'(?:\s*,\s*' + PRIM + r')*)?\s*\]',
        re.DOTALL,
    )
    def collapse(m):
        compact = re.sub(r'\s+', ' ', m.group(0))
        return compact if len(compact) <= 120 else m.group(0)
    return pattern.sub(collapse, text)


def patch_material(mat_path: Path, mat: dict, path: str, new_value: float) -> None:
    """Write new_value into mat at path and save to disk."""
    parts = path.split(".")
    obj = mat
    for p in parts[:-1]:
        obj = obj[p]
    leaf = obj[parts[-1]]
    if "value" in leaf:
        leaf["value"] = new_value
    elif "typical" in leaf:
        leaf["typical"] = new_value
    text = _compact_arrays(json.dumps(mat, indent=2, ensure_ascii=False)) + "\n"
    mat_path.write_text(text, encoding="utf-8")


# ── File finding ──────────────────────────────────────────────────────────────

def find_material_files(pattern: str) -> list[Path]:
    p = Path(pattern)
    if "/" in pattern or p.is_absolute():
        if "*" in pattern:
            return sorted(q for q in p.parent.glob(p.name)
                          if q.suffix == ".json" and q.name != "index.json")
        return [p] if p.exists() else []
    return sorted(
        q for q in MATERIALS_DIR.rglob(pattern)
        if q.name != "index.json"
    )


# ── Per-file comparison ───────────────────────────────────────────────────────

def compare_material(
    mat_path: Path,
    refs_dir: Path,
    tolerance: float,
    allow_fix: bool,
    verbose: bool,
) -> int:
    try:
        mat = json.loads(mat_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"\nERROR reading {mat_path}: {e}")
        return 1

    rel = mat_path.relative_to(ROOT)
    print(f"\n{'=' * 78}")
    print(f"  {rel}")
    print(f"{'=' * 78}")

    no_ref: list[tuple[str, object]] = []
    missing_file: dict[str, list[str]] = {}     # ref_key → [paths]
    mismatches: list[tuple] = []
    matches: list[tuple] = []

    for path, value, ref, is_simple in iter_props(mat):
        if value is None:
            continue    # null value — nothing to check

        if ref is None:
            no_ref.append((path, value))
            continue

        parsed = load_parsed(ref, refs_dir)
        if parsed is None:
            missing_file.setdefault(ref, []).append(path)
            continue

        ref_val = get_parsed_value(parsed, path)
        if ref_val is None:
            # Parsed file exists but doesn't contain this property
            if verbose:
                print(f"  [verbose] {path}: {ref!r} has no parsed value for this field")
            continue

        if values_differ(value, ref_val, tolerance):
            mismatches.append((path, value, ref_val, ref, is_simple))
        else:
            matches.append((path, value, ref))

    issues = 0

    # ── No reference ──────────────────────────────────────────────────────────
    if no_ref:
        issues += len(no_ref)
        n = len(no_ref)
        print(f"\n  NO REFERENCE  — {n} propert{'y' if n == 1 else 'ies'} with a value but no source cited")
        print("  " + "─" * 68)
        for path, value in no_ref:
            print(f"    {path:<50s}  {_fmt(value, path)}")

    # ── Missing parsed file ───────────────────────────────────────────────────
    if missing_file:
        n = len(missing_file)
        print(f"\n  NO PARSED FILE  — {n} cited ref{'s' if n > 1 else ''} without a downloaded/parsed HTML")
        print("  " + "─" * 68)
        for ref_key, paths in sorted(missing_file.items()):
            props = ", ".join(p.split(".")[-1] for p in paths)
            print(f"    {ref_key:<40s}  used by: {props}")

    # ── Mismatches ────────────────────────────────────────────────────────────
    if mismatches:
        issues += len(mismatches)
        pct = int(tolerance * 100)
        print(f"\n  VALUE MISMATCHES  — >{pct}% relative difference  [{len(mismatches)}]")
        print("  " + "─" * 68)
        for path, mat_val, ref_val, ref_key, is_simple in mismatches:
            print(f"\n    {path}")
            print(f"      material : {_fmt(mat_val, path)}")
            print(f"      reference: {_fmt(ref_val, path)}  (from {ref_key})")

            if allow_fix and is_simple and isinstance(ref_val, (int, float)):
                try:
                    ans = input(f"      → Update value to {_fmt(ref_val, path)}? [y/N]: ").strip().lower()
                except EOFError:
                    ans = "n"
                if ans == "y":
                    patch_material(mat_path, mat, path, float(ref_val))
                    print(f"      ✓ Updated.")

    # ── Verbose matches ───────────────────────────────────────────────────────
    if verbose and matches:
        print(f"\n  MATCHES  [{len(matches)}]")
        print("  " + "─" * 68)
        for path, val, ref_key in matches:
            print(f"    ✓ {path:<50s}  {_fmt(val, path)}  ({ref_key})")

    # ── Summary for this file ─────────────────────────────────────────────────
    if not no_ref and not mismatches:
        if not missing_file:
            print("  ✓ All properties match their cited references.")
        else:
            print("  ✓ All parseable properties match their cited references.")

    return issues


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "pattern",
        help="Filename or glob to match material JSONs, e.g. aluminum-6061-t6.json, aluminum*.json, *.json",
    )
    parser.add_argument(
        "--refs-dir", required=True, metavar="DIR",
        help="Directory of parsed reference JSONs (output of parse_refs.py)",
    )
    parser.add_argument(
        "--tolerance", type=float, default=0.05, metavar="FRAC",
        help="Relative tolerance for value comparison (default: 0.05 = 5%%)",
    )
    parser.add_argument(
        "--no-fix", action="store_true",
        help="Report only; never prompt to update material files",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Also list properties that match their cited references",
    )
    args = parser.parse_args()

    refs_dir = Path(args.refs_dir)
    if not refs_dir.is_dir():
        print(f"ERROR: --refs-dir {refs_dir!r} is not a directory")
        sys.exit(1)

    files = find_material_files(args.pattern)
    if not files:
        print(f"No material JSON files found matching: {args.pattern!r}")
        sys.exit(0)

    print(f"Pattern    : {args.pattern}")
    print(f"Refs dir   : {refs_dir.resolve()}")
    print(f"Tolerance  : {int(args.tolerance * 100)}%")
    print(f"Files      : {len(files)}")

    total_issues = 0
    for mat_path in files:
        total_issues += compare_material(
            mat_path, refs_dir, args.tolerance, not args.no_fix, args.verbose
        )

    print(f"\n{'=' * 78}")
    print(f"  Files checked: {len(files)}   Issues found: {total_issues}")
    print(f"{'=' * 78}")


if __name__ == "__main__":
    main()
