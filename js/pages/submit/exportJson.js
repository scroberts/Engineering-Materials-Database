/**
 * submit/exportJson.js — Build the canonical material JSON from the form
 * and trigger the download, including the edit-mode / new-material
 * post-download instructions.
 */

import { esc } from './utils.js';
import { refs, canonicalKeys } from './refsStore.js';
import { editMode } from './state.js';

// ── JSON export ───────────────────────────────────────────────────────────────

export function downloadJSON() {
  const mat = buildMaterialJSON();
  const errors = validateExport(mat);
  if (errors.length) {
    alert('Please fix the following before downloading:\n\n' + errors.join('\n'));
    return;
  }

  const slug = mat.identification.slug || 'material';
  const json = JSON.stringify(mat, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${slug}.json`; a.click();
  URL.revokeObjectURL(url);

  // Show post-download instructions
  const panel = document.getElementById('post-download');
  panel.hidden = false;
  if (editMode) {
    showEditPostDownload(panel, slug, mat.identification.name || slug);
  } else {
    document.getElementById('pr-filename-hint').textContent = `${slug}.json`;
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateExport(mat) {
  const errs = [];
  if (!mat.identification.name) errs.push('• Material name is required');
  if (!mat.identification.slug) errs.push('• Slug is required');
  if (!/^[a-z0-9-]+$/.test(mat.identification.slug || ''))
    errs.push('• Slug must be lowercase letters, numbers, and hyphens only');
  if (!mat.identification.category) errs.push('• Category is required');
  if (!mat.identification.usage_frequency) errs.push('• Usage Frequency is required');
  const hasValue = (obj) => Object.values(obj ?? {}).some(p => p?.value != null);
  if (!hasValue(mat.mechanical_common) && !hasValue(mat.physical))
    errs.push('• At least one mechanical or physical property value is required');
  return errs;
}

function buildMaterialJSON() {
  // ── Identification ──
  const identification = {
    name:                getField('name'),
    slug:                getField('slug'),
    category:            getSelectField('category'),
    fabrication_processes: getCheckboxGroup('fabrication_processes'),
    common_forms:        getCheckboxGroup('common_forms'),
    common_form_notes:   getField('common_form_notes') || null,
    usage_frequency:     getField('usage_frequency'),
    notes:               getField('notes') || null,
  };

  // ── Typical usage ──
  const typical_usage = getField('typical_usage') || null;

  // ── Mechanical common ──
  const mc = {
    youngs_modulus:      getValuedProp('youngs_modulus',      'GPa'),
    poissons_ratio:      getValuedPropRaw('poissons_ratio'),
    yield_strength:      getValuedProp('yield_strength',      'GPa'),
    tensile_strength:    getValuedProp('tensile_strength',    'GPa'),
    compressive_modulus: getValuedProp('compressive_modulus', 'GPa'),
    compressive_strength:getValuedProp('compressive_strength','MPa'),
    usable_temp_range:   getTempRange(),
  };

  // ── Mechanical other ──
  const mo = {
    microyield_strength: getValuedProp('microyield_strength', 'GPa'),
    creep_strength:      getValuedProp('creep_strength',      'GPa'),
    fatigue_sn_curve:    getSNData(),
    fracture_toughness:  getValuedProp('fracture_toughness',  'MPa·m^0.5'),
    hardness_vickers:    getValuedPropRaw('hardness_vickers'),
    hardness_brinell:    getValuedPropRaw('hardness_brinell'),
    hardness_rockwell:   getRockwell(),
    hardness_shore:      getShore(),
    ductility:           getDuctility(),
    shear_strength:      getValuedProp('shear_strength',      'GPa'),
  };

  // ── Physical ──
  const ph = {
    density:               getValuedProp('density',               'g/cm³'),
    electrical_conductivity:getValuedProp('electrical_conductivity','% IACS'),
    vapour_pressure:       getValuedPropRaw('vapour_pressure'),
    thermal_expansion:     getCTE(),
    thermal_conductivity:  getThermalTable('thermal_conductivity', 'k',  'W/m·K'),
    specific_heat:         getThermalTable('specific_heat',        'cp', 'J/(kg·K)'),
    thermal_diffusivity:   getValuedProp('thermal_diffusivity',   'cm²/s'),
    melting_point_tm:      getValuedProp('melting_point_tm',      '°C'),
    glass_transition_tg:   getValuedProp('glass_transition_tg',  '°C'),
    magnetic_classification: {
      value: getSelectField('magnetic_classification') || null,
      ref:   getRefKey('magnetic_classification'),
    },
  };

  // Collect all referenced keys that were actually used
  const usedRefs = collectUsedRefs(mc, mo, ph);

  // Embed full metadata for any reference not in references/index.json.
  // This allows a complete round-trip: re-uploading this JSON restores
  // all reference details instead of falling back to stubs.
  // The admin must also add these entries to references/index.json when merging the PR.
  const newRefs = {};
  for (const key of usedRefs) {
    if (!canonicalKeys.has(key) && refs[key]) {
      newRefs[key] = refs[key];
    }
  }

  return {
    schema_version: 1,
    identification,
    typical_usage,
    mechanical_common: mc,
    mechanical_other:  mo,
    physical:          ph,
    references:        usedRefs,
    ...(Object.keys(newRefs).length ? { new_references: newRefs } : {}),
    metadata: {
      submitted_by:   null,
      submitted_date: new Date().toISOString().slice(0, 10),
      approved_by:    null,
      approved_date:  null,
    },
  };
}

// ── Getter helpers ────────────────────────────────────────────────────────────

function getField(id) {
  const el = document.getElementById(`field-${id}`);
  return el ? (el.value.trim() || null) : null;
}

function getSelectField(id) {
  const el = document.getElementById(`field-${id}`);
  return el ? (el.value || null) : null;
}

function getCheckboxGroup(id) {
  const wrap = document.getElementById(`field-${id}`);
  if (!wrap) return [];
  return [...wrap.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
}

function getRefKey(fieldId) {
  const sel = document.querySelector(`.form-ref-select[data-field-id="${fieldId}"]`);
  return sel ? (sel.value || null) : null;
}

/** Return {value, ref} with value converted from display unit to canonical. */
function getValuedProp(fieldId, canonicalUnit) {
  const inp = document.getElementById(`field-${fieldId}`);
  const raw = inp ? parseFloat(inp.value) : NaN;
  const value = isNaN(raw) ? null : toCanonical(raw, fieldId, canonicalUnit);
  return { value, ref: getRefKey(fieldId) };
}

/** Return {value, ref} with value taken as-is (no unit conversion needed). */
function getValuedPropRaw(fieldId) {
  const inp = document.getElementById(`field-${fieldId}`);
  const raw = inp ? parseFloat(inp.value) : NaN;
  return { value: isNaN(raw) ? null : raw, ref: getRefKey(fieldId) };
}

/**
 * Convert an entered value from its display unit to canonical storage unit.
 * Pass displayUnitOverride to bypass the fieldId-based select lookup.
 */
function toCanonical(value, fieldId, canonicalUnit, displayUnitOverride) {
  const unitSel = displayUnitOverride
    ? null
    : document.querySelector(`.form-unit-select[data-field-id="${fieldId}"]`);
  const displayUnit = displayUnitOverride ?? unitSel?.value ?? canonicalUnit;
  if (displayUnit === canonicalUnit) return value;

  if (canonicalUnit === 'GPa') {
    const TO_GPa = { GPa: 1, MPa: 0.001, psi: 6.89476e-6, ksi: 0.0068948 };
    return value * (TO_GPa[displayUnit] ?? 1);
  }
  if (canonicalUnit === 'MPa') {
    const TO_MPa = { MPa: 1, psi: 1 / 145.038, ksi: 1 / 0.145038 };
    return value * (TO_MPa[displayUnit] ?? 1);
  }
  if (canonicalUnit === 'MPa·m^0.5') {
    const TO_SI = { 'MPa·m^0.5': 1, 'ksi·in^0.5': 1 / 0.9099 };
    return value * (TO_SI[displayUnit] ?? 1);
  }
  if (canonicalUnit === '°C') {
    if (displayUnit === '°C') return value;
    if (displayUnit === 'K')  return value - 273.15;
    if (displayUnit === '°F') return (value - 32) * 5 / 9;
  }
  if (canonicalUnit === 'g/cm³') {
    if (displayUnit === 'lb/in³') return value / 0.036127292;
    return value;
  }
  if (canonicalUnit === '% IACS') {
    if (displayUnit === 'MS/m') return value / 0.58;
    if (displayUnit === 'S/m')  return value / 5.8e5;
    return value;
  }
  if (canonicalUnit === 'W/m·K') {
    if (displayUnit === 'BTU/(hr·ft·°F)') return value / 0.5779;
    return value;
  }
  if (canonicalUnit === 'J/(kg·K)') {
    if (displayUnit === 'BTU/(lb·°F)') return value / 2.3885e-4;
    return value;
  }
  if (canonicalUnit === 'cm²/s') {
    if (displayUnit === 'ft²/hr') return value / 3.875;
    return value;
  }
  if (canonicalUnit === 'µm/m·K') {
    if (displayUnit === 'µin/in·°F') return value * (9 / 5);
    return value;
  }
  return value;
}

function getTempRange() {
  const minEl  = document.getElementById('field-usable_temp_range-min');
  const maxEl  = document.getElementById('field-usable_temp_range-max');
  const unitEl = document.getElementById('field-usable_temp_range-unit');
  const tempUnit = unitEl?.value ?? 'K';
  const toNum = el => { const v = parseFloat(el?.value); return isNaN(v) ? null : v; };
  const minEntered = toNum(minEl);
  const maxEntered = toNum(maxEl);
  return {
    min: minEntered != null ? toCanonical(minEntered, null, '°C', tempUnit) : null,
    max: maxEntered != null ? toCanonical(maxEntered, null, '°C', tempUnit) : null,
    ref: getRefKey('usable_temp_range'),
  };
}

function getRockwell() {
  const inp   = document.getElementById('field-hardness_rockwell');
  const scale = document.getElementById('field-hardness_rockwell_scale');
  const raw   = inp ? parseFloat(inp.value) : NaN;
  return {
    value: isNaN(raw) ? null : raw,
    scale: scale ? (scale.value || null) : null,
    ref:   getRefKey('hardness_rockwell'),
  };
}

function getShore() {
  const inp   = document.getElementById('field-hardness_shore');
  const scale = document.getElementById('field-hardness_shore_scale');
  const raw   = inp ? parseFloat(inp.value) : NaN;
  return {
    value: isNaN(raw) ? null : raw,
    scale: scale ? (scale.value || null) : null,
    ref:   getRefKey('hardness_shore'),
  };
}

function getDuctility() {
  const minEl = document.getElementById('field-ductility-min');
  const maxEl = document.getElementById('field-ductility-max');
  const typEl = document.getElementById('field-ductility-typical');
  const toNum = el => { const v = parseFloat(el?.value); return isNaN(v) ? null : v; };
  return {
    min:     toNum(minEl),
    max:     toNum(maxEl),
    typical: toNum(typEl),
    ref:     getRefKey('ductility'),
  };
}

function getSNData() {
  const stressUnit = document.getElementById('field-fatigue_sn_curve_stress_unit')?.value ?? 'GPa';
  const rows = document.querySelectorAll('#field-fatigue_sn_curve .sn-row');
  const points = [];
  for (const row of rows) {
    const stress = parseFloat(row.querySelector('.sn-stress')?.value);
    const cycles = parseFloat(row.querySelector('.sn-cycles')?.value);
    if (!isNaN(stress) && !isNaN(cycles)) {
      points.push({ stress: toCanonical(stress, null, 'GPa', stressUnit), cycles });
    }
  }
  const ratioRaw = parseFloat(document.getElementById('field-fatigue_sn_curve_stress_ratio')?.value);
  const stressRatio = isNaN(ratioRaw) ? null : ratioRaw;
  const testMethod = document.getElementById('field-fatigue_sn_curve_test_method')?.value || null;
  return { points, stress_ratio: stressRatio, test_method: testMethod, ref: getRefKey('fatigue_sn_curve') };
}

function getThermalTable(fieldId, valueKey, canonicalUnit) {
  const valIn  = document.getElementById(`field-${fieldId}_value`);
  const raw    = valIn ? parseFloat(valIn.value) : NaN;
  const valUnit = document.getElementById(`field-${fieldId}_value_unit`)?.value ?? canonicalUnit;
  const tempUnit = document.getElementById(`field-${fieldId}_temp_unit`)?.value ?? 'K';

  const value = isNaN(raw) ? null : toCanonical(raw, null, canonicalUnit, valUnit);

  const tableRows = document.querySelectorAll(`#field-${fieldId} .cte-row`);
  const table = [];
  for (const row of tableRows) {
    const tempEntered = parseFloat(row.querySelector('.thermal-temp')?.value);
    const valEntered  = parseFloat(row.querySelector('.thermal-val')?.value);
    if (!isNaN(tempEntered) && !isNaN(valEntered)) {
      const tempC    = toCanonical(tempEntered, null, '°C', tempUnit);
      const valCanon = toCanonical(valEntered,  null, canonicalUnit, valUnit);
      const pt = { temp: Math.round(tempC * 10) / 10 };
      pt[valueKey] = valCanon;
      table.push(pt);
    }
  }

  return { value, table, ref: getRefKey(fieldId) };
}

function getCTE() {
  const singleEl  = document.getElementById('field-thermal_expansion_value');
  const singleVal = singleEl ? parseFloat(singleEl.value) : NaN;
  const cteUnit   = document.getElementById('field-thermal_expansion_cte_unit')?.value ?? 'µm/m·K';
  const tempUnit  = document.getElementById('field-thermal_expansion_temp_unit')?.value ?? 'K';

  const tableRows = document.querySelectorAll('#field-thermal_expansion .cte-row');
  const table = [];
  for (const row of tableRows) {
    const tempEntered = parseFloat(row.querySelector('.cte-temp')?.value);
    const cteEntered  = parseFloat(row.querySelector('.cte-val')?.value);
    if (!isNaN(tempEntered) && !isNaN(cteEntered)) {
      const tempC        = toCanonical(tempEntered, null, '°C', tempUnit);
      const cteCanonical = toCanonical(cteEntered,  null, 'µm/m·K', cteUnit);
      table.push({ temp: Math.round(tempC * 10) / 10, cte: cteCanonical });
    }
  }

  return {
    value: isNaN(singleVal) ? null : toCanonical(singleVal, null, 'µm/m·K', cteUnit),
    table: table.length ? table : [],
    ref:   getRefKey('thermal_expansion'),
  };
}

/** Walk the exported JSON objects and collect all non-null ref keys. */
function collectUsedRefs(...sections) {
  const keys = new Set();
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if ('ref' in obj && obj.ref) keys.add(obj.ref);
    for (const v of Object.values(obj)) walk(v);
  }
  for (const s of sections) walk(s);
  return [...keys];
}

// ── Edit post-download ────────────────────────────────────────────────────────

function showEditPostDownload(panel, slug, name) {
  const category = getSelectField('category');
  const folder   = inferCategory(category);
  panel.innerHTML = `
    <h3>Next steps — submit correction via GitHub Pull Request</h3>
    <ol class="pr-steps">
      <li>
        <strong>Fork</strong> the repository at
        <a href="https://github.com/scroberts/Engineering-Materials-Database" target="_blank" rel="noopener">
          scroberts/Engineering-Materials-Database
        </a>
      </li>
      <li>
        Replace the existing file at<br>
        <code>materials/${esc(folder)}/${esc(slug)}.json</code>
      </li>
      <li>
        Open a Pull Request with the title format:<br>
        <code>Fix material: ${esc(name)}</code>
      </li>
      <li>
        The GitHub Actions CI will validate your JSON automatically.
        An admin will review and merge once everything checks out.
      </li>
    </ol>`;
}

function inferCategory(category) {
  const map = {
    Metal: 'metals', Plastic: 'plastics', Ceramic: 'ceramics', Composite: 'composites',
    Glass: 'glass', 'Natural Material': 'natural', Elastomer: 'elastomers',
  };
  return map[category] ?? 'materials';
}
