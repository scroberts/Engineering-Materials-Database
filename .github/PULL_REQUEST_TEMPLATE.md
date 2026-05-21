## Summary

<!-- What does this PR add or change? -->

## Checklist

- [ ] `python tools/validate.py` passes locally
- [ ] `python tools/update_manifest.py` run if any material files were added or removed
- [ ] New references either exist in `references/index.json` or are embedded under `new_references` in the material JSON (admin: run `python tools/import_new_refs.py --write` after merge)
- [ ] Slug matches filename (`identification.slug` == filename without `.json`)
- [ ] All property values stored in canonical units (GPa, MPa, g/cm³, °C, µm/m·K, W/m·K, J/kg·K, % IACS, HV)

## Materials added / changed

<!-- List any new or updated material files, e.g. materials/metals/steel-4340.json -->
