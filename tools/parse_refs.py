"""
parse_refs.py — Parse downloaded HTML reference files into material JSON schema format.

Each HTML file is read, its source site detected from the filename prefix, and
a site-specific parser extracts property values. Output is one JSON per input
file, structured like the material schema (canonical units), for comparison
with existing material JSONs.

Unrecognised properties are collected under a top-level "_raw" key.

Usage:
    python tools/parse_refs.py <html_dir>
    python tools/parse_refs.py <html_dir> --glob "azom*.html"
    python tools/parse_refs.py <html_dir> --output parsed/
    python tools/parse_refs.py <html_dir> --glob "matweb*.html" --output /tmp/parsed
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: beautifulsoup4 not installed. Run: pip install beautifulsoup4")
    sys.exit(1)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _num(s: str) -> float | None:
    """Extract the first number from a string; return None if nothing parses."""
    if not s:
        return None
    s = (
        s.replace('−', '-')   # Unicode minus
         .replace('–', '-')   # en-dash (sometimes used as minus)
         .replace(',', '')    # thousands separator
    )
    # Normalise "1.1 x 10^-1" / "1.1 × 10^-1" → "1.1e-1" before regex
    s = re.sub(r'([-+]?\d+\.?\d*)\s*[x×]\s*10\^([+-]?\d+)', r'\1e\2', s)
    m = re.search(r'[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?', s)
    return float(m.group()) if m else None


_SCI_X_RE = re.compile(r'([-+]?\d[\d,]*\.?\d*)\s*[x×]\s*10\^([+-]?\d+)')


def _split_val_unit(cell: str) -> tuple[str, str] | None:
    """
    Split a value+unit cell string into (value_str, unit_str).
    Normalises 'N x 10^E' / 'N × 10^E' notation to 'NeE' before splitting,
    so that e.g. '1.1 x 10^-1 BTU/lb-°F' yields ('1.1e-1', 'BTU/lb-°F').
    Returns None if no leading number is found.
    """
    cell = _SCI_X_RE.sub(r'\1e\2', cell.strip())
    m = re.match(r'^\s*([-+]?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?)\s*(.*)', cell, re.DOTALL)
    return (m.group(1), m.group(2)) if m else None


def _nu(s: str) -> str:
    """Normalise a unit string for comparison (lowercase, no spaces/symbols)."""
    s = s.lower()
    for old, new in [
        ('°', ''), ('°', ''), ('µ', 'u'), ('μ', 'u'),
        (' ', ''), ('²', '2'), ('³', '3'),
        ('½', '0.5'), ('¹', '1'),
        ('·', ''), ('*', ''), ('^', ''),
    ]:
        s = s.replace(old, new)
    return s


def _vp(value, ref=None) -> dict:
    """Build a valued_property dict."""
    return {"value": value, "ref": ref}


def _convert_pressure_to_gpa(value: float, unit: str) -> float | None:
    """Convert a pressure/modulus value to GPa."""
    u = _nu(unit)
    if 'gpa' in u or 'kn/mm2' in u:
        return value
    if 'mpa' in u or 'n/mm2' in u:
        return value / 1000.0
    if 'ksi' in u:
        return value * 0.006894757
    if 'psi' in u:
        return value * 6.894757e-6
    if 'pa' in u and 'k' not in u and 'm' not in u:
        return value * 1e-9
    return None


def _convert_pressure_to_mpa(value: float, unit: str) -> float | None:
    """Convert a pressure value to MPa."""
    u = _nu(unit)
    if 'mpa' in u or 'n/mm2' in u:
        return value
    if 'gpa' in u or 'kn/mm2' in u:
        return value * 1000.0
    if 'ksi' in u:
        return value * 6.894757
    if 'psi' in u:
        return value * 0.006894757
    return None


def _convert_density(value: float, unit: str) -> float | None:
    u = _nu(unit)
    if 'g/cm' in u or 'g/cc' in u:
        return value
    if 'kg/m3' in u:
        return value / 1000.0
    if 'lb/in3' in u or 'lb/in' in u:
        return value * 27.6799
    if 'lb/ft3' in u:
        return value * 0.016018
    return None


def _convert_cte(value: float, unit: str) -> float | None:
    """Convert CTE to µm/m·K."""
    u = _nu(unit)
    # Read the temperature scale from the trailing character rather than a
    # '/f' or '/c' substring search: symbol-stripping in _nu() collapses
    # e.g. 'µm/m·°F' to 'um/mf' and 'µin/in·°C' to 'uin/inc', so the '/'
    # is no longer adjacent to the temperature letter. Ratio-only units
    # (in/in, ft/ft) end in 'n'/'t' and carry no explicit marker; per
    # convention these are °F unless an explicit °C/K unit is appended.
    is_fahrenheit = u.endswith('f') or 'in/in' in u or 'ft/ft' in u
    if u.endswith('c') or u.endswith('k'):
        is_fahrenheit = False
    if 'ppm' in u or 'um/m' in u or 'ue/' in u:
        return value * 1.8 if is_fahrenheit else value   # ppm/°C = µm/m·K
    # Bare SI units: value already in 1/K or 1/°F (e.g. 11.7e-6 /K → ×1e6)
    if 'in/in' in u or 'ft/ft' in u or u.endswith('f') or u.endswith('c') or u.endswith('k'):
        return value * (1.8e6 if is_fahrenheit else 1e6)
    return None


def _convert_conductivity(value: float, unit: str) -> float | None:
    """Convert thermal conductivity to W/m·K."""
    u = _nu(unit)
    if 'w/m' in u:
        return value
    # BTU·in/(hr·ft²·°F) must be checked before BTU/(hr·ft·°F) — factor of 12 difference
    if 'btu' in u and 'in' in u and 'hr' in u:
        return value * 0.14423
    if 'btu' in u and 'hr' in u:
        return value * 1.73073
    if 'btu' in u and 'in' in u and 's' in u:
        return value * 519.22
    if 'cal' in u and 's' in u:
        return value * 418.68
    if 'cal' in u and 'min' in u:
        return value * 6.978
    return None


def _convert_specific_heat(value: float, unit: str) -> float | None:
    """Convert specific heat to J/kg·K."""
    u = _nu(unit)
    # kj/kg must be checked before j/kg — 'kj/kgk' contains the substring 'j/kgk'
    if 'kj/kg' in u:
        return value * 1000.0
    if 'j/kgk' in u or 'j/kg' in u:
        return value
    if 'btu/lb' in u:
        return value * 4186.8
    if 'cal/gk' in u or 'cal/g' in u:
        return value * 4186.8
    if 'j/gk' in u or 'j/g' in u:
        return value * 1000.0
    return None


def _convert_temp(value: float, unit: str) -> float | None:
    u = _nu(unit)
    if 'f' in u and 'c' not in u and 'k' not in u:
        return (value - 32) * 5.0 / 9.0
    if 'k' in u and 'c' not in u:
        return value - 273.15
    return value   # assume °C


def _convert_fracture_toughness(value: float, unit: str) -> float | None:
    """Convert fracture toughness to MPa·m^0.5."""
    u = _nu(unit)
    if 'mpa' in u:
        return value
    if 'ksi' in u:
        return value * 1.0988
    return None


def _convert_thermal_diffusivity(value: float, unit: str) -> float | None:
    """Convert thermal diffusivity to cm²/s."""
    u = _nu(unit)
    if 'cm2/s' in u or 'cm2s' in u:
        return value
    if 'mm2/s' in u or 'mm2s' in u:
        return value * 0.01
    if 'm2/s' in u or 'm2s' in u:
        return value * 10000.0
    return None


# ── Property name → schema field mapping ─────────────────────────────────────

# Maps (normalised property name fragment) → schema path + converter
# Used as a fallback/shared layer; parsers may override per-site.

_PROP_MAP = [
    # (pattern in property name, schema key, converter_fn, canonical_unit_label)
    # Mechanical
    ("young", "mechanical_common.youngs_modulus", _convert_pressure_to_gpa, "GPa"),
    ("elastic mod", "mechanical_common.youngs_modulus", _convert_pressure_to_gpa, "GPa"),
    ("modulus of elasticity", "mechanical_common.youngs_modulus", _convert_pressure_to_gpa, "GPa"),
    ("tensile modulus", "mechanical_common.youngs_modulus", _convert_pressure_to_gpa, "GPa"),
    ("poisson", "mechanical_common.poissons_ratio", None, "—"),
    ("tensile strength, ult", "mechanical_common.tensile_strength", _convert_pressure_to_gpa, "GPa"),
    ("ultimate tensile", "mechanical_common.tensile_strength", _convert_pressure_to_gpa, "GPa"),
    ("uts", "mechanical_common.tensile_strength", _convert_pressure_to_gpa, "GPa"),
    ("tensile strength, yield", "mechanical_common.yield_strength", _convert_pressure_to_gpa, "GPa"),
    ("yield strength", "mechanical_common.yield_strength", _convert_pressure_to_gpa, "GPa"),
    ("0.2% proof", "mechanical_common.yield_strength", _convert_pressure_to_gpa, "GPa"),
    ("proof stress", "mechanical_common.yield_strength", _convert_pressure_to_gpa, "GPa"),
    # Bare "Tensile Strength" (no Ultimate/Yield qualifier) — must come after the
    # qualified patterns above so those get first shot; catches unqualified rows
    # like AZoM's plain "Tensile Strength (MPa)" cells (found on 1018 steel, PA6, PA12).
    ("tensile strength", "mechanical_common.tensile_strength", _convert_pressure_to_gpa, "GPa"),
    ("compressive yield", "mechanical_common.compressive_strength", _convert_pressure_to_mpa, "MPa"),
    ("compressive strength", "mechanical_common.compressive_strength", _convert_pressure_to_mpa, "MPa"),
    ("elongation", "mechanical_other.ductility", None, "%"),
    ("ductility", "mechanical_other.ductility", None, "%"),
    ("shear strength", "mechanical_other.shear_strength", _convert_pressure_to_gpa, "GPa"),
    ("fracture toughness", "mechanical_other.fracture_toughness", _convert_fracture_toughness, "MPa·m^0.5"),
    ("hardness, vickers", "mechanical_other.hardness_vickers", None, "HV"),
    ("vickers hardness", "mechanical_other.hardness_vickers", None, "HV"),
    ("hardness hv", "mechanical_other.hardness_vickers", None, "HV"),
    ("hardness, brinell", "mechanical_other.hardness_brinell", None, "HB"),
    ("brinell hardness", "mechanical_other.hardness_brinell", None, "HB"),
    ("hardness hb", "mechanical_other.hardness_brinell", None, "HB"),
    ("hardness, rockwell", "mechanical_other.hardness_rockwell", None, "HR"),
    ("rockwell hardness", "mechanical_other.hardness_rockwell", None, "HR"),
    # Physical
    ("density", "physical.density", _convert_density, "g/cm³"),
    ("thermal expansion", "physical.thermal_expansion", _convert_cte, "µm/m·K"),
    ("coefficient of thermal expansion", "physical.thermal_expansion", _convert_cte, "µm/m·K"),
    ("cte", "physical.thermal_expansion", _convert_cte, "µm/m·K"),
    ("linear expansion", "physical.thermal_expansion", _convert_cte, "µm/m·K"),
    ("thermal conductivity", "physical.thermal_conductivity", _convert_conductivity, "W/m·K"),
    ("specific heat", "physical.specific_heat", _convert_specific_heat, "J/kg·K"),
    ("heat capacity", "physical.specific_heat", _convert_specific_heat, "J/kg·K"),
    ("thermal diffusivity", "physical.thermal_diffusivity", _convert_thermal_diffusivity, "cm²/s"),
    ("melting point", "physical.melting_point_tm", _convert_temp, "°C"),
    ("solidus", "physical.melting_point_tm", _convert_temp, "°C"),
    ("glass transition", "physical.glass_transition_tg", _convert_temp, "°C"),
    ("glass temperature", "physical.glass_transition_tg", _convert_temp, "°C"),
    ("electrical conductivity", "physical.electrical_conductivity", None, "% IACS"),
]


def _map_property(name: str, value_str: str, unit: str) -> tuple[str, object] | None:
    """
    Attempt to map a (name, value, unit) triple to a schema path and canonical value.
    Returns (schema_path, canonical_value) or None if unmapped.
    """
    n = name.lower().strip()
    v = _num(value_str)
    if v is None:
        return None

    for pattern, path, converter, _ in _PROP_MAP:
        if pattern in n:
            if converter is None:
                canonical = v
            else:
                canonical = converter(v, unit)
                if canonical is None:
                    # Converter doesn't recognise unit — store raw float
                    canonical = v
            return path, canonical

    return None


def _set_nested(d: dict, path: str, value) -> None:
    """Set d['a']['b']['c'] = value from dot-separated path 'a.b.c'."""
    keys = path.split('.')
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = value


def _get_nested(d: dict, path: str):
    """Get a nested value by dot-separated path; return None if missing."""
    for k in path.split('.'):
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


# ── Output template ───────────────────────────────────────────────────────────

def _empty_result(stub: str, site: str, source_url: str | None) -> dict:
    return {
        "_meta": {
            "source_site": site,
            "source_file": f"{stub}.html",
            "source_url": source_url,
            "parsed_date": date.today().isoformat(),
        },
        "identification": {
            "name": None,
            "slug": stub,
            "category": None,
            "usage_frequency": None,
        },
        "mechanical_common": {},
        "mechanical_other": {},
        "physical": {},
        "_raw": {},
    }


_ROCKWELL_SCALE_PATH = "mechanical_other.hardness_rockwell"
_ROCKWELL_SCALE_RE = re.compile(r"rockwell\s*([a-z])\b", re.I)


def _rockwell_scale(name: str) -> str | None:
    """Rockwell scale letter from a property name, e.g. 'Hardness, Rockwell C' -> 'C'."""
    m = _ROCKWELL_SCALE_RE.search(name)
    return m.group(1).upper() if m else None


def _finish(result: dict, parsed: dict, raw: dict) -> dict:
    """Merge parsed properties and raw leftovers into the result template."""
    for path, value in parsed.items():
        if path == f"{_ROCKWELL_SCALE_PATH}__scale":
            continue  # side-channel, consumed by the hardness_rockwell branch below
        if path.startswith("mechanical_common."):
            key = path.split(".", 1)[1]
            result["mechanical_common"][key] = _vp(value)
        elif path.startswith("mechanical_other."):
            key = path.split(".", 1)[1]
            if key == "ductility":
                result["mechanical_other"]["ductility"] = {
                    "min": None, "max": None, "typical": value, "ref": None
                }
            elif key == "hardness_rockwell":
                result["mechanical_other"]["hardness_rockwell"] = {
                    "value": value,
                    "scale": parsed.get(f"{_ROCKWELL_SCALE_PATH}__scale"),
                    "ref": None,
                }
            else:
                result["mechanical_other"][key] = _vp(value)
        elif path.startswith("physical."):
            key = path.split(".", 1)[1]
            if key in ("thermal_conductivity", "specific_heat"):
                result["physical"][key] = {"value": value, "table": [], "ref": None}
            elif key == "thermal_expansion":
                result["physical"]["thermal_expansion"] = {"value": value, "table": [], "ref": None}
            elif key == "magnetic_classification":
                result["physical"]["magnetic_classification"] = {"value": value, "ref": None}
            else:
                result["physical"][key] = _vp(value)
    result["_raw"].update(raw)
    return result


# ── Per-site parsers ──────────────────────────────────────────────────────────

class BaseParser:
    site = "generic"

    def parse(self, html: str, stub: str) -> dict:
        raise NotImplementedError

    def _apply_rows(self, rows: list[tuple[str, str, str]]) -> tuple[dict, dict]:
        """
        Given [(name, value_str, unit_str), ...], apply _map_property to each.
        Returns (parsed, raw) where parsed = {schema_path: canonical_value}
        and raw = {name: value_str + unit_str} for unmapped rows.

        First match per schema path wins, not last. Found via a real AISI 1018
        AZoM page: rows like "Hardness, Rockwell B (Converted from Brinell
        hardness)" spuriously substring-match the hardness_brinell pattern.
        Last-write-wins let that overwrite the correct primary "Hardness,
        Brinell" row (126) with an unrelated converted value (71) — silently
        wrong, not just missing. The primary row for a property consistently
        appears before parenthetical cross-references to it. (js/core/htmlImport.js
        has the identical fix, found and applied there first.)
        """
        parsed = {}
        raw = {}
        for name, value_str, unit_str in rows:
            result = _map_property(name, value_str, unit_str)
            if result:
                path, canon = result
                if path not in parsed:
                    parsed[path] = canon
                    if path == _ROCKWELL_SCALE_PATH:
                        scale = _rockwell_scale(name)
                        if scale:
                            parsed[f"{_ROCKWELL_SCALE_PATH}__scale"] = scale
            else:
                raw[name] = f"{value_str} {unit_str}".strip()
        return parsed, raw


class AZoMParser(BaseParser):
    """
    AZoM material property pages.

    Property tables are inside .content-item-body elements.
    Each table row has two or three cells: [Property Name] [Value] [Unit?]
    Often value and unit are combined in one cell, e.g. "68.9 GPa".
    """
    site = "azom"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        # Try to find a page title for the material name
        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        # Property tables may appear in multiple containers
        for container in soup.select(".content-item-body, .article-content, .specifications-table"):
            for table in container.find_all("table"):
                for tr in table.find_all("tr"):
                    cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                    if len(cells) < 2:
                        continue
                    prop_name = cells[0]
                    if len(cells) == 2:
                        # Value and unit combined
                        val_raw = cells[1]
                        num_m = _split_val_unit(val_raw)
                        if num_m:
                            rows.append((prop_name, num_m[0], num_m[1]))
                        else:
                            rows.append((prop_name, val_raw, ""))
                    elif len(cells) >= 3:
                        # Try: [name] [metric value+unit] [imperial value+unit]
                        # Use first (metric) value column
                        metric_cell = cells[1]
                        num_m = _split_val_unit(metric_cell)
                        if num_m:
                            rows.append((prop_name, num_m[0], num_m[1]))
                        else:
                            rows.append((prop_name, metric_cell, ""))

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class MakeItFromParser(BaseParser):
    """
    MakeItFrom.com material pages.

    Properties are in div sections (class contains 'mech', 'therm', etc.).
    Each property block has a <p class="nd"> for the name and a value block
    containing the number, with units in <i> tags.
    The site shows metric first, then imperial in a second block; we take metric.
    """
    site = "makeitfrom"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        # Sections: .mech-prop, .therm-prop, .ele-prop, .other-prop, .common-prop
        # or simpler class names. The site wraps each property in a <div> or <li>.
        # Pattern: look for named property blocks.
        for prop_div in soup.find_all(class_=re.compile(r'\bnd\b|\bprop-name\b|\bname\b')):
            prop_name = prop_div.get_text(strip=True)
            # Value is in a sibling or nearby element
            parent = prop_div.parent
            if parent:
                val_el = parent.find(class_=re.compile(r'\bval\b|\bvalue\b|\bnum\b'))
                if val_el:
                    # Units are in <i> inside the value element
                    unit_els = val_el.find_all("i")
                    unit = " ".join(u.get_text(strip=True) for u in unit_els)
                    # Remove units from value text
                    val_text = val_el.get_text(" ", strip=True)
                    for u in unit_els:
                        val_text = val_text.replace(u.get_text(strip=True), "")
                    rows.append((prop_name, val_text.strip(), unit.strip()))

        # Fallback: look for definition-list or table patterns
        if not rows:
            rows = self._fallback_table_rows(soup)

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)

    def _fallback_table_rows(self, soup) -> list[tuple[str, str, str]]:
        rows = []
        for table in soup.find_all("table"):
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) >= 2:
                    prop = cells[0]
                    val_raw = cells[1]
                    m = _split_val_unit(val_raw)
                    if m:
                        rows.append((prop, m[0], m[1]))
        return rows


class MatWebParser(BaseParser):
    """
    MatWeb.com material data sheets.

    Properties in a table with class "tablediv" or similar.
    Rows: [Property] [Value] [Units]
    """
    site = "matweb"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        # MatWeb title usually in <h1> or page title
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)
        if not name:
            title = soup.find("title")
            if title:
                name = title.get_text(strip=True).split("|")[0].strip()

        rows = []
        # MatWeb tables: [Property] [Metric value+unit] [Imperial value+unit]
        # Always parse value and unit from cells[1] only; cells[2] is the imperial
        # column and must NOT be used as the unit string (it contains a number+unit
        # that would cause the metric value to be re-converted with the wrong unit).
        for table in soup.find_all("table", class_=re.compile(r'tablediv|datatable|property', re.I)):
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) >= 2:
                    m = _split_val_unit(cells[1])
                    if m:
                        rows.append((cells[0], m[0], m[1]))

        # Fallback: any table that looks like property data
        if not rows:
            for table in soup.find_all("table"):
                for tr in table.find_all("tr"):
                    cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                    if len(cells) >= 2:
                        prop = cells[0]
                        if not prop or _num(prop) is not None:
                            continue
                        m = _split_val_unit(cells[1])
                        if m:
                            rows.append((prop, m[0], m[1]))

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class SpaceMatDBParser(BaseParser):
    """
    SpaceMatDB material pages.

    Property tables use class="TFtable". Two-column: [Property] [Value + unit].
    Collapsible sections with id="flip1"/"panel1", etc.
    """
    site = "spacematdb"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        for table in soup.find_all("table", class_=re.compile(r'TFtable|spacetable', re.I)):
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) < 2:
                    continue
                prop = cells[0]
                val_raw = cells[1]
                m = _split_val_unit(val_raw)
                if m:
                    rows.append((prop, m[0], m[1]))
                else:
                    rows.append((prop, val_raw, ""))

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class TheWorldMaterialParser(BaseParser):
    """
    TheWorldMaterial.com pages.

    Standard HTML tables with class="table" inside .table-responsive wrappers.
    Header row labels property name; columns may have metric and imperial values.
    """
    site = "theworldmaterial"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        for wrapper in soup.select(".table-responsive, .entry-content"):
            for table in wrapper.find_all("table"):
                trs = table.find_all("tr")
                # Try to detect header row with column names
                headers = []
                if trs:
                    header_cells = [th.get_text(strip=True) for th in trs[0].find_all(["th", "td"])]
                    if any(h for h in header_cells if not _num(h)):
                        headers = header_cells
                        trs = trs[1:]

                for tr in trs:
                    cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                    if len(cells) < 2:
                        continue
                    prop = cells[0]
                    # Use first numeric value column
                    for cell in cells[1:]:
                        m = _split_val_unit(cell)
                        if m:
                            rows.append((prop, m[0], m[1]))
                            break

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class EngineersEdgeParser(BaseParser):
    """
    EngineersEdge.com pages.

    Legacy HTML with <TABLE> (no class), inline bgcolor/width styling.
    Often has both metric and imperial columns side-by-side.
    We prefer the metric column (first numeric value found).
    """
    site = "engineersedge"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        for tag in soup.find_all(["h1", "h2"]):
            text = tag.get_text(strip=True)
            if text and len(text) > 5:
                name = text
                break

        rows = []
        for table in soup.find_all("table"):
            trs = table.find_all("tr")
            for tr in trs:
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) < 2:
                    continue
                prop = cells[0].strip()
                if not prop or prop.lower() in ("property", "properties", "characteristic"):
                    continue
                # Take first cell with a number as the metric value
                for cell in cells[1:]:
                    m = _split_val_unit(cell)
                    if m:
                        rows.append((prop, m[0], m[1]))
                        break

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class HighTempMetalsParser(BaseParser):
    """
    HighTempMetals.com pages.

    Multi-column tables with temperature columns paired with property values.
    Columns often follow the pattern: °C | value | °F | value.
    Room-temperature rows are identified by ~20–25 °C entries.
    """
    site = "hightempmetals"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        for table in soup.find_all("table"):
            headers = []
            trs = table.find_all("tr")
            if not trs:
                continue
            # Read header row if present
            first_cells = [td.get_text(strip=True) for td in trs[0].find_all(["td", "th"])]
            if any(h for h in first_cells if _num(h) is None and h):
                headers = first_cells
                trs = trs[1:]

            if headers:
                # Structured: header describes the property, rows are temperature points
                # The section title (above the table) usually names the property
                section_header = table.find_previous(["h2", "h3", "h4", "strong", "b"])
                section_name = section_header.get_text(strip=True) if section_header else "Unknown"
                for tr in trs:
                    cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                    if not cells:
                        continue
                    # Zip with headers; look for room-temp value
                    for h, c in zip(headers, cells):
                        if not h or not c:
                            continue
                        # If header looks like a property name (not a temp), pair it
                        if _num(h) is None and _num(c) is not None:
                            rows.append((f"{section_name} — {h}", c, ""))
                        elif h.strip().lower() in ("°c", "c", "temp(c)", "temperature"):
                            pass  # Skip temperature index column
            else:
                # Simple two-column: [Property] [Value+unit]
                for tr in trs:
                    cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                    if len(cells) >= 2:
                        prop = cells[0]
                        m = _split_val_unit(cells[1])
                        if m:
                            rows.append((prop, m[0], m[1]))

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class EfundaParser(BaseParser):
    """
    eFunda.com material pages.

    Content in .ros-content or standard tables. Properties are typically
    in well-structured two- or three-column tables.
    """
    site = "efunda"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        for table in soup.find_all("table"):
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) >= 3:
                    rows.append((cells[0], cells[1], cells[2]))
                elif len(cells) == 2:
                    m = _split_val_unit(cells[1])
                    if m:
                        rows.append((cells[0], m[0], m[1]))

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class NISTParser(BaseParser):
    """
    NIST material data pages.

    NIST pages vary widely. This parser handles the cryogenic materials
    database structure as well as general NIST pages with property tables.
    """
    site = "nist"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        for table in soup.find_all("table"):
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) >= 2:
                    prop = cells[0]
                    for cell in cells[1:]:
                        m = _split_val_unit(cell)
                        if m:
                            rows.append((prop, m[0], m[1]))
                            break

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


class GenericParser(BaseParser):
    """
    Fallback parser: scan all tables in the page for (name, value, unit) rows.
    Skips tables with fewer than 2 columns and rows with no numeric value.
    """
    site = "generic"

    def parse(self, html: str, stub: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")

        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

        rows = []
        for table in soup.find_all("table"):
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) < 2:
                    continue
                prop = cells[0]
                if not prop or _num(prop) is not None:
                    continue  # Skip rows where first cell is a number (header/spacer)
                for cell in cells[1:]:
                    m = _split_val_unit(cell)
                    if m:
                        rows.append((prop, m[0], m[1]))
                        break

        parsed, raw = self._apply_rows(rows)
        result = _empty_result(stub, self.site, None)
        if name:
            result["identification"]["name"] = name
        return _finish(result, parsed, raw)


# ── Site detection ────────────────────────────────────────────────────────────

_PARSERS: dict[str, type[BaseParser]] = {
    "azom":             AZoMParser,
    "makeitfrom":       MakeItFromParser,
    "matweb":           MatWebParser,
    "spacematdb":       SpaceMatDBParser,
    "theworldmaterial": TheWorldMaterialParser,
    "engineersedge":    EngineersEdgeParser,
    "engineers-edge":   EngineersEdgeParser,
    "hightempmetals":   HighTempMetalsParser,
    "efunda":           EfundaParser,
    "nist":             NISTParser,
}


def _detect_site(stem: str) -> str:
    """Detect site from filename stem using longest-prefix match."""
    for prefix in sorted(_PARSERS, key=len, reverse=True):
        if stem.startswith(prefix):
            return prefix
    return "generic"


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    # Windows consoles default to a legacy codepage (cp1252) that can't encode
    # this script's output (box-drawing separator, arrows, µ in property names)
    # — the parse itself succeeds but the summary print crashes with exit 1.
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(errors="replace")

    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("html_dir", help="Directory containing downloaded HTML files")
    parser.add_argument(
        "--glob", default="*.html", metavar="PATTERN",
        help="Glob pattern to filter files (default: *.html). Example: azom*.html"
    )
    parser.add_argument(
        "--output", metavar="DIR",
        help="Directory for parsed JSON output (default: <html_dir>/parsed/)"
    )
    args = parser.parse_args()

    html_dir = Path(args.html_dir)
    if not html_dir.is_dir():
        print(f"ERROR: {html_dir} is not a directory")
        sys.exit(1)

    output_dir = Path(args.output) if args.output else html_dir / "parsed"
    output_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(html_dir.glob(args.glob))
    if not files:
        print(f"No files matching '{args.glob}' in {html_dir}")
        sys.exit(0)

    print(f"Input dir  : {html_dir.resolve()}")
    print(f"Pattern    : {args.glob}")
    print(f"Output dir : {output_dir.resolve()}")
    print(f"Files      : {len(files)}\n")

    ok = skipped = 0
    for html_file in files:
        stub = html_file.stem
        site = _detect_site(stub)
        parser_cls = _PARSERS.get(site, GenericParser)
        parser_inst = parser_cls()

        try:
            html = html_file.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            print(f"  SKIP  {stub:50s}  read error: {e}")
            skipped += 1
            continue

        try:
            result = parser_inst.parse(html, stub)
        except Exception as e:
            print(f"  FAIL  {stub:50s}  parse error: {e}")
            skipped += 1
            continue

        out_path = output_dir / f"{stub}.json"
        out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        raw_count = len(result.get("_raw", {}))
        parsed_count = (
            len(result.get("mechanical_common", {}))
            + len(result.get("mechanical_other", {}))
            + len(result.get("physical", {}))
        )
        print(f"  OK    {stub:50s}  [{site}]  {parsed_count} mapped, {raw_count} raw")
        ok += 1

    print(f"\n{'─' * 60}")
    print(f"Parsed : {ok}/{len(files)}  →  {output_dir}")
    if skipped:
        print(f"Skipped: {skipped}")


if __name__ == "__main__":
    main()
