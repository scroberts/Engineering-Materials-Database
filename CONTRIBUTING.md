# Contributing to the UVIC Engineering Materials Database

## Who can contribute

Anyone — students, instructors, engineers, or researchers. All contributions go through a GitHub Pull Request so the data can be reviewed before it goes live.

## Submitting a new material

1. Open the [Submit page](https://scroberts.github.io/Engineering-Materials-Database/submit.html) on the live site.
2. Fill in the form. Every value should come from a published, peer-reviewed, or authoritative manufacturer source — cite it with a DOI or URL.
3. Click **Download JSON**. A validated JSON file is saved to your computer.
4. Fork this repository and place the file in the correct `materials/<category>/` subfolder. The filename must match the `slug` field exactly.
5. Add any new references to `references/index.json`.
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
- **Every value needs a citation.** `"ref": null` is only acceptable for derived values (e.g. shear strength from von Mises) and magnetic classification (recorded by convention without a ref).
- **Canonical units in JSON.** See the [Canonical Storage Units table](README.md#canonical-storage-units) — convert only at display time.
- **One material per condition.** Wrought annealed Ti-6Al-4V and AM as-built Ti-6Al-4V are separate entries.

## Questions or corrections without a PR

Use the [Issue templates](https://github.com/scroberts/Engineering-Materials-Database/issues/new/choose) to report a data error or request a new material without opening a PR yourself.
