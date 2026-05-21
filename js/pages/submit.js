/**
 * submit.js — Material submission form
 *
 * Responsibilities:
 *   1. Load references/index.json → populate reference panel + per-field dropdowns
 *   2. Build form sections mirroring the JSON schema
 *   3. Pre-fill from uploaded JSON (runs migrateToLatest first)
 *   4. Download canonical JSON on button click
 *   5. Show post-download PR instructions
 *   6. Allow adding new BibTeX references inline
 */

import { loadReferences, loadMaterial } from '../core/loader.js';
import { migrateToLatest } from '../core/schema.js';
import {
  PRESSURE_UNITS, COMP_STRENGTH_UNITS, FRACTURE_UNITS, TEMPERATURE_UNITS,
  DENSITY_UNITS, ELECTRICAL_UNITS, CTE_UNITS, THERMAL_COND_UNITS,
  SPECIFIC_HEAT_UNITS, THERMAL_DIFF_UNITS,
} from '../core/units.js';

// ── Mode ────────────────────────────────────────────────────────────────────

const _editSlug = new URLSearchParams(location.search).get('slug');
const _editMode = Boolean(_editSlug);

// ── State ───────────────────────────────────────────────────────────────────

/** Live reference database (key → {short_label, doi, bibtex, url}) */
let _refs = {};

/**
 * Keys that were present in references/index.json at page load.
 * Anything not in this set is "new" and must be embedded in the
 * downloaded JSON under `new_references` so it survives a round-trip.
 */
let _canonicalKeys = new Set();

// ── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  if (_editMode) {
    document.querySelector('.submit-title').textContent = 'Edit Material';
    document.querySelector('.submit-subtitle').textContent = 'Loading…';
  }

  try {
    _refs = await loadReferences();
    _canonicalKeys = new Set(Object.keys(_refs));
  } catch (e) {
    console.warn('Could not load references:', e);
    _refs = {};
    _canonicalKeys = new Set();
  }

  renderRefPanel();
  buildForm();
  wireForm();

  if (_editMode) await loadEditMaterial();
}

init();

// ── Edit mode ────────────────────────────────────────────────────────────────

async function loadEditMaterial() {
  try {
    const raw = await loadMaterial(_editSlug);
    const mat = migrateToLatest(raw);
    prefillForm(mat);
    applyEditModeUI(mat);
  } catch (e) {
    document.querySelector('.submit-title').textContent = 'Edit Material — Error';
    document.querySelector('.submit-subtitle').textContent =
      `Could not load "${_editSlug}": ${e.message}`;
  }
}

function applyEditModeUI(mat) {
  const name = mat.identification?.name ?? _editSlug;
  document.title = `Edit: ${name} — UVIC Engineering Materials Database`;
  document.querySelector('.submit-title').textContent    = `Edit Material: ${name}`;
  document.querySelector('.submit-subtitle').textContent =
    'Update the values below. Download the corrected JSON and open a Pull Request to replace the existing file.';
  document.querySelector('.submit-prefill-row').hidden   = true;
  document.getElementById('btn-download').textContent    = 'Download Updated JSON';

  // Slug must not change — filename is the slug
  const slugIn = document.getElementById('field-slug');
  if (slugIn) {
    slugIn.readOnly = true;
    slugIn.dataset.userEdited = 'true';
  }
}

// ── Reference panel ──────────────────────────────────────────────────────────

function renderRefPanel() {
  const list = document.getElementById('ref-panel-list');
  list.innerHTML = '';
  for (const [key, entry] of Object.entries(_refs)) {
    const li = document.createElement('li');
    li.className = 'ref-panel-item';

    const labelRow = document.createElement('div');
    labelRow.className = 'ref-panel-item-row';

    const textWrap = document.createElement('div');
    textWrap.innerHTML = `<strong>${esc(entry.short_label)}</strong><div class="ref-panel-key">${esc(key)}</div>`;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-ref-edit';
    editBtn.textContent = 'Edit';
    editBtn.dataset.refKey = key;
    editBtn.addEventListener('click', () => openEditRef(key));

    labelRow.append(textWrap, editBtn);
    li.appendChild(labelRow);
    list.appendChild(li);
  }
  if (!Object.keys(_refs).length) {
    list.innerHTML = '<li class="ref-panel-item" style="color:var(--color-muted);font-style:italic">No references loaded</li>';
  }
  // Refresh all ref selects in the form
  for (const sel of document.querySelectorAll('.form-ref-select')) {
    populateRefSelect(sel);
  }
}

function populateRefSelect(sel) {
  const current = sel.value;
  sel.innerHTML = '<option value="">— no ref —</option>';
  for (const [key, entry] of Object.entries(_refs)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = entry.short_label;
    sel.appendChild(opt);
  }
  if (current && _refs[current]) sel.value = current;
}

// ── Add / Edit reference form wiring ─────────────────────────────────────────

/** Key being edited; null when adding a new entry. */
let _editingKey = null;

/** Which tab is active: 'bibtex' | 'url' */
let _activeTab = 'bibtex';

function wireAddRefForm() {
  const btnAdd    = document.getElementById('btn-add-ref');
  const addForm   = document.getElementById('ref-add-form');
  const btnSave   = document.getElementById('btn-ref-save');
  const btnCancel = document.getElementById('btn-ref-cancel');
  const bibtexIn  = document.getElementById('ref-bibtex-input');
  const keyIn     = document.getElementById('ref-key-input');
  const labelIn   = document.getElementById('ref-shortlabel-input');
  const doiIn     = document.getElementById('ref-doi-input');
  const bibUpload = document.getElementById('ref-bib-upload');

  // ── Tab switching ──
  for (const tab of document.querySelectorAll('.ref-tab')) {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  }

  // ── Open add form ──
  btnAdd.addEventListener('click', () => {
    if (!addForm.hidden && _editingKey === null) {
      // Toggle closed if already open in add mode
      addForm.hidden = true;
      return;
    }
    _editingKey = null;
    clearAddForm();
    btnSave.textContent = 'Add Reference';
    addForm.hidden = false;
    switchTab('bibtex');
    keyIn.focus();
  });

  // ── Cancel ──
  btnCancel.addEventListener('click', () => {
    addForm.hidden = true;
    _editingKey = null;
    clearAddForm();
  });

  // ── BibTeX auto-parse ──
  bibtexIn.addEventListener('input', () => {
    const text = bibtexIn.value;
    const keyMatch  = text.match(/@\w+\{([^,]+),/);
    const doiMatch  = text.match(/doi\s*=\s*\{([^}]+)\}/i);
    const authMatch = text.match(/author\s*=\s*\{+([^{}]+)\}+/i);
    const yearMatch = text.match(/year\s*=\s*\{(\d{4})\}/i);
    if (keyMatch && !keyIn.value)  keyIn.value = keyMatch[1].trim();
    if (doiMatch && !doiIn.value)  doiIn.value = doiMatch[1].trim();
    if (!labelIn.value && authMatch && yearMatch) {
      const last = authMatch[1].split(/,| and /)[0].trim().split(/\s+/).pop();
      labelIn.value = `${last} ${yearMatch[1]}`;
    }
  });

  // ── Save (add or update) ──
  btnSave.addEventListener('click', () => {
    if (_activeTab === 'url') {
      saveUrlRef();
    } else {
      saveBibtexRef();
    }
  });

  // ── .bib file upload ──
  bibUpload.addEventListener('change', async () => {
    const file = bibUpload.files[0];
    if (!file) return;
    const text = await file.text();
    const entries = parseBib(text);
    let added = 0;
    for (const [key, entry] of Object.entries(entries)) {
      if (!_refs[key]) { _refs[key] = entry; added++; }
    }
    renderRefPanel();
    alert(`Added ${added} reference(s) from ${file.name}.`);
    bibUpload.value = '';
  });
}

function switchTab(tabName) {
  _activeTab = tabName;
  for (const tab of document.querySelectorAll('.ref-tab')) {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  }
  document.getElementById('ref-tab-bibtex').hidden = (tabName !== 'bibtex');
  document.getElementById('ref-tab-url').hidden    = (tabName !== 'url');
}

function saveBibtexRef() {
  const keyIn   = document.getElementById('ref-key-input');
  const labelIn = document.getElementById('ref-shortlabel-input');
  const doiIn   = document.getElementById('ref-doi-input');
  const bibtexIn= document.getElementById('ref-bibtex-input');

  const key   = (_editingKey ?? keyIn.value.trim());
  const label = labelIn.value.trim();
  if (!key || !label) { alert('Key and Short Label are required.'); return; }

  // If renaming the key (editing and key field changed), remove old entry
  if (_editingKey && _editingKey !== key) {
    // Don't allow key rename — key field is locked during edit
  }

  _refs[key] = {
    short_label: label,
    doi: doiIn.value.trim() || null,
    bibtex: bibtexIn.value.trim() || (_refs[key]?.bibtex ?? null),
    url: _refs[key]?.url ?? null,
  };
  finishSave();
}

function saveUrlRef() {
  const labelIn = document.getElementById('ref-url-label-input');
  const urlIn   = document.getElementById('ref-url-input');
  const keyIn   = document.getElementById('ref-url-key-input');

  const label = labelIn.value.trim();
  const url   = urlIn.value.trim();
  if (!label || !url) { alert('Short label and URL are required.'); return; }

  // Auto-generate key from label if blank (and not editing)
  let key = _editingKey ?? keyIn.value.trim();
  if (!key) {
    key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    // Ensure unique
    let k = key; let n = 2;
    while (_refs[k] && k !== _editingKey) { k = `${key}-${n++}`; }
    key = k;
  }

  _refs[key] = {
    short_label: label,
    doi: null,
    bibtex: null,
    url,
  };
  finishSave();
}

function finishSave() {
  renderRefPanel();
  document.getElementById('ref-add-form').hidden = true;
  _editingKey = null;
  clearAddForm();
}

/**
 * Open the add-form pre-populated with an existing ref for editing.
 * The key field is shown but locked (can't rename a key mid-session).
 */
function openEditRef(key) {
  const entry  = _refs[key];
  if (!entry) return;
  _editingKey  = key;

  const addForm = document.getElementById('ref-add-form');
  const btnSave = document.getElementById('btn-ref-save');
  clearAddForm();
  btnSave.textContent = 'Save Changes';
  addForm.hidden = false;

  if (entry.url && !entry.bibtex) {
    // URL-type reference → open URL tab
    switchTab('url');
    document.getElementById('ref-url-label-input').value = entry.short_label;
    document.getElementById('ref-url-input').value = entry.url;
    const keyIn = document.getElementById('ref-url-key-input');
    keyIn.value = key;
    keyIn.readOnly = true;
  } else {
    // BibTeX / manual reference
    switchTab('bibtex');
    document.getElementById('ref-shortlabel-input').value = entry.short_label;
    document.getElementById('ref-doi-input').value = entry.doi ?? '';
    document.getElementById('ref-bibtex-input').value = entry.bibtex ?? '';
    const keyIn = document.getElementById('ref-key-input');
    keyIn.value = key;
    keyIn.readOnly = true;
  }

  addForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAddForm() {
  document.getElementById('ref-bibtex-input').value = '';
  const keyIn = document.getElementById('ref-key-input');
  keyIn.value = ''; keyIn.readOnly = false;
  document.getElementById('ref-shortlabel-input').value = '';
  document.getElementById('ref-doi-input').value = '';
  document.getElementById('ref-url-label-input').value = '';
  document.getElementById('ref-url-input').value = '';
  const urlKeyIn = document.getElementById('ref-url-key-input');
  urlKeyIn.value = ''; urlKeyIn.readOnly = false;
}

/** Very simple BibTeX parser — extracts key, short_label, doi. */
function parseBib(text) {
  const result = {};
  const entryRe = /@\w+\{([^,]+),([\s\S]*?)(?=\n@|\s*$)/g;
  let m;
  while ((m = entryRe.exec(text)) !== null) {
    const key     = m[1].trim();
    const body    = m[2];
    const doiM    = body.match(/doi\s*=\s*\{([^}]+)\}/i);
    const authM   = body.match(/author\s*=\s*\{+([^{}]+)\}+/i);
    const yearM   = body.match(/year\s*=\s*\{(\d{4})\}/i);
    let label = key;
    if (authM && yearM) {
      const last = authM[1].split(/,| and /)[0].trim().split(/\s+/).pop();
      label = `${last} ${yearM[1]}`;
    }
    result[key] = {
      short_label: label,
      doi: doiM ? doiM[1].trim() : null,
      bibtex: m[0],
    };
  }
  return result;
}

// ── Form definition ──────────────────────────────────────────────────────────

/**
 * Each field descriptor:
 * { id, label, hint, type }
 *
 * Types:
 *   'text'       → <input type="text">
 *   'textarea'   → <textarea>
 *   'select'     → <select>  (needs options:[])
 *   'checkbox'   → hidden + checkbox list  (needs options:[])
 *   'bool'       → yes/no/unknown select
 *   'number'     → numeric input, optional canonicalUnit + displayUnits[]
 *   'range'      → {min, max} pair, optional canonicalUnit + displayUnits[]
 *   'range3'     → {min, max, typical} triple
 *   'hardness'   → special hardness sub-form
 *   'sn'         → S-N curve editor
 *   'cte'        → CTE table + single value
 *   'rockwell'   → rockwell + scale
 */

const FORM_SECTIONS = [
  {
    id: 'identification',
    title: 'Identification',
    fields: [
      { id: 'name',       label: 'Material name',        type: 'text',     required: true,
        hint: 'e.g. Aluminum 6061-T6' },
      { id: 'slug',       label: 'Slug (URL key)',        type: 'text',     required: true,
        hint: 'e.g. aluminum-6061-t6  (lowercase, hyphens only)' },
      { id: 'category',   label: 'Category',              type: 'select',   required: true,
        options: ['Metal', 'Plastic', 'Ceramic', 'Composite', 'Glass', 'Natural Material', 'Elastomer'] },
      { id: 'fabrication_processes', label: 'Fabrication processes', type: 'checkbox',
        options: ['Machining', 'Welding', 'Bending', 'Casting', 'Extrusion', 'Moulding',
                  '3D Print (FDM)', '3D Print (SLA)', '3D Print (SLS)',
                  '3D Print (DMLS/SLM)', '3D Print (Binder Jet)', 'Sintering',
                  'Composite Layup', 'Vacuum Infusion', 'Plating', 'Polishing'] },
      { id: 'common_forms', label: 'Common forms', type: 'checkbox',
        options: ['Sheet', 'Plate', 'Round Bar', 'Tube',
                  'Angles and Structural Profiles', 'Filament',
                  'Pellet', 'Powder', 'Prepreg'] },
      { id: 'common_form_notes', label: 'Form notes', type: 'text',
        hint: 'Optional notes on available forms' },
      { id: 'usage_frequency', label: 'Usage Frequency', type: 'select', required: true,
        options: ['Common', 'Specialty', 'Exotic'] },
      { id: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'typical_usage',
    title: 'Typical Usage',
    collapsed: true,
    fields: [
      { id: 'typical_usage', label: 'Typical usage', type: 'textarea',
        hint: 'Describe common engineering applications for this material' },
    ],
  },
  {
    id: 'mechanical_common',
    title: 'Mechanical — Common',
    fields: [
      { id: 'youngs_modulus',     label: "Young's Modulus (E)",        type: 'number',
        hint: 'Stiffness in the elastic region',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'poissons_ratio',     label: "Poisson's Ratio (ν)",        type: 'number',
        hint: 'Lateral strain / axial strain (dimensionless, ~0.25–0.45)' },
      { id: 'yield_strength',     label: 'Yield Strength (σ_y)',       type: 'number',
        hint: 'Onset of plastic deformation',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'tensile_strength',   label: 'Tensile Strength (UTS)',     type: 'number',
        hint: 'Maximum stress before fracture',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'compressive_modulus',   label: 'Compressive Modulus',     type: 'number',
        hint: 'Stiffness in compression (often ≈ E; enter if distinct)',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'compressive_strength',  label: 'Compressive Strength',    type: 'number',
        hint: 'Maximum compressive stress (stored in MPa)',
        canonicalUnit: 'MPa', displayUnits: COMP_STRENGTH_UNITS },
      { id: 'usable_temp_range', label: 'Usable Temperature Range', type: 'temprange',
        hint: 'Min and max service temperature' },
    ],
  },
  {
    id: 'mechanical_other',
    title: 'Mechanical — Other',
    collapsed: true,
    fields: [
      { id: 'microyield_strength', label: 'Micro-yield Strength',      type: 'number',
        hint: 'Stress causing 1 µstrain permanent set',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'creep_strength',      label: 'Creep Strength',            type: 'number',
        hint: 'Stress producing 0.1% creep in 1000 h',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'fatigue_sn_curve',    label: 'Fatigue S-N Curve',         type: 'sn',
        hint: 'Stress amplitude (GPa) vs. cycles to failure' },
      { id: 'fracture_toughness',  label: 'Fracture Toughness (K_IC)', type: 'number',
        hint: 'Critical stress intensity factor',
        canonicalUnit: 'MPa·m^0.5', displayUnits: FRACTURE_UNITS },
      { id: 'hardness',            label: 'Hardness',                  type: 'hardness' },
      { id: 'ductility',           label: 'Ductility (elongation)',     type: 'range3',
        hint: '% elongation at fracture; enter min, max, and/or typical' },
      { id: 'shear_strength',      label: 'Shear Strength',            type: 'number',
        hint: 'Leave blank to compute from yield strength (von Mises)',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
    ],
  },
  {
    id: 'physical',
    title: 'Physical Properties',
    fields: [
      { id: 'density',               label: 'Density (ρ)',             type: 'number',
        hint: 'Mass per unit volume',
        canonicalUnit: 'g/cm³', displayUnits: DENSITY_UNITS },
      { id: 'electrical_conductivity', label: 'Electrical Conductivity', type: 'number',
        hint: '% of International Annealed Copper Standard',
        canonicalUnit: '% IACS', displayUnits: ELECTRICAL_UNITS },
      { id: 'vapour_pressure',       label: 'Vapour Pressure',         type: 'number',
        hint: 'Pa (at 20 °C)' },
      { id: 'thermal_expansion',     label: 'CTE (α)',                 type: 'cte',
        hint: 'Enter single value and/or temperature-dependent table' },
      { id: 'thermal_conductivity',  label: 'Thermal Conductivity (k)', type: 'thermal-table',
        hint: 'Enter single value and/or temperature-dependent table',
        valueKey: 'k', valueLabel: 'k',
        canonicalUnit: 'W/m·K', displayUnits: THERMAL_COND_UNITS },
      { id: 'specific_heat',         label: 'Specific Heat (Cp)',      type: 'thermal-table',
        hint: 'Enter single value and/or temperature-dependent table',
        valueKey: 'cp', valueLabel: 'Cp',
        canonicalUnit: 'J/(kg·K)', displayUnits: SPECIFIC_HEAT_UNITS },
      { id: 'thermal_diffusivity',   label: 'Thermal Diffusivity (D)', type: 'number',
        hint: 'Leave blank to compute from k, ρ, Cp',
        canonicalUnit: 'cm²/s', displayUnits: THERMAL_DIFF_UNITS },
      { id: 'melting_point_tm',    label: 'Melting Point (Tm)',    type: 'number',
        canonicalUnit: '°C', displayUnits: TEMPERATURE_UNITS },
      { id: 'glass_transition_tg', label: 'Glass Transition (Tg)', type: 'number',
        canonicalUnit: '°C', displayUnits: TEMPERATURE_UNITS },
      { id: 'magnetic_classification', label: 'Magnetic Classification', type: 'magclass' },
    ],
  },
];

// ── Form builder ─────────────────────────────────────────────────────────────

function buildForm() {
  const form = document.getElementById('submit-form');
  form.innerHTML = '';
  for (const section of FORM_SECTIONS) {
    form.appendChild(buildSection(section));
  }
}

function buildSection(sec) {
  const div = document.createElement('div');
  div.className = 'form-section' + (sec.collapsed ? ' is-collapsed' : '');
  div.dataset.sectionId = sec.id;
  div.innerHTML = `
    <div class="form-section-header">
      <h3 class="form-section-title">${esc(sec.title)}</h3>
      <span class="form-section-icon">▼</span>
    </div>
    <div class="form-section-body"></div>`;
  div.querySelector('.form-section-header').addEventListener('click', () => {
    div.classList.toggle('is-collapsed');
  });
  const body = div.querySelector('.form-section-body');
  for (const field of sec.fields) {
    body.appendChild(buildField(field));
  }
  return div;
}

function buildField(field) {
  const wrap = document.createElement('div');
  if (field.type === 'sn' || field.type === 'cte' || field.type === 'hardness' || field.type === 'thermal-table') {
    wrap.className = 'form-row wide';
  } else if (field.type === 'checkbox') {
    wrap.className = 'form-row wide';
  } else {
    wrap.className = 'form-row';
  }

  const labelEl = document.createElement('label');
  labelEl.className = 'form-label';
  labelEl.htmlFor = `field-${field.id}`;
  labelEl.innerHTML = esc(field.label) + (field.hint ? `<small>${esc(field.hint)}</small>` : '');

  wrap.appendChild(labelEl);

  switch (field.type) {
    case 'text':      wrap.appendChild(buildText(field));     break;
    case 'textarea':  wrap.appendChild(buildTextarea(field)); break;
    case 'select':    wrap.appendChild(buildSelect(field));   break;
    case 'checkbox':  wrap.appendChild(buildCheckboxGroup(field)); break;
    case 'bool':      wrap.appendChild(buildBool(field));     break;
    case 'number':    wrap.appendChild(buildNumber(field));    break;
    case 'range':     wrap.appendChild(buildRange(field));     break;
    case 'temprange': wrap.appendChild(buildTempRange(field)); break;
    case 'range3':    wrap.appendChild(buildRange3(field));   break;
    case 'hardness':  wrap.appendChild(buildHardness(field)); break;
    case 'sn':        wrap.appendChild(buildSN(field));       break;
    case 'cte':           wrap.appendChild(buildCTE(field));           break;
    case 'thermal-table': wrap.appendChild(buildThermalTable(field)); break;
    case 'rockwell':  wrap.appendChild(buildRockwell(field)); break;
    case 'magclass':  wrap.appendChild(buildMagClass(field)); break;
    default:          wrap.appendChild(buildText(field));
  }

  return wrap;
}

// ── Field type builders ───────────────────────────────────────────────────────

function buildText(f) {
  const el = document.createElement('input');
  el.type = 'text';
  el.id = `field-${f.id}`;
  el.className = 'form-control';
  if (f.required) el.required = true;
  return el;
}

function buildTextarea(f) {
  const el = document.createElement('textarea');
  el.id = `field-${f.id}`;
  el.className = 'form-control';
  el.rows = 3;
  return el;
}

function buildSelect(f) {
  const el = document.createElement('select');
  el.id = `field-${f.id}`;
  el.className = 'form-control';
  el.innerHTML = '<option value="">— select —</option>';
  for (const opt of f.options) {
    el.innerHTML += `<option value="${esc(opt)}">${esc(opt)}</option>`;
  }
  return el;
}

function buildCheckboxGroup(f) {
  const wrap = document.createElement('div');
  wrap.className = 'form-tag-group';
  wrap.id = `field-${f.id}`;
  for (const opt of f.options) {
    const lbl = document.createElement('label');
    lbl.className = 'form-tag';
    lbl.innerHTML = `<input type="checkbox" value="${esc(opt)}"> ${esc(opt)}`;
    lbl.querySelector('input').addEventListener('change', e => {
      lbl.classList.toggle('is-checked', e.target.checked);
    });
    wrap.appendChild(lbl);
  }
  return wrap;
}

function buildBool(f) {
  const el = document.createElement('select');
  el.id = `field-${f.id}`;
  el.className = 'form-control';
  el.innerHTML = `
    <option value="">— unknown —</option>
    <option value="true">Yes</option>
    <option value="false">No</option>`;
  return el;
}

function buildNumber(f) {
  const group = document.createElement('div');
  group.className = 'form-input-group';

  const inp = document.createElement('input');
  inp.type = 'number';
  inp.id = `field-${f.id}`;
  inp.className = 'form-control';
  inp.step = 'any';
  inp.placeholder = '—';
  group.appendChild(inp);

  if (f.displayUnits) {
    const sel = document.createElement('select');
    sel.className = 'form-unit-select';
    sel.dataset.fieldId = f.id;
    for (const u of f.displayUnits) {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      sel.appendChild(opt);
    }
    group.appendChild(sel);
  }

  if (!f.noRef) {
    const refSel = buildRefSelect();
    refSel.dataset.fieldId = f.id;
    group.appendChild(refSel);
  }

  return group;
}

function buildRange(f) {
  const group = document.createElement('div');
  group.className = 'form-input-group';

  const rangeGroup = document.createElement('div');
  rangeGroup.className = 'form-range-group';

  const minIn = document.createElement('input');
  minIn.type = 'number'; minIn.step = 'any'; minIn.placeholder = 'min';
  minIn.id = `field-${f.id}-min`;
  minIn.className = 'form-control';

  const sep = document.createElement('span');
  sep.className = 'range-sep'; sep.textContent = '→';

  const maxIn = document.createElement('input');
  maxIn.type = 'number'; maxIn.step = 'any'; maxIn.placeholder = 'max';
  maxIn.id = `field-${f.id}-max`;
  maxIn.className = 'form-control';

  rangeGroup.append(minIn, sep, maxIn);
  group.appendChild(rangeGroup);

  const refSel = buildRefSelect();
  refSel.dataset.fieldId = f.id;
  group.appendChild(refSel);

  return group;
}

function buildTempRange(f) {
  const group = document.createElement('div');
  group.className = 'form-input-group';

  const rangeGroup = document.createElement('div');
  rangeGroup.className = 'form-range-group';

  const minIn = document.createElement('input');
  minIn.type = 'number'; minIn.step = 'any'; minIn.placeholder = 'min';
  minIn.id = `field-${f.id}-min`; minIn.className = 'form-control';

  const sep = document.createElement('span');
  sep.className = 'range-sep'; sep.textContent = '→';

  const maxIn = document.createElement('input');
  maxIn.type = 'number'; maxIn.step = 'any'; maxIn.placeholder = 'max';
  maxIn.id = `field-${f.id}-max`; maxIn.className = 'form-control';

  rangeGroup.append(minIn, sep, maxIn);
  group.appendChild(rangeGroup);

  // Temperature unit selector — defaults to K to match detail page display
  const unitSel = document.createElement('select');
  unitSel.className = 'form-unit-select';
  unitSel.id = `field-${f.id}-unit`;
  for (const u of TEMPERATURE_UNITS) {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    if (u === 'K') opt.selected = true;
    unitSel.appendChild(opt);
  }
  group.appendChild(unitSel);

  const refSel = buildRefSelect();
  refSel.dataset.fieldId = f.id;
  group.appendChild(refSel);

  return group;
}

function buildRange3(f) {
  const group = document.createElement('div');
  group.className = 'form-input-group';

  const rangeGroup = document.createElement('div');
  rangeGroup.className = 'form-range-group';

  for (const part of ['min', 'max', 'typical']) {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = 'any'; inp.placeholder = part;
    inp.id = `field-${f.id}-${part}`;
    inp.className = 'form-control';
    if (part !== 'min') {
      const sep = document.createElement('span');
      sep.className = 'range-sep'; sep.textContent = '/';
      rangeGroup.appendChild(sep);
    }
    rangeGroup.appendChild(inp);
  }

  group.appendChild(rangeGroup);

  const refSel = buildRefSelect();
  refSel.dataset.fieldId = f.id;
  group.appendChild(refSel);

  return group;
}

function buildHardness(f) {
  const wrap = document.createElement('div');
  wrap.className = 'hardness-form-group';
  wrap.id = `field-${f.id}`;

  for (const [scale, id, placeholder] of [
    ['Vickers (HV)', 'hardness_vickers', ''],
    ['Brinell (HB)', 'hardness_brinell', ''],
  ]) {
    const row = document.createElement('div');
    row.className = 'hardness-form-row';
    const lbl = document.createElement('label');
    lbl.htmlFor = `field-${id}`;
    lbl.textContent = scale;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = 'any'; inp.id = `field-${id}`;
    inp.className = 'form-control'; inp.placeholder = placeholder || '—';
    const refSel = buildRefSelect();
    refSel.dataset.fieldId = id;
    row.append(lbl, inp, refSel);
    wrap.appendChild(row);
  }

  // Rockwell
  const row = document.createElement('div');
  row.className = 'hardness-form-row';
  const lbl = document.createElement('label');
  lbl.textContent = 'Rockwell';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = 'any'; inp.id = 'field-hardness_rockwell';
  inp.className = 'form-control'; inp.placeholder = '—';
  const scaleSel = document.createElement('select');
  scaleSel.className = 'form-unit-select'; scaleSel.id = 'field-hardness_rockwell_scale';
  for (const s of ['', 'A', 'B', 'C', 'D', 'E', 'F']) {
    scaleSel.innerHTML += `<option value="${s}">${s || '— scale —'}</option>`;
  }
  const refSel = buildRefSelect();
  refSel.dataset.fieldId = 'hardness_rockwell';
  row.append(lbl, inp, scaleSel, refSel);
  wrap.appendChild(row);

  // Shore
  const shoreRow = document.createElement('div');
  shoreRow.className = 'hardness-form-row';
  const shoreLbl = document.createElement('label');
  shoreLbl.textContent = 'Shore';
  const shoreInp = document.createElement('input');
  shoreInp.type = 'number'; shoreInp.step = 'any'; shoreInp.id = 'field-hardness_shore';
  shoreInp.className = 'form-control'; shoreInp.placeholder = '—';
  const shoreScaleSel = document.createElement('select');
  shoreScaleSel.className = 'form-unit-select'; shoreScaleSel.id = 'field-hardness_shore_scale';
  for (const s of ['', 'A', 'D']) {
    shoreScaleSel.innerHTML += `<option value="${s}">${s || '— scale —'}</option>`;
  }
  const shoreRefSel = buildRefSelect();
  shoreRefSel.dataset.fieldId = 'hardness_shore';
  shoreRow.append(shoreLbl, shoreInp, shoreScaleSel, shoreRefSel);
  wrap.appendChild(shoreRow);

  return wrap;
}

function buildSN(f) {
  const wrap = document.createElement('div');
  wrap.className = 'sn-editor';
  wrap.id = `field-${f.id}`;

  // Stress unit selector
  const unitRow = document.createElement('div');
  unitRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem;font-size:0.8rem;color:var(--color-muted);';
  const unitLbl = document.createElement('span');
  unitLbl.textContent = 'Stress unit:';
  const unitSel = document.createElement('select');
  unitSel.className = 'form-unit-select';
  unitSel.id = 'field-fatigue_sn_curve_stress_unit';
  for (const u of PRESSURE_UNITS) {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    unitSel.appendChild(opt);
  }
  unitRow.append(unitLbl, unitSel);
  wrap.appendChild(unitRow);

  const rows = document.createElement('div');
  rows.className = 'sn-rows';

  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'sn-add-btn';
  addBtn.textContent = '+ Add data point';

  const refRow = document.createElement('div');
  refRow.style.display = 'flex'; refRow.style.alignItems = 'center'; refRow.style.gap = '0.4rem';
  const refLbl = document.createElement('span');
  refLbl.textContent = 'Reference:'; refLbl.style.fontSize = '0.8rem'; refLbl.style.color = 'var(--color-muted)';
  const refSel = buildRefSelect(); refSel.dataset.fieldId = f.id;
  refRow.append(refLbl, refSel);

  addBtn.addEventListener('click', () => addSNRow(rows));
  addSNRow(rows); // start with one row

  wrap.append(rows, addBtn, refRow);
  return wrap;
}

function addSNRow(container) {
  const row = document.createElement('div');
  row.className = 'sn-row';

  const stressLbl = document.createElement('label');
  stressLbl.textContent = 'Stress';
  const stressIn = document.createElement('input');
  stressIn.type = 'number'; stressIn.step = 'any'; stressIn.placeholder = '—';
  stressIn.className = 'form-control sn-stress';

  const cyclesLbl = document.createElement('label');
  cyclesLbl.textContent = 'Cycles';
  const cyclesIn = document.createElement('input');
  cyclesIn.type = 'number'; cyclesIn.step = 'any'; cyclesIn.placeholder = '1e6';
  cyclesIn.className = 'form-control sn-cycles';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.className = 'sn-remove-btn'; removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(stressLbl, stressIn, cyclesLbl, cyclesIn, removeBtn);
  container.appendChild(row);
}

function buildCTE(f) {
  const wrap = document.createElement('div');
  wrap.className = 'cte-editor';
  wrap.id = `field-${f.id}`;

  // CTE value unit selector (applies to single value and table CTE column)
  const cteUnitRow = document.createElement('div');
  cteUnitRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;font-size:0.8rem;color:var(--color-muted);';
  const cteUnitLbl = document.createElement('span');
  cteUnitLbl.textContent = 'CTE unit:';
  const cteUnitSel = document.createElement('select');
  cteUnitSel.className = 'form-unit-select';
  cteUnitSel.id = 'field-thermal_expansion_cte_unit';
  for (const u of CTE_UNITS) {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    cteUnitSel.appendChild(opt);
  }
  cteUnitRow.append(cteUnitLbl, cteUnitSel);
  wrap.appendChild(cteUnitRow);

  // Single value row
  const singleRow = document.createElement('div');
  singleRow.className = 'form-input-group';
  const singleIn = document.createElement('input');
  singleIn.type = 'number'; singleIn.step = 'any'; singleIn.placeholder = 'single value';
  singleIn.id = 'field-thermal_expansion_value'; singleIn.className = 'form-control';
  const refSel = buildRefSelect(); refSel.dataset.fieldId = f.id;
  singleRow.append(singleIn, refSel);
  wrap.appendChild(singleRow);

  // Table rows
  const tableRows = document.createElement('div');
  tableRows.className = 'cte-rows';
  tableRows.style.marginTop = '0.4rem';

  // Temperature unit selector for the table column
  const tableUnitRow = document.createElement('div');
  tableUnitRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-top:0.5rem;margin-bottom:0.2rem;';
  const tableUnitLbl = document.createElement('span');
  tableUnitLbl.style.cssText = 'font-size:0.75rem;color:var(--color-muted);';
  tableUnitLbl.textContent = 'Table temperature unit:';
  const tableUnitSel = document.createElement('select');
  tableUnitSel.className = 'form-unit-select';
  tableUnitSel.id = 'field-thermal_expansion_temp_unit';
  for (const u of TEMPERATURE_UNITS) {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    if (u === 'K') opt.selected = true;
    tableUnitSel.appendChild(opt);
  }
  tableUnitRow.append(tableUnitLbl, tableUnitSel);
  wrap.appendChild(tableUnitRow);

  const tableHeader = document.createElement('div');
  tableHeader.style.fontSize = '0.75rem'; tableHeader.style.color = 'var(--color-muted)';
  tableHeader.style.marginBottom = '0.2rem';
  tableHeader.textContent = 'Temperature-dependent values (optional):';

  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'sn-add-btn';
  addBtn.textContent = '+ Add temperature point';
  addBtn.addEventListener('click', () => addCTERow(tableRows));

  wrap.append(tableHeader, tableRows, addBtn);
  return wrap;
}

function addCTERow(container) {
  const row = document.createElement('div');
  row.className = 'cte-row';

  const tempLbl = document.createElement('label'); tempLbl.textContent = 'Temp';
  const tempIn  = document.createElement('input');
  tempIn.type = 'number'; tempIn.step = 'any'; tempIn.className = 'form-control cte-temp';

  const cteLbl  = document.createElement('label'); cteLbl.textContent = 'CTE';
  const cteIn   = document.createElement('input');
  cteIn.type = 'number'; cteIn.step = 'any'; cteIn.className = 'form-control cte-val';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.className = 'sn-remove-btn'; removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(tempLbl, tempIn, cteLbl, cteIn, removeBtn);
  container.appendChild(row);
}

function buildThermalTable(f) {
  const wrap = document.createElement('div');
  wrap.className = 'cte-editor';
  wrap.id = `field-${f.id}`;

  // Value unit selector
  const valUnitRow = document.createElement('div');
  valUnitRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;font-size:0.8rem;color:var(--color-muted);';
  const valUnitLbl = document.createElement('span');
  valUnitLbl.textContent = 'Unit:';
  const valUnitSel = document.createElement('select');
  valUnitSel.className = 'form-unit-select';
  valUnitSel.id = `field-${f.id}_value_unit`;
  for (const u of f.displayUnits) {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    valUnitSel.appendChild(opt);
  }
  valUnitRow.append(valUnitLbl, valUnitSel);
  wrap.appendChild(valUnitRow);

  // Single value + ref
  const singleRow = document.createElement('div');
  singleRow.className = 'form-input-group';
  const singleIn = document.createElement('input');
  singleIn.type = 'number'; singleIn.step = 'any'; singleIn.placeholder = 'single value';
  singleIn.id = `field-${f.id}_value`; singleIn.className = 'form-control';
  const refSel = buildRefSelect(); refSel.dataset.fieldId = f.id;
  singleRow.append(singleIn, refSel);
  wrap.appendChild(singleRow);

  // Table section
  const tableRows = document.createElement('div');
  tableRows.className = 'cte-rows';
  tableRows.style.marginTop = '0.4rem';

  const tableUnitRow = document.createElement('div');
  tableUnitRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-top:0.5rem;margin-bottom:0.2rem;';
  const tableUnitLbl = document.createElement('span');
  tableUnitLbl.style.cssText = 'font-size:0.75rem;color:var(--color-muted);';
  tableUnitLbl.textContent = 'Table temperature unit:';
  const tableUnitSel = document.createElement('select');
  tableUnitSel.className = 'form-unit-select';
  tableUnitSel.id = `field-${f.id}_temp_unit`;
  for (const u of TEMPERATURE_UNITS) {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    if (u === 'K') opt.selected = true;
    tableUnitSel.appendChild(opt);
  }
  tableUnitRow.append(tableUnitLbl, tableUnitSel);
  wrap.appendChild(tableUnitRow);

  const tableHeader = document.createElement('div');
  tableHeader.style.fontSize = '0.75rem'; tableHeader.style.color = 'var(--color-muted)';
  tableHeader.style.marginBottom = '0.2rem';
  tableHeader.textContent = 'Temperature-dependent values (optional):';

  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'sn-add-btn';
  addBtn.textContent = '+ Add temperature point';
  addBtn.addEventListener('click', () => addThermalTableRow(tableRows, f.valueLabel));

  wrap.append(tableHeader, tableRows, addBtn);
  return wrap;
}

function addThermalTableRow(container, valueLabel) {
  const row = document.createElement('div');
  row.className = 'cte-row';

  const tempLbl = document.createElement('label'); tempLbl.textContent = 'Temp';
  const tempIn  = document.createElement('input');
  tempIn.type = 'number'; tempIn.step = 'any'; tempIn.className = 'form-control thermal-temp';

  const valLbl  = document.createElement('label'); valLbl.textContent = valueLabel;
  const valIn   = document.createElement('input');
  valIn.type = 'number'; valIn.step = 'any'; valIn.className = 'form-control thermal-val';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.className = 'sn-remove-btn'; removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(tempLbl, tempIn, valLbl, valIn, removeBtn);
  container.appendChild(row);
}

function buildMagClass(f) {
  const group = document.createElement('div');
  group.className = 'form-input-group';

  const sel = document.createElement('select');
  sel.id = `field-${f.id}`;
  sel.className = 'form-control';
  sel.innerHTML = `
    <option value="">— unknown —</option>
    <option value="Ferromagnetic">Ferromagnetic (incl. ferrimagnetic) — strongly magnetic, use with caution near field-sensitive instruments</option>
    <option value="Paramagnetic">Paramagnetic — weakly magnetic, generally acceptable</option>
    <option value="Diamagnetic">Diamagnetic — magnetically benign, preferred for precision optical/astronomical instruments</option>`;

  const refSel = buildRefSelect();
  refSel.dataset.fieldId = f.id;

  group.append(sel, refSel);
  return group;
}

function buildRefSelect() {
  const sel = document.createElement('select');
  sel.className = 'form-ref-select';
  populateRefSelect(sel);
  return sel;
}

// ── Form wiring ───────────────────────────────────────────────────────────────

function wireForm() {
  // Slug auto-generation from name
  const nameIn = document.getElementById('field-name');
  const slugIn = document.getElementById('field-slug');
  if (nameIn && slugIn) {
    nameIn.addEventListener('input', () => {
      if (!slugIn.dataset.userEdited) {
        slugIn.value = nameIn.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
    });
    slugIn.addEventListener('input', () => { slugIn.dataset.userEdited = 'true'; });
  }

  // Pre-fill upload
  document.getElementById('prefill-upload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw  = JSON.parse(text);
      const mat  = migrateToLatest(raw);
      prefillForm(mat);
      document.getElementById('prefill-status').textContent = `Pre-filled from ${file.name}`;
    } catch (err) {
      document.getElementById('prefill-status').textContent = `Error: ${err.message}`;
      document.getElementById('prefill-status').style.color = 'var(--color-danger)';
    }
  });

  // Download button
  document.getElementById('btn-download').addEventListener('click', downloadJSON);

  // Add-ref panel wiring
  wireAddRefForm();
}

// ── Pre-fill ─────────────────────────────────────────────────────────────────

function prefillForm(mat) {
  // Merge references FIRST so dropdowns are populated before setRefField calls.
  // 1. Use full metadata from new_references if present (proper round-trip).
  // 2. Fall back to stubs for any remaining unknown keys.
  let stubsAdded = 0;
  const newRefsInFile = mat.new_references ?? {};
  for (const key of (mat.references ?? [])) {
    if (!_refs[key]) {
      if (newRefsInFile[key]) {
        // Full metadata embedded in the file — restore it completely
        _refs[key] = newRefsInFile[key];
      } else {
        // No metadata available — add a stub the user can edit
        _refs[key] = { short_label: key, doi: null, bibtex: null, url: null };
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

function setBoolField(id, value) {
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

// ── JSON export ───────────────────────────────────────────────────────────────

function downloadJSON() {
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
  if (_editMode) {
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
    if (!_canonicalKeys.has(key) && _refs[key]) {
      newRefs[key] = _refs[key];
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

function getBoolField(id) {
  const el = document.getElementById(`field-${id}`);
  if (!el || !el.value) return null;
  return el.value === 'true';
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
  return { points, ref: getRefKey('fatigue_sn_curve') };
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

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
