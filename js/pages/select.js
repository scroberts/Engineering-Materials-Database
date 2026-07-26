/**
 * select.js — Advanced Material Selection page logic.
 *
 * Three-tier filtering:
 *   1. Categorical pre-filters (from Browse URL params, manifest data only)
 *   2. Numeric property range filters (up to 5, requires full material JSONs)
 *   3. Merit index ranking (from derived.js MERIT_INDICES)
 */

import { loadManifest, loadMaterialBatch } from '../core/loader.js';
import { MERIT_INDICES } from '../core/derived.js';
import {
  convertPressure, convertCompStrength, convertFracture,
  convertTemperature, convertDensity, convertCTE,
  convertThermalCond, convertSpecificHeat, convertThermalDiff,
} from '../core/units.js';

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Filterable property definitions ────────────────────────────────────────

const PROPERTIES = [
  // Mechanical
  { id: 'youngs_modulus',      label: "Young's Modulus",     group: 'Mechanical',
    get: m => m.mechanical_common?.youngs_modulus?.value ?? null,
    unit: { metric: 'GPa',  imperial: 'ksi' },
    convert: (v, sys) => sys === 'imperial' ? convertPressure(v, 'ksi') : v },
  { id: 'yield_strength',      label: 'Yield Strength',      group: 'Mechanical',
    get: m => m.mechanical_common?.yield_strength?.value ?? null,
    unit: { metric: 'MPa',  imperial: 'ksi' },
    convert: (v, sys) => sys === 'imperial' ? convertPressure(v, 'ksi') : (v != null ? v * 1000 : null) },
  { id: 'tensile_strength',    label: 'Tensile Strength',    group: 'Mechanical',
    get: m => m.mechanical_common?.tensile_strength?.value ?? null,
    unit: { metric: 'MPa',  imperial: 'ksi' },
    convert: (v, sys) => sys === 'imperial' ? convertPressure(v, 'ksi') : (v != null ? v * 1000 : null) },
  { id: 'compressive_strength',label: 'Compressive Strength',group: 'Mechanical',
    get: m => m.mechanical_common?.compressive_strength?.value ?? null,
    unit: { metric: 'MPa',  imperial: 'ksi' },
    convert: (v, sys) => sys === 'imperial' ? convertCompStrength(v, 'ksi') : v },
  { id: 'shear_strength',      label: 'Shear Strength',      group: 'Mechanical',
    get: m => m.mechanical_other?.shear_strength?.value ?? null,
    unit: { metric: 'MPa',  imperial: 'ksi' },
    convert: (v, sys) => sys === 'imperial' ? convertPressure(v, 'ksi') : (v != null ? v * 1000 : null) },
  { id: 'fracture_toughness',  label: 'Fracture Toughness',  group: 'Mechanical',
    get: m => m.mechanical_other?.fracture_toughness?.value ?? null,
    unit: { metric: 'MPa·m^0.5', imperial: 'ksi·in^0.5' },
    convert: (v, sys) => sys === 'imperial' ? convertFracture(v, 'ksi·in^0.5') : v },
  { id: 'hardness_vickers',    label: 'Hardness (HV)',       group: 'Mechanical',
    get: m => m.mechanical_other?.hardness_vickers?.value ?? null,
    unit: { metric: 'HV', imperial: 'HV' },
    convert: (v) => v },
  { id: 'ductility',           label: 'Ductility (elongation)', group: 'Mechanical',
    get: m => {
      const d = m.mechanical_other?.ductility;
      if (!d) return null;
      return d.typical ?? ((d.min != null && d.max != null) ? (d.min + d.max) / 2 : (d.min ?? d.max));
    },
    unit: { metric: '%', imperial: '%' },
    convert: (v) => v },
  { id: 'max_service_temp',    label: 'Max Service Temp',    group: 'Mechanical',
    get: m => m.mechanical_common?.usable_temp_range?.max ?? null,
    unit: { metric: '°C', imperial: '°F', tempDependent: true },
    convert: (v, sys, tempUnit) => convertTemperature(v, tempUnit) },
  { id: 'min_service_temp',    label: 'Min Service Temp',    group: 'Mechanical',
    get: m => m.mechanical_common?.usable_temp_range?.min ?? null,
    unit: { metric: '°C', imperial: '°F', tempDependent: true },
    convert: (v, sys, tempUnit) => convertTemperature(v, tempUnit) },
  // Physical
  { id: 'density',             label: 'Density',             group: 'Physical',
    get: m => m.physical?.density?.value ?? null,
    unit: { metric: 'g/cm³', imperial: 'lb/in³' },
    convert: (v, sys) => sys === 'imperial' ? convertDensity(v, 'lb/in³') : v },
  { id: 'electrical_conductivity', label: 'Electrical Conductivity', group: 'Physical',
    get: m => m.physical?.electrical_conductivity?.value ?? null,
    unit: { metric: '% IACS', imperial: '% IACS' },
    convert: (v) => v },
  { id: 'cte',                 label: 'CTE',                 group: 'Physical',
    get: m => m.physical?.thermal_expansion?.value ?? null,
    unit: { metric: 'µm/m·K', imperial: 'µin/in·°F' },
    convert: (v, sys) => sys === 'imperial' ? convertCTE(v, 'µin/in·°F') : v },
  { id: 'thermal_conductivity',label: 'Thermal Conductivity',group: 'Physical',
    get: m => {
      const tc = m.physical?.thermal_conductivity;
      return tc?.value ?? null;
    },
    unit: { metric: 'W/m·K', imperial: 'BTU/(hr·ft·°F)' },
    convert: (v, sys) => sys === 'imperial' ? convertThermalCond(v, 'BTU/(hr·ft·°F)') : v },
  { id: 'specific_heat',       label: 'Specific Heat',       group: 'Physical',
    get: m => {
      const sh = m.physical?.specific_heat;
      return sh?.value ?? null;
    },
    unit: { metric: 'J/(kg·K)', imperial: 'BTU/(lb·°F)' },
    convert: (v, sys) => sys === 'imperial' ? convertSpecificHeat(v, 'BTU/(lb·°F)') : v },
  { id: 'thermal_diffusivity', label: 'Thermal Diffusivity', group: 'Physical',
    get: m => m.physical?.thermal_diffusivity?.value ?? null,
    unit: { metric: 'cm²/s', imperial: 'ft²/hr' },
    convert: (v, sys) => sys === 'imperial' ? convertThermalDiff(v, 'ft²/hr') : v },
  { id: 'melting_point',       label: 'Melting Point (Tm)',  group: 'Physical',
    get: m => m.physical?.melting_point_tm?.value ?? null,
    unit: { metric: '°C', imperial: '°F', tempDependent: true },
    convert: (v, sys, tempUnit) => convertTemperature(v, tempUnit) },
  { id: 'glass_transition',    label: 'Glass Transition (Tg)', group: 'Physical',
    get: m => m.physical?.glass_transition_tg?.value ?? null,
    unit: { metric: '°C', imperial: '°F', tempDependent: true },
    convert: (v, sys, tempUnit) => convertTemperature(v, tempUnit) },
];

const PROP_BY_ID = Object.fromEntries(PROPERTIES.map(p => [p.id, p]));

// ── State ──────────────────────────────────────────────────────────────────

let filterCount  = 0;
const MAX_FILTERS = 5;
const resultSlugs = new Set();   // checked for Compare

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  populateMeritSelect();
  buildPrefilterPanel();
  wireControls();
  addFilterRow();
}

// ── Rank selector (merit indices + raw properties) ────────────────────────

function populateMeritSelect() {
  const sel   = document.getElementById('ctrl-merit');
  const dirSel = document.getElementById('ctrl-direction');
  const dirLabel = document.getElementById('ctrl-direction-label');

  // Merit index optgroup
  const miGroup = document.createElement('optgroup');
  miGroup.label = 'Merit Indices';
  for (const mi of MERIT_INDICES) {
    const opt = document.createElement('option');
    opt.value       = `mi:${mi.id}`;
    opt.textContent = `${mi.id}: ${mi.label} — ${mi.shortName}`;
    miGroup.appendChild(opt);
  }
  sel.appendChild(miGroup);

  // Property optgroups
  const propGroups = {};
  for (const p of PROPERTIES) {
    if (!propGroups[p.group]) propGroups[p.group] = [];
    propGroups[p.group].push(p);
  }
  for (const [grp, props] of Object.entries(propGroups)) {
    const og = document.createElement('optgroup');
    og.label = `By Property — ${grp}`;
    for (const p of props) {
      const opt = document.createElement('option');
      opt.value       = `prop:${p.id}`;
      opt.textContent = p.label;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }

  function onRankChange() {
    const hint = document.getElementById('merit-hint');
    const val  = sel.value;

    if (!val) {
      hint.textContent = '';
      dirLabel.hidden  = true;
      return;
    }

    if (val.startsWith('mi:')) {
      const miId = val.slice(3);
      const mi   = MERIT_INDICES.find(m => m.id === miId);
      if (mi) {
        dirSel.value    = mi.higherIsBetter ? 'desc' : 'asc';
        dirLabel.hidden = true;   // direction is fixed for merit indices
        hint.textContent = `Direction fixed: ${mi.higherIsBetter ? 'higher' : 'lower'} is better. ${mi.description}`;
      }
    } else {
      dirLabel.hidden  = false;   // user chooses direction for raw properties
      const propId = val.slice(5);
      const prop   = PROP_BY_ID[propId];
      hint.textContent = prop
        ? `Ranks by ${prop.label} (${prop.unit.metric}). Materials missing this value are excluded from ranking.`
        : '';
    }
  }

  sel.addEventListener('change', onRankChange);
  dirLabel.hidden = true;   // hidden initially (None selected)
}

// ── Pre-filter panel ───────────────────────────────────────────────────────

function buildPrefilterPanel() {
  const p    = new URLSearchParams(location.search);
  const cats = p.getAll('cat');
  const fabs = p.getAll('fab');
  const forms= p.getAll('form');
  const freq = p.getAll('freq');
  const mag  = p.getAll('magnetic');

  const tags = [...cats, ...fabs, ...forms, ...freq, ...mag];
  if (tags.length === 0) return;

  const panel = document.getElementById('prefilter-panel');
  const tagsEl = document.getElementById('prefilter-tags');

  tagsEl.innerHTML = tags.map(t => `<span class="prefilter-tag">${escHtml(t)}</span>`).join('');

  // Build edit link preserving params
  const editUrl = `index.html${location.search ? location.search : ''}`;
  document.getElementById('prefilter-edit-link').href = editUrl;

  panel.hidden = false;

  // Count pre-filter candidates from manifest
  loadManifest().then(manifest => {
    const preFilters = {
      categories: new Set(cats),
      fab:        new Set(fabs),
      forms:      new Set(forms),
      frequency:  new Set(freq),
      magnetic:   new Set(mag),
    };
    const count = manifest.materials.filter(m => matchesPreFilters(m, preFilters)).length;
    document.getElementById('prefilter-count').textContent =
      `${count} material${count === 1 ? '' : 's'} in starting set`;
  });
}

// ── Filter row builder ─────────────────────────────────────────────────────

function getUnitLabel(propId) {
  const prop = PROP_BY_ID[propId];
  if (!prop) return '';
  const sys     = document.getElementById('ctrl-units').value;
  const tempUnit = document.getElementById('ctrl-temp').value;
  if (prop.unit.tempDependent) return tempUnit;
  return prop.unit[sys];
}

function addFilterRow() {
  if (filterCount >= MAX_FILTERS) return;
  filterCount++;

  const rows = document.getElementById('filter-rows');
  const row  = document.createElement('div');
  row.className   = 'filter-row';
  row.dataset.idx = filterCount;

  // Property selector
  const propSel = document.createElement('select');
  propSel.className  = 'filter-prop-select';
  propSel.innerHTML  = '<option value="">Property…</option>';
  // Group options
  const groups = {};
  for (const p of PROPERTIES) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }
  for (const [grp, props] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = grp;
    for (const p of props) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      optgroup.appendChild(o);
    }
    propSel.appendChild(optgroup);
  }

  // Operator selector
  const opSel = document.createElement('select');
  opSel.className = 'filter-op-select';
  for (const [val, label] of [['gte','≥'], ['lte','≤'], ['between','between'], ['eq','=']]) {
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    opSel.appendChild(o);
  }

  // Value input(s)
  const val1 = document.createElement('input');
  val1.type = 'number'; val1.className = 'filter-val-input'; val1.placeholder = 'value';

  const betweenSep = document.createElement('span');
  betweenSep.className = 'filter-between-sep';
  betweenSep.textContent = 'and';
  betweenSep.hidden = true;

  const val2 = document.createElement('input');
  val2.type = 'number'; val2.className = 'filter-val-input'; val2.placeholder = 'value';
  val2.hidden = true;

  // Unit label
  const unitLabel = document.createElement('span');
  unitLabel.className = 'filter-unit-label';

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.type      = 'button';
  removeBtn.className = 'btn-remove-filter';
  removeBtn.textContent = '×';
  removeBtn.title     = 'Remove filter';

  row.append(propSel, opSel, val1, betweenSep, val2, unitLabel, removeBtn);
  rows.appendChild(row);

  // Events
  propSel.addEventListener('change', () => {
    unitLabel.textContent = getUnitLabel(propSel.value);
  });
  opSel.addEventListener('change', () => {
    const isBetween = opSel.value === 'between';
    betweenSep.hidden = !isBetween;
    val2.hidden       = !isBetween;
  });
  removeBtn.addEventListener('click', () => {
    row.remove();
    filterCount--;
    updateAddFilterButton();
  });

  updateAddFilterButton();
}

function updateAddFilterButton() {
  const btn  = document.getElementById('btn-add-filter');
  const hint = document.getElementById('filter-hint');
  btn.disabled   = filterCount >= MAX_FILTERS;
  hint.hidden    = filterCount < MAX_FILTERS;
}

// ── Controls wiring ────────────────────────────────────────────────────────

function wireControls() {
  document.getElementById('btn-add-filter').addEventListener('click', addFilterRow);
  document.getElementById('btn-find').addEventListener('click', runSearch);

  // Update unit labels on all existing filter rows when unit system changes
  const unitsSel = document.getElementById('ctrl-units');
  const tempSel  = document.getElementById('ctrl-temp');
  const refresh  = () => {
    document.querySelectorAll('.filter-row').forEach(row => {
      const propSel = row.querySelector('.filter-prop-select');
      const label   = row.querySelector('.filter-unit-label');
      if (propSel && label) label.textContent = getUnitLabel(propSel.value);
    });
  };
  unitsSel.addEventListener('change', refresh);
  tempSel.addEventListener('change', refresh);

  document.getElementById('btn-select-all').addEventListener('click', () => {
    document.querySelectorAll('.result-check').forEach(cb => {
      cb.checked = true;
      resultSlugs.add(cb.dataset.slug);
    });
    updateCompareButton();
  });

  document.getElementById('btn-compare-selected').addEventListener('click', () => {
    if (resultSlugs.size < 2) return;
    location.href = `compare.html?slugs=${[...resultSlugs].join(',')}`;
  });
}

// ── Pre-filter matching (manifest fields only) ─────────────────────────────

function matchesPreFilters(m, pf) {
  if (pf.categories.size > 0 && !pf.categories.has(m.category)) return false;
  if (pf.fab.size > 0) {
    const set = new Set(m.fabrication_processes || []);
    if (![...pf.fab].some(v => set.has(v))) return false;
  }
  if (pf.forms.size > 0) {
    const set = new Set(m.common_forms || []);
    if (![...pf.forms].some(v => set.has(v))) return false;
  }
  if (pf.frequency.size > 0 && !pf.frequency.has(m.usage_frequency)) return false;
  if (pf.magnetic.size > 0 && !pf.magnetic.has(m.magnetic_classification)) return false;
  return true;
}

// ── Collect property filters from DOM ─────────────────────────────────────

function collectPropertyFilters() {
  const sys      = document.getElementById('ctrl-units').value;
  const tempUnit = document.getElementById('ctrl-temp').value;
  const filters  = [];

  document.querySelectorAll('.filter-row').forEach(row => {
    const propId = row.querySelector('.filter-prop-select').value;
    if (!propId) return;
    const prop = PROP_BY_ID[propId];
    if (!prop) return;

    const op   = row.querySelector('.filter-op-select').value;
    const v1   = parseFloat(row.querySelector('.filter-val-input').value);
    const val2el = row.querySelectorAll('.filter-val-input')[1];
    const v2   = val2el ? parseFloat(val2el.value) : NaN;

    if (isNaN(v1)) return;

    // Convert user-entered display value back to canonical
    const toCanonical = displayVal => {
      if (prop.unit.tempDependent) return convertTempToCanonical(displayVal, tempUnit);
      // Reverse the display conversion
      return displayToCanonical(displayVal, propId, sys);
    };

    filters.push({
      prop,
      op,
      lo: toCanonical(v1),
      hi: op === 'between' && !isNaN(v2) ? toCanonical(v2) : null,
    });
  });
  return filters;
}

function convertTempToCanonical(displayVal, tempUnit) {
  if (tempUnit === '°C') return displayVal;
  if (tempUnit === 'K')  return displayVal - 273.15;
  if (tempUnit === '°F') return (displayVal - 32) * 5 / 9;
  return displayVal;
}

function displayToCanonical(displayVal, propId, sys) {
  if (sys === 'metric') {
    // Metric display ≈ canonical except yield/tensile/shear stored in GPa, displayed in MPa
    if (['yield_strength', 'tensile_strength', 'shear_strength'].includes(propId)) {
      return displayVal / 1000;  // MPa → GPa
    }
    return displayVal;
  }
  // Imperial: reverse each conversion
  const C = {
    youngs_modulus:       v => v / 145.038,        // ksi → GPa
    yield_strength:       v => v / 145.038,        // ksi → GPa
    tensile_strength:     v => v / 145.038,
    compressive_strength: v => v / 0.145038,       // ksi → MPa
    shear_strength:       v => v / 145.038,
    fracture_toughness:   v => v / 0.9099,         // ksi·in^0.5 → MPa·m^0.5
    density:              v => v / 0.036127292,     // lb/in³ → g/cm³
    cte:                  v => v / (5/9),           // µin/in·°F → µm/m·K
    thermal_conductivity: v => v / 0.5779,
    specific_heat:        v => v / 2.3885e-4,
    thermal_diffusivity:  v => v / 3.875,           // ft²/hr → cm²/s
  };
  return C[propId] ? C[propId](displayVal) : displayVal;
}

// ── Property filter pass/fail ──────────────────────────────────────────────

function passesPropertyFilter(mat, { prop, op, lo, hi }) {
  const canonical = prop.get(mat);
  if (canonical == null) return false;  // null → excluded

  if (op === 'gte')     return canonical >= lo;
  if (op === 'lte')     return canonical <= lo;
  if (op === 'eq')      return Math.abs(canonical - lo) / (Math.abs(lo) || 1) < 0.01;
  if (op === 'between') return hi != null ? canonical >= lo && canonical <= hi : canonical >= lo;
  return true;
}

// ── Main search ────────────────────────────────────────────────────────────

async function runSearch() {
  const findBtn = document.getElementById('btn-find');
  findBtn.disabled = true;
  findBtn.textContent = 'Searching…';

  const resultsSection = document.getElementById('results-section');
  resultsSection.hidden = true;

  try {
    // Phase 1 — pre-filter on manifest
    const manifest = await loadManifest();
    const p = new URLSearchParams(location.search);
    const preFilters = {
      categories: new Set(p.getAll('cat')),
      fab:        new Set(p.getAll('fab')),
      forms:      new Set(p.getAll('form')),
      frequency:  new Set(p.getAll('freq')),
      magnetic:   new Set(p.getAll('magnetic')),
    };
    const candidates = manifest.materials.filter(m => matchesPreFilters(m, preFilters));

    if (candidates.length === 0) {
      showNoResults('No materials match the pre-filters. Try adjusting your Browse filters.');
      return;
    }

    // Phase 2 — load full JSONs for candidates only
    const fullMaterials = await loadMaterialBatch(candidates.map(m => m.slug));

    // Phase 3 — property range filters
    const propFilters = collectPropertyFilters();
    let results = fullMaterials;
    for (const pf of propFilters) {
      results = results.filter(m => passesPropertyFilter(m, pf));
    }

    if (results.length === 0) {
      showNoResults('No materials pass all property filters. Try broadening the ranges.');
      return;
    }

    // Phase 4 — rank by merit index, raw property, or alphabetical sort
    const rankVal  = document.getElementById('ctrl-merit').value;
    const dirVal   = document.getElementById('ctrl-direction').value;
    const maxN     = Math.max(1, parseInt(document.getElementById('ctrl-max-results').value, 10) || 10);
    let ranked     = [];
    let rankInfo   = null;   // { label, values: {slug→score}, unit }

    if (rankVal.startsWith('mi:')) {
      const miId = rankVal.slice(3);
      const mi   = MERIT_INDICES.find(m => m.id === miId);
      if (mi) {
        const scored = results
          .map(m => ({ mat: m, score: mi.fn(m) }))
          .filter(x => x.score != null);
        const desc = mi.higherIsBetter;
        scored.sort((a, b) => desc ? b.score - a.score : a.score - b.score);
        ranked   = scored.slice(0, maxN).map(x => x.mat);
        rankInfo = {
          label:  `${mi.id}: ${mi.label}`,
          values: Object.fromEntries(scored.map(x => [x.mat.identification.slug, x.score])),
          unit:   '',
        };
      }
    } else if (rankVal.startsWith('prop:')) {
      const propId = rankVal.slice(5);
      const prop   = PROP_BY_ID[propId];
      if (prop) {
        const sys      = document.getElementById('ctrl-units').value;
        const tempUnit = document.getElementById('ctrl-temp').value;
        const scored   = results
          .map(m => ({ mat: m, score: prop.get(m) }))
          .filter(x => x.score != null);
        const desc = dirVal === 'desc';
        scored.sort((a, b) => desc ? b.score - a.score : a.score - b.score);
        ranked = scored.slice(0, maxN).map(x => x.mat);
        // Convert scores to display units for the rank column
        const displayScores = Object.fromEntries(scored.map(x => {
          const disp = prop.unit.tempDependent
            ? convertTemperature(x.score, tempUnit)
            : prop.convert(x.score, sys, tempUnit);
          return [x.mat.identification.slug, disp];
        }));
        const unitLabel = prop.unit.tempDependent
          ? tempUnit
          : prop.unit[sys];
        rankInfo = {
          label:  `${prop.label} (${unitLabel})`,
          values: displayScores,
          unit:   unitLabel,
        };
      }
    }

    if (!rankInfo) {
      // No ranking — alphabetical
      results.sort((a, b) => a.identification.name.localeCompare(b.identification.name));
      ranked = results.slice(0, maxN);
    }

    renderResults(ranked, rankInfo);
  } finally {
    findBtn.disabled  = false;
    findBtn.textContent = 'Find Materials';
  }
}

// ── Results rendering ──────────────────────────────────────────────────────

function showNoResults(msg) {
  const section = document.getElementById('results-section');
  document.getElementById('results-heading').textContent = '0 materials found';
  document.getElementById('results-tbody').innerHTML =
    `<tr><td colspan="7" class="no-results">${msg}</td></tr>`;
  document.getElementById('btn-compare-selected').disabled = true;
  resultSlugs.clear();
  section.hidden = false;
}

/**
 * @param {Object[]} materials  - ordered list of full material objects
 * @param {Object|null} rankInfo - { label, values: {slug→displayScore}, unit } or null
 */
function renderResults(materials, rankInfo) {
  const sys      = document.getElementById('ctrl-units').value;

  resultSlugs.clear();

  const section  = document.getElementById('results-section');
  const heading  = document.getElementById('results-heading');
  const tbody    = document.getElementById('results-tbody');
  const colRank  = document.getElementById('col-merit-header');

  heading.textContent = `${materials.length} material${materials.length === 1 ? '' : 's'} found`;

  // Rank column header
  if (rankInfo) {
    colRank.hidden = false;
    colRank.textContent = rankInfo.label;
  } else {
    colRank.hidden = true;
  }

  // Unit labels for fixed summary columns
  const eUnit  = sys === 'imperial' ? 'ksi' : 'GPa';
  const syUnit = sys === 'imperial' ? 'ksi' : 'MPa';
  const rhoUnit= sys === 'imperial' ? 'lb/in³' : 'g/cm³';

  const ths = document.querySelectorAll('.results-table th');
  if (ths[3]) ths[3].textContent = `E (${eUnit})`;
  if (ths[4]) ths[4].innerHTML   = `σ<sub>y</sub> (${syUnit})`;
  if (ths[5]) ths[5].textContent = `ρ (${rhoUnit})`;

  tbody.innerHTML = materials.map((mat, i) => {
    const id     = mat.identification;
    const slug   = id.slug;
    const catCls = id.category.toLowerCase().replace(/\s+/g, '-');

    const eRaw  = mat.mechanical_common?.youngs_modulus?.value ?? null;
    const syRaw = mat.mechanical_common?.yield_strength?.value ?? null;
    const rRaw  = mat.physical?.density?.value ?? null;

    const eDisp  = sys === 'imperial' ? convertPressure(eRaw, 'ksi') : eRaw;
    const syDisp = sys === 'imperial' ? convertPressure(syRaw, 'ksi') : (syRaw != null ? syRaw * 1000 : null);
    const rDisp  = sys === 'imperial' ? convertDensity(rRaw, 'lb/in³') : rRaw;

    const fmtV = (v, d = 2) => v != null ? Number(v.toFixed(d)).toString() : '—';
    const numCell = (v, d = 2) => {
      const cls = v != null ? 'col-num' : 'col-num missing';
      return `<td class="${cls}">${fmtV(v, d)}</td>`;
    };

    const rankBadge   = rankInfo ? `<span class="rank-badge">${i + 1}</span>` : '';
    const rankScore   = rankInfo?.values?.[slug] ?? null;
    const rankDisplay = rankScore != null ? Number(rankScore.toPrecision(4)).toString() : '—';

    return `<tr>
      <td class="col-check">
        <input type="checkbox" class="result-check" data-slug="${slug}">
      </td>
      <td class="col-name">${rankBadge}<a href="material.html?slug=${slug}">${escHtml(id.name)}</a></td>
      <td><span class="badge badge-${catCls}">${escHtml(id.category)}</span></td>
      ${numCell(eDisp, 1)}
      ${numCell(syDisp, 0)}
      ${numCell(rDisp, sys === 'imperial' ? 4 : 2)}
      ${rankInfo ? `<td class="col-num">${rankDisplay}</td>` : ''}
    </tr>`;
  }).join('');

  // Wire checkboxes
  tbody.querySelectorAll('.result-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const slug = cb.dataset.slug;
      if (cb.checked) resultSlugs.add(slug);
      else            resultSlugs.delete(slug);
      updateCompareButton();
    });
  });

  updateCompareButton();
  section.hidden = false;
}

function updateCompareButton() {
  const btn = document.getElementById('btn-compare-selected');
  const n   = resultSlugs.size;
  btn.disabled    = n < 2;
  btn.textContent = `Compare Selected (${n})`;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

init();
