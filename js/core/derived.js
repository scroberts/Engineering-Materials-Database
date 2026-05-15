/**
 * derived.js — Calculated material properties and merit indices.
 *
 * All functions accept a full material data object and return a number or null.
 * Null is returned whenever a required input field is missing.
 *
 * Units of inputs (canonical storage):
 *   E   → GPa     ρ → g/cm³   σ_y → GPa    K_IC → MPa·m^0.5
 *   α   → µm/m·°C  k → W/m·K  D   → cm²/s   Cp  → J/kg·K
 */

// ── Helpers ────────────────────────────────────────────────────────────────

const val = (section, key) => section?.[key]?.value ?? null;

function get(mat) {
  const mc = mat.mechanical_common  ?? {};
  const mo = mat.mechanical_other   ?? {};
  const ph = mat.physical           ?? {};
  return {
    E:    val(mc, 'youngs_modulus'),      // GPa
    nu:   val(mc, 'poissons_ratio'),      // dimensionless
    sig_y:val(mc, 'yield_strength'),      // GPa
    K_IC: val(mo, 'fracture_toughness'), // MPa·m^0.5
    rho:  val(ph, 'density'),            // g/cm³
    alpha:val(ph, 'thermal_expansion') != null
            ? (ph.thermal_expansion?.value ?? null)
            : null,                       // µm/m·°C
    k:    val(ph, 'thermal_conductivity'),// W/m·K
    D:    val(ph, 'thermal_diffusivity'), // cm²/s
    Cp:   val(ph, 'specific_heat'),       // J/kg·K
  };
}

// ── Structural calculated properties ──────────────────────────────────────

/** Shear Modulus G = E / (2(1+ν))  [GPa] */
export function shearModulus(mat) {
  const { E, nu } = get(mat);
  return (E != null && nu != null) ? E / (2 * (1 + nu)) : null;
}

/**
 * Specific Stiffness = E / ρ
 * Units: GPa / (g/cm³) = GPa·cm³/g = MN·m/kg (numerically equivalent)
 */
export function specificStiffness(mat) {
  const { E, rho } = get(mat);
  return (E != null && rho != null) ? E / rho : null;
}

/**
 * Shear Strength via von Mises: τ = σ_y / √3
 * Only used when shear_strength is not directly entered.  [GPa]
 */
export function shearStrengthVonMises(mat) {
  const { sig_y } = get(mat);
  return sig_y != null ? sig_y / Math.sqrt(3) : null;
}

// ── Merit indices ──────────────────────────────────────────────────────────
// All indices return a dimensionless ratio or a ratio with consistent units.
// "Better" direction is noted in the MERIT_INDICES export below.

export const MERIT_INDICES = [
  // Stiffness-limited design
  {
    id: 'M1', group: 'Stiffness',
    label: 'E / ρ',
    description: 'Specific stiffness — constant cross-section rod or beam',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? E / rho : null; },
  },
  {
    id: 'M2', group: 'Stiffness',
    label: '(E / ρ)^½',
    description: 'Beam deflection at minimum mass',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? Math.pow(E / rho, 0.5) : null; },
  },
  {
    id: 'M3', group: 'Stiffness',
    label: '(E / ρ)^⅓',
    description: 'Plate deflection at minimum mass',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? Math.pow(E / rho, 1/3) : null; },
  },
  {
    id: 'M4', group: 'Stiffness',
    label: 'E^½ / ρ',
    description: 'Resonant frequency at minimum mass (Paquin 1997)',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? Math.pow(E, 0.5) / rho : null; },
  },

  // Strength-limited design
  {
    id: 'M5', group: 'Strength',
    label: 'σ_y / ρ',
    description: 'Specific strength — constant cross-section rod',
    higherIsBetter: true,
    fn: mat => { const { sig_y, rho } = get(mat); return sig_y && rho ? sig_y / rho : null; },
  },
  {
    id: 'M6', group: 'Strength',
    label: 'σ_y^⅔ / ρ',
    description: 'Beam strength at minimum mass',
    higherIsBetter: true,
    fn: mat => { const { sig_y, rho } = get(mat); return sig_y && rho ? Math.pow(sig_y, 2/3) / rho : null; },
  },
  {
    id: 'M7', group: 'Strength',
    label: 'σ_y^½ / ρ',
    description: 'Plate strength at minimum mass',
    higherIsBetter: true,
    fn: mat => { const { sig_y, rho } = get(mat); return sig_y && rho ? Math.pow(sig_y, 0.5) / rho : null; },
  },

  // Fracture and damage tolerance
  {
    id: 'M8', group: 'Fracture',
    label: 'K_IC / σ_y',
    description: 'Plastic zone size — ductility index',
    higherIsBetter: true,
    fn: mat => {
      const { K_IC, sig_y } = get(mat);
      // K_IC in MPa·m^0.5, sig_y in GPa → convert sig_y to MPa
      return (K_IC && sig_y) ? K_IC / (sig_y * 1000) : null;
    },
  },
  {
    id: 'M9', group: 'Fracture',
    label: 'K_IC² / σ_y²',
    description: 'Fracture process zone size',
    higherIsBetter: true,
    fn: mat => {
      const { K_IC, sig_y } = get(mat);
      return (K_IC && sig_y) ? (K_IC * K_IC) / (sig_y * 1000 * sig_y * 1000) : null;
    },
  },
  {
    id: 'M10', group: 'Fracture',
    label: 'K_IC / ρ',
    description: 'Toughness per unit mass',
    higherIsBetter: true,
    fn: mat => {
      const { K_IC, rho } = get(mat);
      return (K_IC && rho) ? K_IC / rho : null;
    },
  },

  // Thermal design
  {
    id: 'M11', group: 'Thermal',
    label: 'α / k',
    description: 'Steady-state thermal distortion (Paquin Table 4) — lower is better',
    higherIsBetter: false,
    fn: mat => {
      const { alpha, k } = get(mat);
      return (alpha != null && k) ? alpha / k : null;
    },
  },
  {
    id: 'M12', group: 'Thermal',
    label: 'α / D',
    description: 'Transient thermal distortion — lower is better',
    higherIsBetter: false,
    fn: mat => {
      const { alpha, D } = get(mat);
      // If D not directly entered, compute from k, rho, Cp
      let diffusivity = D;
      if (diffusivity == null) {
        const { k, rho, Cp } = get(mat);
        diffusivity = (k && rho && Cp)
          ? (k / (rho * 1000 * Cp)) * 1e4   // m²/s → cm²/s
          : null;
      }
      return (alpha != null && diffusivity) ? alpha / diffusivity : null;
    },
  },
  {
    id: 'M13', group: 'Thermal',
    label: 'k / (ρ·C_p)',
    description: 'Thermal diffusivity — speed of transient response',
    higherIsBetter: true,
    fn: mat => {
      const { D, k, rho, Cp } = get(mat);
      if (D != null) return D;   // use directly-entered value
      return (k && rho && Cp)
        ? (k / (rho * 1000 * Cp)) * 1e4   // m²/s → cm²/s
        : null;
    },
  },
];
