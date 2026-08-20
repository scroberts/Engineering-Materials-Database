// tests/units.test.js — Node built-in test runner, no dependencies.
// Run with: node --test tests/   (or `npm test`)
//
// These conversion factors flow into every displayed number on the site.
// Expected values below were computed independently (calculator/hand, not
// copy-pasted from js/core/units.js) — see the review notes in CLAUDE.md.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPressure,
  convertCompStrength,
  convertFracture,
  convertPressureUnits,
  convertTemperature,
  convertElectrical,
  convertDensity,
  convertCTE,
  convertThermalCond,
  convertSpecificHeat,
  convertThermalDiff,
  hvToHb,
  hbToHv,
  densityKgM3,
  fmt,
  fmtCycles,
} from '../js/core/units.js';

describe('convertPressure (canonical GPa -> display)', () => {
  test('GPa -> MPa/psi/ksi factors', () => {
    assert.equal(convertPressure(1, 'GPa'), 1);
    assert.equal(convertPressure(1, 'MPa'), 1000);
    assert.equal(convertPressure(1, 'psi'), 145037.738);
    assert.equal(convertPressure(1, 'ksi'), 145.038);
  });
  test('scales linearly', () => {
    assert.equal(convertPressure(2.5, 'MPa'), 2500);
  });
  test('null passthrough', () => {
    assert.equal(convertPressure(null, 'MPa'), null);
  });
});

describe('convertCompStrength (canonical MPa -> display)', () => {
  test('MPa/psi/ksi factors', () => {
    assert.equal(convertCompStrength(1, 'MPa'), 1);
    assert.equal(convertCompStrength(1, 'psi'), 145.038);
    assert.equal(convertCompStrength(1, 'ksi'), 0.145038);
  });
  test('null passthrough', () => {
    assert.equal(convertCompStrength(null, 'psi'), null);
  });
});

describe('convertFracture (canonical MPa·m^0.5 -> display)', () => {
  test('ksi·in^0.5 factor', () => {
    assert.equal(convertFracture(1, 'MPa·m^0.5'), 1);
    assert.equal(convertFracture(1, 'ksi·in^0.5'), 0.9099);
  });
  test('null passthrough', () => {
    assert.equal(convertFracture(null, 'ksi·in^0.5'), null);
  });
});

describe('convertPressureUnits (arbitrary unit -> unit, via GPa)', () => {
  test('1000 MPa round-trips to 1 GPa', () => {
    assert.equal(convertPressureUnits(1000, 'MPa', 'GPa'), 1);
  });
  test('same-unit short-circuit returns the input unchanged', () => {
    assert.equal(convertPressureUnits(42, 'ksi', 'ksi'), 42);
  });
  test('GPa -> psi via the round-trip path', () => {
    assert.equal(convertPressureUnits(1, 'GPa', 'psi'), 145037.738);
  });
});

describe('convertTemperature (canonical °C -> display)', () => {
  test('°C passthrough', () => {
    assert.equal(convertTemperature(100, '°C'), 100);
  });
  test('°C -> K adds 273.15', () => {
    assert.equal(convertTemperature(0, 'K'), 273.15);
  });
  test('°C -> °F: 0°C = 32°F, 100°C = 212°F', () => {
    assert.equal(convertTemperature(0, '°F'), 32);
    assert.equal(convertTemperature(100, '°F'), 212);
  });
  test('-40 is the classic C/F crossing point', () => {
    assert.equal(convertTemperature(-40, '°F'), -40);
  });
  test('null passthrough', () => {
    assert.equal(convertTemperature(null, 'K'), null);
  });
});

describe('convertElectrical (canonical % IACS -> display)', () => {
  test('% IACS passthrough', () => {
    assert.equal(convertElectrical(30, '% IACS'), 30);
  });
  test('% IACS -> MS/m factor 0.58', () => {
    assert.equal(convertElectrical(100, 'MS/m'), 58);
  });
  test('% IACS -> S/m factor 5.8e5', () => {
    assert.equal(convertElectrical(1, 'S/m'), 580000);
  });
});

describe('convertDensity (canonical g/cm3 -> display)', () => {
  test('g/cm3 passthrough', () => {
    assert.equal(convertDensity(7.85, 'g/cm³'), 7.85);
  });
  test('g/cm3 -> lb/in3 factor', () => {
    assert.equal(convertDensity(1, 'lb/in³'), 0.036127292);
  });
});

describe('convertCTE (canonical µm/m·K -> display)', () => {
  test('µm/m·K passthrough', () => {
    assert.equal(convertCTE(12, 'µm/m·K'), 12);
  });
  test('µm/m·K -> µin/in·°F is exactly *5/9', () => {
    assert.equal(convertCTE(9, 'µin/in·°F'), 5);
  });
});

describe('convertThermalCond (canonical W/m·K -> display)', () => {
  test('W/m·K passthrough', () => {
    assert.equal(convertThermalCond(50, 'W/m·K'), 50);
  });
  test('W/m·K -> BTU/(hr·ft·°F) factor', () => {
    assert.equal(convertThermalCond(1, 'BTU/(hr·ft·°F)'), 0.5779);
  });
});

describe('convertSpecificHeat (canonical J/(kg·K) -> display)', () => {
  test('J/(kg·K) passthrough', () => {
    assert.equal(convertSpecificHeat(490, 'J/(kg·K)'), 490);
  });
  test('J/(kg·K) -> BTU/(lb·°F) factor', () => {
    assert.equal(convertSpecificHeat(1, 'BTU/(lb·°F)'), 2.3885e-4);
  });
});

describe('convertThermalDiff (canonical cm²/s -> display)', () => {
  test('cm²/s passthrough', () => {
    assert.equal(convertThermalDiff(0.5, 'cm²/s'), 0.5);
  });
  test('cm²/s -> ft²/hr factor', () => {
    assert.equal(convertThermalDiff(1, 'ft²/hr'), 3.875);
  });
});

describe('hardness conversions (approximate, HV <-> HB)', () => {
  test('hvToHb', () => {
    assert.equal(hvToHb(105), 100);
  });
  test('hbToHv', () => {
    assert.equal(hbToHv(100), 105);
  });
  test('round-trip is stable within rounding for a typical steel hardness', () => {
    assert.equal(hbToHv(hvToHb(210)), 210); // 210/1.05=200 exactly, 200*1.05=210 exactly
  });
  test('null passthrough on both directions', () => {
    assert.equal(hvToHb(null), null);
    assert.equal(hbToHv(null), null);
  });
});

describe('densityKgM3', () => {
  test('g/cm3 -> kg/m3 is *1000', () => {
    assert.equal(densityKgM3(2.7), 2700);
  });
  test('null passthrough', () => {
    assert.equal(densityKgM3(null), null);
  });
});

describe('fmt (display formatting)', () => {
  test('null/NaN render as em dash', () => {
    assert.equal(fmt(null, 'GPa'), '—');
    assert.equal(fmt(NaN, 'GPa'), '—');
  });
  test('rounds to the unit\'s configured decimal places', () => {
    assert.equal(fmt(1.23456, 'GPa'), '1.235'); // GPa -> 3 decimals
    assert.equal(fmt(100.4, 'psi'), '100');     // psi -> 0 decimals
  });
  test('strips trailing zeros after rounding', () => {
    assert.equal(fmt(1.2, 'GPa'), '1.2');
  });
  test('overrideDecimals takes priority over the unit default', () => {
    assert.equal(fmt(1.23456, 'GPa', 1), '1.2');
  });
  test('unknown unit falls back to 2 decimals', () => {
    assert.equal(fmt(5, 'not-a-real-unit'), '5');
    assert.equal(fmt(5.567, 'not-a-real-unit'), '5.57');
  });
});

describe('fmtCycles (life-count formatting)', () => {
  test('null renders as em dash', () => {
    assert.equal(fmtCycles(null), '—');
  });
  test('below 1e3 renders the raw integer', () => {
    assert.equal(fmtCycles(100), '100');
  });
  test('1e3-1e6 range uses ×10³', () => {
    assert.equal(fmtCycles(8400), '8 × 10³');
  });
  test('1e6-1e9 range uses ×10⁶', () => {
    assert.equal(fmtCycles(1e6), '1 × 10⁶');
    assert.equal(fmtCycles(5e8), '500 × 10⁶'); // this is aluminum-2024-t3's longest-life point
  });
  test('>=1e9 range uses ×10⁹ with one decimal', () => {
    assert.equal(fmtCycles(1e9), '1.0 × 10⁹');
    assert.equal(fmtCycles(1.5e9), '1.5 × 10⁹');
  });
});
