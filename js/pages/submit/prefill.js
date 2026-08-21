/**
 * submit/prefill.js — Populate the form from an uploaded/migrated material
 * JSON, or from a parsed HTML import.
 */

import { migrateToLatest } from '../../core/schema.js';
import { refs, renderRefPanel } from './refsStore.js';
import { addSNRow, addCTERow, addThermalTableRow } from './formBuilder.js';

// ── Pre-fill from HTML ────────────────────────────────────────────────────────

export function referenceLabel(parsed, fallbackName) {
  return `${parsed.mat.identification.name ?? fallbackName} — ${parsed.siteLabel}`;
}

/**
 * Set ref = refKey on every populated leaf in mat's property sections, so that
 * prefillForm() (unmodified) wires up each field's reference dropdown as it
 * populates the field itself.
 */
function assignRefToPopulated(mat, refKey) {
  for (const section of ['mechanical_common', 'mechanical_other', 'physical']) {
    const obj = mat[section];
    if (!obj) continue;
    for (const prop of Object.values(obj)) {
      if (!prop || typeof prop !== 'object' || !('ref' in prop)) continue;
      const hasValue = ['value', 'typical', 'min', 'max'].some(k => prop[k] != null);
      if (hasValue) prop.ref = refKey;
    }
  }
}

export function applyHtmlPrefill({ mat, siteLabel, populatedCount, unmatchedRaw }, refKey) {
  if (refKey) assignRefToPopulated(mat, refKey);
  prefillForm(migrateToLatest(mat));

  const parts = [`Pre-filled ${populatedCount} propert${populatedCount === 1 ? 'y' : 'ies'} from ${siteLabel}`];
  if (refKey) parts.push(`added reference [${refKey}] and linked it to all populated fields`);
  const rawCount = Object.keys(unmatchedRaw).length;
  if (rawCount) {
    parts.push(`${rawCount} propert${rawCount === 1 ? 'y' : 'ies'} not recognized (see console)`);
    console.log('Unrecognized properties from HTML import:', unmatchedRaw);
  }
  const status = document.getElementById('prefill-html-status');
  status.style.color = '';
  status.textContent = parts.join(' — ') +
    '. Existing values in these fields were overwritten — review before downloading.';
}

// ── Pre-fill ─────────────────────────────────────────────────────────────────

export function prefillForm(mat) {
  // Merge references FIRST so dropdowns are populated before setRefField calls.
  // 1. Use full metadata from new_references if present (proper round-trip).
  // 2. Fall back to stubs for any remaining unknown keys.
  let stubsAdded = 0;
  const newRefsInFile = mat.new_references ?? {};
  for (const key of (mat.references ?? [])) {
    if (!refs[key]) {
      if (newRefsInFile[key]) {
        // Full metadata embedded in the file — restore it completely
        refs[key] = newRefsInFile[key];
      } else {
        // No metadata available — add a stub the user can edit
        refs[key] = { short_label: key, doi: null, bibtex: null, url: null };
        stubsAdded++;
      }
    }
  }
  if (Object.keys(newRefsInFile).length || stubsAdded) renderRefPanel();

  const id = mat.identification ?? {};
  setField('name', id.name);
  setField('slug', id.slug);
  setSelectField('category', id.category);
  setCheckboxGroup('fabrication_processes', id.fabrication_processes ?? []);
  setCheckboxGroup('common_forms', id.common_forms ?? []);
  setField('common_form_notes', id.common_form_notes);
  setSelectField('usage_frequency', id.usage_frequency);
  setField('notes', id.notes);
  setField('typical_usage', mat.typical_usage);

  const mc = mat.mechanical_common ?? {};
  setNumberField('youngs_modulus',    mc.youngs_modulus?.value,    mc.youngs_modulus?.ref);
  setNumberField('poissons_ratio',    mc.poissons_ratio?.value,    mc.poissons_ratio?.ref);
  setNumberField('yield_strength',    mc.yield_strength?.value,    mc.yield_strength?.ref);
  setNumberField('tensile_strength',  mc.tensile_strength?.value,  mc.tensile_strength?.ref);
  setNumberField('compressive_modulus',  mc.compressive_modulus?.value,  mc.compressive_modulus?.ref);
  setNumberField('compressive_strength', mc.compressive_strength?.value, mc.compressive_strength?.ref);
  if (mc.usable_temp_range) {
    // Stored in °C; form defaults to K display
    const cToK = v => v != null ? Math.round((v + 273.15) * 10) / 10 : null;
    setField('field-usable_temp_range-min', cToK(mc.usable_temp_range.min), true);
    setField('field-usable_temp_range-max', cToK(mc.usable_temp_range.max), true);
    setRefField('usable_temp_range', mc.usable_temp_range.ref);
  }

  const mo = mat.mechanical_other ?? {};
  setNumberField('microyield_strength', mo.microyield_strength?.value, mo.microyield_strength?.ref);
  setNumberField('creep_strength',      mo.creep_strength?.value,      mo.creep_strength?.ref);
  setNumberField('fracture_toughness',  mo.fracture_toughness?.value,  mo.fracture_toughness?.ref);
  setNumberField('hardness_vickers',    mo.hardness_vickers?.value,    mo.hardness_vickers?.ref);
  setNumberField('hardness_brinell',    mo.hardness_brinell?.value,    mo.hardness_brinell?.ref);
  if (mo.hardness_rockwell) {
    setField('field-hardness_rockwell', mo.hardness_rockwell.value, true);
    setSelectField('hardness_rockwell_scale', mo.hardness_rockwell.scale);
    setRefField('hardness_rockwell', mo.hardness_rockwell.ref);
  }
  if (mo.hardness_shore) {
    setField('field-hardness_shore', mo.hardness_shore.value, true);
    setSelectField('hardness_shore_scale', mo.hardness_shore.scale);
    setRefField('hardness_shore', mo.hardness_shore.ref);
  }
  if (mo.ductility) {
    setField('field-ductility-min',     mo.ductility.min,     true);
    setField('field-ductility-max',     mo.ductility.max,     true);
    setField('field-ductility-typical', mo.ductility.typical, true);
    setRefField('ductility', mo.ductility.ref);
  }
  setNumberField('shear_strength', mo.shear_strength?.value, mo.shear_strength?.ref);

  if (mo.fatigue_sn_curve?.points?.length) {
    prefillSN(mo.fatigue_sn_curve);
  }

  const ph = mat.physical ?? {};
  setNumberField('density',               ph.density?.value,               ph.density?.ref);
  setNumberField('electrical_conductivity', ph.electrical_conductivity?.value, ph.electrical_conductivity?.ref);
  setNumberField('vapour_pressure',       ph.vapour_pressure?.value,       ph.vapour_pressure?.ref);
  prefillThermalTable('thermal_conductivity', 'k',  ph.thermal_conductivity);
  prefillThermalTable('specific_heat',        'cp', ph.specific_heat);
  setNumberField('thermal_diffusivity',   ph.thermal_diffusivity?.value,   ph.thermal_diffusivity?.ref);
  // Stored in °C; convert to K for pre-fill (form unit select defaults to K)
  const cToK = v => v != null ? Math.round((v + 273.15) * 10) / 10 : null;
  setField('field-melting_point_tm',    cToK(ph.melting_point_tm?.value),    true);
  setField('field-glass_transition_tg', cToK(ph.glass_transition_tg?.value), true);
  setRefField('melting_point_tm',    ph.melting_point_tm?.ref);
  setRefField('glass_transition_tg', ph.glass_transition_tg?.ref);
  if (ph.magnetic_classification) {
    setSelectField('magnetic_classification', ph.magnetic_classification.value);
    setRefField('magnetic_classification', ph.magnetic_classification.ref);
  }
  if (ph.thermal_expansion) {
    // Reset CTE unit to canonical before pre-filling
    const cteUnitEl = document.getElementById('field-thermal_expansion_cte_unit');
    if (cteUnitEl) cteUnitEl.value = 'µm/m·K';
    setField('field-thermal_expansion_value', ph.thermal_expansion.value, true);
    setRefField('thermal_expansion', ph.thermal_expansion.ref);
    if (ph.thermal_expansion.table?.length) {
      prefillCTE(ph.thermal_expansion.table);
    }
  }

  // Surface a notice about reference handling
  const restoredCount = Object.keys(newRefsInFile).length;
  if (restoredCount || stubsAdded) {
    const status = document.getElementById('prefill-status');
    const parts = [];
    if (restoredCount) parts.push(`${restoredCount} reference${restoredCount > 1 ? 's' : ''} restored`);
    if (stubsAdded)    parts.push(`${stubsAdded} unknown reference${stubsAdded > 1 ? 's' : ''} added as stubs (click Edit in the References panel to fill in details)`);
    status.textContent += ' — ' + parts.join(', ');
  }
}

function setField(idOrEl, value, isId = false) {
  const el = isId ? document.getElementById(idOrEl) : document.getElementById(`field-${idOrEl}`);
  if (!el || value == null) return;
  el.value = value;
}

function setSelectField(id, value) {
  const el = document.getElementById(`field-${id}`);
  if (!el || value == null) return;
  el.value = String(value);
}

function setCheckboxGroup(id, values) {
  const wrap = document.getElementById(`field-${id}`);
  if (!wrap) return;
  for (const lbl of wrap.querySelectorAll('.form-tag')) {
    const cb = lbl.querySelector('input');
    const checked = values.includes(cb.value);
    cb.checked = checked;
    lbl.classList.toggle('is-checked', checked);
  }
}

function setNumberField(id, value, refKey) {
  setField(id, value != null ? String(value) : null);
  if (refKey) setRefField(id, refKey);
}

function setRefField(id, refKey) {
  if (!refKey) return;
  const sel = document.querySelector(`.form-ref-select[data-field-id="${id}"]`);
  if (sel) sel.value = refKey;
}

function prefillSN(snData) {
  const container = document.querySelector('#field-fatigue_sn_curve .sn-rows');
  if (!container) return;
  // Reset stress unit to GPa (canonical) so pre-filled values display correctly
  const stressUnitEl = document.getElementById('field-fatigue_sn_curve_stress_unit');
  if (stressUnitEl) stressUnitEl.value = 'GPa';
  const ratioEl = document.getElementById('field-fatigue_sn_curve_stress_ratio');
  if (ratioEl) ratioEl.value = snData.stress_ratio ?? '';
  const methodEl = document.getElementById('field-fatigue_sn_curve_test_method');
  if (methodEl) methodEl.value = snData.test_method ?? '';
  container.innerHTML = '';
  for (const pt of snData.points) {
    addSNRow(container);
    const rows = container.querySelectorAll('.sn-row');
    const last = rows[rows.length - 1];
    last.querySelector('.sn-stress').value = pt.stress ?? '';
    last.querySelector('.sn-cycles').value = pt.cycles ?? '';
  }
  setRefField('fatigue_sn_curve', snData.ref);
}

function prefillCTE(table) {
  const container = document.querySelector('#field-thermal_expansion .cte-rows');
  if (!container) return;
  // Reset CTE unit to canonical before pre-filling
  const cteUnitEl = document.getElementById('field-thermal_expansion_cte_unit');
  if (cteUnitEl) cteUnitEl.value = 'µm/m·K';
  // Stored in °C; form temp unit defaults to K
  const cToK = v => v != null ? Math.round((v + 273.15) * 10) / 10 : v;
  for (const pt of table) {
    addCTERow(container);
    const rows = container.querySelectorAll('.cte-row');
    const last = rows[rows.length - 1];
    last.querySelector('.cte-temp').value = cToK(pt.temp) ?? '';
    last.querySelector('.cte-val').value  = pt.cte ?? '';
  }
}

function prefillThermalTable(fieldId, valueKey, prop) {
  if (!prop) return;
  const canonicalUnit = valueKey === 'k' ? 'W/m·K' : 'J/(kg·K)';
  const valueLabel    = valueKey === 'k' ? 'k' : 'Cp';

  // Reset value unit to canonical so the stored value displays as-is
  const valUnitEl = document.getElementById(`field-${fieldId}_value_unit`);
  if (valUnitEl) valUnitEl.value = canonicalUnit;

  const valIn = document.getElementById(`field-${fieldId}_value`);
  if (valIn && prop.value != null) valIn.value = String(prop.value);

  setRefField(fieldId, prop.ref);

  if (!prop.table?.length) return;
  const container = document.querySelector(`#field-${fieldId} .cte-rows`);
  if (!container) return;

  // Reset temp unit to K (values stored in °C; K is the form default)
  const tempUnitEl = document.getElementById(`field-${fieldId}_temp_unit`);
  if (tempUnitEl) tempUnitEl.value = 'K';

  const cToK = v => v != null ? Math.round((v + 273.15) * 10) / 10 : v;
  for (const pt of prop.table) {
    addThermalTableRow(container, valueLabel);
    const rows = container.querySelectorAll('.cte-row');
    const last = rows[rows.length - 1];
    last.querySelector('.thermal-temp').value = cToK(pt.temp) ?? '';
    last.querySelector('.thermal-val').value  = pt[valueKey] ?? '';
  }
}
