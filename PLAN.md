# UVIC Design Engineering Materials Database — Development Plan

## Overview

Build a static materials database website for UVIC Design Engineering students, hosted on GitHub Pages. Students browse, search, compare, and reference common engineering materials. They can also propose new entries via a form that exports a JSON file, submitted for admin review via GitHub Pull Request.

**Stack:** Plain HTML/CSS/JS frontend (no build step) · Chart.js via CDN · Material data as JSON files in the repo · Python scripts for all admin tooling

---

## Repository Structure

```
/
├── index.html              # Browse/search page (main entry point)
├── material.html           # Single material detail view (?slug=...)
├── compare.html            # Multi-material comparison and merit indices
├── submit.html             # Student submission form
├── 404.html                # GitHub Pages fallback

├── css/
│   ├── base.css            # Reset, typography, CSS variables
│   ├── components.css      # Cards, badges, dropdowns, modals
│   └── pages/
│       ├── browse.css
│       ├── detail.css
│       ├── compare.css
│       └── submit.css

├── js/
│   ├── core/
│   │   ├── loader.js       # Fetches manifest + lazy-loads individual material files
│   │   ├── store.js        # In-memory Map cache keyed by slug
│   │   ├── schema.js       # Schema version constants + in-browser migration runner
│   │   ├── units.js        # Unit conversion: convert(value, fromUnit, toUnit)
│   │   ├── derived.js      # Calculated properties and merit indices M1–M13
│   │   └── tooltips.js     # Property name → definition string map
│   └── pages/
│       ├── browse.js       # Filter/search/card rendering for index.html
│       ├── detail.js       # Property table + unit picker wiring for material.html
│       ├── compare.js      # Charts, S-N curve, CTE, merit index table
│       └── submit.js       # Form build, JSON download, upload-to-prefill

├── materials/
│   ├── index.json          # Manifest: lightweight metadata for all approved materials
│   ├── metals/
│   ├── plastics/
│   ├── ceramics/
│   └── composites/

├── schema/
│   └── v1.json             # JSON Schema Draft-07 for material file format

├── references/
│   └── index.json          # Shared BibTeX reference database

├── tools/                  # Python admin scripts (not served by GitHub Pages)
│   ├── validate.py         # Validate all material JSONs against schema
│   ├── update_manifest.py  # Regenerate materials/index.json from material files
│   ├── migrate.py          # Migrate material files to latest schema version
│   ├── import_bibtex.py    # Parse .bib files and add to references/index.json
│   ├── import_new_refs.py  # Promote new_references from material JSONs into references/index.json
│   └── requirements.txt    # jsonschema, bibtexparser

└── .github/
    ├── PULL_REQUEST_TEMPLATE.md
    └── workflows/
        └── validate-schema.yml   # CI: runs tools/validate.py on PRs
```

---

## JSON Schema (v1)

### Canonical Storage Units

All values stored in canonical units in JSON. Display conversion happens at render time only.

| Property                | Canonical Unit | Notes |
|-------------------------|----------------|-------|
| Pressure / Moduli       | GPa            | |
| Compressive Strength    | MPa            | Exception to the GPa rule |
| Density                 | g/cm³          | Displayed in both g/cm³ and kg/m³ |
| Temperature             | °C             | |
| Ductility               | %              | |
| Hardness                | Vickers (HV)   | |
| Fracture Toughness      | MPa·m^0.5      | |
| CTE                     | µm/m·°C        | |
| Thermal Conductivity    | W/m·K          | |
| Specific Heat           | J/kg·K         | |
| Thermal Diffusivity     | cm²/s          | |
| Electrical Conductivity | % IACS         | % of International Annealed Copper Standard |
| Vapour Pressure         | Pa             | |

### Material File Structure

```json
{
  "schema_version": 1,
  "identification": {
    "name": "Aluminum 6061-T6",
    "slug": "aluminum-6061-t6",
    "category": "Metal",
    "fabrication_processes": ["Machining", "Extrude", "Forging"],
    "common_forms": ["Sheet", "Round Bar"],
    "common_form_notes": null,
    "usage_frequency": "Common",
    "notes": null
  },
  "typical_usage": null,
  "mechanical_common": {
    "youngs_modulus":      { "value": 68.9,  "ref": "10.1117/12.279804" },
    "poissons_ratio":      { "value": 0.33,  "ref": null },
    "yield_strength":      { "value": 0.276, "ref": "10.1117/12.279804" },
    "tensile_strength":    { "value": 0.310, "ref": "10.1117/12.279804" },
    "compressive_modulus": { "value": null,  "ref": null },
    "compressive_strength":{ "value": null,  "ref": null },
    "usable_temp_range":   { "min": -80, "max": 150, "ref": null }
  },
  "mechanical_other": {
    "microyield_strength": { "value": null, "ref": null },
    "creep_strength":      { "value": null, "ref": null },
    "fatigue_sn_curve": {
      "points": [
        { "stress": 0.150, "cycles": 1e4 },
        { "stress": 0.097, "cycles": 5e8 }
      ],
      "ref": null
    },
    "fracture_toughness":  { "value": null, "ref": null },
    "hardness_vickers":    { "value": null, "ref": null },
    "hardness_brinell":    { "value": 107,  "ref": "10.1117/12.279804" },
    "hardness_rockwell":   { "value": null, "scale": null, "ref": null },
    "ductility":           { "min": 8, "max": 17, "typical": null, "ref": null },
    "shear_strength":      { "value": null, "ref": null }
  },
  "physical": {
    "density":                { "value": 2.70,  "ref": "10.1117/12.279804" },
    "electrical_conductivity":{ "value": 30.0,  "ref": null },
    "vapour_pressure":        { "value": null,  "ref": null },
    "thermal_expansion": {
      "value": 23.6,
      "table": [
        { "temp": 20,  "cte": 23.6 },
        { "temp": 100, "cte": 24.5 }
      ],
      "ref": null
    },
    "thermal_conductivity":   { "value": 167,  "ref": null },
    "specific_heat":          { "value": 896,  "ref": null },
    "thermal_diffusivity":    { "value": null, "ref": null },
    "melting_point_tm":       { "value": 652,  "ref": null },
    "glass_transition_tg":    { "value": null, "ref": null }
  },
  "references": ["10.1117/12.279804"],
  "metadata": {
    "submitted_by": null,
    "submitted_date": null,
    "approved_by": null,
    "approved_date": null
  }
}
```

References are stored by BibTeX citation key, looked up in `references/index.json`.

### Manifest: materials/index.json

Lightweight summary used by the browse page. Generated by `tools/update_manifest.py` — avoids fetching every individual material file on page load.

```json
{
  "generated": "2025-01-01T00:00:00Z",
  "materials": [
    {
      "slug": "aluminum-6061-t6",
      "path": "materials/metals/aluminum-6061-t6.json",
      "name": "Aluminum 6061-T6",
      "category": "Metal",
      "fabrication_processes": ["Machining", "Extrude"],
      "common_forms": ["Sheet", "Round Bar"],
      "usage_frequency": "Common",
      "youngs_modulus": 68.9,
      "density": 2.70,
      "yield_strength": 0.276,
      "tensile_strength": 0.310,
      "magnetic_classification": "Paramagnetic"
    }
  ]
}
```

### References: references/index.json

```json
{
  "10.1117/12.279804": {
    "bibtex": "@inproceedings{10.1117/12.279804, ...}",
    "short_label": "Paquin 1997",
    "doi": "10.1117/12.279804"
  }
}
```

Short labels are auto-generated as **"Author Year"** (first author surname + year).

---

## Page Descriptions

### index.html — Browse / Search

- Loads `materials/index.json` manifest on page load via `loader.loadManifest()`
- Sidebar filters: category, fabrication process, common forms, commonly-available toggle, text search
- Main grid of material cards; each card has a "Compare" checkbox
- Filter state serialised to URL query params (shareable links)
- Floating "Compare N" button (max 10) navigates to `compare.html?slugs=...`

### material.html — Material Detail

- Reads `?slug=` query param; loads full material JSON via `loader.loadMaterial(slug)`
- Runs `schema.js` migration if needed; computes derived properties via `derived.js`
- Property table grouped by section; each pressure field has a unit `<select>`
- Each property row shows its attached reference (short label)
- Unit conversion: canonical value in `data-canonical` attribute; dropdown triggers `units.convert()` and updates display in-place
- Ductility typical computed as avg(min, max) if null, shown as "(calculated)"
- Hardness: computes missing scales at display time (HB ≈ HV / 1.05)
- CTE: sparkline if table is present; links to CTE chart on compare page
- Disclaimer banner (not for safety-critical use)
- Download CSV button (visible or all properties)

### compare.html — Comparison and Merit Indices

Receives `?slugs=slug1,slug2,...` (max 10). Fetches all material JSONs in parallel.

**Property bar charts** — one per numerical property; property selector checkboxes show/hide; global unit selector rescales via `chart.update()` without re-render.

**S-N Curve chart** — log x-axis (cycles), linear y-axis (stress); log-linear interpolation between data points; only shown for materials with `fatigue_sn_curve` data.

**CTE vs Temperature chart** — monotone cubic interpolation between table points; shown for materials with multi-point CTE tables.

**Merit Index table** — one row per index (M1–M13), one column per material. Each cell shows the numeric value and an inline mini-bar (width proportional to performance within the row). Best performer highlighted. "—" for missing data. Rows grouped into collapsible sections; row checkboxes show/hide individual indices.

**CSV export** — user chooses visible-only (current display units) or all properties (canonical units).

Chart.js 4.x via CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`

### submit.html — Student Submission Form

- Disclaimer banner at top
- All fields from the schema, grouped by section, in order
- Each pressure field has a unit selector; value converted to canonical units on export
- Each property row has a reference dropdown populated from `references/index.json`
- Reference panel: lists all known references; student can select, or add new via manual entry or `.bib` upload
- Live preview of calculated properties as fields are filled
- Hover tooltips on all property labels (same definitions as detail page)
- **Upload JSON**: pre-fills form; migrates old schema versions first; shows "pre-filled" notice
- **Download JSON**: converts to canonical units, sets `schema_version` and `submitted_date`, triggers file download
- Post-download panel shows GitHub PR submission instructions

---

## JavaScript Core Modules

### js/core/loader.js

| Function | Description |
|---|---|
| `loadManifest()` | Fetch `materials/index.json` once; cache in store; return same promise on repeat calls |
| `loadMaterial(slug)` | Cache miss → look up path in manifest → fetch → cache → return |
| `loadMaterialBatch(slugs)` | `Promise.all(slugs.map(loadMaterial))` |

### js/core/units.js

`convert(value, fromUnit, toUnit)` — pure function; all conversion math in one place.

| Conversion | Detail |
|---|---|
| Pressure (GPa base) | ×1000 MPa · ×145037.738 psi · ×145.038 ksi |
| Compressive Strength | Stored in MPa; picker shows MPa / psi / ksi only |
| Density | g/cm³ × 1000 = kg/m³; both shown simultaneously, no picker |
| Fracture Toughness | MPa·m^0.5 × 0.9099 = ksi·in^0.5 |
| Hardness | HB ≈ HV / 1.05; Rockwell via ASTM E140 table lookup |
| Electrical Conductivity | Stored as % IACS; no conversion needed |

### js/core/derived.js

**Structural properties:**

| Function | Formula | Unit |
|---|---|---|
| `shearModulus(m)` | E / (2(1+ν)) | GPa |
| `shearStrength(m)` | σ_y / √3 | GPa (used only when not directly entered) |
| `specificStiffness(m)` | E / ρ | MN·m/kg |

**Merit indices** — all return null if any required input is missing:

| ID | Function | Formula | Better |
|----|---|---|---|
| M1 | `meritM1(m)` | E / ρ | Higher |
| M2 | `meritM2(m)` | (E/ρ)^0.5 | Higher |
| M3 | `meritM3(m)` | (E/ρ)^(1/3) | Higher |
| M4 | `meritM4(m)` | E^0.5 / ρ | Higher |
| M5 | `meritM5(m)` | σ_y / ρ | Higher |
| M6 | `meritM6(m)` | σ_y^(2/3) / ρ | Higher |
| M7 | `meritM7(m)` | σ_y^0.5 / ρ | Higher |
| M8 | `meritM8(m)` | K_IC / σ_y | Higher |
| M9 | `meritM9(m)` | K_IC² / σ_y² | Higher |
| M10 | `meritM10(m)` | K_IC / ρ | Higher |
| M11 | `meritM11(m)` | α / k | Lower |
| M12 | `meritM12(m)` | α / D | Lower |
| M13 | `meritM13(m)` | k / (ρ·Cp) | Higher |

Exported as `MERIT_INDICES = [{ id, label, fn, higherIsBetter }, ...]` so `compare.js` iterates generically.

### js/core/schema.js

- `CURRENT_VERSION = 1`
- `MIGRATIONS = [{ fromVersion, toVersion, migrate }]`
- `migrateToLatest(obj)` — runs migration chain in-memory; disk files never modified by the browser

### js/core/tooltips.js

Central map of property key → definition string. Used by `detail.js` and `submit.js` to attach hover tooltips to all property labels.

---

## Python Admin Tools

Activate the virtual environment first: `.venv\Scripts\activate`
Install dependencies: `pip install -r tools/requirements.txt`

| Script | Purpose | When to run |
|---|---|---|
| `tools/validate.py` | Validate all `materials/**/*.json` against `schema/v1.json`; non-zero exit on failure | CI on every PR; locally before committing new material files |
| `tools/update_manifest.py` | Walk `materials/` tree; write `materials/index.json` | After every merged material PR |
| `tools/migrate.py` | In-place migrate material files to latest schema; backs up originals to `tools/backup/` | When schema version increments |
| `tools/import_bibtex.py` | Parse `.bib` file; add new entries to `references/index.json` with auto-generated short labels | When adding references in bulk |
| `tools/import_new_refs.py` | Promote `new_references` entries from material JSONs into `references/index.json`. Dry-run by default; `--write` to apply | After merging a PR that used `new_references` |

---

## Admin Workflow

1. Student opens a Pull Request adding a file to `materials/<category>/`
2. CI runs `tools/validate.py` — PR cannot merge if it fails
3. Admin reviews PR diff; checks PR template checklist
4. On approval, admin merges PR
5. Admin runs `python tools/import_new_refs.py --write` then `python tools/update_manifest.py` locally and commits both outputs to `main`

**PR checklist** (`.github/PULL_REQUEST_TEMPLATE.md`):
- [ ] File in correct `materials/<category>/` subfolder
- [ ] Filename matches `slug` field in JSON
- [ ] `schema_version` matches current version
- [ ] Pressure values in GPa; compressive strength in MPa
- [ ] At least one property has a reference attached
- [ ] `usage_frequency` set appropriately (Common / Specialty / Exotic)
- [ ] New references either in `references/index.json` or embedded under `new_references`

---

## Build Order

- [x] 1. `schema/v1.json` — formal schema; everything else depends on this contract
- [x] 2. `references/index.json` — seed with the Paquin 1997 reference
- [x] 3. `materials/metals/aluminum-6061-t6.json` + 2 seed materials from other categories
- [x] 4. `tools/validate.py` · `tools/update_manifest.py` · `tools/requirements.txt`
- [x] 5. `materials/index.json` — generated by running `update_manifest.py`
- [x] 6. `js/core/units.js`
- [x] 7. `js/core/loader.js` · `js/core/store.js`
- [x] 8. `js/core/derived.js` · `js/core/schema.js` · `js/core/tooltips.js`
- [x] 9. `index.html` · `js/pages/browse.js` · CSS
- [x] 10. `material.html` · `js/pages/detail.js`
- [x] 11. `compare.html` · `js/pages/compare.js`
- [x] 12. `submit.html` · `js/pages/submit.js`
- [x] 13. `tools/migrate.py` · `tools/import_bibtex.py`
- [x] 14. `.github/PULL_REQUEST_TEMPLATE.md` · `.github/workflows/validate-schema.yml`
- [x] 15. Edit mode — implemented as dual-mode `submit.html` (`?slug=` pre-fills form, locks slug, "Download Updated JSON")
- [x] 16. Additional seed materials — 41 materials across metals, plastics, ceramics, composites, elastomers, glass, and natural categories
- [x] 17b. `tools/import_new_refs.py` — promote `new_references` from submitted JSONs into `references/index.json`; closes the manual copy step in the admin workflow
- [x] 17. `404.html`
- [x] 18. Merit index table improvements — shortName, augmented descriptions, reference footnotes in `derived.js` + `compare.js`
- [x] 19. `js/core/export.js` · Download dropdown in detail.js + compare.js · SheetJS CDN in compare.html + material.html

### Phase 2 — Advanced Material Selection

- [ ] 20. `magnetic_classification` added to manifest — extend `tools/update_manifest.py` to extract `physical.magnetic_classification.value`; regenerate `materials/index.json`
- [ ] 21. Browse: Magnetic Classification filter — add `<fieldset id="filter-magnetic">` to `index.html` sidebar; extend `materialMatches()` in `browse.js` to filter on `?magnetic=` URL param
- [ ] 22. Browse: "Compare All Filtered" button — shows in compare-bar when 2–10 filtered materials visible; disabled (tooltip) when >10; navigates to `compare.html?slugs=...`
- [ ] 23. Browse: "Advanced Selection →" button — below Reset in sidebar; builds `select.html?cat=...&fab=...&form=...&freq=...&magnetic=...` from current filter state and navigates
- [ ] 24. Nav "Select" link — add to all 5 pages (`index.html`, `material.html`, `compare.html`, `submit.html`, `select.html`) between Compare and Submit
- [ ] 25. `select.html` — page shell: site header, nav, h1, pre-selection panel, max-results/units/temp controls, property filter rows, merit index selector, Find Materials button, results section
- [ ] 26. `css/pages/select.css` — page-specific styles for filter rows, property selector layout, results table
- [ ] 27. `js/pages/select.js` — pre-selection panel (read URL params, display read-only, "Edit" link); Add/Remove filter rows; unit label auto-update; Find Materials button wiring
- [ ] 28. `js/pages/select.js` — two-phase filtering algorithm: manifest pre-filter → `loadMaterialBatch()` → property range filters → merit index ranking → top-N results
- [ ] 29. `js/pages/select.js` — results rendering: table with checkboxes, "Select All" link, "Compare Selected (N)" button → `compare.html?slugs=...`
- [ ] 30. `js/core/disclaimer.js` — add `select.html` to pages that load the disclaimer banner
- [ ] 31. End-to-end verification — full checklist from SPEC.md §12.12

---

## Verification Checklist

| Step | Command / Action | Pass Criteria |
|---|---|---|
| Schema validation | `python tools/validate.py` | No errors |
| Manifest generation | `python tools/update_manifest.py` | `materials/index.json` reflects all seed files |
| Browse page | `python -m http.server`, open `index.html` | Filters narrow results; URL params update; Compare button appears |
| Detail page | Navigate to `material.html?slug=aluminum-6061-t6` | Unit dropdowns recalculate; derived properties shown; tooltips appear |
| Compare page | Select 3 materials → Compare | Bar charts render; merit index table shows M1–M13; CSV downloads correctly |
| Submit form | Fill form → Download JSON | File has canonical units, correct `schema_version`; re-uploading pre-fills form correctly |
| Unit round-trip | Convert GPa → psi → GPa | Returns to original value within floating-point tolerance |
