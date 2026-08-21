# Contributing to the UVIC Engineering Materials Database

## Who can contribute

Anyone — students, instructors, engineers, or researchers. All contributions go through a GitHub Pull Request so the data can be reviewed before it goes live.

## Submitting a new material

1. Open the [Submit page](https://scroberts.github.io/Engineering-Materials-Database/submit.html) on the live site.
2. Fill in the form. Every value should come from a published, peer-reviewed, or authoritative manufacturer source — cite it with a DOI or URL.
3. Click **Download JSON**. A validated JSON file is saved to your computer.
4. Fork this repository and place the file in the correct `materials/<category>/` subfolder. The filename must match the `slug` field exactly.
5. If you cited a reference that isn't already in the database, use the Submit form's "Add Reference" panel (BibTeX or URL tab) to add it — this embeds it in your downloaded JSON under `new_references` automatically. You don't need to touch `references/index.json` yourself; an admin promotes it into the shared reference database after your PR merges.
6. Run `python tools/validate.py` locally — fix any errors.
7. Run `python tools/update_manifest.py` to regenerate the manifest.
8. Open a Pull Request against `main`. CI will re-run validation automatically.

See `.github/PULL_REQUEST_TEMPLATE.md` for the full review checklist.

## Correcting existing data

1. Open the material's detail page and click **Edit** (or navigate to `submit.html?slug=<slug>`).
2. Correct the value and update or add the source citation.
3. Download the updated JSON, replace the file in your fork, and open a Pull Request.

## Data quality expectations

- **Primary sources only.** Peer-reviewed papers, official standards (ASTM, MIL-HDBK), and authoritative manufacturer datasheets are acceptable. Secondary aggregators (MatWeb, AZoM) may be used to locate values but should be cross-checked.
- **Every value needs a citation, or an explanation.** `"ref": null` is expected to be rare, but it's acceptable when the reason is stated explicitly in `notes` rather than left to guesswork — common cases already in this database: derived values (e.g. shear strength from von Mises, `electrical_conductivity: 0` for materials that are electrical insulators by definition), and well-established physical constants a source didn't bother restating (e.g. a textbook melting point). Say so in `notes` the way `polycarbonate.json`/`alumina-al2o3.json` do (e.g. "Electrical conductivity is nominally 0% IACS — polycarbonate is an electrical insulator, not a specific sourced measurement") so a null ref reads as a deliberate call, not a missed citation. This isn't automated — `tools/lint_physics.py`'s docstring explains why a blanket "value present, ref null" check was tried and dropped (too many legitimate cases, no reliable way to tell them from real gaps without reading the notes).
- **Canonical units in JSON.** See the [Canonical Storage Units table](README.md#canonical-storage-units) — convert only at display time.
- **One material per condition.** Wrought annealed Ti-6Al-4V and AM as-built Ti-6Al-4V are separate entries.

## Questions or corrections without a PR

Use the [Issue templates](https://github.com/scroberts/Engineering-Materials-Database/issues/new/choose) to report a data error or request a new material without opening a PR yourself.
