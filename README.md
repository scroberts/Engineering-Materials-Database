# UVIC Engineering Materials Database

A static reference database of engineering material properties for Design Engineering students at the University of Victoria. Browse, filter, compare, and export data for metals, plastics, ceramics, composites, elastomers, glass, and natural materials.

**Live site:** https://scroberts.github.io/Engineering-Materials-Database/

[![Validate Material JSON](https://github.com/scroberts/Engineering-Materials-Database/actions/workflows/validate-schema.yml/badge.svg)](https://github.com/scroberts/Engineering-Materials-Database/actions/workflows/validate-schema.yml)  [![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

> **Educational use only.** Data has been compiled from published sources. Do not use as the sole basis for safety-critical design decisions — always verify against primary sources and manufacturer datasheets.

---

## Features

- **Browse** — filter materials by category, fabrication process, common forms, usage frequency, and magnetic classification; shareable URL state
- **Advanced Selection** — three-tier filtering: categorical pre-filters → up to 5 numeric property range filters → merit index or property ranking (M1–M11)
- **Compare** — side-by-side bar charts, S-N curve overlay, CTE vs temperature chart, and merit index table for up to 10 materials
- **Detail view** — full property tables with unit conversion (metric/imperial), reference badges, and cryogenic data tables
- **Submit** — form-based submission that exports a validated JSON file for review via GitHub Pull Request; supports edit mode for existing materials
- **Export** — CSV and Excel download from both Detail and Compare pages, in current display units or canonical units

---

## Material Coverage (62 materials)

| Category | Materials |
|---|---|
| Metals (33) | Aluminium alloys (1100-O, 2024-T3, 5052-H32, 6061-T6, 6063-T5, 7075-T6), AlSi10Mg, Beryllium S65, Brass (Free-Cutting ASTM B16), Copper C11000, Inconel 625, Inconel 718, Invar 36, Magnesium AZ31B-H24, Maraging Steel 300 (DMLS, Aged), Nitinol (shape memory & superelastic), Stainless 17-4 PH, 17-7 PH, 303/304/316, 316L (DMLS), Steel 1018 (Cold-Drawn)/4130 (Normalized)/4340/A2/H13/Mild A36/Spring 5160, Ti-6Al-4V (annealed, Grade 5 STA, and DMLS heat-treated) |
| Plastics (11) | ABS, Acrylic (PMMA), Nylon 6 (PA6), Nylon 12 (PA12), PEEK, PETG-FDM, PHA-FDM, PLA-FDM, Polycarbonate (PC), POM (Delrin), UHMW-PE |
| Ceramics (3) | Alumina Al₂O₃, Silicon Carbide, Tungsten Carbide-Cobalt (WC-6Co) |
| Composites (5) | CFRP-UD, C-SiC Woven, GFRP Woven, Kevlar 49/Epoxy UD, Synfoam SW-9 Syntactic Foam |
| Elastomers (4) | EPDM, Fluorocarbon (Viton), Nitrile (NBR), Silicone (VMQ) |
| Glass (4) | BK7 Optical, Borosilicate, ULE, Zerodur Grade 0 |
| Natural (2) | Balsa Wood, Birch Plywood |

---

## Architecture

**Pure static site — no server, no build step, no framework.**

| Layer | Technology |
|---|---|
| Hosting | GitHub Pages |
| Markup | HTML5 |
| Styles | CSS3 (hand-written, no framework) |
| Logic | Vanilla JavaScript — ES Modules (`type="module"`) |
| Charts | Chart.js 4.x via CDN |
| Excel export | SheetJS (xlsx) via CDN |
| Data | JSON files (`materials/`, `references/`) |
| Schema | JSON Schema Draft-07 (`schema/v1.json`) |
| Admin tools | Python 3 scripts (`tools/`) |
| CI | GitHub Actions — schema validation on every PR |

---

## Running Locally

ES modules require an HTTP server — opening `index.html` directly with `file://` will not work.

```bash
# Clone the repo
git clone https://github.com/scroberts/Engineering-Materials-Database.git
cd Engineering-Materials-Database

# Start a dev server (Python 3 built-in)
python -m http.server

# Open in browser
open http://localhost:8000
```

---

## Admin Tools

Requires Python 3 and the packages in `tools/requirements.txt`.

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate          # macOS/Linux
.venv\Scripts\activate             # Windows

pip install -r tools/requirements.txt
```

### Data management

| Script | Purpose | When to run |
|---|---|---|
| `python tools/validate.py` | Validate all material JSONs against the schema | Before every commit touching `materials/` |
| `python tools/update_manifest.py` | Regenerate `materials/index.json` | After merging any new material |
| `python tools/migrate.py` | Apply schema version migrations | When schema version increments |
| `python tools/import_bibtex.py [file.bib] [--write]` | Bulk-import references from a `.bib` file | When adding references in bulk |
| `python tools/import_new_refs.py [files] [--write]` | Promote `new_references` from material JSONs into `references/index.json` | After merging a PR that used `new_references` |

### Reference verification

A three-step workflow for auditing material property values against their cited web sources.

> **Storage note:** downloaded HTML and PDF files are kept **outside the repository** (gitignored) in a local folder such as OneDrive. Never save them inside the repo directory.

**Step 1 — download**

```
python tools/download_refs.py <output_dir> [options]
```

| Option | Default | Description |
|---|---|---|
| `<output_dir>` | *(required)* | Directory to save downloaded files — use a path **outside** the repo |
| `--delay SECS` | `1.5` | Pause between requests (be polite to servers) |
| `--force` | off | Re-download files that already exist |

Fetches every URL in `references/index.json` and saves each as `<output_dir>/<stub>.html` or `.pdf`. If the HTML page links to a PDF, that is downloaded too. Failures are logged to `<output_dir>/failed.txt`.

**Step 2 — parse**

```
python tools/parse_refs.py <html_dir> [options]
```

| Option | Default | Description |
|---|---|---|
| `<html_dir>` | *(required)* | Directory of downloaded HTML files |
| `--glob PATTERN` | `*.html` | Filter files, e.g. `"azom*.html"` |
| `--output DIR` | `<html_dir>/parsed/` | Where to write the output JSON files |

Reads each HTML file, detects the source site from the filename prefix (`azom-*`, `makeitfrom-*`, `matweb-*`, `spacematdb-*`, `theworldmaterial-*`, `engineersedge-*`, `hightempmetals-*`, `efunda-*`, `nist-*`), and extracts property values using a site-specific parser. Output is one JSON per file in material-schema format with canonical units. Unrecognised properties are stored under `_raw`.

**Step 3 — compare**

```
python tools/compare_refs.py <pattern> --refs-dir <dir> [options]
```

| Option | Default | Description |
|---|---|---|
| `<pattern>` | *(required)* | Filename or glob to match material JSONs, e.g. `aluminum*.json` or `*.json` |
| `--refs-dir DIR` | *(required)* | Directory of parsed reference JSONs from Step 2 |
| `--tolerance FRAC` | `0.05` | Relative tolerance for value comparison (0.05 = 5%) |
| `--no-fix` | off | Report only; never prompt to update material files |
| `--verbose` | off | Also list properties that match their cited references |

For each material JSON, reports: properties with a value but no reference assigned; cited reference keys with no parsed file (expected for PDFs); and numeric mismatches beyond the tolerance. For simple numeric mismatches, prompts `y/N` to patch the value in-place.

---

## Adding a New Material

1. Use the **Submit** page to fill in properties and download a validated JSON file, or copy an existing file from `materials/<category>/` as a template.
2. Place the file in the correct `materials/<category>/` subfolder. The filename must match the `slug` field.
3. If using new references not yet in `references/index.json`, embed them under `new_references` in your material JSON (the Submit page does this automatically). After the PR is merged, run `python tools/import_new_refs.py --write` to promote them into the global index.
4. Run `python tools/validate.py` — fix any errors.
5. Run `python tools/update_manifest.py` to regenerate the manifest.
6. Open a Pull Request. CI will re-run validation automatically.

See `.github/PULL_REQUEST_TEMPLATE.md` for the full review checklist.

---

## Repository Structure

```
index.html              Browse/search page
select.html             Advanced Material Selection
material.html           Material detail view (?slug=...)
compare.html            Comparison charts (?slugs=a,b,c)
submit.html             Submission / edit form
404.html                Custom not-found page

css/
  base.css              Reset, CSS variables, site header
  components.css        Badges, buttons, cards, filters
  pages/                Page-specific styles

js/
  core/
    loader.js           Fetch + cache manifest and material files
    store.js            In-memory Map cache
    units.js            All unit conversions
    derived.js          Shear modulus, specific stiffness, merit indices M1–M11
    schema.js           Schema version migration runner
    tooltips.js         Property label → definition map
    export.js           CSV and Excel download
  pages/
    browse.js           Browse page logic
    detail.js           Detail page — property tables, unit pickers
    compare.js          Compare page — charts, merit index table
    submit.js           Submission form — thin orchestrator (see submit/)
    submit/             Submission form logic, split into modules
      state.js          Edit-mode flags derived from the URL
      utils.js          esc()
      formSchema.js     FORM_SECTIONS field definitions
      refsStore.js      Reference database state, side panel, add/edit-ref form
      formBuilder.js    Renders FORM_SECTIONS into DOM controls
      prefill.js        Populates the form from a material JSON or HTML import
      exportJson.js     Reads the form back into canonical JSON + downloads it
    select.js           Advanced Selection logic

materials/
  index.json            Generated manifest (do not edit by hand)
  metals/               32 material JSON files
  plastics/             11 material JSON files
  ceramics/             3 material JSON files
  composites/           5 material JSON files
  elastomers/           4 material JSON files
  glass/                4 material JSON files
  natural/              2 material JSON files

references/
  index.json            Shared reference database (BibTeX cite keys)

schema/
  v1.json               JSON Schema Draft-07 for material files

tools/
  validate.py
  update_manifest.py
  migrate.py
  import_bibtex.py
  import_new_refs.py
  download_refs.py
  parse_refs.py
  compare_refs.py
  requirements.txt

.github/
  PULL_REQUEST_TEMPLATE.md
  workflows/validate-schema.yml
```

---

## Canonical Storage Units

All values are stored in canonical units in JSON. Conversion to display units happens at render time only.

| Property | Canonical Unit |
|---|---|
| Moduli / Pressure | GPa |
| Compressive Strength | MPa (exception) |
| Fracture Toughness | MPa·m½ |
| Density | g/cm³ |
| Temperature | °C |
| CTE | µm/m·K |
| Thermal Conductivity | W/m·K |
| Specific Heat | J/kg·K |
| Thermal Diffusivity | cm²/s |
| Electrical Conductivity | % IACS |
| Hardness | Vickers (HV) |

---

## License

For educational use at the University of Victoria. Material property data is sourced from published references cited within each material file.

---

## AI Disclosure

Development of this tool was assisted by [Claude](https://claude.ai) (Anthropic). AI was used for JavaScript feature development, JSON data entry from reference sources, schema design, and code review. All material property values were verified against primary sources cited within each material file.
