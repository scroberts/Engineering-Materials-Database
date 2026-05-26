# UVIC Design Engineering Materials Database — Specification

> **Living Document.** This specification evolves as the project develops. When requirements change, update this file and note the change in the relevant section.

---

## 1. Purpose and Goals

This database serves undergraduate and graduate students at UVIC as a reference for material properties used in the mechanical engineering design process.

**Key design principles:**

- **Curated, not exhaustive.** The database features materials that are commonly used in student design projects and are readily available. Obscure or non-substitutable materials may be entered but are flagged as uncommon. This guides students toward practical material choices.
- **Student participation.** Students are encouraged to research materials and submit entries. Submissions are held in review until approved by an administrator.
- **Forward-compatible.** The data format is versioned so that existing entries can be migrated when the schema changes.
- **Safety disclaimer.** The database is a reference tool for educational purposes only. It must not be used as the sole basis for safety-critical design decisions.

---

## 2. System Architecture

- **Repository:** All material data (JSON files) and website code are stored in a GitHub repository.
- **Hosting:** The website is a static site hosted on GitHub Pages. There is no server-side runtime.
- **Admin tooling:** Python scripts in the `tools/` directory handle data management tasks (manifest generation, schema validation, migration, BibTeX import). These run locally or in CI — they are not part of the website.
- **Student submissions:** Students fill out an entry form on the website, download the result as a `.json` file, and submit it via a GitHub Pull Request. An administrator reviews the PR before merging.

---

## 3. Unit System

All values are stored in canonical units in the JSON files. The display layer converts to the user's chosen unit at render time; stored data is never modified.

### Canonical Storage Units

| Property Type           | Canonical Unit | Notes                                                              |
|-------------------------|----------------|--------------------------------------------------------------------|
| Pressure / Moduli       | GPa            |                                                                    |
| Compressive Strength    | MPa            | Exception to the GPa rule; entered and stored in MPa               |
| Density                 | g/cm³          | Displayed in both g/cm³ and kg/m³                                  |
| Temperature             | °C             |                                                                    |
| Ductility               | % (0–100)      |                                                                    |
| Hardness                | Vickers (HV)   |                                                                    |
| Fracture Toughness      | MPa·m^0.5      |                                                                    |
| CTE                     | µm/m·°C        |                                                                    |
| Thermal Conductivity    | W/m·K          |                                                                    |
| Specific Heat           | J/kg·K         |                                                                    |
| Thermal Diffusivity     | cm²/s          |                                                                    |
| Electrical Conductivity | % IACS         | % of International Annealed Copper Standard                        |
| Vapour Pressure         | Pa             |                                                                    |

### Supported Display Unit Conversions

Where a field supports unit selection, a dropdown appears beside the entry or display field. A global **Metric / Imperial** toggle on the detail page switches all unit dropdowns simultaneously.

| Unit Type               | Options                                    | Metric default  | Imperial default | Notes                                                         |
|-------------------------|--------------------------------------------|-----------------|------------------|---------------------------------------------------------------|
| Pressure                | GPa, MPa, psi, ksi                         | GPa             | ksi              |                                                               |
| Compressive Strength    | MPa, psi, ksi                              | MPa             | ksi              | Stored in MPa (exception to GPa rule)                         |
| Fracture Toughness      | MPa·m½, ksi·in½                            | MPa·m½          | ksi·in½          | Multiply MPa·m½ by 0.9099 to get ksi·in½. Displayed with superscript ½ in HTML. |
| Density                 | g/cm³ and kg/m³                            | Both shown      | Both shown       | Both values displayed simultaneously; no selector             |
| Temperature             | K, °C, °F                                  | K               | °F               | Global dropdown applies to all temperature fields on the page |
| Electrical Conductivity | % IACS, MS/m, S/m                          | % IACS          | % IACS           | 1 % IACS = 0.58 MS/m = 580,000 S/m                           |
| Strain / Ductility      | %                                          | %               | %                | No conversion needed                                          |
| Hardness                | Vickers (HV), Brinell (HB), Rockwell       | —               | —                | No selector; all available scales shown simultaneously        |
| Fatigue Cycles          | Cycles                                     | —               | —                | Displayed in condensed scientific notation (e.g. 500 × 10⁶)  |

> **Note — Rockwell hardness:** Rockwell has multiple scales (A, B, C, etc.). The scale must be recorded alongside the value. Conversion between Vickers and Rockwell uses the ASTM E140 standard conversion tables.

> **Note — Fracture toughness notation:** The unit key stored internally is `MPa·m^0.5`; it is rendered as `MPa·m½` with a proper superscript in the browser. Dropdown option text uses the plain form to avoid HTML-rendering limitations in `<select>` elements.

---

## 4. Reference Management

References are stored in a shared database (`references/index.json`) keyed by their BibTeX citation key. Material entries reference this database by key — they do not embed the full BibTeX text.

Short labels are in the format **"Author Year"** (e.g. "Paquin 1997"). For multi-author works, the first author's surname is used.

### Inline Reference Badges

On the material detail page, each property with an attached reference displays a small numbered badge (e.g. **[1]**) as a superscript after the value. Numbers are assigned in the order the references appear in the material's `references` array. Clicking a badge scrolls to the numbered entry in the References section at the bottom of the page.

A reference badge is only shown when a value is actually displayed. Fields that show "—" do not display a badge even if a reference key is present in the JSON.

### Reference Section

The References section at the bottom of each material detail page is open by default and lists all cited references in numbered order. Each entry shows:

- **[N]** — number matching the inline badge
- Short label (e.g. "ASM Handbook V2 1990")
- Title extracted from BibTeX
- A hyperlink, resolved in priority order:
  1. DOI link: `https://doi.org/{doi}` (if a DOI is present)
  2. URL extracted from the BibTeX `url` field
  3. WorldCat link via ISBN: `https://www.worldcat.org/isbn/{isbn}` (for books with no DOI)
  4. No link shown if none of the above are available

### Entering References

References can be added to the database in two ways:

1. **Upload a `.bib` file** — the system parses the file and adds all new entries to the reference database.
2. **Manual entry form** — the user fills in BibTeX fields (author, title, year, journal/booktitle, doi, isbn, etc.) through a structured input screen.

### Attaching References to Properties

Each property field has a reference dropdown beside it. The dropdown lists all references in two groups: "New (this session)" first (alphabetical), then "Reference database" (alphabetical). A property may have one reference attached to it, or none.

When submitting a new material, if the required reference is not yet in `references/index.json`, the student adds it via the reference entry form. These new references are embedded in the downloaded JSON under a `new_references` field and are valid for that file without needing to be in the global index first. After the PR is merged, the admin runs `python tools/import_new_refs.py --write` to promote them into `references/index.json`.

---

## 5. Data Fields

### 5.1 Material Identification

| Field                          | Input Type    | Options / Notes |
|--------------------------------|---------------|-----------------|
| Material Name                  | Text          | Full descriptive name, e.g. "Aluminum 6061-T6" |
| Category                       | Single select | Metal, Plastic, Ceramic, Composite, Glass, Natural Material, Elastomer |
| Usage Frequency                | Single select | Common (readily available), Specialty (less common), Exotic (rare/hard to source) |
| Suitable Fabrication Processes | Multi-select  | Machining, Welding, Bending, Forging, Casting, Extrusion, Moulding, 3D Print (FDM), 3D Print (SLA), 3D Print (SLS), Vacuum Infusion, Composite Layup |
| Common Forms                   | Multi-select  | Sheet, Plate, Round Bar, Tube, Angle/Channel, Wire, Powder, Filament |
| Common Form Notes              | Text box      | Free text, e.g. availability notes or standard sizes |
| Notes                          | Text box      | General notes about the material |

### 5.2 Typical Usage

| Field         | Input Type | Notes |
|---------------|------------|-------|
| Typical Usage | Text box   | Describe common engineering applications for this material |

### 5.3 Mechanical Properties — Common

Each field has a unit selector dropdown and a reference selector dropdown.

| Field                    | Value(s)                 | Unit Picker        | Notes |
|--------------------------|--------------------------|------------------  |-------|
| Young's Modulus          | Float                    | Pressure           | |
| Poisson's Ratio          | Float                    | —                  | Dimensionless; no unit conversion |
| Yield Strength           | Float                    | Pressure           | 0.2% offset or elastic limit |
| Tensile Strength         | Float                    | Pressure           | Ultimate tensile strength |
| Compressive Modulus      | Float                    | Pressure           | Leave blank if equal to Young's Modulus |
| Compressive Strength     | Float                    | MPa, psi, ksi      | Maximum compressive stress before failure. Stored in MPa (exception to GPa rule). Hover tooltip distinguishes this from Compressive Modulus. |
| Usable Temperature Range | Float (min), Float (max) | Temperature (K/°C/°F) | Stored in °C; displayed in the globally selected temperature unit. |

### 5.4 Mechanical Properties — Other

Each field has a unit selector dropdown and a reference selector dropdown.

| Field               | Value(s)                                                          | Unit Picker             | Notes |
|---------------------|-------------------------------------------------------------------|-------------------------|-------|
| Microyield Strength | Float                                                             | Pressure                | |
| Creep Strength      | Float                                                             | Pressure                | |
| Fatigue (S-N Curve) | Table of up to 10 rows: Float (stress amplitude), Integer (cycles)| Pressure / Cycles       | Enter data points from low cycle to high cycle. A curve is fitted through the points for display. |
| Fracture Toughness  | Float                                                             | MPa·m½, ksi·in½         | Mode I (K_IC) unless noted. Rendered with superscript ½ in the browser. |
| Hardness            | Float, Scale selector                                             | —                       | All available scales shown simultaneously. Missing scales are estimated (HV ↔ HB ≈ ×1.05; Rockwell per ASTM E140). Rockwell entry requires scale (A, B, C, etc.). |
| Ductility (% Elongation) | Float (min), Float (max), Float (typical)                   | %                       | Typical shown if entered. If only min and max are given, typical is the average flagged "(avg of range)". If only one bound is given, shown as "≥ min %" or "≤ max %". If no data, "—" is shown and no reference badge appears. |
| Shear Strength      | Float, or calculated                                              | Pressure                | May be entered directly. If left blank and Yield Strength is available, the von Mises estimate τ = σ_y / √3 is shown with a "(von Mises estimate)" note and is also shown in the Calculated Properties section. |

### 5.5 Physical and Thermal Properties

Each field has a reference selector dropdown.

| Field                         | Value(s)                                                                        | Display Units              | Notes |
|-------------------------------|---------------------------------------------------------------------------------|----------------------------|-------|
| Density                       | Float                                                                           | g/cm³ and kg/m³            | Both values displayed simultaneously; no selector |
| Electrical Conductivity       | Float                                                                           | % IACS, MS/m, S/m          | Stored in % IACS. 1 % IACS = 0.58 MS/m = 580,000 S/m. Copper = 100 % IACS. |
| Vapour Pressure               | Float                                                                           | Pa                         | No conversion |
| Thermal Expansion (CTE)       | Float (single value) or table of up to 10 (Temperature °C, CTE µm/m·°C) pairs  | µm/m·°C                    | Stored in °C. Temperature column in multi-point table is displayed in the globally selected temperature unit. A curve is fitted through multi-point data for display. |
| Thermal Conductivity          | Float (single value) or table of up to 12 (Temperature °C, k W/m·K) pairs      | W/m·K                      | Temperature-dependent table rendered in the same expandable pattern as CTE |
| Specific Heat                 | Float (single value) or table of up to 12 (Temperature °C, Cp J/kg·K) pairs    | J/kg·K                     | Temperature-dependent table rendered in the same expandable pattern as CTE |
| Thermal Diffusivity           | Float                                                                           | cm²/s                      | If not entered, computed from k / (ρ · Cp) and labelled "(k/ρCp)" |
| Melting Point (Tm)            | Float                                                                           | K / °C / °F (global unit)  | Stored in °C. For crystalline materials (metals, ceramics). Leave blank for amorphous materials. |
| Glass Transition Temp. (Tg)   | Float                                                                           | K / °C / °F (global unit)  | Stored in °C. For amorphous polymers and glasses. Leave blank for crystalline materials. |
| Magnetic Classification       | Single select                                                                   | —                          | One of: Ferromagnetic (strongly magnetic — caution near field-sensitive instruments), Paramagnetic (weakly magnetic, generally acceptable), Diamagnetic (magnetically benign, preferred for precision optical/astronomical instruments). Displayed as a colour-coded badge. |

### 5.6 Calculated Properties (Display Only)

These are computed from entered values and displayed automatically. They are not stored in the JSON file.

| Field              | Formula              | Unit       | Required Inputs                                                          |
|--------------------|----------------------|------------|--------------------------------------------------------------------------|
| Specific Stiffness | E / ρ                | GPa·cm³/g  | Young's Modulus, Density                                                 |
| Shear Modulus      | E / (2 × (1 + ν))   | GPa        | Young's Modulus, Poisson's Ratio                                         |
| Shear Strength     | σ_y / √3            | MPa        | Yield Strength; shown only when Shear Strength is not directly entered   |

Calculated fields display "—" if any required input is missing.

---

## 6. Reports and Visualisation

### 6.1 Hover Tooltips

All property names throughout the site display a brief definition when the user hovers over them. This provides in-context explanations without requiring students to leave the page. Tooltip text is defined in a central `js/core/tooltips.js` file keyed by property name.

### 6.2 Single Material View

Displays all properties for one material in a structured table, grouped by collapsible sections. A toolbar at the top of the page provides:

- **Metric / Imperial toggle** — switches all unit dropdowns simultaneously to their metric or imperial defaults (see Section 3 for defaults).
- **Temperature unit selector** — independently selects K, °C, or °F; applies document-wide to every temperature value on the page (usable temp range, Tm, Tg, CTE table column).

Per-section unit dropdowns are also available for finer control (pressure, compressive strength, fracture toughness, electrical conductivity).

Inline reference badges (**[1]**, **[2]**, …) appear after each value that has a source. Clicking a badge scrolls to the numbered entry in the References section at the bottom of the page. The References section is open by default.

### 6.3 Multi-Material Comparison — Properties Summary and Bar Charts

A **Properties Summary** table appears at the top of the comparison view, before the charts. It lists all material properties side-by-side with one column per material. A dedicated Unit column shows the display unit for each row; value cells show bare numbers. Identification fields (Category, Common Forms, Fabrication Processes, Magnetic Classification) render as colour-coded badges. The table respects the global Metric/Imperial toggle.

Allows the user to select up to **10 materials** and plot any single numerical property as a bar chart across the selected materials. A global unit selector rescales all bars without reloading. Materials are colour-coded consistently across all charts.

### 6.4 S-N Curve Chart

For materials that have fatigue S-N curve data, a stress vs. cycles chart is available. When multiple materials are overlaid, each is colour-coded. A log-linear interpolation is drawn through the data points. The x-axis (cycles) uses a **logarithmic scale**; the y-axis (stress amplitude) uses a **linear scale**.

### 6.5 CTE vs Temperature Chart

For materials that have a CTE table with multiple temperature points, a chart of CTE versus temperature is available. When multiple materials are shown, each is colour-coded. A curve fit (monotone cubic interpolation) is drawn between data points.

### 6.6 Merit Index Table

Merit indices are Ashby-style figures of merit for comparing materials under a specific design constraint. They are presented as a combined table: one row per index, one column per selected material. A small inline bar within each cell visualises the relative value across the row — the best performer in each row is highlighted. The user can show or hide individual index rows via checkboxes. Indices are grouped into collapsible sections (Stiffness, Strength, Fracture, Thermal).

**Variable definitions used below:**

| Symbol  | Property              | Canonical Unit |
|---------|-----------------------|----------------|
| E       | Young's Modulus       | GPa            |
| ρ       | Density               | g/cm³          |
| σ_y     | Yield Strength        | GPa            |
| K_IC    | Fracture Toughness    | MPa·m^0.5      |
| α       | CTE                   | µm/m·°C        |
| k       | Thermal Conductivity  | W/m·K          |
| a       | Thermal Diffusivity   | cm²/s          |
| C_p     | Specific Heat         | J/kg·K         |

#### Stiffness-Limited Design

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M1           | E / ρ           | Higher | Specific stiffness — constant cross-section rod or beam |
| M2           | E^½ / ρ         | Higher | Beam Efficiency Index — beam deflection at minimum mass |
| M3           | E^⅓ / ρ         | Higher | Panel Efficiency Index — plate deflection at minimum mass |

#### Strength-Limited Design

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M4           | σ_y / ρ         | Higher | Specific strength — constant cross-section rod   |
| M5           | σ_y^⅔ / ρ      | Higher | Beam Strength Index — beam strength at minimum mass |
| M6           | σ_y^½ / ρ      | Higher | Panel Strength Index — plate strength at minimum mass |

#### Fracture and Damage Tolerance

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M7           | K_IC / σ_y      | Higher | Damage Tolerance Index — critical flaw size a material can survive |
| M8           | K_IC / ρ        | Higher | Specific toughness — toughness per unit mass     |

#### Thermal Design

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M9           | α / k           | Lower  | Steady-state thermal distortion                  |
| M10          | α / a           | Lower  | Transient thermal distortion (a = k / ρ·C_p)    |
| M11          | k / (ρ · C_p)   | Higher | Thermal diffusivity — speed of transient response |

> **Note:** Indices M9 and M10 are "lower is better" — materials with small CTE and high conductivity/diffusivity resist thermal distortion. All other indices are "higher is better". The bar chart colour-codes the direction automatically (green shade for best performer).

> **Note — M11:** k / (ρ · C_p) is the definition of thermal diffusivity (symbol a or D). If thermal diffusivity is directly entered for a material, M11 uses that value directly; otherwise it is computed from k, ρ, and C_p if all three are available.

A merit index is displayed as "—" for a given material if any required property is missing.

### 6.7 Data Export

On any material view or comparison view, a **Download** dropdown button is available with two format options:

- **CSV** — comma-separated text, opens in any spreadsheet application.
- **Excel (.xlsx)** — formatted spreadsheet using the SheetJS library.

Before downloading, the user selects a unit scope:

- **Current units** — properties exported in the unit currently shown on screen (metric or imperial, as selected by the toolbar toggle).
- **Canonical units** — every property exported in its canonical storage unit (GPa for pressure/moduli, MPa for compressive strength, g/cm³ for density, °C for temperature, etc.), regardless of the current display setting.

**File format:** columns are `Property`, `Unit`, then one column per material name. Section divider rows (IDENTIFICATION, MECHANICAL, PHYSICAL, MERIT INDICES) separate the property groups. Missing values are empty cells; text values (category, fabrication processes, magnetic classification) appear as plain text.

The compare page export also includes a MERIT INDICES section (M1–M11 Ashby indices) with the computed value for each material.

Single material: filename is `<slug>.csv` or `<slug>.xlsx`. Multiple materials: `materials_comparison.csv` or `materials_comparison.xlsx`.

---

## 7. Submission Form

The submission form allows students to create or edit a material entry and export it as a `.json` file.

### Disclaimer

The following disclaimer is displayed prominently at the top of the submission form and on all material detail pages:

> **Disclaimer:** The data in this database is provided for educational reference only. It has been compiled from published sources but has not been independently verified. This data **must not** be used as the sole basis for safety-critical design decisions. Always verify material properties against primary sources and applicable standards before use in any application where failure could result in injury or harm.

### Form Behaviour

- All input groups from Section 5 are present, in the same order.
- Unit selectors on entry fields convert to canonical units before export — the stored JSON always uses canonical units regardless of what units the student entered.
- Calculated properties (Section 5.6) are shown as a live preview that updates as the student fills in the required fields.
- Hovering over any property label shows the same tooltip definition as on the display pages.

### Loading an Existing File

A file picker at the top of the form accepts a `.json` file. When a file is loaded:

- The form is pre-populated with all fields from the file.
- A notice is shown: *"Form pre-filled from uploaded file — please review all fields before downloading."*
- If the uploaded file uses an older schema version, it is automatically migrated to the current version before populating the form.
- Fields not present in the uploaded file are left blank.

### Reference Entry During Submission

A reference panel (sidebar or modal) lists all references currently in the database. The student can:

- Select an existing reference to attach it to a property field.
- Add a new reference by uploading a `.bib` file or entering fields manually.

New references added during a submission are included in the downloaded JSON and should be submitted alongside the material file in the same pull request.

### Downloading the JSON File

A **Download JSON** button exports the completed form as a `.json` file named after the material slug (e.g. `aluminum-6061-t6.json`). The file includes:

- `schema_version` set to the current version number.
- `submitted_date` set to today's date (ISO 8601).
- All entered values in canonical units.
- Reference keys for all attached references.

### Post-Download Submission Instructions

After the file is downloaded, the form displays instructions for submitting via GitHub:

1. Fork the UVIC Materials Database repository.
2. Place the `.json` file in the `materials/<category>/` subfolder.
3. New references you added are already embedded in the JSON under `new_references` — no separate file edit needed.
4. Open a Pull Request to the `main` branch with the title: `Add material: <Material Name>`.
5. Complete the checklist in the PR template.
6. An administrator will review the submission and may request changes.

---

## 8. Admin Workflow

### Reviewing Submissions

Student submissions arrive as GitHub Pull Requests. The PR diff shows the full content of the new JSON file. Automated CI checks run `tools/validate.py` against any new or modified files in `materials/` and `references/`. The CI check must pass before a PR can be merged.

**PR review checklist (enforced via `.github/PULL_REQUEST_TEMPLATE.md`):**

- [ ] File is placed in the correct `materials/<category>/` subfolder
- [ ] Filename matches the `slug` field inside the JSON
- [ ] `schema_version` matches the current version
- [ ] All pressure values are in GPa; compressive strength in MPa
- [ ] At least one property has a reference attached
- [ ] `usage_frequency` is set appropriately (Common / Specialty / Exotic)
- [ ] New references either exist in `references/index.json` or are embedded under `new_references` in the material JSON

### After Merging

After a PR is merged, the admin runs:

```bash
python tools/import_new_refs.py --write   # promote any new_references into references/index.json
python tools/update_manifest.py           # regenerate materials/index.json
```

Both outputs must be committed to `main`.

---

## 9. Python Admin Tools

Located in `tools/`. Run locally or in CI. Require `pip install -r tools/requirements.txt`.

| Script                     | Purpose |
|----------------------------|---------|
| `tools/validate.py`        | Validate all `materials/**/*.json` against the current JSON Schema. Exits non-zero on failure. |
| `tools/update_manifest.py` | Walk the `materials/` tree and regenerate `materials/index.json`. Run after every merge. |
| `tools/migrate.py`         | Migrate material files from an older schema version to the current one. Originals are backed up to `tools/backup/` before modification. |
| `tools/import_bibtex.py`   | Parse a `.bib` file and add new entries to `references/index.json`, generating short labels automatically. |
| `tools/import_new_refs.py` | Scan all material JSONs for `new_references` entries and merge any new keys into `references/index.json`. Dry-run by default; pass `--write` to apply. Run after merging a PR that used `new_references`. |
| `tools/download_refs.py <dir>` | Fetch each URL in `references/index.json` and save as `<stub>.html` or `<stub>.pdf`. Skips already-downloaded files. Flags: `--delay SECS` (default 1.5), `--force`. Logs failures to `<dir>/failed.txt`. |
| `tools/parse_refs.py <dir>` | Parse downloaded HTML files into material-schema-format JSON with canonical units. Detects site from filename prefix (`azom-*`, `makeitfrom-*`, `matweb-*`, etc.) and applies a site-specific parser. Flags: `--glob PATTERN` (e.g. `"azom*.html"`), `--output DIR` (default: `<dir>/parsed/`). |
| `tools/compare_refs.py <pattern> --refs-dir <dir>` | Compare material JSON property values against parsed reference data. Reports: values with no reference, reference keys with no parsed file, and numeric mismatches. Prompts `y/n` to update mismatched values in-place. Flags: `--tolerance FRAC` (default 0.05 = 5%), `--no-fix`, `--verbose`. |

---

## 10. Schema Versioning

Each material JSON file contains a top-level `schema_version` integer. When the data format changes:

1. The new schema is documented in `schema/vN.json`.
2. A migration function is added to `tools/migrate.py` and to the in-browser `js/core/schema.js` migration chain.
3. Existing files continue to work without modification — migration runs in-memory in the browser and in-place (with backup) via `tools/migrate.py`.

This ensures old entries are never broken by format changes.

---

## 11. Open Items

> Items in this section are incomplete or pending decisions. Remove entries once resolved.

- **Reference gaps** — Alumina Al₂O₃ (Cp, thermal diffusivity, melting point refs) and C/SiC Woven (all properties) have values without citations.

---

---

## 12. Advanced Material Selection (Phase 2)

### 12.1 Overview

The Advanced Material Selection page (`select.html`) provides a structured, three-tier filter for finding materials that satisfy engineering design constraints:

1. **Categorical pre-filters** — narrow the candidate set by category, fabrication process, common forms, usage frequency, and magnetic classification (inherited from the Browse page via URL params)
2. **Property range filters** — up to 5 numeric constraints (e.g. yield strength ≥ 500 MPa, density ≤ 5 g/cm³)
3. **Merit index ranking** — rank remaining candidates by any of M1–M11 and return the top N

Results display as a selectable table that feeds directly into the Compare page.

Additionally, the Browse page gains two related upgrades:
- **Magnetic Classification filter** (Ferromagnetic / Paramagnetic / Diamagnetic checkboxes in the sidebar)
- **"Compare All Filtered" button** — sends all visible Browse results to the Compare page in one click

### 12.2 Navigation

A **"Select"** link is added between Compare and Submit on every page:

```html
<a href="index.html"   class="nav-link">Browse</a>
<a href="compare.html" class="nav-link">Compare</a>
<a href="select.html"  class="nav-link">Select</a>
<a href="submit.html"  class="nav-link">Submit</a>
<button class="nav-link" data-action="show-disclaimer">Disclaimer</button>
```

### 12.3 Browse Page Upgrades

#### Magnetic Classification Filter

A new fieldset in the Browse sidebar, after Usage Frequency:

```html
<fieldset>
  <legend>Magnetic Class</legend>
  <div id="filter-magnetic">
    <!-- checkboxes: Ferromagnetic, Paramagnetic, Diamagnetic -->
  </div>
</fieldset>
```

URL param: `?magnetic=Paramagnetic` (append-style, same convention as all other params). Filter logic in `materialMatches()`:

```js
if (f.magnetic.size > 0 && !f.magnetic.has(mat.magnetic_classification)) return false;
```

Materials where `magnetic_classification` is `null` in the manifest are excluded when any magnetic filter is active.

The manifest (`materials/index.json`) must be extended to include `magnetic_classification` per entry. `update_manifest.py` extracts `physical.magnetic_classification.value` from each material JSON.

#### "Compare All Filtered" Button

Appears in the compare-bar area alongside the existing "Compare N" button:

| Filtered count | State |
|---|---|
| < 2 | Hidden |
| 2–10 | Enabled: "Compare All Filtered (N)" |
| > 10 | Disabled, tooltip: "Narrow filters to ≤ 10 to compare all" |

Clicking: populates `compareSet` with all currently-visible slugs, navigates to `compare.html?slugs=<csv>`.

#### "Advanced Selection →" Button

Added in the filter sidebar, below the Reset button. Constructs `select.html?` + current Browse filter URL params (same params `writeFiltersToURL` would write) and navigates.

### 12.4 select.html — Page Layout

```
[site header + nav — Browse | Compare | Select | Submit | Disclaimer]

h1: Advanced Material Selection

┌─ Pre-selection (from Browse) ──────────────────────── [Edit on Browse] ─┐
│  Category: Metal                                                         │
│  Fabrication: Machining, Welding                                         │
│  20 materials in starting set                                            │
│  (or "All 41 materials — no pre-filters applied")                        │
└──────────────────────────────────────────────────────────────────────────┘

Max results: [10]    Units: [Metric ▼]    Temperature: [°C ▼]

── Property Filters ──────────────────────────────────────────────────────

  [Property ▼] [≥ ▼] [___________] MPa                           [×]
  [Property ▼] [between ▼] [_______] and [_______] g/cm³         [×]

  [+ Add Filter]  (max 5 rows)

── Merit Index Ranking ───────────────────────────────────────────────────

  Rank by: [None ▼]
  (top N results by selected index; applied after property filters)

                                             [ Find Materials ]

── Results ───────────────────────────────────────────────────────────────

  8 materials match · showing top 8  [☐ Select All]  [Compare Selected (3)]

  ☐  Titanium Ti-6Al-4V (Annealed)       Metal   114 GPa   880 MPa   4.43 g/cm³
  ☑  Inconel 718 (Precipitation H.)      Metal   200 GPa  1035 MPa   8.19 g/cm³
  ...
```

### 12.5 Pre-selection Panel

**Source:** URL params passed by "Advanced Selection →" on Browse, or typed manually.

**Params read:** `?cat=`, `?fab=`, `?form=`, `?freq=`, `?magnetic=` — same names and multi-value append format as Browse.

**Display:** For each active dimension, show selected values comma-separated. Count how many manifest entries survive all pre-filters; show as "N materials in starting set". If no params: "All N materials — no pre-filters applied".

**"Edit on Browse" link:** constructs `index.html?` + same URL params, returning to Browse with filters pre-applied.

### 12.6 Property Filters

Up to 5 rows, dynamically added. Each row:

| Control | Type | Detail |
|---|---|---|
| Property | `<select>` (grouped) | 18 options — see §12.7 |
| Operator | `<select>` | `≥`, `≤`, `between`, `=` |
| Value A | `<input type="number">` | Always visible |
| "and" label | text | Only when operator = `between` |
| Value B | `<input type="number">` | Only when operator = `between` |
| Unit label | `<span>` | Auto-set from property + unit system |
| Remove | `<button>` [×] | Removes row |

Entered values are converted from display unit to canonical unit before comparison using existing `units.js` functions. The global unit system (Metric / Imperial) and temperature selector on the Select page are independent of other pages; unit labels update when the system changes but entered values are not re-scaled.

**Null exclusion:** materials where the filtered property is `null` are excluded from results.

**Ductility extraction:** use `ductility.typical` if non-null; else average of `min`/`max` if both present; else whichever bound is available; else `null` → excluded.

### 12.7 Filterable Properties

**Mechanical — Common**

| Label | JSON path | Canonical | Metric label | Imperial label |
|---|---|---|---|---|
| Young's Modulus | `mechanical_common.youngs_modulus` | GPa | GPa | ksi |
| Yield Strength | `mechanical_common.yield_strength` | GPa | MPa | ksi |
| Tensile Strength | `mechanical_common.tensile_strength` | GPa | MPa | ksi |
| Compressive Strength | `mechanical_common.compressive_strength` | MPa | MPa | ksi |
| Max Service Temp | `mechanical_common.usable_temp_range.max` | °C | °C / K / °F | °F |
| Min Service Temp | `mechanical_common.usable_temp_range.min` | °C | °C / K / °F | °F |

**Mechanical — Other**

| Label | JSON path | Canonical | Metric label | Imperial label |
|---|---|---|---|---|
| Shear Strength | `mechanical_other.shear_strength` | GPa | MPa | ksi |
| Fracture Toughness | `mechanical_other.fracture_toughness` | MPa·m½ | MPa·m½ | ksi·in½ |
| Hardness (HV) | `mechanical_other.hardness_vickers` | HV | HV | HV |
| Ductility | `mechanical_other.ductility.typical` | % | % | % |

**Physical**

| Label | JSON path | Canonical | Metric label | Imperial label |
|---|---|---|---|---|
| Density | `physical.density` | g/cm³ | g/cm³ | lb/in³ |
| Electrical Conductivity | `physical.electrical_conductivity` | % IACS | % IACS | % IACS |
| CTE | `physical.thermal_expansion.value` | µm/m·K | µm/m·K | µin/in·°F |
| Thermal Conductivity | `physical.thermal_conductivity.value` | W/m·K | W/m·K | BTU/hr·ft·°F |
| Specific Heat | `physical.specific_heat.value` | J/kg·K | J/kg·K | BTU/lb·°F |
| Thermal Diffusivity | `physical.thermal_diffusivity` | cm²/s | cm²/s | in²/s |
| Melting Point | `physical.melting_point_tm` | °C | °C / K / °F | °F |
| Glass Transition Tg | `physical.glass_transition_tg` | °C | °C / K / °F | °F |

### 12.8 Merit Index Ranking

A single `<select>` with "None" and all 11 indices (grouped by Stiffness / Strength / Fracture / Thermal). The direction (↑ higher / ↓ lower) is auto-set from `MERIT_INDICES[i].higherIsBetter` in `derived.js` and shown as helper text below the selector.

**Ranking logic** (applied after all property filters):

1. Compute `MERIT_INDICES[i].fn(material)` for each remaining candidate
2. Exclude materials returning `null` (missing required inputs)
3. Sort descending (higherIsBetter) or ascending (M9, M10)
4. Truncate to `maxResults`

When a merit index is active, a column is added to the results table showing each material's index value (3 significant figures).

### 12.9 Results Section

Table columns: checkbox · name (link) · category badge · E · σ_y · ρ · merit index value (if active).

**"Select All / Deselect All"** — toggle link; checks all / unchecks all.

**"Compare Selected (K)"** — disabled when <2 checked; navigates to `compare.html?slugs=...`; enforces max 10 (button shows "Max 10" and is disabled if >10 checked).

**Empty states:**

| Condition | Message |
|---|---|
| Pre-filters yield 0 | "No materials match the Browse pre-filters. [Edit on Browse]" |
| Property filters yield 0 | "No materials satisfy all property filters." |
| Merit index yields 0 | "No materials have the data needed for this merit index." |
| Find not yet clicked | Results section hidden |

### 12.10 Filtering Algorithm

```
async function findMaterials():
  manifest = await loadManifest()

  // Phase 1 — manifest-level (no extra fetches)
  candidates = manifest.materials.filter(m =>
    matchesPreFilters(m, {categories, fabrication, forms, frequency, magnetic})
  )
  if candidates.length === 0: renderEmpty('pre-filter'); return

  // Phase 2 — load full JSONs for candidates only
  fullMaterials = await loadMaterialBatch(candidates.map(m => m.slug))
  // loader.js caches each by slug; worst case 41 parallel fetches

  // Phase 3 — property range filters (up to 5)
  for each activeFilter:
    fullMaterials = fullMaterials.filter(m =>
      passesPropertyFilter(m, filter, unitSystem, tempUnit)
    )
    // null value → excluded
  if fullMaterials.length === 0: renderEmpty('property-filter'); return

  // Phase 4 — merit index ranking (optional)
  if meritIndexSelected:
    scored = fullMaterials
      .map(m => ({ m, score: MERIT_INDICES[idx].fn(m) }))
      .filter(x => x.score !== null)
    if scored.length === 0: renderEmpty('merit-index'); return
    scored.sort((a, b) => higherIsBetter ? b.score - a.score : a.score - b.score)
    results = scored.slice(0, maxResults).map(x => x.m)
  else:
    results = fullMaterials
      .sort((a, b) => a.identification.name.localeCompare(b.identification.name))
      .slice(0, maxResults)

  renderResults(results)
```

### 12.11 Implementation Build Order

| # | Item | Files |
|---|---|---|
| 20 | Add `magnetic_classification` to manifest; regenerate | `tools/update_manifest.py`, `materials/index.json` |
| 21 | Browse: Magnetic Classification filter | `js/pages/browse.js`, `index.html` |
| 22 | Browse: "Compare All Filtered" button | `js/pages/browse.js`, `index.html` |
| 23 | Browse: "Advanced Selection →" button | `js/pages/browse.js`, `index.html` |
| 24 | Nav: add "Select" link on all existing pages | `index.html`, `material.html`, `compare.html`, `submit.html` |
| 25 | `select.html` shell + `css/pages/select.css` | new files |
| 26 | `select.js` — pre-selection panel (URL param read, count display) | `js/pages/select.js` |
| 27 | `select.js` — property filter rows (add/remove, operator, unit labels) | `js/pages/select.js` |
| 28 | `select.js` — merit index selector and ranking | `js/pages/select.js` |
| 29 | `select.js` — `findMaterials()` and result table rendering | `js/pages/select.js` |
| 30 | `select.js` — "Compare Selected" wiring | `js/pages/select.js` |
| 31 | `disclaimer.js` — load on `select.html` | `js/core/disclaimer.js`, `select.html` |

### 12.12 Verification Checklist

| Test | Expected |
|---|---|
| `python tools/validate.py` | 41/41 valid |
| `python tools/update_manifest.py` | Each manifest entry includes `magnetic_classification` |
| Browse: check "Paramagnetic" | Only paramagnetic materials shown; `?magnetic=Paramagnetic` in URL |
| Browse: "Compare All Filtered (N)" with 2–10 visible | Navigates to compare.html with N slugs |
| Browse: "Compare All Filtered" with >10 visible | Button disabled |
| Browse: "Advanced Selection →" with Metal filter active | Navigates to `select.html?cat=Metal` |
| Select: open with `?cat=Metal` | Pre-selection shows "Category: Metal · 20 materials in starting set" |
| Select: open with no params | Shows "All 41 materials — no pre-filters applied" |
| Select: yield ≥ 500 MPa (Metric) | Only materials with σ_y ≥ 0.5 GPa canonical |
| Select: yield ≥ 72.5 ksi (Imperial) | Same result as above (72.5 ksi ≈ 500 MPa) |
| Select: `between` operator | Two value inputs appear |
| Select: property with null value for a material | That material excluded |
| Select: merit index M1 | Results sorted by E/ρ descending |
| Select: merit index M9  | Results sorted by α/k ascending (lower is better) |
| Select: "Select All" | All result checkboxes checked |
| Select: "Compare Selected (3)" | Navigates to `compare.html?slugs=slug1,slug2,slug3` |
| Select: >10 boxes checked | Compare button disabled, shows "Max 10" |
| Units: Metric → Imperial | Filter unit labels update; result column headers update |
| Temperature: °C → °F | Service temp filter label updates; 600 °C entered as 1112 °F matches same materials |

---

## Appendix: Document References

[Ref 1]
```
@inproceedings{10.1117/12.279804,
  author       = {Roger A. Paquin},
  title        = {{Advanced materials: an overview}},
  volume       = {10289},
  booktitle    = {Advanced Materials for Optics and Precision Structures: A Critical Review},
  editor       = {Mark A. Ealey and Roger A. Paquin and Thomas B. Parsonage},
  organization = {International Society for Optics and Photonics},
  publisher    = {SPIE},
  pages        = {1028902},
  year         = {1997},
  doi          = {10.1117/12.279804},
  url          = {https://doi.org/10.1117/12.279804}
}
```
