/**
 * units.js — Unit conversion for all property types.
 *
 * Canonical storage units (as defined in schema/v1.json):
 *   Pressure / Moduli   → GPa
 *   Compressive Strength → MPa  (exception)
 *   Fracture Toughness  → MPa·m^0.5
 *   Density             → g/cm³
 *   Hardness            → Vickers (HV)
 *   Temperature         → °C
 */

// ── Unit lists ─────────────────────────────────────────────────────────────

export const PRESSURE_UNITS       = ['GPa', 'MPa', 'psi', 'ksi'];
export const COMP_STRENGTH_UNITS  = ['MPa', 'psi', 'ksi'];    // stored in MPa
export const FRACTURE_UNITS       = ['MPa·m^0.5', 'ksi·in^0.5'];
export const TEMPERATURE_UNITS    = ['K', '°C', '°F'];        // stored in °C
export const ELECTRICAL_UNITS     = ['% IACS', 'MS/m', 'S/m']; // stored in % IACS

// ── Conversion factors (multiply canonical value to get target unit) ────────

const FROM_GPa = { GPa: 1, MPa: 1000, psi: 145037.738, ksi: 145.038 };
const TO_GPa   = { GPa: 1, MPa: 0.001, psi: 6.89476e-6, ksi: 0.0068948 };

const FROM_MPa = { MPa: 1, psi: 145.038, ksi: 0.145038 };

const FROM_MPa_sqrtm = { 'MPa·m^0.5': 1, 'ksi·in^0.5': 0.9099 };

// ── Decimal places per display unit ────────────────────────────────────────

export const UNIT_DECIMALS = {
  GPa: 3,
  MPa: 1,
  psi: 0,
  ksi: 2,
  'MPa·m^0.5': 1,
  'ksi·in^0.5': 3,
};

// ── Converters ─────────────────────────────────────────────────────────────

/**
 * Convert a value stored in GPa to the requested display unit.
 * @param {number|null} valueGPa
 * @param {string} toUnit  — one of PRESSURE_UNITS
 */
export function convertPressure(valueGPa, toUnit) {
  if (valueGPa == null) return null;
  return valueGPa * FROM_GPa[toUnit];
}

/**
 * Convert a value stored in MPa (compressive strength) to display unit.
 * @param {number|null} valueMPa
 * @param {string} toUnit  — one of COMP_STRENGTH_UNITS
 */
export function convertCompStrength(valueMPa, toUnit) {
  if (valueMPa == null) return null;
  return valueMPa * FROM_MPa[toUnit];
}

/**
 * Convert fracture toughness from canonical MPa·m^0.5.
 * @param {number|null} val
 * @param {string} toUnit  — one of FRACTURE_UNITS
 */
export function convertFracture(val, toUnit) {
  if (val == null) return null;
  return val * FROM_MPa_sqrtm[toUnit];
}

/**
 * Convert a value from one pressure unit to another (used by unit selectors).
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 */
export function convertPressureUnits(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  const inGPa = value * TO_GPa[fromUnit];
  return inGPa * FROM_GPa[toUnit];
}

/**
 * Convert temperature from canonical °C to display unit.
 * @param {number|null} valueCelsius
 * @param {string} toUnit  — 'K' | '°C' | '°F'
 */
export function convertTemperature(valueCelsius, toUnit) {
  if (valueCelsius == null) return null;
  if (toUnit === '°C') return valueCelsius;
  if (toUnit === 'K')  return valueCelsius + 273.15;
  if (toUnit === '°F') return valueCelsius * 9 / 5 + 32;
  return valueCelsius;
}

/**
 * Convert electrical conductivity from canonical % IACS to display unit.
 * 1 % IACS = 0.58 MS/m = 580,000 S/m
 * @param {number|null} valueIACS
 * @param {string} toUnit  — '% IACS' | 'MS/m' | 'S/m'
 */
export function convertElectrical(valueIACS, toUnit) {
  if (valueIACS == null) return null;
  if (toUnit === '% IACS') return valueIACS;
  if (toUnit === 'MS/m')   return valueIACS * 0.58;
  if (toUnit === 'S/m')    return valueIACS * 5.8e5;
  return valueIACS;
}

// ── Hardness conversions (approximate) ────────────────────────────────────

/** HV → HB  (valid for HV < 650) */
export function hvToHb(hv) { return hv != null ? Math.round(hv / 1.05) : null; }

/** HB → HV */
export function hbToHv(hb) { return hb != null ? Math.round(hb * 1.05) : null; }

// ── Density ────────────────────────────────────────────────────────────────

/** Density stored in g/cm³; convert to kg/m³ for display. */
export function densityKgM3(gcm3) { return gcm3 != null ? gcm3 * 1000 : null; }

// ── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a number with the appropriate decimal places for a unit.
 * Returns '—' for null/undefined.
 */
export function fmt(value, unit, overrideDecimals) {
  if (value == null || isNaN(value)) return '—';
  const d = overrideDecimals ?? UNIT_DECIMALS[unit] ?? 2;
  // Use locale formatting for large numbers (e.g. psi)
  if (Math.abs(value) >= 10000) {
    return Number(value.toFixed(d)).toLocaleString();
  }
  return Number(value.toFixed(d)).toString();
}

/** Format a cycle count in scientific-ish notation. */
export function fmtCycles(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} × 10⁹`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} × 10⁶`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} × 10³`;
  return n.toString();
}
