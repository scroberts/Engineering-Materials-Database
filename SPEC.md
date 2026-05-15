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

Each property field has a reference dropdown beside it. The dropdown lists all references currently in the database (displayed as the short label, e.g. "Paquin 1997"). A property may have one reference attached to it, or none.

When submitting a new material, if the required reference is not yet in the database, the student can add it through the reference entry form first, then attach it to the relevant fields.

---

## 5. Data Fields

### 5.1 Material Identification

| Field                          | Input Type    | Options / Notes |
|--------------------------------|---------------|-----------------|
| Material Name                  | Text          | Full descriptive name, e.g. "Aluminum 6061-T6" |
| Category                       | Single select | Metal, Plastic, Ceramic, Composite |
| Commonly Available             | Checkbox      | Uncheck to flag a material as uncommon or hard to source |
| Suitable Fabrication Processes | Multi-select  | Machining, Welding, Forging, Casting, Extrude, Injection Moulding, 3D Print (FDM), 3D Print (SLA), 3D Print (SLS), Vacuum Infusion, Composite Layup, Plateable, Polishable |
| Common Forms                   | Multi-select  | Sheet, Plate, Round Bar, Angles and Structural Profiles, Filament |
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
| Thermal Conductivity          | Float                                                                           | W/m·K                      | |
| Specific Heat                 | Float                                                                           | J/kg·K                     | |
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
| D       | Thermal Diffusivity   | cm²/s          |
| C_p     | Specific Heat         | J/kg·K         |

#### Stiffness-Limited Design

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M1           | E / ρ           | Higher | Specific stiffness — constant cross-section rod or beam |
| M2           | (E / ρ)^½       | Higher | Beam deflection at minimum mass                  |
| M3           | (E / ρ)^⅓       | Higher | Plate deflection at minimum mass                 |
| M4           | E^½ / ρ         | Higher | Resonant frequency at minimum mass (Paquin [Ref 1]) |

#### Strength-Limited Design

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M5           | σ_y / ρ         | Higher | Specific strength — constant cross-section rod   |
| M6           | σ_y^⅔ / ρ      | Higher | Beam strength at minimum mass                    |
| M7           | σ_y^½ / ρ      | Higher | Plate strength at minimum mass                   |

#### Fracture and Damage Tolerance

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M8           | K_IC / σ_y      | Higher | Plastic zone size; ductility index               |
| M9           | K_IC² / σ_y²    | Higher | Fracture process zone size                       |
| M10          | K_IC / ρ        | Higher | Toughness per unit mass                          |

#### Thermal Design

| Index        | Formula         | Better | Application                                      |
|--------------|-----------------|--------|--------------------------------------------------|
| M11          | α / k           | Lower  | Steady-state thermal distortion (Paquin Table 4) |
| M12          | α / D           | Lower  | Transient thermal distortion                     |
| M13          | k / (ρ · C_p)   | Higher | Thermal diffusivity — speed of transient response (equivalent to D) |

> **Note:** Indices M11 and M12 are "lower is better" — materials with small CTE and high conductivity/diffusivity resist thermal distortion. All other indices are "higher is better". The bar chart colour-codes the direction automatically (green shade for best performer).

> **Note — M13:** k / (ρ · C_p) is the definition of thermal diffusivity D. If D is directly entered for a material, M13 is computed from D directly. Otherwise it is computed from k, ρ, and C_p if all three are available.

A merit index is displayed as "—" for a given material if any required property is missing.

### 6.7 Data Export

On any material view or comparison view, a **Download** dropdown button is available with two format options:

- **CSV** — comma-separated text, opens in any spreadsheet application.
- **Excel (.xlsx)** — formatted spreadsheet using the SheetJS library.

Before downloading, the user selects a unit scope:

- **Current units** — properties exported in the unit currently shown on screen (metric or imperial, as selected by the toolbar toggle).
- **Canonical units** — every property exported in its canonical storage unit (GPa for pressure/moduli, MPa for compressive strength, g/cm³ for density, °C for temperature, etc.), regardless of the current display setting.

**File format:** columns are `Property`, `Unit`, then one column per material name. Section divider rows (IDENTIFICATION, MECHANICAL, PHYSICAL, MERIT INDICES) separate the property groups. Missing values are empty cells; text values (category, fabrication processes, magnetic classification) appear as plain text.

The compare page export also includes a MERIT INDICES section (M1–M13 Ashby indices) with the computed value for each material.

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
3. If you added new references, also update `references/index.json`.
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
- [ ] All pressure values are in GPa
- [ ] At least one property has a reference attached
- [ ] `commonly_available` is set appropriately
- [ ] Any new references are added to `references/index.json`

### After Merging

After a PR is merged, the admin runs:

```bash
python tools/update_manifest.py
```

This regenerates `materials/index.json` (the manifest used by the browse page) and must be committed to `main`.

---

## 9. Python Admin Tools

Located in `tools/`. Run locally or in CI. Require `pip install -r tools/requirements.txt`.

| Script                     | Purpose |
|----------------------------|---------|
| `tools/validate.py`        | Validate all `materials/**/*.json` against the current JSON Schema. Exits non-zero on failure. |
| `tools/update_manifest.py` | Walk the `materials/` tree and regenerate `materials/index.json`. Run after every merge. |
| `tools/migrate.py`         | Migrate material files from an older schema version to the current one. Originals are backed up to `tools/backup/` before modification. |
| `tools/import_bibtex.py`   | Parse a `.bib` file and add new entries to `references/index.json`, generating short labels automatically. |

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

- **Additional seed materials** — steel 4340, PEEK, carbon fibre/epoxy composite

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
