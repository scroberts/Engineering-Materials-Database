// tests/derived.test.js — Node built-in test runner, no dependencies.
// Run with: node --test tests/   (or `npm test`)
//
// Expected values are computed here from the formulas documented in each
// derived.js JSDoc comment (E/ρ, E^½/ρ, K_IC/σ_y, etc.) using round,
// hand-verifiable inputs — not copy-pasted from the implementation — so a
// wrong exponent, wrong field, or wrong unit assumption in derived.js will
// actually be caught rather than just re-confirmed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  shearModulus,
  specificStiffness,
  shearStrengthVonMises,
  MERIT_INDICES,
} from '../js/core/derived.js';

const EPS = 1e-9;
const approx = (actual, expected, msg) => {
  assert.ok(
    Math.abs(actual - expected) < Math.max(1e-6, Math.abs(expected) * 1e-9),
    `${msg}: expected ${expected}, got ${actual}`
  );
};

function meritFn(id) {
  const idx = MERIT_INDICES.find(m => m.id === id);
  assert.ok(idx, `merit index ${id} should exist in MERIT_INDICES`);
  return idx.fn;
}

// Round, hand-verifiable fixture. Not a real material — chosen so every
// formula below can be checked with simple arithmetic.
const FIXTURE = {
  mechanical_common: {
    youngs_modulus: { value: 100, ref: null },   // GPa
    poissons_ratio: { value: 0.25, ref: null },  // dimensionless
    yield_strength: { value: 0.5, ref: null },   // GPa (= 500 MPa)
  },
  mechanical_other: {
    fracture_toughness: { value: 25, ref: null }, // MPa·m^0.5
  },
  physical: {
    density: { value: 5, ref: null },             // g/cm³
    thermal_expansion: { value: 10, table: [], ref: null },       // µm/m·K
    thermal_conductivity: { value: 20, table: [], ref: null },    // W/m·K
    specific_heat: { value: 1000, table: [], ref: null },         // J/kg·K
    thermal_diffusivity: { value: null, ref: null },              // force the derived k/(ρ·Cp) path
  },
};

// Same fixture, but with a directly-entered thermal_diffusivity, to check
// that a stored value takes priority over the k/(ρ·Cp) derivation.
const FIXTURE_WITH_DIFFUSIVITY = {
  ...FIXTURE,
  physical: { ...FIXTURE.physical, thermal_diffusivity: { value: 0.05, ref: null } },
};

// A material missing required fields — every function/index should return
// null, not throw or return NaN, so the UI's "—" fallback works everywhere.
const EMPTY = { mechanical_common: {}, mechanical_other: {}, physical: {} };

describe('shearModulus: G = E / (2(1+ν))', () => {
  test('known values', () => {
    // 100 / (2 * 1.25) = 40
    assert.equal(shearModulus(FIXTURE), 40);
  });
  test('null when E or ν missing', () => {
    assert.equal(shearModulus(EMPTY), null);
  });
});

describe('specificStiffness: E / ρ', () => {
  test('known values', () => {
    assert.equal(specificStiffness(FIXTURE), 20); // 100 / 5
  });
  test('null when E or ρ missing', () => {
    assert.equal(specificStiffness(EMPTY), null);
  });
});

describe('shearStrengthVonMises: τ = σ_y / √3', () => {
  test('known values', () => {
    approx(shearStrengthVonMises(FIXTURE), 0.5 / Math.sqrt(3), 'von Mises shear');
  });
  test('null when yield_strength missing', () => {
    assert.equal(shearStrengthVonMises(EMPTY), null);
  });
});

describe('merit indices — stiffness-limited design', () => {
  test('M1 = E/ρ', () => {
    assert.equal(meritFn('M1')(FIXTURE), 20); // 100/5
  });
  test('M2 = E^½/ρ', () => {
    approx(meritFn('M2')(FIXTURE), Math.sqrt(100) / 5, 'M2'); // 10/5 = 2
  });
  test('M3 = E^⅓/ρ', () => {
    approx(meritFn('M3')(FIXTURE), Math.cbrt(100) / 5, 'M3');
  });
});

describe('merit indices — strength-limited design', () => {
  test('M4 = σ_y/ρ', () => {
    assert.equal(meritFn('M4')(FIXTURE), 0.1); // 0.5/5
  });
  test('M5 = σ_y^⅔/ρ', () => {
    approx(meritFn('M5')(FIXTURE), Math.pow(0.5, 2 / 3) / 5, 'M5');
  });
  test('M6 = σ_y^½/ρ', () => {
    approx(meritFn('M6')(FIXTURE), Math.sqrt(0.5) / 5, 'M6');
  });
});

describe('merit indices — fracture and damage tolerance', () => {
  test('M7 = K_IC/σ_y, with σ_y converted GPa->MPa', () => {
    // 25 MPa·m^0.5 / (0.5 GPa * 1000 MPa/GPa) = 25/500 = 0.05
    assert.equal(meritFn('M7')(FIXTURE), 0.05);
  });
  test('M8 = K_IC/ρ', () => {
    assert.equal(meritFn('M8')(FIXTURE), 5); // 25/5
  });
});

describe('merit indices — thermal design', () => {
  test('M9 = α/k', () => {
    assert.equal(meritFn('M9')(FIXTURE), 0.5); // 10/20
  });
  test('M11 = k/(ρ·Cp), unit-converted m²/s -> cm²/s, derived when not directly entered', () => {
    // k/(ρ_kg_per_m3 * Cp) in m²/s, then *1e4 for cm²/s:
    // ρ must be converted g/cm³ -> kg/m³ (×1000) to make the SI diffusivity formula dimensionally correct
    const expected = (20 / (5 * 1000 * 1000)) * 1e4;
    approx(meritFn('M11')(FIXTURE), expected, 'M11 derived');
  });
  test('M11 uses the directly-entered thermal_diffusivity when present, not the derived value', () => {
    assert.equal(meritFn('M11')(FIXTURE_WITH_DIFFUSIVITY), 0.05);
  });
  test('M10 = α/a, using the same diffusivity precedence as M11', () => {
    const diffusivity = (20 / (5 * 1000 * 1000)) * 1e4;
    approx(meritFn('M10')(FIXTURE), 10 / diffusivity, 'M10 derived');
    assert.equal(meritFn('M10')(FIXTURE_WITH_DIFFUSIVITY), 10 / 0.05);
  });
});

describe('merit indices — missing-data handling', () => {
  test('every index returns null (not NaN, not throw) on an empty material', () => {
    for (const idx of MERIT_INDICES) {
      assert.equal(idx.fn(EMPTY), null, `${idx.id} should return null on empty input`);
    }
  });
});

describe('MERIT_INDICES metadata sanity', () => {
  test('every index has a unique id, and higherIsBetter is a boolean', () => {
    const ids = MERIT_INDICES.map(m => m.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate merit index id found');
    for (const idx of MERIT_INDICES) {
      assert.equal(typeof idx.higherIsBetter, 'boolean', `${idx.id}.higherIsBetter should be boolean`);
    }
  });
});
