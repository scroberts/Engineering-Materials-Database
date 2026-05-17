# UVIC Engineering Materials Database

A static reference database of engineering material properties for Design Engineering students at the University of Victoria. Browse, filter, compare, and export data for metals, plastics, ceramics, composites, elastomers, glass, and natural materials.

**Live site:** https://scroberts.github.io/Engineering-Materials-Database/

> **Educational use only.** Data has been compiled from published sources. Do not use as the sole basis for safety-critical design decisions — always verify against primary sources and manufacturer datasheets.

---

## Features

- **Browse** — filter materials by category, fabrication process, common forms, usage frequency, and magnetic classification; shareable URL state
- **Advanced Selection** — three-tier filtering: categorical pre-filters → up to 5 numeric property range filters → merit index or property ranking (M1–M13)
- **Compare** — side-by-side bar charts, S-N curve overlay, CTE vs temperature chart, and merit index table for up to 10 materials
- **Detail view** — full property tables with unit conversion (metric/imperial), reference badges, and cryogenic data tables
- **Submit** — form-based submission that exports a validated JSON file for review via GitHub Pull Request; supports edit mode for existing materials
- **Export** — CSV and Excel download from both Detail and Compare pages, in current display units or canonical units

---

## Material Coverage (41 materials)

| Category | Materials |
|---|---|
| Metals (19) | Aluminium alloys (1100-O, 5052-H32, 6061-T6, 7075-T6), AlSi10Mg, Beryllium S65, Copper C11000, Inconel 625, Inconel 718, Invar 36, Stainless 303/304/316, Steel 4340/A2/H13/Mild A36/Spring 5160, Ti-6Al-4V |
| Plastics (7) | ABS, ABS-FDM, Acrylic (PMMA), PEEK, PETG-FDM, PLA-FDM, POM (Delrin) |
| Ceramics (2) | Alumina Al₂O₃, Silicon Carbide |
| Composites (3) | CFRP-UD, C-SiC Woven, GFRP Woven |
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

| Script | Purpose | When to run |
|---|---|---|
| `python tools/validate.py` | Validate all material JSONs against the schema | Before every commit touching `materials/` |
| `python tools/update_manifest.py` | Regenerate `materials/index.json` | After merging any new material |
| `python tools/migrate.py` | Apply schema version migrations | When schema version increments |
| `python tools/import_bibtex.py` | Bulk-import references from a `.bib` file | When adding references in bulk |

---

## Adding a New Material

1. Use the **Submit** page to fill in properties and download a validated JSON file, or copy an existing file from `materials/<category>/` as a template.
2. Place the file in the correct `materials/<category>/` subfolder. The filename must match the `slug` field.
3. Add any new references to `references/index.json` (BibTeX cite key → entry).
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
    derived.js          Shear modulus, specific stiffness, merit indices M1–M13
    schema.js           Schema version migration runner
    tooltips.js         Property label → definition map
    export.js           CSV and Excel download
  pages/
    browse.js           Browse page logic
    detail.js           Detail page — property tables, unit pickers
    compare.js          Compare page — charts, merit index table
    submit.js           Submission form logic
    select.js           Advanced Selection logic

materials/
  index.json            Generated manifest (do not edit by hand)
  metals/               19 material JSON files
  plastics/             7 material JSON files
  ceramics/             2 material JSON files
  composites/           3 material JSON files
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
