/**
 * submit/formBuilder.js — Renders FORM_SECTIONS into DOM form controls.
 */

import { PRESSURE_UNITS, TEMPERATURE_UNITS, CTE_UNITS } from '../../core/units.js';
import { esc } from './utils.js';
import { buildRefSelect } from './refsStore.js';
import { FORM_SECTIONS } from './formSchema.js';

// Schema maxItems (schema/v1.json) for the row-based editors below. Enforced
// here too so a user can't build an over-limit table that only fails at CI.
const SN_MAX_POINTS = 10;
const CTE_MAX_ROWS = 10;
const THERMAL_TABLE_MAX_ROWS = 12;

/** Disable `addBtn` once `container` holds `limit` rows matching `rowSelector`. */
function syncAddButtonState(container, addBtn, rowSelector, limit) {
  const atLimit = container.querySelectorAll(rowSelector).length >= limit;
  addBtn.disabled = atLimit;
  addBtn.title = atLimit ? `Maximum ${limit} rows` : '';
}

export function buildForm() {
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

  // Stress ratio (R) + test method — required context so curves from
  // different materials aren't compared apples-to-oranges (see CLAUDE.md).
  const conditionRow = document.createElement('div');
  conditionRow.style.cssText = 'display:flex;align-items:center;gap:0.6rem;margin-bottom:0.4rem;font-size:0.8rem;color:var(--color-muted);flex-wrap:wrap;';

  const ratioLbl = document.createElement('span');
  ratioLbl.textContent = 'Stress ratio R (σ_min/σ_max):';
  const ratioIn = document.createElement('input');
  ratioIn.type = 'number'; ratioIn.step = 'any'; ratioIn.placeholder = 'e.g. -1';
  ratioIn.className = 'form-control'; ratioIn.style.maxWidth = '6rem';
  ratioIn.id = 'field-fatigue_sn_curve_stress_ratio';
  ratioIn.title = 'R = -1 is fully reversed; leave blank if the source does not document it — do not guess.';

  const methodLbl = document.createElement('span');
  methodLbl.textContent = 'Test method:';
  const methodSel = document.createElement('select');
  methodSel.className = 'form-unit-select';
  methodSel.id = 'field-fatigue_sn_curve_test_method';
  methodSel.title = 'Leave blank if the source does not document it — do not guess.';
  for (const m of ['', 'Axial', 'Rotating Beam', 'Plane Bending', 'Torsion']) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m || '— unknown —';
    methodSel.appendChild(opt);
  }

  conditionRow.append(ratioLbl, ratioIn, methodLbl, methodSel);
  wrap.appendChild(conditionRow);

  const conditionNote = document.createElement('p');
  conditionNote.style.cssText = 'font-size:0.75rem;color:var(--color-muted);margin:0 0 0.5rem;';
  conditionNote.textContent = 'All data points below must share this same R and test method. If the source mixes conditions, split them into separate materials/curves rather than combining.';
  wrap.appendChild(conditionNote);

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

  addBtn.addEventListener('click', () => {
    addSNRow(rows);
    syncAddButtonState(rows, addBtn, '.sn-row', SN_MAX_POINTS);
  });
  addSNRow(rows); // start with one row
  syncAddButtonState(rows, addBtn, '.sn-row', SN_MAX_POINTS);

  wrap.append(rows, addBtn, refRow);
  return wrap;
}

export function addSNRow(container) {
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
  removeBtn.addEventListener('click', () => {
    row.remove();
    const addBtn = container.parentElement?.querySelector('.sn-add-btn');
    if (addBtn) syncAddButtonState(container, addBtn, '.sn-row', SN_MAX_POINTS);
  });

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
  addBtn.addEventListener('click', () => {
    addCTERow(tableRows);
    syncAddButtonState(tableRows, addBtn, '.cte-row', CTE_MAX_ROWS);
  });

  wrap.append(tableHeader, tableRows, addBtn);
  return wrap;
}

export function addCTERow(container) {
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
  removeBtn.addEventListener('click', () => {
    row.remove();
    const addBtn = container.parentElement?.querySelector('.sn-add-btn');
    if (addBtn) syncAddButtonState(container, addBtn, '.cte-row', CTE_MAX_ROWS);
  });

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
  addBtn.addEventListener('click', () => {
    addThermalTableRow(tableRows, f.valueLabel);
    syncAddButtonState(tableRows, addBtn, '.cte-row', THERMAL_TABLE_MAX_ROWS);
  });

  wrap.append(tableHeader, tableRows, addBtn);
  return wrap;
}

export function addThermalTableRow(container, valueLabel) {
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
  removeBtn.addEventListener('click', () => {
    row.remove();
    const addBtn = container.parentElement?.querySelector('.sn-add-btn');
    if (addBtn) syncAddButtonState(container, addBtn, '.cte-row', THERMAL_TABLE_MAX_ROWS);
  });

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
