// tests/htmlImport.test.js — Node built-in test runner, no dependencies.
// Run with: node --test tests/   (or `npm test`)
//
// htmlImport.js is a client-side (DOMParser-based) port of tools/parse_refs.py,
// explicitly documented as drift-prone against it (the two are hand-kept in
// sync, not shared code). This covers the pure value/unit/mapping logic —
// the actual place a silent divergence would show up as wrong numbers — not
// the DOM-scraping per-site parsers or parseHtmlToMaterial() itself, which
// need a real DOMParser (a browser API Node doesn't provide, and this
// project deliberately has zero JS dependencies, so no jsdom/linkedom here).
// A few internal helpers were given `export` specifically to make this
// possible; see htmlImport.js for the added exports.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  num, splitValUnit, nu,
  convertPressureToGPa, convertPressureToMPa, convertDensity, convertCTE,
  convertConductivity, convertSpecificHeat, convertTemp,
  convertFractureToughness, convertThermalDiffusivity,
  mapProperty, applyRows, detectSite, extractRockwellScale,
} from '../js/core/htmlImport.js';

function approx(actual, expected) {
  assert.ok(Math.abs(actual - expected) < Math.max(1e-6, Math.abs(expected) * 1e-9),
    `expected ~${expected}, got ${actual}`);
}

describe('num: numeric text extraction', () => {
  test('plain integers and decimals', () => {
    assert.equal(num('203'), 203);
    assert.equal(num('0.334'), 0.334);
  });
  test('unicode minus and en-dash are normalized to a regular minus', () => {
    assert.equal(num('−40'), -40);
    assert.equal(num('–40'), -40);
  });
  test('thousands separators are stripped', () => {
    assert.equal(num('1,530,800'), 1530800);
  });
  test('scientific "x 10^n" notation is converted to eN', () => {
    assert.equal(num('1.5 x 10^6'), 1.5e6);
    assert.equal(num('2.3 × 10^-3'), 2.3e-3);
  });
  test('null/empty input returns null, not NaN', () => {
    assert.equal(num(''), null);
    assert.equal(num(null), null);
  });
  test('non-numeric text returns null', () => {
    assert.equal(num('N/A'), null);
  });
});

describe('splitValUnit: leading number + trailing unit text', () => {
  test('splits a simple "203 GPa" style cell', () => {
    assert.deepEqual(splitValUnit('203 GPa'), ['203', 'GPa']);
  });
  test('splits with no unit present', () => {
    assert.deepEqual(splitValUnit('0.30'), ['0.30', '']);
  });
  test('handles scientific x10^n notation before the unit', () => {
    assert.deepEqual(splitValUnit('1.5 x 10^6 psi'), ['1.5e6', 'psi']);
  });
  test('null for a cell with no leading number', () => {
    assert.equal(splitValUnit('N/A'), null);
  });
});

describe('nu: unit-string normalization', () => {
  test('lowercases and strips spaces/degree signs', () => {
    assert.equal(nu('°C'), 'c');
    assert.equal(nu('W/m·K'), 'w/mk');
  });
  test('normalizes micro sign variants to "u"', () => {
    assert.equal(nu('µm/m·K'), 'um/mk');
    assert.equal(nu('μm/m·K'), 'um/mk');
  });
});

describe('unit converters (ported 1:1 from tools/parse_refs.py — must stay numerically identical)', () => {
  test('convertPressureToGPa', () => {
    assert.equal(convertPressureToGPa(200, 'GPa'), 200);
    approx(convertPressureToGPa(200000, 'MPa'), 200);
    approx(convertPressureToGPa(1000, 'ksi'), 1000 * 0.006894757);
    assert.equal(convertPressureToGPa(1, 'furlong'), null);
  });
  test('convertPressureToMPa', () => {
    assert.equal(convertPressureToMPa(500, 'MPa'), 500);
    assert.equal(convertPressureToMPa(0.5, 'GPa'), 500);
  });
  test('convertDensity', () => {
    assert.equal(convertDensity(7.8, 'g/cm3'), 7.8);
    approx(convertDensity(7800, 'kg/m3'), 7.8);
  });
  test('convertCTE: ppm/°C passes through, ppm/°F scales by 1.8', () => {
    assert.equal(convertCTE(12, 'ppm/C'), 12);
    approx(convertCTE(12, 'ppm/F'), 12 * 1.8);
  });
  test('convertTemp: Celsius passthrough, Fahrenheit and Kelvin convert', () => {
    assert.equal(convertTemp(100, 'C'), 100);
    approx(convertTemp(212, 'F'), 100);
    approx(convertTemp(373.15, 'K'), 100);
  });
  test('convertFractureToughness', () => {
    assert.equal(convertFractureToughness(25, 'MPa*m^0.5'), 25);
    approx(convertFractureToughness(20, 'ksi*in^0.5'), 20 * 1.0988);
  });
  test('convertThermalDiffusivity', () => {
    assert.equal(convertThermalDiffusivity(0.05, 'cm2/s'), 0.05);
    approx(convertThermalDiffusivity(5, 'mm2/s'), 0.05);
  });
  test('convertConductivity and convertSpecificHeat pass through W/m·K and J/kg·K', () => {
    assert.equal(convertConductivity(45, 'W/mK'), 45);
    assert.equal(convertSpecificHeat(460, 'J/kgK'), 460);
  });
});

describe('mapProperty: name/value/unit -> schema path + canonical value', () => {
  test('maps a Young\'s Modulus row to mechanical_common.youngs_modulus in GPa', () => {
    const result = mapProperty('Young\'s Modulus', '200', 'GPa');
    assert.deepEqual(result, ['mechanical_common.youngs_modulus', 200]);
  });
  test('unqualified "Tensile Strength" maps after qualified Ultimate/Yield patterns', () => {
    assert.deepEqual(
      mapProperty('Ultimate Tensile Strength', '600', 'MPa'),
      ['mechanical_common.tensile_strength', 0.6],
    );
    assert.deepEqual(
      mapProperty('Tensile Strength', '600', 'MPa'),
      ['mechanical_common.tensile_strength', 0.6],
    );
  });
  test('unrecognized property name returns null', () => {
    assert.equal(mapProperty('Some Unrelated Field', '5', ''), null);
  });
  test('unparsable value returns null even for a recognized property name', () => {
    assert.equal(mapProperty('Density', 'N/A', 'g/cm3'), null);
  });
});

describe('applyRows: first-match-wins per schema path', () => {
  test('a later row for the same path is ignored (first-wins, not last-wins)', () => {
    const rows = [
      ['Hardness, Brinell', '217', 'HB'],
      ['Hardness, Rockwell C (converted from Brinell hardness value of 217)', '17', ''],
    ];
    const [parsed] = applyRows(rows);
    assert.equal(parsed['mechanical_other.hardness_brinell'], 217);
  });
  test('regression: the parenthetical cross-reference must not overwrite the primary row', () => {
    // This is the exact scenario documented in htmlImport.js's applyRows()
    // comment (found on azom-4340.html / azom-1018.html) — a converted-value
    // parenthetical spuriously substring-matches "brinell hardness" and, with
    // last-write-wins, silently clobbered the correct primary value.
    const rowsPrimaryFirst = [
      ['Hardness, Brinell', '217', 'HB'],
      ['Hardness, Rockwell C (converted from Brinell hardness value of 217)', '17', ''],
    ];
    const [parsed] = applyRows(rowsPrimaryFirst);
    assert.notEqual(parsed['mechanical_other.hardness_brinell'], 17);
  });
  test('unrecognized rows are collected into the raw map, keyed by property name', () => {
    const [, raw] = applyRows([['Some Unrelated Field', '5', 'widgets']]);
    assert.equal(raw['Some Unrelated Field'], '5 widgets');
  });
  test('Rockwell scale letter is captured as a side-channel key', () => {
    const [parsed] = applyRows([['Hardness, Rockwell C', '55', '']]);
    assert.equal(parsed['mechanical_other.hardness_rockwell__scale'], 'C');
  });
});

describe('detectSite: filename prefix -> site key', () => {
  test('matches known prefixes', () => {
    assert.equal(detectSite('azom-4340'), 'azom');
    assert.equal(detectSite('matweb-6063-t5'), 'matweb');
    assert.equal(detectSite('hightempmetals-inconel'), 'hightempmetals');
  });
  test('falls back to generic for an unrecognized prefix', () => {
    assert.equal(detectSite('some-random-file'), 'generic');
  });
  test('prefers the longest matching prefix (engineers-edge vs engineersedge)', () => {
    assert.equal(detectSite('engineers-edge-steel'), 'engineers-edge');
  });
});

describe('extractRockwellScale', () => {
  test('extracts the scale letter from a property name', () => {
    assert.equal(extractRockwellScale('Hardness, Rockwell C'), 'C');
    assert.equal(extractRockwellScale('Rockwell B Hardness'), 'B');
  });
  test('null when no scale letter is present', () => {
    assert.equal(extractRockwellScale('Hardness, Brinell'), null);
  });
});
