/**
 * export.js — CSV and xlsx data export for material pages.
 *
 * buildRows(materials, unitSystem) → flat row descriptor list
 * downloadCSV(rows, materials, filename)
 * downloadXLSX(rows, materials, filename)  — requires SheetJS (window.XLSX)
 *
 * unitSystem: 'metric' | 'imperial' | 'canonical'
 *   canonical → no conversion; values in storage units (GPa, °C, g/cm³, etc.)
 */

import { MERIT_INDICES, shearStrengthVonMises } from './derived.js';
import {
  convertPressure, convertCompStrength, convertFracture,
  convertTemperature, convertDensity, convertCTE,
  convertThermalCond, convertSpecificHeat, convertThermalDiff,
} from './units.js';

// ── Unit label helpers ──────────────────────────────────────────────────────

function pressureUnit(us) { return us === 'imperial' ? 'ksi' : 'GPa'; }
function strengthUnit(us)  { return us === 'canonical' ? 'GPa' : us === 'imperial' ? 'ksi' : 'MPa'; }
function compUnit(us)      { return us === 'imperial' ? 'ksi' : 'MPa'; }
function fractureUnit(us)  { return us === 'imperial' ? 'ksi·in^0.5' : 'MPa·m^0.5'; }
function densityUnit(us)   { return us === 'imperial' ? 'lb/in³' : 'g/cm³'; }
function cteUnit(us)       { return us === 'imperial' ? 'µin/in·°F' : 'µm/m·K'; }
function condUnit(us)      { return us === 'imperial' ? 'BTU/(hr·ft·°F)' : 'W/m·K'; }
function heatUnit(us)      { return us === 'imperial' ? 'BTU/(lb·°F)' : 'J/(kg·K)'; }
function diffUnit(us)      { return us === 'imperial' ? 'ft²/hr' : 'cm²/s'; }
function tempUnit(us)      { return us === 'imperial' ? '°F' : '°C'; }

// ── Value conversion helpers ────────────────────────────────────────────────

function toPressure(gpa, us) {
  if (gpa == null) return null;
  return us === 'imperial' ? convertPressure(gpa, 'ksi') : gpa;
}

function toStrength(gpa, us) {
  // yield/tensile/shear stored in GPa → MPa (metric), ksi (imperial), GPa (canonical)
  if (gpa == null) return null;
  if (us === 'canonical') return gpa;
  if (us === 'imperial') return convertPressure(gpa, 'ksi');
  return gpa * 1000; // GPa → MPa
}

function toCompStrength(mpa, us) {
  // compressive strength stored in MPa
  if (mpa == null) return null;
  return us === 'imperial' ? convertCompStrength(mpa, 'ksi') : mpa;
}

function toFracture(val, us) {
  if (val == null) return null;
  return us === 'imperial' ? convertFracture(val, 'ksi·in^0.5') : val;
}

function toDensity(val, us) {
  if (val == null) return null;
  return us === 'imperial' ? convertDensity(val, 'lb/in³') : val;
}

function toCTE(val, us) {
  if (val == null) return null;
  return us === 'imperial' ? convertCTE(val, 'µin/in·°F') : val;
}

function toCond(val, us) {
  if (val == null) return null;
  return us === 'imperial' ? convertThermalCond(val, 'BTU/(hr·ft·°F)') : val;
}

function toHeat(val, us) {
  if (val == null) return null;
  return us === 'imperial' ? convertSpecificHeat(val, 'BTU/(lb·°F)') : val;
}

function toDiff(val, us) {
  if (val == null) return null;
  return us === 'imperial' ? convertThermalDiff(val, 'ft²/hr') : val;
}

function toTemp(celsius, us) {
  if (celsius == null) return null;
  return us === 'imperial' ? convertTemperature(celsius, '°F') : celsius;
}

// ── Row builder ─────────────────────────────────────────────────────────────

/**
 * Build a flat list of row descriptors from an array of materials.
 * Each row is one of:
 *   { type: 'section', label: 'IDENTIFICATION' }
 *   { type: 'row', label: '...', unit: '...', values: [number|string|null, ...] }
 *
 * Rows where every value is null/'' are omitted.
 */
export function buildRows(materials, unitSystem) {
  const us = unitSystem ?? 'metric';
  const result = [];

  const v = (section, key) => section?.[key]?.value ?? null;

  function pushSection(label) {
    result.push({ type: 'section', label });
  }

  function pushRow(label, unit, values) {
    if (values.every(val => val == null || val === '')) return;
    result.push({ type: 'row', label, unit, values });
  }

  // ── IDENTIFICATION ──────────────────────────────────────────────────────

  pushSection('IDENTIFICATION');
  pushRow('Category', '', materials.map(m => m.identification?.category ?? null));
  pushRow('Common Forms', '', materials.map(m => {
    const f = m.identification?.common_forms ?? [];
    return f.length ? f.join(', ') : null;
  }));
  pushRow('Fabrication Processes', '', materials.map(m => {
    const p = m.identification?.fabrication_processes ?? [];
    return p.length ? p.join(', ') : null;
  }));
  pushRow('Magnetic Classification', '', materials.map(m =>
    m.physical?.magnetic_classification?.value ?? null
  ));

  // ── MECHANICAL ──────────────────────────────────────────────────────────

  pushSection('MECHANICAL');
  const pu = pressureUnit(us);
  const su = strengthUnit(us);
  const cu = compUnit(us);
  const fu = fractureUnit(us);
  const tu = tempUnit(us);

  pushRow("Young's Modulus", pu, materials.map(m =>
    toPressure(v(m.mechanical_common, 'youngs_modulus'), us)
  ));
  pushRow("Poisson's Ratio", '', materials.map(m =>
    v(m.mechanical_common, 'poissons_ratio')
  ));
  pushRow('Yield Strength', su, materials.map(m =>
    toStrength(v(m.mechanical_common, 'yield_strength'), us)
  ));
  pushRow('Tensile Strength', su, materials.map(m =>
    toStrength(v(m.mechanical_common, 'tensile_strength'), us)
  ));
  pushRow('Compressive Strength', cu, materials.map(m =>
    toCompStrength(v(m.mechanical_common, 'compressive_strength'), us)
  ));
  pushRow('Shear Strength', su, materials.map(m => {
    const direct = v(m.mechanical_other, 'shear_strength');
    const calc   = shearStrengthVonMises(m);
    return toStrength(direct ?? calc, us);
  }));
  pushRow('Fracture Toughness', fu, materials.map(m =>
    toFracture(v(m.mechanical_other, 'fracture_toughness'), us)
  ));
  pushRow('Hardness (HV)', 'HV', materials.map(m =>
    v(m.mechanical_other, 'hardness_vickers')
  ));
  pushRow('Hardness (HB)', 'HB', materials.map(m =>
    v(m.mechanical_other, 'hardness_brinell')
  ));
  pushRow('Hardness (Rockwell)', 'Rockwell', materials.map(m => {
    const h = m.mechanical_other?.hardness_rockwell;
    return (h?.value != null && h?.scale) ? `${h.value} HR${h.scale}` : null;
  }));
  pushRow('Ductility', '%', materials.map(m => {
    const d = m.mechanical_other?.ductility;
    if (!d) return null;
    if (d.typical != null) return d.typical;
    if (d.min != null && d.max != null) return (d.min + d.max) / 2;
    if (d.min != null) return `>= ${d.min}`;
    if (d.max != null) return `<= ${d.max}`;
    return null;
  }));
  pushRow('Usable Temp Min', tu, materials.map(m =>
    toTemp(m.mechanical_common?.usable_temp_range?.min ?? null, us)
  ));
  pushRow('Usable Temp Max', tu, materials.map(m =>
    toTemp(m.mechanical_common?.usable_temp_range?.max ?? null, us)
  ));

  // ── PHYSICAL ────────────────────────────────────────────────────────────

  pushSection('PHYSICAL');
  const du  = densityUnit(us);
  const cteu = cteUnit(us);
  const ku  = condUnit(us);
  const hu  = heatUnit(us);
  const dfu = diffUnit(us);

  pushRow('Density', du, materials.map(m =>
    toDensity(v(m.physical, 'density'), us)
  ));
  pushRow('Melting Point', tu, materials.map(m =>
    toTemp(v(m.physical, 'melting_point_tm'), us)
  ));
  pushRow('Glass Transition Temp.', tu, materials.map(m =>
    toTemp(v(m.physical, 'glass_transition_tg'), us)
  ));
  pushRow('Electrical Conductivity', '% IACS', materials.map(m =>
    v(m.physical, 'electrical_conductivity')
  ));
  pushRow('CTE', cteu, materials.map(m =>
    toCTE(m.physical?.thermal_expansion?.value ?? null, us)
  ));
  pushRow('Thermal Conductivity', ku, materials.map(m =>
    toCond(v(m.physical, 'thermal_conductivity'), us)
  ));
  pushRow('Specific Heat', hu, materials.map(m =>
    toHeat(v(m.physical, 'specific_heat'), us)
  ));
  pushRow('Thermal Diffusivity', dfu, materials.map(m =>
    toDiff(v(m.physical, 'thermal_diffusivity'), us)
  ));

  // ── CTE VS TEMPERATURE ──────────────────────────────────────────────────

  const cteTblMats = materials.filter(m => (m.physical?.thermal_expansion?.table?.length ?? 0) > 1);
  if (cteTblMats.length > 0) {
    // Union of all temperature points across materials, sorted ascending
    const allTemps = [...new Set(
      cteTblMats.flatMap(m => m.physical.thermal_expansion.table.map(pt => pt.temp))
    )].sort((a, b) => a - b);

    pushSection('CTE VS TEMPERATURE');
    for (const tempC of allTemps) {
      const dispTemp = Math.round(toTemp(tempC, us) * 10) / 10;
      pushRow(`CTE at ${dispTemp} ${tu}`, cteu, materials.map(m => {
        const tbl = m.physical?.thermal_expansion?.table ?? [];
        const pt  = tbl.find(p => p.temp === tempC);
        return pt != null ? toCTE(pt.cte, us) : null;
      }));
    }
  }

  // ── FATIGUE S-N CURVE ───────────────────────────────────────────────────

  const snMats = materials.filter(m => (m.mechanical_other?.fatigue_sn_curve?.points?.length ?? 0) > 0);
  if (snMats.length > 0) {
    // Union of all cycle counts, sorted ascending
    const allCycles = [...new Set(
      snMats.flatMap(m => m.mechanical_other.fatigue_sn_curve.points.map(pt => pt.cycles))
    )].sort((a, b) => a - b);

    pushSection('FATIGUE S-N CURVE');
    for (const cycles of allCycles) {
      pushRow(`Stress at ${fmtCyclesExport(cycles)} cycles`, su, materials.map(m => {
        const pts = m.mechanical_other?.fatigue_sn_curve?.points ?? [];
        const pt  = pts.find(p => p.cycles === cycles);
        return pt != null ? toStrength(pt.stress, us) : null;
      }));
    }
  }

  // ── MERIT INDICES ───────────────────────────────────────────────────────

  pushSection('MERIT INDICES');
  for (const idx of MERIT_INDICES) {
    const dir = idx.higherIsBetter ? '(higher is better)' : '(lower is better)';
    pushRow(`${idx.shortName ?? idx.id}`, `${idx.label} ${dir}`, materials.map(m => idx.fn(m)));
  }

  return result;
}

function fmtCyclesExport(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}e9`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}e6`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}e3`;
  return String(n);
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtForCsv(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  // Up to 5 significant figures, no trailing zeros
  const abs = Math.abs(val);
  if (abs === 0) return '0';
  const sigFigs = 4;
  return parseFloat(val.toPrecision(sigFigs)).toString();
}

function escapeCsv(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── CSV download ─────────────────────────────────────────────────────────────

export function downloadCSV(rows, materials, filename) {
  const names = materials.map(m => m.identification?.name ?? m.identification?.slug ?? '');
  const lines = [];

  lines.push(['Property', 'Unit', ...names].map(escapeCsv).join(','));

  for (const row of rows) {
    if (row.type === 'section') {
      lines.push('');
      lines.push(escapeCsv(row.label));
    } else {
      const cells = [row.label, row.unit, ...row.values.map(fmtForCsv)];
      lines.push(cells.map(escapeCsv).join(','));
    }
  }

  const csv  = lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── xlsx download ─────────────────────────────────────────────────────────────

export function downloadXLSX(rows, materials, filename) {
  if (typeof window.XLSX === 'undefined') {
    alert('Excel export requires the SheetJS library. Please use CSV export instead, or reload the page and try again.');
    return;
  }

  const XLSX = window.XLSX;
  const names = materials.map(m => m.identification?.name ?? m.identification?.slug ?? '');
  const aoa = [['Property', 'Unit', ...names]];

  for (const row of rows) {
    if (row.type === 'section') {
      aoa.push([]);
      aoa.push([row.label]);
    } else {
      // Pass numbers through as-is so Excel treats them numerically
      const vals = row.values.map(v => {
        if (v == null) return '';
        return v;
      });
      aoa.push([row.label, row.unit, ...vals]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 30 },  // Property
    { wch: 22 },  // Unit / formula
    ...names.map(() => ({ wch: 18 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Materials');
  XLSX.writeFile(wb, filename);
}
