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
  hvToHb, hbToHv, densityKgM3,
  fmt, fmtCycles,
  PRESSURE_UNITS, COMP_STRENGTH_UNITS, FRACTURE_UNITS,
  TEMPERATURE_UNITS, ELECTRICAL_UNITS, UNIT_DECIMALS,
} from '../core/units.js';
import { shearModulus, specificStiffness, shearStrengthVonMises } from '../core/derived.js';
import { TOOLTIPS } from '../core/tooltips.js';

// ── Unit display names ────────────────────────────────────────────────────────
// Fracture toughness units use <sup>½</sup> in HTML display but plain ^0.5 in
// <option> text (HTML is not rendered inside <select> elements).

const UNIT_HTML = {
  'MPa·m^0.5': 'MPa·m<sup>½</sup>',
  'ksi·in^0.5': 'ksi·in<sup>½</sup>',
};

/** HTML string for display inside a table cell. */
function displayUnitHtml(unit) { return UNIT_HTML[unit] ?? unit; }

// ── Canonical conversion ──────────────────────────────────────────────────────

function convertFromCanonical(canonical, canonicalUnit, toUnit) {
  if (canonicalUnit === 'GPa')       return convertPressure(canonical, toUnit);
  if (canonicalUnit === 'MPa')       return convertCompStrength(canonical, toUnit);
  if (canonicalUnit === 'MPa·m^0.5') return convertFracture(canonical, toUnit);
  if (canonicalUnit === '°C')        return convertTemperature(canonical, toUnit);
  if (canonicalUnit === '% IACS')    return convertElectrical(canonical, toUnit);
  return canonical;
}

// ── Temperature formatting ────────────────────────────────────────────────────

function fmtTemp(celsius, toUnit = 'K') {
  if (celsius == null) return null;
  const val = convertTemperature(celsius, toUnit);
  const d   = toUnit === '°F' ? 1 : 0;   // e.g. 212.0 °F, but 273 K / 20 °C
  return `${Number(val.toFixed(d))} ${toUnit}`;
}

// ── Reference numbering (set by render() before any section renderer runs) ───

let _refNums = new Map();  // refKey → 1-based display number

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

/** Standard two-column property row. Pass refKey=null to suppress badge. */
function propRow(labelHtml, valueHtml, refKey) {
  return `<tr>
    <th>${labelHtml}</th>
    <td class="prop-value">${valueHtml}${refKey ? refBadge(refKey) : ''}</td>
  </tr>`;
}

/**
 * Property row whose value participates in unit-conversion.
 * The canonical value is stored in data-canonical / data-canonical-unit
 * so wireUnitSelector can recalculate it when the user changes the unit.
 */
function unitPropRow(labelHtml, canonical, canonicalUnit, currentUnit, dataKey, refKey) {
  if (canonical == null) {
    return `<tr>
      <th>${labelHtml}</th>
      <td class="prop-value missing"
          data-prop="${dataKey}"
          data-canonical=""
          data-canonical-unit="${canonicalUnit}">—</td>
    </tr>`;
  }
  const converted = convertFromCanonical(canonical, canonicalUnit, currentUnit);
  const display   = fmt(converted, currentUnit);
  return `<tr>
    <th>${labelHtml}</th>
    <td class="prop-value"
        data-prop="${dataKey}"
        data-canonical="${canonical}"
        data-canonical-unit="${canonicalUnit}">
      ${display} ${displayUnitHtml(currentUnit)}${refKey ? refBadge(refKey) : ''}
    </td>
  </tr>`;
}

/**
 * Temperature property row.  Canonical unit is °C; default display is K.
 * data-canonical-unit="°C" makes wireUnitSelector find these cells.
 */
function tempPropRow(labelHtml, celsius, dataKey, refKey) {
  if (celsius == null) {
    return `<tr>
      <th>${labelHtml}</th>
      <td class="prop-value missing"
          data-prop="${dataKey}"
          data-canonical=""
          data-canonical-unit="°C">—</td>
    </tr>`;
  }
  return `<tr>
    <th>${labelHtml}</th>
    <td class="prop-value"
        data-prop="${dataKey}"
        data-canonical="${celsius}"
        data-canonical-unit="°C">
      ${fmtTemp(celsius, 'K')}${refKey ? refBadge(refKey) : ''}
    </td>
  </tr>`;
}

/**
 * Electrical conductivity row (canonical % IACS), unit-selectable.
 */
function electricalPropRow(labelHtml, valueIACS, dataKey, refKey) {
  if (valueIACS == null) {
    return `<tr>
      <th>${labelHtml}</th>
      <td class="prop-value missing"
          data-prop="${dataKey}"
          data-canonical=""
          data-canonical-unit="% IACS">—</td>
    </tr>`;
  }
  return `<tr>
    <th>${labelHtml}</th>
    <td class="prop-value"
        data-prop="${dataKey}"
        data-canonical="${valueIACS}"
        data-canonical-unit="% IACS">
      ${fmt(valueIACS, null, 1)} % IACS${refKey ? refBadge(refKey) : ''}
    </td>
  </tr>`;
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

    // Temperature and electrical conductivity update document-wide;
    // pressure/fracture selectors are scoped to their section.
    const scope = (canonicalUnit === '°C' || canonicalUnit === '% IACS')
      ? document
      : (selectEl.closest('.detail-section') ?? document);

    scope.querySelectorAll(`[data-canonical-unit="${canonicalUnit}"]`).forEach(td => {
      const raw = parseFloat(td.dataset.canonical);
      if (isNaN(raw)) return;

      const converted = convertFromCanonical(raw, canonicalUnit, toUnit);
      let displayText;

      if (canonicalUnit === '°C') {
        const d = toUnit === '°F' ? 1 : 0;
        displayText = `${Number(converted.toFixed(d))} ${toUnit}`;
      } else if (canonicalUnit === '% IACS') {
        const d = toUnit === '% IACS' ? 1 : toUnit === 'MS/m' ? 3 : 0;
        displayText = `${Number(converted.toFixed(d))} ${toUnit}`;
      } else {
        displayText = `${fmt(converted, toUnit)} ${displayUnitHtml(toUnit)}`;
      }

      const badge = td.querySelector('.prop-ref');
      td.innerHTML = displayText;
      if (badge) td.appendChild(badge);
    });

    // Update CTE table temperature column header when temp unit changes
    if (canonicalUnit === '°C') {
      document.querySelectorAll('.cte-temp-header').forEach(th => {
        th.textContent = `Temperature (${toUnit})`;
      });
      // Update usable temp range label in mechanical section
      document.querySelectorAll('.temp-range-display').forEach(span => {
        const minC = parseFloat(span.dataset.minC);
        const maxC = parseFloat(span.dataset.maxC);
        if (!isNaN(minC) && !isNaN(maxC)) {
          const d = toUnit === '°F' ? 1 : 0;
          const minVal = Number(convertTemperature(minC, toUnit).toFixed(d));
          const maxVal = Number(convertTemperature(maxC, toUnit).toFixed(d));
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
  </div>`;
}

// Metric/Imperial preset maps: canonicalUnit → target display unit
const METRIC_PRESET = {
  'GPa': 'GPa', 'MPa': 'MPa', 'MPa·m^0.5': 'MPa·m^0.5',
  '°C': 'K', '% IACS': '% IACS',
};
const IMPERIAL_PRESET = {
  'GPa': 'ksi', 'MPa': 'ksi', 'MPa·m^0.5': 'ksi·in^0.5',
  '°C': '°F', '% IACS': '% IACS',
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

  // Usable temperature range — stored as a range object, not valued_property
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
      ${unitPropRow(
        tipLabel("Young's Modulus (E)", 'youngs_modulus'),
        v(mc.youngs_modulus), 'GPa', 'GPa', 'youngs_modulus', mc.youngs_modulus?.ref)}
      ${propRow(
        tipLabel("Poisson's Ratio (ν)", 'poissons_ratio'),
        v(mc.poissons_ratio) != null
          ? `${v(mc.poissons_ratio)}${refBadge(mc.poissons_ratio?.ref)}` : '—')}
      ${unitPropRow(
        tipLabel('Yield Strength (σ<sub>y</sub>)', 'yield_strength'),
        v(mc.yield_strength), 'GPa', 'GPa', 'yield_strength', mc.yield_strength?.ref)}
      ${unitPropRow(
        tipLabel('Tensile Strength (UTS)', 'tensile_strength'),
        v(mc.tensile_strength), 'GPa', 'GPa', 'tensile_strength', mc.tensile_strength?.ref)}
      ${unitPropRow(
        tipLabel('Compressive Modulus', 'compressive_modulus'),
        v(mc.compressive_modulus), 'GPa', 'GPa', 'compressive_modulus', mc.compressive_modulus?.ref)}
    </table>
    ${unitSelectorRow('Compressive strength unit', COMP_STRENGTH_UNITS, 'MPa', 'MPa')}
    <table class="prop-table">
      ${unitPropRow(
        tipLabel('Compressive Strength', 'compressive_strength'),
        v(mc.compressive_strength), 'MPa', 'MPa', 'compressive_strength', mc.compressive_strength?.ref)}
    </table>
    <table class="prop-table">
      ${propRow(
        tipLabel('Usable Temp Range', 'usable_temp_range'),
        `${tempRangeHtml}${tempRange?.ref ? refBadge(tempRange.ref) : ''}`,
        null)}
    </table>`;

  return sectionCard('Mechanical — Common', body);
}

function renderMechanicalOther(mat) {
  const mo = mat.mechanical_other ?? {};

  // ── Fracture toughness ──────────────────────────────────────────────────
  const ktBody = `
    ${unitSelectorRow('Unit', FRACTURE_UNITS, 'MPa·m^0.5', 'MPa·m^0.5')}
    <table class="prop-table">
      ${unitPropRow(
        tipLabel('Fracture Toughness (K<sub>IC</sub>)', 'fracture_toughness'),
        v(mo.fracture_toughness), 'MPa·m^0.5', 'MPa·m^0.5', 'fracture_toughness',
        mo.fracture_toughness?.ref)}
    </table>`;

  // ── Hardness ────────────────────────────────────────────────────────────
  const hv = v(mo.hardness_vickers);
  const hb = v(mo.hardness_brinell);
  const hvFromHb = hb != null ? hbToHv(hb) : null;
  const hbFromHv = hv != null ? hvToHb(hv) : null;

  const hvDisplay = hv != null
    ? `<span class="hardness-val">${hv}</span>${refBadge(mo.hardness_vickers?.ref)}`
    : (hvFromHb != null
      ? `<span class="hardness-val derived">${hvFromHb} <span class="prop-note">(from HB)</span></span>`
      : '—');
  const hbDisplay = hb != null
    ? `<span class="hardness-val">${hb}</span>${refBadge(mo.hardness_brinell?.ref)}`
    : (hbFromHv != null
      ? `<span class="hardness-val derived">${hbFromHv} <span class="prop-note">(from HV)</span></span>`
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

  let ducDisplay, ducRefKey;
  if (ducTypical != null) {
    ducDisplay = `${ducTypical.toFixed(1)} % ${ducCalcNote} ${ducRange}`;
    ducRefKey  = ducObj.ref;
  } else if (ducObj.min != null) {
    ducDisplay = `≥ ${ducObj.min} %`;
    ducRefKey  = ducObj.ref;
  } else if (ducObj.max != null) {
    ducDisplay = `≤ ${ducObj.max} %`;
    ducRefKey  = ducObj.ref;
  } else {
    ducDisplay = '—';
    ducRefKey  = null;   // no value → no reference badge
  }

  // ── Shear strength ───────────────────────────────────────────────────────
  const shearDirect = v(mo.shear_strength);
  const shearCalc   = shearStrengthVonMises(mat);
  const shearVal    = shearDirect ?? shearCalc;
  const shearNote   = shearDirect == null && shearCalc != null
    ? `<span class="prop-note">(von Mises estimate)</span>` : '';
  const shearDisplay = shearVal != null
    ? `${fmt(shearVal * 1000, 'MPa', 1)} MPa ${shearNote}` : '—';

  // ── Microyield / creep ───────────────────────────────────────────────────
  const myDisplay = v(mo.microyield_strength) != null
    ? `${fmt(v(mo.microyield_strength) * 1000, 'MPa', 2)} MPa ${refBadge(mo.microyield_strength?.ref)}`
    : '—';
  const creepDisplay = v(mo.creep_strength) != null
    ? `${fmt(v(mo.creep_strength) * 1000, 'MPa', 2)} MPa ${refBadge(mo.creep_strength?.ref)}`
    : '—';

  const body = `
    ${ktBody}
    <table class="prop-table">
      ${propRow(tipLabel('Hardness', 'hardness_vickers'), hardnessHtml)}
      ${propRow(tipLabel('Ductility (elongation)', 'ductility'), ducDisplay, ducRefKey)}
      ${propRow(tipLabel('Shear Strength', 'shear_strength'), shearDisplay,
        shearDirect != null ? mo.shear_strength?.ref : null)}
      ${propRow(tipLabel('Microyield Strength', 'microyield_strength'), myDisplay)}
      ${propRow(tipLabel('Creep Strength', 'creep_strength'), creepDisplay)}
    </table>`;

  // ── S-N curve table ──────────────────────────────────────────────────────
  const snPoints = mo.fatigue_sn_curve?.points ?? [];
  let snHtml = '';
  if (snPoints.length > 0) {
    const snRef  = refBadge(mo.fatigue_sn_curve?.ref);
    const snRows = snPoints.map(pt =>
      `<tr>
        <td>${fmt(pt.stress * 1000, 'MPa', 1)} MPa</td>
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
  const rhoDisplay = rho != null
    ? `${fmt(rho, null, 2)} g/cm³ <span class="density-secondary">(${fmt(densityKgM3(rho), null, 0)} kg/m³)</span>${refBadge(ph.density?.ref)}`
    : '—';

  // ── Electrical conductivity ───────────────────────────────────────────────
  const elecUnit = unitSelectorRow('Electrical conductivity unit', ELECTRICAL_UNITS, '% IACS', '% IACS');

  // ── CTE ──────────────────────────────────────────────────────────────────
  const cteObj   = ph.thermal_expansion ?? {};
  const cteVal   = cteObj.value;
  const cteTable = cteObj.table ?? [];
  const cteDisplay = cteVal != null ? `${fmt(cteVal, null, 2)} µm/m·K` : '—';

  // ── Thermal diffusivity: prefer direct value, else compute k/(ρCp) ───────
  const kVal      = v(ph.thermal_conductivity);
  const CpVal     = v(ph.specific_heat);
  const DVal      = v(ph.thermal_diffusivity);
  const DComputed = (kVal != null && rho != null && CpVal != null)
    ? (kVal / (rho * 1000 * CpVal)) * 1e4 : null;
  const DDisplay  = DVal != null
    ? `${fmt(DVal, null, 5)} cm²/s ${refBadge(ph.thermal_diffusivity?.ref)}`
    : (DComputed != null
        ? `${fmt(DComputed, null, 5)} cm²/s <span class="prop-note">(k/ρCp)</span>`
        : '—');

  const Tm = v(ph.melting_point_tm);
  const Tg = v(ph.glass_transition_tg);

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
    <table class="prop-table">
      ${propRow(tipLabel('Density (ρ)', 'density'), rhoDisplay)}
    </table>
    ${elecUnit}
    <table class="prop-table">
      ${electricalPropRow(
        tipLabel('Electrical Conductivity', 'electrical_conductivity'),
        v(ph.electrical_conductivity), 'electrical_conductivity',
        ph.electrical_conductivity?.ref)}
      ${propRow(
        tipLabel('Vapour Pressure', 'vapour_pressure'),
        v(ph.vapour_pressure) != null
          ? `${v(ph.vapour_pressure)} Pa ${refBadge(ph.vapour_pressure?.ref)}` : '—')}
    </table>
    <table class="prop-table">
      ${propRow(
        tipLabel('Thermal Expansion (α)', 'thermal_expansion'),
        `${cteDisplay}${refBadge(cteObj.ref)}`)}
      ${propRow(
        tipLabel('Thermal Conductivity (k)', 'thermal_conductivity'),
        kVal != null ? `${fmt(kVal, null, 1)} W/m·K ${refBadge(ph.thermal_conductivity?.ref)}` : '—')}
      ${propRow(
        tipLabel('Specific Heat (C<sub>p</sub>)', 'specific_heat'),
        CpVal != null ? `${fmt(CpVal, null, 0)} J/kg·K ${refBadge(ph.specific_heat?.ref)}` : '—')}
      ${propRow(
        tipLabel('Thermal Diffusivity (D)', 'thermal_diffusivity'),
        DDisplay)}
      ${tempPropRow(tipLabel('Melting Point (T<sub>m</sub>)', 'melting_point_tm'),
        Tm, 'melting_point_tm', ph.melting_point_tm?.ref)}
      ${tempPropRow(tipLabel('Glass Transition (T<sub>g</sub>)', 'glass_transition_tg'),
        Tg, 'glass_transition_tg', ph.glass_transition_tg?.ref)}
      ${propRow(tipLabel('Magnetic Classification', 'magnetic_classification'), magDisplay)}
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

  return sectionCard('Physical', body + cteTableHtml);
}

function renderComputed(mat) {
  const G   = shearModulus(mat);
  const ss  = specificStiffness(mat);
  const tau = (() => {
    const direct = mat.mechanical_other?.shear_strength?.value ?? null;
    return direct == null ? shearStrengthVonMises(mat) : null;
  })();

  function computedItem(label, tooltipKey, value, unit) {
    const tip = escHtml(TOOLTIPS[tooltipKey] ?? '');
    const valueHtml = value != null
      ? `<span class="computed-value">${fmt(value, null, 3)}<span class="computed-unit">${unit}</span></span>`
      : `<span class="computed-value missing">—</span>`;
    return `<div class="computed-item">
      <div class="computed-label" title="${tip}">${label}</div>
      ${valueHtml}
    </div>`;
  }

  const body = `<div class="computed-grid">
    ${computedItem('Shear Modulus (G)', 'shear_modulus', G, ' GPa')}
    ${computedItem('Specific Stiffness (E/ρ)', 'specific_stiffness', ss, ' GPa·cm³/g')}
    ${tau != null ? computedItem('Shear Strength (est.)', 'shear_strength_calc', tau * 1000, ' MPa') : ''}
  </div>`;
  return sectionCard('Calculated Properties', body);
}

function renderFabricationForms(mat) {
  const id   = mat.identification ?? {};
  const fab  = (id.fabrication_processes ?? []).map(p => `<span class="chip">${escHtml(p)}</span>`).join('');
  const forms = (id.common_forms ?? []).map(f => `<span class="chip">${escHtml(f)}</span>`).join('');
  const none = `<span style="padding:0.6rem 1rem;color:var(--color-muted);font-size:0.85rem">None listed</span>`;

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

    // Build the best available link: DOI → entry.url → bibtex URL → ISBN WorldCat → nothing
    const doiVal = entry.doi;
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
  const id = mat.identification ?? {};
  const catClass = (id.category ?? 'metal').toLowerCase().replace(/\s+/g, '-');
  const freq = id.usage_frequency;
  const uncommonBadge = (freq && freq !== 'Common')
    ? `<span class="badge badge-${freq === 'Exotic' ? 'exotic' : 'specialty'}">${escHtml(freq)}</span>` : '';
  const notesHtml  = id.notes      ? `<p class="detail-notes">${escHtml(id.notes)}</p>` : '';
  const usageHtml  = mat.typical_usage
    ? `<p class="detail-usage"><strong>Typical usage:</strong> ${escHtml(mat.typical_usage)}</p>` : '';

  return `
    <div class="detail-header">
      <a href="index.html" class="detail-back">← All Materials</a>
      <h1 class="detail-title">${escHtml(id.name ?? 'Unknown Material')}</h1>
      <div class="detail-badges">
        <span class="badge badge-${catClass}">${escHtml(id.category ?? '')}</span>
        ${uncommonBadge}
      </div>
      ${notesHtml}
      ${usageHtml}
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function render(mat, refs) {
  // Build reference number map (order matches mat.references array)
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

  // Wire collapsible sections
  layout.querySelectorAll('.detail-section').forEach(wireSectionToggle);

  // Wire unit-conversion selects
  layout.querySelectorAll('.unit-select').forEach(wireUnitSelector);

  // Wire the global metric/imperial buttons
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

  // Skeleton while loading
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
