/**
 * detail.js — Material detail page logic.
 *
 * Reads ?slug=... from the URL, loads the full material JSON plus the
 * shared references database, runs schema migration, then renders every
 * property section with unit-conversion dropdowns and a global
 * Metric / Imperial preset toolbar.
 */

import { loadMaterial, loadReferences } from '../core/loader.js';
import { migrateToLatest } from '../core/schema.js';
import {
  convertPressure, convertCompStrength, convertFracture,
  convertTemperature, convertElectrical,
  convertDensity, convertCTE, convertThermalCond, convertSpecificHeat, convertThermalDiff,
  hvToHb, hbToHv,
  fmt, fmtCycles,
  PRESSURE_UNITS, COMP_STRENGTH_UNITS, FRACTURE_UNITS,
  TEMPERATURE_UNITS, ELECTRICAL_UNITS, DENSITY_UNITS,
  CTE_UNITS, THERMAL_COND_UNITS, SPECIFIC_HEAT_UNITS, THERMAL_DIFF_UNITS,
} from '../core/units.js';
import { shearModulus, specificStiffness, shearStrengthVonMises } from '../core/derived.js';
import { TOOLTIPS } from '../core/tooltips.js';

// ── Unit display names ────────────────────────────────────────────────────────
// Fracture toughness units use <sup>½</sup> in HTML but plain text in <option>.

const UNIT_HTML = {
  'MPa·m^0.5': 'MPa·m<sup>½</sup>',
  'ksi·in^0.5': 'ksi·in<sup>½</sup>',
};

function displayUnitHtml(unit) { return UNIT_HTML[unit] ?? unit; }

// ── Canonical → display conversion ───────────────────────────────────────────

function convertFromCanonical(canonical, canonicalUnit, toUnit) {
  if (canonicalUnit === 'GPa')        return convertPressure(canonical, toUnit);
  if (canonicalUnit === 'MPa')        return convertCompStrength(canonical, toUnit);
  if (canonicalUnit === 'MPa·m^0.5') return convertFracture(canonical, toUnit);
  if (canonicalUnit === '°C')         return convertTemperature(canonical, toUnit);
  if (canonicalUnit === '% IACS')     return convertElectrical(canonical, toUnit);
  if (canonicalUnit === 'g/cm³')     return convertDensity(canonical, toUnit);
  if (canonicalUnit === 'µm/m·K')    return convertCTE(canonical, toUnit);
  if (canonicalUnit === 'W/m·K')     return convertThermalCond(canonical, toUnit);
  if (canonicalUnit === 'J/(kg·K)')  return convertSpecificHeat(canonical, toUnit);
  if (canonicalUnit === 'cm²/s')     return convertThermalDiff(canonical, toUnit);
  return canonical;
}

// ── Module-level state ────────────────────────────────────────────────────────

let _refNums    = new Map();  // refKey → 1-based display number
let _currentMat = null;       // current material (for export)

// ── HTML helpers ──────────────────────────────────────────────────────────────

const v = prop => prop?.value ?? null;

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline numbered reference anchor, e.g. [1] → jumps to #ref-1. */
function refBadge(key) {
  if (!key) return '';
  const num = _refNums.get(key);
  if (num == null) return '';
  return `<a href="#ref-${num}" class="prop-ref">[${num}]</a>`;
}

/**
 * Universal property row renderer.
 *
 * Pre-rendered values (hardness, density, magnetic class, …):
 *   renderRow(label, { html: '…' })
 *
 * Unit-convertible values:
 *   renderRow(label, { canonical, canonicalUnit, displayUnit, refKey, note, dataKey })
 *   canonical=null emits a "—" placeholder that still carries data attributes
 *   so wireUnitSelector can target it when the unit later changes.
 */
function renderRow(labelHtml, { html, canonical, canonicalUnit, displayUnit, refKey, note, dataKey } = {}) {
  if (html !== undefined) {
    return `<tr><th>${labelHtml}</th><td class="prop-value">${html}</td></tr>`;
  }

  const unit = displayUnit ?? canonicalUnit;
  const dataAttrs = [
    dataKey       ? `data-prop="${dataKey}"` : '',
    canonicalUnit ? `data-canonical-unit="${canonicalUnit}"` : '',
    `data-canonical="${canonical ?? ''}"`,
  ].filter(Boolean).join(' ');

  if (canonical == null) {
    return `<tr><th>${labelHtml}</th><td class="prop-value missing" ${dataAttrs}>—</td></tr>`;
  }

  const converted  = convertFromCanonical(canonical, canonicalUnit, unit);
  const valueText  = `${fmt(converted, unit)} ${displayUnitHtml(unit)}`;
  const refHtml    = refKey ? refBadge(refKey) : '';
  const noteHtml   = note   ? ` ${note}` : '';

  return `<tr><th>${labelHtml}</th><td class="prop-value" ${dataAttrs}>${valueText}${refHtml}${noteHtml}</td></tr>`;
}

// ── Section collapse ──────────────────────────────────────────────────────────

function wireSectionToggle(sectionEl) {
  const header = sectionEl.querySelector('.detail-section-header');
  if (!header) return;
  header.addEventListener('click', () => sectionEl.classList.toggle('is-collapsed'));
}

// ── Unit selector wiring ──────────────────────────────────────────────────────

function wireUnitSelector(selectEl) {
  selectEl.addEventListener('change', () => {
    const toUnit       = selectEl.value;
    const canonicalUnit = selectEl.dataset.canonicalUnit;

    document.querySelectorAll(`[data-canonical-unit="${canonicalUnit}"]`).forEach(td => {
      const raw = parseFloat(td.dataset.canonical);
      if (isNaN(raw)) return;

      const converted   = convertFromCanonical(raw, canonicalUnit, toUnit);
      const displayText = `${fmt(converted, toUnit)} ${displayUnitHtml(toUnit)}`;

      // Preserve child nodes that should survive the innerHTML reset
      const badge = td.querySelector('.prop-ref');
      const note  = td.querySelector('.prop-note');
      td.innerHTML = displayText;
      if (note)  td.appendChild(note);
      if (badge) td.appendChild(badge);
    });

    // Temperature-specific side effects
    if (canonicalUnit === '°C') {
      document.querySelectorAll('.cte-temp-header').forEach(th => {
        th.textContent = `Temperature (${toUnit})`;
      });
      document.querySelectorAll('.temp-range-display').forEach(span => {
        const minC = parseFloat(span.dataset.minC);
        const maxC = parseFloat(span.dataset.maxC);
        if (!isNaN(minC) && !isNaN(maxC)) {
          const minVal = fmt(convertTemperature(minC, toUnit), toUnit);
          const maxVal = fmt(convertTemperature(maxC, toUnit), toUnit);
          span.textContent = `${minVal} ${toUnit} to ${maxVal} ${toUnit}`;
        }
      });
    }
  });
}

// ── Global unit toolbar ───────────────────────────────────────────────────────

function renderToolbar() {
  const tempOpts = TEMPERATURE_UNITS.map(u =>
    `<option value="${u}"${u === 'K' ? ' selected' : ''}>${u}</option>`
  ).join('');

  return `<div class="unit-toolbar">
    <div class="unit-toolbar-group">
      <span class="unit-toolbar-label">Units:</span>
      <button class="unit-preset-btn is-active" data-preset="metric">Metric</button>
      <button class="unit-preset-btn" data-preset="imperial">Imperial</button>
    </div>
    <div class="unit-toolbar-group">
      <label class="unit-toolbar-label" for="temp-unit-select">Temperature:</label>
      <select class="unit-select unit-toolbar-select" id="temp-unit-select"
              data-canonical-unit="°C">${tempOpts}</select>
    </div>
    <div class="unit-toolbar-group export-dropdown" id="export-dropdown">
      <button class="export-btn" id="export-trigger">Download ▾</button>
      <div class="export-menu" id="export-menu" hidden>
        <button class="export-option" data-fmt="csv"  data-scope="display">CSV — current units</button>
        <button class="export-option" data-fmt="csv"  data-scope="canonical">CSV — canonical units</button>
        <button class="export-option" data-fmt="xlsx" data-scope="display">Excel — current units</button>
        <button class="export-option" data-fmt="xlsx" data-scope="canonical">Excel — canonical units</button>
      </div>
    </div>
  </div>`;
}

// Metric/Imperial preset maps: canonicalUnit → target display unit
const METRIC_PRESET = {
  'GPa': 'GPa', 'MPa': 'MPa', 'MPa·m^0.5': 'MPa·m^0.5',
  '°C': 'K', '% IACS': '% IACS', 'g/cm³': 'g/cm³',
  'µm/m·K': 'µm/m·K', 'W/m·K': 'W/m·K', 'J/(kg·K)': 'J/(kg·K)', 'cm²/s': 'cm²/s',
};
const IMPERIAL_PRESET = {
  'GPa': 'ksi', 'MPa': 'ksi', 'MPa·m^0.5': 'ksi·in^0.5',
  '°C': '°F', '% IACS': '% IACS', 'g/cm³': 'lb/in³',
  'µm/m·K': 'µin/in·°F', 'W/m·K': 'BTU/(hr·ft·°F)', 'J/(kg·K)': 'BTU/(lb·°F)', 'cm²/s': 'ft²/hr',
};

function wireToolbar(layout) {
  layout.querySelectorAll('.unit-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      layout.querySelectorAll('.unit-preset-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      const preset = btn.dataset.preset === 'metric' ? METRIC_PRESET : IMPERIAL_PRESET;
      document.querySelectorAll('.unit-select').forEach(sel => {
        const target = preset[sel.dataset.canonicalUnit];
        if (target && sel.value !== target) {
          sel.value = target;
          sel.dispatchEvent(new Event('change'));
        }
      });
    });
  });

  // Export dropdown
  const trigger = layout.querySelector('#export-trigger');
  const menu    = layout.querySelector('#export-menu');
  if (!trigger || !menu) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    menu.toggleAttribute('hidden');
  });

  menu.querySelectorAll('.export-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      menu.setAttribute('hidden', '');
      if (!_currentMat) return;
      const scope  = btn.dataset.scope;
      const preset = layout.querySelector('.unit-preset-btn.is-active')?.dataset.preset ?? 'metric';
      const us     = scope === 'canonical' ? 'canonical' : preset;
      const slug   = _currentMat.identification?.slug ?? 'material';
      const filename = slug + (btn.dataset.fmt === 'xlsx' ? '.xlsx' : '.csv');
      const { buildRows, downloadCSV, downloadXLSX } = await import('../core/export.js');
      const rows = buildRows([_currentMat], us);
      if (btn.dataset.fmt === 'xlsx') downloadXLSX(rows, [_currentMat], filename);
      else downloadCSV(rows, [_currentMat], filename);
    });
  });

  document.addEventListener('click', () => menu.setAttribute('hidden', ''));
}

// ── Render helpers ────────────────────────────────────────────────────────────

function unitSelectorRow(label, units, defaultUnit, canonicalUnit) {
  const opts = units.map(u =>
    `<option value="${u}"${u === defaultUnit ? ' selected' : ''}>${u}</option>`
  ).join('');
  return `<div class="unit-selector-row">
    <label>${label}:</label>
    <select class="unit-select" data-canonical-unit="${canonicalUnit}">${opts}</select>
  </div>`;
}

function sectionCard(title, bodyHtml, collapsed = false) {
  return `<div class="detail-section${collapsed ? ' is-collapsed' : ''}">
    <div class="detail-section-header">
      <h2 class="detail-section-title">${title}</h2>
      <span class="section-toggle-icon">▾</span>
    </div>
    <div class="detail-section-body">${bodyHtml}</div>
  </div>`;
}

function tipLabel(text, tooltipKey) {
  const tip = escHtml(TOOLTIPS[tooltipKey] ?? '');
  return `<span class="prop-label" title="${tip}">${text}</span>`;
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderMechanicalCommon(mat) {
  const mc = mat.mechanical_common ?? {};

  const tempRange = mc.usable_temp_range;
  let tempRangeHtml = '—';
  if (tempRange?.min != null && tempRange?.max != null) {
    const minK = Math.round(tempRange.min + 273.15);
    const maxK = Math.round(tempRange.max + 273.15);
    tempRangeHtml = `<span class="temp-range-display"
        data-min-c="${tempRange.min}"
        data-max-c="${tempRange.max}">
      ${minK} K to ${maxK} K
    </span>`;
  }

  const body = `
    ${unitSelectorRow('Pressure unit', PRESSURE_UNITS, 'GPa', 'GPa')}
    <table class="prop-table">
      ${renderRow(tipLabel("Young's Modulus (E)", 'youngs_modulus'), {
        canonical: v(mc.youngs_modulus), canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'youngs_modulus', refKey: mc.youngs_modulus?.ref })}
      ${renderRow(tipLabel("Poisson's Ratio (ν)", 'poissons_ratio'), {
        html: v(mc.poissons_ratio) != null
          ? `${v(mc.poissons_ratio)}${refBadge(mc.poissons_ratio?.ref)}` : '—' })}
      ${renderRow(tipLabel('Yield Strength (σ<sub>y</sub>)', 'yield_strength'), {
        canonical: v(mc.yield_strength), canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'yield_strength', refKey: mc.yield_strength?.ref })}
      ${renderRow(tipLabel('Tensile Strength (UTS)', 'tensile_strength'), {
        canonical: v(mc.tensile_strength), canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'tensile_strength', refKey: mc.tensile_strength?.ref })}
      ${renderRow(tipLabel('Compressive Modulus', 'compressive_modulus'), {
        canonical: v(mc.compressive_modulus), canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'compressive_modulus', refKey: mc.compressive_modulus?.ref })}
    </table>
    ${unitSelectorRow('Compressive strength unit', COMP_STRENGTH_UNITS, 'MPa', 'MPa')}
    <table class="prop-table">
      ${renderRow(tipLabel('Compressive Strength', 'compressive_strength'), {
        canonical: v(mc.compressive_strength), canonicalUnit: 'MPa', displayUnit: 'MPa',
        dataKey: 'compressive_strength', refKey: mc.compressive_strength?.ref })}
    </table>
    <table class="prop-table">
      ${renderRow(tipLabel('Usable Temp Range', 'usable_temp_range'), {
        html: `${tempRangeHtml}${tempRange?.ref ? refBadge(tempRange.ref) : ''}` })}
    </table>`;

  return sectionCard('Mechanical — Common', body);
}

function renderMechanicalOther(mat) {
  const mo = mat.mechanical_other ?? {};

  // ── Fracture toughness ──────────────────────────────────────────────────
  const ktBody = `
    ${unitSelectorRow('Unit', FRACTURE_UNITS, 'MPa·m^0.5', 'MPa·m^0.5')}
    <table class="prop-table">
      ${renderRow(tipLabel('Fracture Toughness (K<sub>IC</sub>)', 'fracture_toughness'), {
        canonical: v(mo.fracture_toughness), canonicalUnit: 'MPa·m^0.5', displayUnit: 'MPa·m^0.5',
        dataKey: 'fracture_toughness', refKey: mo.fracture_toughness?.ref })}
    </table>`;

  // ── Hardness ────────────────────────────────────────────────────────────
  const hv = v(mo.hardness_vickers);
  const hb = v(mo.hardness_brinell);
  const hvDisplay = hv != null
    ? `<span class="hardness-val">${hv}</span>${refBadge(mo.hardness_vickers?.ref)}`
    : (hb != null
      ? `<span class="hardness-val derived">${hbToHv(hb)} <span class="prop-note">(from HB)</span></span>`
      : '—');
  const hbDisplay = hb != null
    ? `<span class="hardness-val">${hb}</span>${refBadge(mo.hardness_brinell?.ref)}`
    : (hv != null
      ? `<span class="hardness-val derived">${hvToHb(hv)} <span class="prop-note">(from HV)</span></span>`
      : '—');
  const hw = mo.hardness_rockwell;
  const hrDisplay = (hw?.value != null && hw?.scale)
    ? `<span class="hardness-val">HR${hw.scale} ${hw.value}</span>${refBadge(hw?.ref)}`
    : '—';
  const hardnessHtml = `
    <div class="hardness-row">
      <div class="hardness-entry">
        <span class="hardness-scale">Vickers (HV)</span>${hvDisplay}
      </div>
      <div class="hardness-entry">
        <span class="hardness-scale">Brinell (HB)</span>${hbDisplay}
      </div>
      <div class="hardness-entry">
        <span class="hardness-scale">Rockwell</span>${hrDisplay}
      </div>
    </div>`;

  // ── Ductility ────────────────────────────────────────────────────────────
  const ducObj = mo.ductility ?? {};
  const ducTypical = ducObj.typical
    ?? ((ducObj.min != null && ducObj.max != null) ? (ducObj.min + ducObj.max) / 2 : null);
  const ducCalcNote = !ducObj.typical && ducTypical != null
    ? `<span class="prop-note">(avg of range)</span>` : '';
  const ducRange = (ducObj.min != null && ducObj.max != null)
    ? `<span class="ductility-range">(${ducObj.min} – ${ducObj.max} %)</span>` : '';

  let ducHtml;
  if (ducTypical != null) {
    ducHtml = `${ducTypical.toFixed(1)} % ${ducCalcNote} ${ducRange}${refBadge(ducObj.ref)}`;
  } else if (ducObj.min != null) {
    ducHtml = `≥ ${ducObj.min} %${refBadge(ducObj.ref)}`;
  } else if (ducObj.max != null) {
    ducHtml = `≤ ${ducObj.max} %${refBadge(ducObj.ref)}`;
  } else {
    ducHtml = '—';
  }

  // ── Shear strength ───────────────────────────────────────────────────────
  const shearDirect = v(mo.shear_strength);
  const shearCalc   = shearStrengthVonMises(mat);
  const shearVal    = shearDirect ?? shearCalc;
  const shearNote   = shearDirect == null && shearCalc != null
    ? `<span class="prop-note">(von Mises estimate)</span>` : '';

  const body = `
    ${ktBody}
    <table class="prop-table">
      ${renderRow(tipLabel('Hardness', 'hardness_vickers'), { html: hardnessHtml })}
      ${renderRow(tipLabel('Ductility (elongation)', 'ductility'), { html: ducHtml })}
      ${renderRow(tipLabel('Shear Strength', 'shear_strength'), {
        canonical: shearVal, canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'shear_strength', note: shearNote,
        refKey: shearDirect != null ? mo.shear_strength?.ref : null })}
      ${renderRow(tipLabel('Microyield Strength', 'microyield_strength'), {
        canonical: v(mo.microyield_strength), canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'microyield_strength', refKey: mo.microyield_strength?.ref })}
      ${renderRow(tipLabel('Creep Strength', 'creep_strength'), {
        canonical: v(mo.creep_strength), canonicalUnit: 'GPa', displayUnit: 'GPa',
        dataKey: 'creep_strength', refKey: mo.creep_strength?.ref })}
    </table>`;

  // ── S-N curve table ──────────────────────────────────────────────────────
  const snPoints = mo.fatigue_sn_curve?.points ?? [];
  let snHtml = '';
  if (snPoints.length > 0) {
    const snRef  = refBadge(mo.fatigue_sn_curve?.ref);
    const snRows = snPoints.map(pt =>
      `<tr>
        <td data-canonical="${pt.stress}" data-canonical-unit="GPa">
          ${fmt(pt.stress, 'GPa')} GPa
        </td>
        <td>${fmtCycles(pt.cycles)}</td>
      </tr>`
    ).join('');
    snHtml = `
      <div class="detail-section-header" style="cursor:default;">
        <h3 class="detail-section-title">Fatigue S–N Data ${snRef}</h3>
      </div>
      <div class="sn-table-wrap">
        <table class="sn-table">
          <thead><tr><th>Stress Amplitude</th><th>Cycles to Failure</th></tr></thead>
          <tbody>${snRows}</tbody>
        </table>
      </div>`;
  }

  return sectionCard('Mechanical — Other', body + snHtml);
}

function renderPhysical(mat) {
  const ph = mat.physical ?? {};

  // ── Density ──────────────────────────────────────────────────────────────
  const rho = v(ph.density);

  // ── CTE ──────────────────────────────────────────────────────────────────
  const cteObj   = ph.thermal_expansion ?? {};
  const cteVal   = cteObj.value;
  const cteTable = cteObj.table ?? [];

  // ── Thermal diffusivity: prefer direct value, else compute k/(ρCp) ───────
  const kVal       = v(ph.thermal_conductivity);
  const CpVal      = v(ph.specific_heat);
  const DVal       = v(ph.thermal_diffusivity);
  const DComputed  = (kVal != null && rho != null && CpVal != null)
    ? (kVal / (rho * 1000 * CpVal)) * 1e4 : null;
  const DEffective = DVal ?? DComputed;
  const diffNote   = DVal == null && DComputed != null
    ? `<span class="prop-note">(k/ρCp)</span>` : '';

  // ── Magnetic classification ───────────────────────────────────────────────
  const magClass = ph.magnetic_classification?.value ?? null;
  const MAG_BADGE = {
    'Ferromagnetic': 'badge-ferro',
    'Paramagnetic':  'badge-para',
    'Diamagnetic':   'badge-dia',
  };
  const magDisplay = magClass
    ? `<span class="badge ${MAG_BADGE[magClass]}">${magClass}</span>${refBadge(ph.magnetic_classification?.ref)}`
    : '—';

  const body = `
    ${unitSelectorRow('Density unit', DENSITY_UNITS, 'g/cm³', 'g/cm³')}
    <table class="prop-table">
      ${renderRow(tipLabel('Density (ρ)', 'density'), {
        canonical: rho, canonicalUnit: 'g/cm³', displayUnit: 'g/cm³',
        dataKey: 'density', refKey: ph.density?.ref })}
    </table>
    ${unitSelectorRow('Electrical conductivity unit', ELECTRICAL_UNITS, '% IACS', '% IACS')}
    <table class="prop-table">
      ${renderRow(tipLabel('Electrical Conductivity', 'electrical_conductivity'), {
        canonical: v(ph.electrical_conductivity), canonicalUnit: '% IACS', displayUnit: '% IACS',
        dataKey: 'electrical_conductivity', refKey: ph.electrical_conductivity?.ref })}
      ${renderRow(tipLabel('Vapour Pressure', 'vapour_pressure'), {
        canonical: v(ph.vapour_pressure), canonicalUnit: 'Pa', displayUnit: 'Pa',
        dataKey: 'vapour_pressure', refKey: ph.vapour_pressure?.ref })}
    </table>
    <div class="unit-selector-group">
      ${unitSelectorRow('CTE', CTE_UNITS, 'µm/m·K', 'µm/m·K')}
      ${unitSelectorRow('Thermal conductivity', THERMAL_COND_UNITS, 'W/m·K', 'W/m·K')}
      ${unitSelectorRow('Specific heat', SPECIFIC_HEAT_UNITS, 'J/(kg·K)', 'J/(kg·K)')}
      ${unitSelectorRow('Thermal diffusivity', THERMAL_DIFF_UNITS, 'cm²/s', 'cm²/s')}
    </div>
    <table class="prop-table">
      ${renderRow(tipLabel('Thermal Expansion (α)', 'thermal_expansion'), {
        canonical: cteVal, canonicalUnit: 'µm/m·K', displayUnit: 'µm/m·K',
        dataKey: 'thermal_expansion', refKey: cteObj.ref })}
      ${renderRow(tipLabel('Thermal Conductivity (k)', 'thermal_conductivity'), {
        canonical: kVal, canonicalUnit: 'W/m·K', displayUnit: 'W/m·K',
        dataKey: 'thermal_conductivity', refKey: ph.thermal_conductivity?.ref })}
      ${renderRow(tipLabel('Specific Heat (C<sub>p</sub>)', 'specific_heat'), {
        canonical: CpVal, canonicalUnit: 'J/(kg·K)', displayUnit: 'J/(kg·K)',
        dataKey: 'specific_heat', refKey: ph.specific_heat?.ref })}
      ${renderRow(tipLabel('Thermal Diffusivity (D)', 'thermal_diffusivity'), {
        canonical: DEffective, canonicalUnit: 'cm²/s', displayUnit: 'cm²/s',
        dataKey: 'thermal_diffusivity', note: diffNote,
        refKey: DVal != null ? ph.thermal_diffusivity?.ref : null })}
      ${renderRow(tipLabel('Melting Point (T<sub>m</sub>)', 'melting_point_tm'), {
        canonical: v(ph.melting_point_tm), canonicalUnit: '°C', displayUnit: 'K',
        dataKey: 'melting_point_tm', refKey: ph.melting_point_tm?.ref })}
      ${renderRow(tipLabel('Glass Transition (T<sub>g</sub>)', 'glass_transition_tg'), {
        canonical: v(ph.glass_transition_tg), canonicalUnit: '°C', displayUnit: 'K',
        dataKey: 'glass_transition_tg', refKey: ph.glass_transition_tg?.ref })}
      ${renderRow(tipLabel('Magnetic Classification', 'magnetic_classification'), { html: magDisplay })}
    </table>`;

  // ── CTE vs Temperature table ──────────────────────────────────────────────
  let cteTableHtml = '';
  if (cteTable.length > 1) {
    const cteRows = cteTable.map(pt =>
      `<tr>
        <td data-canonical="${pt.temp}" data-canonical-unit="°C"
            class="cte-temp-cell">${Math.round(pt.temp + 273.15)} K</td>
        <td>${fmt(pt.cte, null, 2)}</td>
      </tr>`
    ).join('');
    cteTableHtml = `
      <div class="detail-section-header" style="cursor:default;">
        <h3 class="detail-section-title">CTE vs Temperature</h3>
      </div>
      <div class="cte-table-wrap">
        <table class="cte-table">
          <thead><tr>
            <th class="cte-temp-header">Temperature (K)</th>
            <th>CTE (µm/m·K)</th>
          </tr></thead>
          <tbody>${cteRows}</tbody>
        </table>
      </div>`;
  }

  // ── k vs Temperature table ────────────────────────────────────────────────
  const kTable = ph.thermal_conductivity?.table ?? [];
  let kTableHtml = '';
  if (kTable.length > 1) {
    const kRows = kTable.map(pt =>
      `<tr>
        <td data-canonical="${pt.temp}" data-canonical-unit="°C"
            class="cte-temp-cell">${Math.round(pt.temp + 273.15)} K</td>
        <td>${fmt(pt.k, null, 1)}</td>
      </tr>`
    ).join('');
    kTableHtml = `
      <div class="detail-section-header" style="cursor:default;">
        <h3 class="detail-section-title">Thermal Conductivity vs Temperature</h3>
      </div>
      <div class="cte-table-wrap">
        <table class="cte-table">
          <thead><tr>
            <th class="cte-temp-header">Temperature (K)</th>
            <th>k (W/m·K)</th>
          </tr></thead>
          <tbody>${kRows}</tbody>
        </table>
      </div>`;
  }

  // ── Cp vs Temperature table ───────────────────────────────────────────────
  const CpTable = ph.specific_heat?.table ?? [];
  let CpTableHtml = '';
  if (CpTable.length > 1) {
    const CpRows = CpTable.map(pt =>
      `<tr>
        <td data-canonical="${pt.temp}" data-canonical-unit="°C"
            class="cte-temp-cell">${Math.round(pt.temp + 273.15)} K</td>
        <td>${fmt(pt.cp, null, 0)}</td>
      </tr>`
    ).join('');
    CpTableHtml = `
      <div class="detail-section-header" style="cursor:default;">
        <h3 class="detail-section-title">Specific Heat vs Temperature</h3>
      </div>
      <div class="cte-table-wrap">
        <table class="cte-table">
          <thead><tr>
            <th class="cte-temp-header">Temperature (K)</th>
            <th>C<sub>p</sub> (J/kg·K)</th>
          </tr></thead>
          <tbody>${CpRows}</tbody>
        </table>
      </div>`;
  }

  return sectionCard('Physical', body + cteTableHtml + kTableHtml + CpTableHtml);
}

function renderComputed(mat) {
  const G   = shearModulus(mat);
  const ss  = specificStiffness(mat);
  const tau = (() => {
    const direct = mat.mechanical_other?.shear_strength?.value ?? null;
    return direct == null ? shearStrengthVonMises(mat) : null;
  })();

  function computedItem(label, tooltipKey, canonical, canonicalUnit, unitSuffix) {
    const tip = escHtml(TOOLTIPS[tooltipKey] ?? '');
    if (canonical == null) {
      return `<div class="computed-item">
        <div class="computed-label" title="${tip}">${label}</div>
        <span class="computed-value missing">—</span>
      </div>`;
    }
    if (canonicalUnit == null) {
      // Non-unit-convertible computed value
      return `<div class="computed-item">
        <div class="computed-label" title="${tip}">${label}</div>
        <span class="computed-value">${fmt(canonical, null, 3)}${unitSuffix ?? ''}</span>
      </div>`;
    }
    return `<div class="computed-item">
      <div class="computed-label" title="${tip}">${label}</div>
      <span class="computed-value"
            data-canonical="${canonical}"
            data-canonical-unit="${canonicalUnit}">
        ${fmt(canonical, canonicalUnit)} ${displayUnitHtml(canonicalUnit)}
      </span>
    </div>`;
  }

  const body = `<div class="computed-grid">
    ${computedItem('Shear Modulus (G)', 'shear_modulus', G, 'GPa')}
    ${computedItem('Specific Stiffness (E/ρ)', 'specific_stiffness', ss, null, ' GPa·cm³/g')}
    ${tau != null ? computedItem('Shear Strength (est.)', 'shear_strength_calc', tau, 'GPa') : ''}
  </div>`;
  return sectionCard('Calculated Properties', body);
}

function renderFabricationForms(mat) {
  const id    = mat.identification ?? {};
  const fab   = (id.fabrication_processes ?? []).map(p => `<span class="chip">${escHtml(p)}</span>`).join('');
  const forms = (id.common_forms ?? []).map(f => `<span class="chip">${escHtml(f)}</span>`).join('');
  const none  = `<span style="padding:0.6rem 1rem;color:var(--color-muted);font-size:0.85rem">None listed</span>`;

  const body = `
    <div class="chip-group-label">Fabrication Processes</div>
    <div class="chip-list">${fab || none}</div>
    <div class="chip-group-label" style="border-top:1px solid var(--color-border);">Common Forms</div>
    <div class="chip-list">${forms || none}</div>`;

  return sectionCard('Fabrication &amp; Forms', body);
}

function renderReferences(mat, refs) {
  const keys = mat.references ?? [];
  if (keys.length === 0) {
    return sectionCard('References',
      '<p style="padding:0.75rem 1rem;color:var(--color-muted);font-size:0.85rem">No references listed.</p>',
      true);
  }

  const items = keys.map((key, i) => {
    const n     = i + 1;
    const entry = refs?.[key];

    if (!entry) {
      return `<li id="ref-${n}">
        <span class="ref-num">[${n}]</span>
        <em>${escHtml(key)} — not found in reference database.</em>
      </li>`;
    }

    // Extract title — handle both single { } and double {{ }} BibTeX wrapping
    const title = entry.bibtex?.match(/title\s*=\s*\{+([^{}]+)\}+/)?.[1] ?? key;

    // Best available link: DOI → entry.url → bibtex URL → ISBN WorldCat → nothing
    const doiVal     = entry.doi;
    const urlFromBib = entry.bibtex?.match(/\burl\s*=\s*\{([^}]+)\}/)?.[1];
    const isbnRaw    = entry.bibtex?.match(/\bisbn\s*=\s*\{([^}]+)\}/)?.[1];
    const isbn       = isbnRaw?.replace(/[-\s]/g, '');

    let linkHref = null;
    if (doiVal)          linkHref = `https://doi.org/${doiVal}`;
    else if (entry.url)  linkHref = entry.url;
    else if (urlFromBib) linkHref = urlFromBib;
    else if (isbn)       linkHref = `https://www.worldcat.org/isbn/${isbn}`;

    const linkHtml = linkHref
      ? `<a class="ref-link" href="${escHtml(linkHref)}" target="_blank" rel="noopener">
           ${doiVal ? `doi:${escHtml(doiVal)}` : 'View source →'}
         </a>`
      : '';

    return `<li id="ref-${n}">
      <span class="ref-num">[${n}]</span>
      <span class="ref-shortlabel">${escHtml(entry.short_label)}</span> —
      ${escHtml(title)}${linkHtml ? '. ' + linkHtml : ''}
    </li>`;
  }).join('');

  return sectionCard('References', `<ul class="references-list">${items}</ul>`, false);
}

// ── Page header ───────────────────────────────────────────────────────────────

function renderHeader(mat) {
  const id      = mat.identification ?? {};
  const catClass = (id.category ?? 'metal').toLowerCase().replace(/\s+/g, '-');
  const freq    = id.usage_frequency;
  const freqCls = freq === 'Exotic' ? 'badge-exotic' : freq === 'Specialty' ? 'badge-specialty' : 'badge-common';
  const freqBadge = freq ? `<span class="badge ${freqCls}">${escHtml(freq)}</span>` : '';
  const notesHtml = id.notes      ? `<p class="detail-notes">${escHtml(id.notes)}</p>` : '';
  const usageHtml = mat.typical_usage
    ? `<p class="detail-usage"><strong>Typical usage:</strong> ${escHtml(mat.typical_usage)}</p>` : '';

  return `
    <div class="detail-header">
      <div class="detail-header-nav">
        <a href="index.html" class="detail-back">← All Materials</a>
        <a href="submit.html?slug=${encodeURIComponent(id.slug ?? '')}" class="detail-edit-link">Edit</a>
      </div>
      <h1 class="detail-title">${escHtml(id.name ?? 'Unknown Material')}</h1>
      <div class="detail-badges">
        <span class="badge badge-${catClass}">${escHtml(id.category ?? '')}</span>
        ${freqBadge}
      </div>
      ${notesHtml}
      ${usageHtml}
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function render(mat, refs) {
  _currentMat = mat;
  const refKeys = mat.references ?? [];
  _refNums = new Map(refKeys.map((k, i) => [k, i + 1]));

  const layout = document.getElementById('detail-layout');

  layout.innerHTML =
    renderHeader(mat) +
    renderToolbar() +
    renderComputed(mat) +
    renderMechanicalCommon(mat) +
    renderMechanicalOther(mat) +
    renderPhysical(mat) +
    renderFabricationForms(mat) +
    renderReferences(mat, refs);

  layout.querySelectorAll('.detail-section').forEach(wireSectionToggle);
  layout.querySelectorAll('.unit-select').forEach(wireUnitSelector);
  wireToolbar(layout);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const layout = document.getElementById('detail-layout');
  const slug   = new URLSearchParams(location.search).get('slug');

  if (!slug) {
    layout.innerHTML = `<div class="detail-error">
      <strong>No material specified.</strong><br>
      Add <code>?slug=material-name</code> to the URL, or
      <a href="index.html">browse all materials</a>.
    </div>`;
    return;
  }

  layout.innerHTML = `
    <div class="detail-loading">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>`;

  try {
    const [rawMat, refs] = await Promise.all([loadMaterial(slug), loadReferences()]);
    const mat = migrateToLatest(rawMat);
    document.title = `${mat.identification?.name ?? slug} — Materials Database`;
    render(mat, refs);
  } catch (err) {
    layout.innerHTML = `<div class="detail-error">
      <strong>Could not load material "${escHtml(slug)}".</strong><br>
      ${escHtml(err.message)}<br><br>
      Make sure you're serving from a web server (<code>python -m http.server</code>)
      and that <code>materials/index.json</code> has been generated.
      <br><br><a href="index.html">← Back to browse</a>
    </div>`;
  }
}

init();
