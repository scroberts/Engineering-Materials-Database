"""
lint_physics.py — Warn about physically implausible values in material JSON.

validate.py checks that data matches the schema's *shape*; this checks
whether it makes physical sense. Both are needed: the 2026-08-20 fatigue-data
audit found three schema-valid curves that were quietly wrong for months
(citation didn't match the source's own equation) — schema validation is
blind to that whole class of error, and so is most of what's checked here.
This is a best-effort sanity net, not a replacement for actually verifying
a source.

Checks (see WARN prefix for which; nothing here fails the build):
  - solidus < liquidus            (melting_point_tm vs. a "liquidus NNN°C"
                                    mention in notes — liquidus has no schema
                                    field, so this is regex best-effort)
  - ductility in [0, 1000]%       (elastomers/UHMW-PE legitimately exceed
                                    100% elongation — a first pass at [0,100]
                                    false-flagged 6 real materials, see
                                    CLAUDE.md punch list)
  - yield_strength <= tensile_strength
  - poissons_ratio in [0, 0.5]     (auxetic metamaterials are the one real
                                    exception; flagged, not rejected)
  - usable_temp_range.min < .max
  - fatigue S-N stress non-increasing with cycles
  - density within a generous per-category range (catches unit mixups like
    kg/m3 entered where g/cm3 was expected, not exotic-but-real materials)

Usage:
    python tools/lint_physics.py                  # lint all materials
    python tools/lint_physics.py path/to/file.json  # lint a single file

Always exits 0 — this is advisory, run it and read the output.
"""

import json
import re
import glob
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
MATERIALS_GLOB = str(ROOT / "materials" / "**" / "*.json")

LIQUIDUS_RE = re.compile(r"liquidus\s+(?:is\s+)?(-?\d+(?:\.\d+)?)\s*°?\s*C", re.IGNORECASE)

# Generous per-category density bounds (g/cm3), set from the actual spread
# already in the database plus headroom for legitimate exotic materials
# (e.g. lithium ~0.53, osmium ~22.6) — meant to catch data-entry/unit errors,
# not to gatekeep unusual-but-real materials.
DENSITY_BOUNDS = {
    "Metal": (0.5, 23.0),
    "Plastic": (0.8, 2.3),
    "Ceramic": (1.0, 19.5),
    "Composite": (0.03, 3.5),
    "Elastomer": (0.7, 2.5),
    "Glass": (1.5, 6.5),
    "Natural Material": (0.05, 1.4),
}


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def lint_file(path):
    warnings = []
    data = load_json(path)
    ident = data.get("identification", {})
    mc = data.get("mechanical_common", {})
    mo = data.get("mechanical_other", {})
    ph = data.get("physical", {})

    # ── solidus < liquidus ───────────────────────────────────────────────
    notes = ident.get("notes") or ""
    liquidus_match = LIQUIDUS_RE.search(notes)
    solidus = (ph.get("melting_point_tm") or {}).get("value")
    if liquidus_match and solidus is not None:
        liquidus = float(liquidus_match.group(1))
        if not (solidus < liquidus):
            warnings.append(
                f"solidus ({solidus}°C) is not below liquidus ({liquidus}°C, from notes text)"
            )

    # ── ductility in [0, 1000]% ──────────────────────────────────────────
    # Upper bound is deliberately loose: elastomers and some plastics
    # (UHMW-PE, nylon 12) legitimately report 200-350%+ elongation at break
    # in this database already. This only catches negative values or a
    # plausible data-entry error (e.g. an extra digit), not real behavior.
    duct = mo.get("ductility") or {}
    for key in ("min", "max", "typical"):
        v = duct.get(key)
        if v is not None and not (0 <= v <= 1000):
            warnings.append(f"ductility.{key} = {v}% is outside [0, 1000]%")

    # ── yield_strength <= tensile_strength ───────────────────────────────
    ys = (mc.get("yield_strength") or {}).get("value")
    uts = (mc.get("tensile_strength") or {}).get("value")
    if ys is not None and uts is not None and ys > uts:
        warnings.append(f"yield_strength ({ys} GPa) exceeds tensile_strength ({uts} GPa)")

    # ── poissons_ratio in [0, 0.5] ────────────────────────────────────────
    nu = (mc.get("poissons_ratio") or {}).get("value")
    if nu is not None and not (0 <= nu <= 0.5):
        warnings.append(
            f"poissons_ratio = {nu} is outside [0, 0.5] "
            "(only expected exception: auxetic metamaterials)"
        )

    # ── usable_temp_range.min < .max ─────────────────────────────────────
    utr = mc.get("usable_temp_range") or {}
    tmin, tmax = utr.get("min"), utr.get("max")
    if tmin is not None and tmax is not None and not (tmin < tmax):
        warnings.append(f"usable_temp_range.min ({tmin}°C) is not below .max ({tmax}°C)")

    # ── fatigue S-N: stress should not increase as life increases ───────
    sn = mo.get("fatigue_sn_curve") or {}
    points = sorted(sn.get("points", []), key=lambda p: p["cycles"])
    for prev, cur in zip(points, points[1:]):
        if cur["stress"] > prev["stress"]:
            warnings.append(
                f"fatigue_sn_curve: stress increases from {prev['stress']} GPa "
                f"@ {prev['cycles']:.0f} cycles to {cur['stress']} GPa @ {cur['cycles']:.0f} cycles"
            )

    # ── density sane for category ────────────────────────────────────────
    category = ident.get("category")
    density = (ph.get("density") or {}).get("value")
    bounds = DENSITY_BOUNDS.get(category)
    if density is not None and bounds and not (bounds[0] <= density <= bounds[1]):
        warnings.append(
            f"density = {density} g/cm³ is outside the expected range for "
            f"{category} ({bounds[0]}-{bounds[1]} g/cm³) — check for a unit mixup"
        )

    return warnings


def main():
    # See parse_refs.py's main() for why: legacy Windows console codepages
    # can't encode °/³/µ etc., which otherwise crashes the print with
    # UnicodeEncodeError even though the lint itself completed successfully.
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(errors="replace")

    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        files = [f for f in glob.glob(MATERIALS_GLOB, recursive=True) if Path(f).name != "index.json"]

    if not files:
        print("No material files found.")
        return

    total_warnings = 0
    flagged_files = 0

    for filepath in sorted(files):
        try:
            rel = Path(filepath).resolve().relative_to(ROOT.resolve())
        except ValueError:
            rel = Path(filepath)
        warnings = lint_file(filepath)
        if warnings:
            flagged_files += 1
            total_warnings += len(warnings)
            print(f"WARN  {rel}")
            for w in warnings:
                print(f"      - {w}")

    print(f"\n{total_warnings} warning(s) across {flagged_files} file(s) "
          f"(of {len(files)} checked) — advisory only, exit code always 0")


if __name__ == "__main__":
    main()
