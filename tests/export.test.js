// tests/export.test.js — Node built-in test runner, no dependencies.
// Run with: node --test tests/   (or `npm test`)
//
// Covers buildRows() only — export.js's other exports (downloadCSV,
// downloadXLSX) touch document/Blob/URL and aren't tested here, matching
// the project convention of testing js/core's pure logic, not js/pages'
// DOM wiring (see units.test.js/derived.test.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows } from '../js/core/export.js';
import { shearStrengthVonMises, MERIT_INDICES } from '../js/core/derived.js';
import { convertPressure, convertTemperature } from '../js/core/units.js';

function findRow(rows, label) {
  return rows.find(r => r.type === 'row' && r.label === label);
}

// Round, hand-verifiable fixture — not a real material.
const MAT_A = {
  identification: {
    name: 'Material A', slug: 'material-a', category: 'Metal',
    common_forms: ['Sheet', 'Plate'], fabrication_processes: ['Machining'],
  },
  mechanical_common: {
    youngs_modulus: { value: 200, ref: null },        // GPa
    poissons_ratio: { value: 0.3, ref: null },
    yield_strength: { value: 0.5, ref: null },         // GPa (500 MPa)
    tensile_strength: { value: 0.6, ref: null },        // GPa (600 MPa)
    compressive_strength: { value: 550, ref: null },    // MPa (stored unit)
    usable_temp_range: { min: -40, max: 200, ref: null }, // °C
  },
  mechanical_other: {
    shear_strength: { value: null, ref: null },         // null -> von Mises fallback
    fracture_toughness: { value: 30, ref: null },
    hardness_vickers: { value: 200, ref: null },
    ductility: { min: null, max: null, typical: 12, ref: null },
    fatigue_sn_curve: {
      points: [{ stress: 0.3, cycles: 1e5 }, { stress: 0.2, cycles: 1e6 }],
      stress_ratio: -1, test_method: 'Axial', ref: null,
    },
  },
  physical: {
    density: { value: 7.8, ref: null },                 // g/cm3
    melting_point_tm: { value: 1500, ref: null },        // °C
    electrical_conductivity: { value: 15, ref: null },
    thermal_expansion: {
      value: 12, ref: null,
      table: [{ temp: 0, cte: 11 }, { temp: 100, cte: 13 }],
    },
    thermal_conductivity: { value: 45, table: [], ref: null },
    specific_heat: { value: 460, table: [], ref: null },
    thermal_diffusivity: { value: 0.12, ref: null },
    magnetic_classification: { value: 'Ferromagnetic', ref: null },
  },
};

const MAT_EMPTY = {
  identification: { category: 'Metal' },
  mechanical_common: {}, mechanical_other: {}, physical: {},
};

describe('buildRows: sections and basic values', () => {
  test('includes IDENTIFICATION/MECHANICAL/PHYSICAL section markers', () => {
    const rows = buildRows([MAT_A], 'metric');
    const sections = rows.filter(r => r.type === 'section').map(r => r.label);
    assert.ok(sections.includes('IDENTIFICATION'));
    assert.ok(sections.includes('MECHANICAL'));
    assert.ok(sections.includes('PHYSICAL'));
    assert.ok(sections.includes('MERIT INDICES'));
  });

  test('Category row reflects identification.category', () => {
    const rows = buildRows([MAT_A], 'metric');
    assert.deepEqual(findRow(rows, 'Category').values, ['Metal']);
  });

  test('metric mode converts GPa strength fields to MPa', () => {
    const rows = buildRows([MAT_A], 'metric');
    // yield_strength stored as 0.5 GPa -> 500 MPa in metric display
    assert.equal(findRow(rows, 'Yield Strength').values[0], 500);
    assert.equal(findRow(rows, 'Yield Strength').unit, 'MPa');
  });

  test('canonical mode leaves GPa strength fields unconverted', () => {
    const rows = buildRows([MAT_A], 'canonical');
    assert.equal(findRow(rows, 'Yield Strength').values[0], 0.5);
    assert.equal(findRow(rows, 'Yield Strength').unit, 'GPa');
  });

  test('imperial mode matches units.js convertPressure directly (not re-derived)', () => {
    const rows = buildRows([MAT_A], 'imperial');
    const expected = convertPressure(0.5, 'ksi');
    assert.equal(findRow(rows, 'Yield Strength').values[0], expected);
  });

  test('temperature rows use units.js convertTemperature in imperial mode', () => {
    const rows = buildRows([MAT_A], 'imperial');
    const expected = convertTemperature(1500, '°F');
    assert.equal(findRow(rows, 'Melting Point').values[0], expected);
  });
});

describe('buildRows: row omission', () => {
  test('a field null on every material is omitted entirely, not shown as blank', () => {
    const rows = buildRows([MAT_EMPTY], 'metric');
    assert.equal(findRow(rows, 'Density'), undefined);
    assert.equal(findRow(rows, 'Young\'s Modulus'), undefined);
  });

  test('a field populated on at least one material is kept, with null for the others', () => {
    const rows = buildRows([MAT_A, MAT_EMPTY], 'metric');
    const row = findRow(rows, 'Density');
    assert.ok(row);
    assert.equal(row.values[0], 7.8);
    assert.equal(row.values[1], null);
  });
});

describe('buildRows: shear strength fallback', () => {
  test('falls back to von Mises when shear_strength is null, matching derived.js directly', () => {
    const rows = buildRows([MAT_A], 'canonical');
    const expected = shearStrengthVonMises(MAT_A); // GPa
    assert.equal(findRow(rows, 'Shear Strength').values[0], expected);
  });

  test('brittle-category gating flows through from derived.js (regression for the von Mises gate)', () => {
    const brittle = {
      ...MAT_A,
      identification: { ...MAT_A.identification, category: 'Ceramic' },
    };
    const rows = buildRows([brittle], 'canonical');
    // yield_strength is populated but category is brittle -> von Mises must
    // not fire, so with shear_strength also null the whole row is omitted.
    assert.equal(findRow(rows, 'Shear Strength'), undefined);
  });

  test('a directly-entered shear_strength is used as-is, not overridden', () => {
    const direct = {
      ...MAT_A,
      mechanical_other: { ...MAT_A.mechanical_other, shear_strength: { value: 0.4, ref: 'some-ref' } },
    };
    const rows = buildRows([direct], 'canonical');
    assert.equal(findRow(rows, 'Shear Strength').values[0], 0.4);
  });
});

describe('buildRows: CTE vs Temperature table', () => {
  test('included with correct per-temperature values when a material has a multi-row table', () => {
    const rows = buildRows([MAT_A], 'metric');
    const sections = rows.filter(r => r.type === 'section').map(r => r.label);
    assert.ok(sections.includes('CTE VS TEMPERATURE'));
    const row0 = findRow(rows, 'CTE at 0 °C');
    const row100 = findRow(rows, 'CTE at 100 °C');
    assert.equal(row0.values[0], 11);
    assert.equal(row100.values[0], 13);
  });

  test('omitted entirely when no material has a >1-row table', () => {
    const rows = buildRows([MAT_EMPTY], 'metric');
    const sections = rows.filter(r => r.type === 'section').map(r => r.label);
    assert.ok(!sections.includes('CTE VS TEMPERATURE'));
  });
});

describe('buildRows: Fatigue S-N curve', () => {
  test('stress ratio, test method, and per-cycle stress rows are all present and correct', () => {
    const rows = buildRows([MAT_A], 'canonical');
    assert.equal(findRow(rows, 'Stress Ratio (R)').values[0], -1);
    assert.equal(findRow(rows, 'Test Method').values[0], 'Axial');
    // 1e5 cycles formats as "100e3" per fmtCyclesExport
    const stressRow = rows.find(r => r.type === 'row' && r.label.startsWith('Stress at') && r.label.includes('100e3'));
    assert.ok(stressRow, 'expected a "Stress at 100e3 cycles" row');
    assert.equal(stressRow.values[0], 0.3);
  });

  test('undocumented stress_ratio/test_method render as the literal string "undocumented"', () => {
    const undocumented = {
      ...MAT_A,
      mechanical_other: {
        ...MAT_A.mechanical_other,
        fatigue_sn_curve: { points: [{ stress: 0.1, cycles: 1e4 }], stress_ratio: null, test_method: null, ref: null },
      },
    };
    const rows = buildRows([undocumented], 'canonical');
    assert.equal(findRow(rows, 'Stress Ratio (R)').values[0], 'undocumented');
    assert.equal(findRow(rows, 'Test Method').values[0], 'undocumented');
  });
});

describe('buildRows: merit indices', () => {
  test('every MERIT_INDICES entry produces a row', () => {
    const rows = buildRows([MAT_A], 'canonical');
    for (const idx of MERIT_INDICES) {
      const row = rows.find(r => r.type === 'row' && r.label === (idx.shortName ?? idx.id));
      assert.ok(row, `expected a row for merit index ${idx.id}`);
    }
  });
});
