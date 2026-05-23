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
    shortName: 'Specific stiffness',
    ref: 'ashby-materials-selection',
    label: 'E / ρ',
    description: 'Specific stiffness — compares how stiff a material is relative to its weight for a rod or beam of fixed geometry. Higher is better: a material with high E/ρ gives you the same stiffness for less mass.',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? E / rho : null; },
  },
  {
    id: 'M2', group: 'Stiffness',
    shortName: 'Beam Efficiency Index',
    ref: 'ashby-materials-selection',
    label: 'E^½ / ρ',
    description: 'E^½ / ρ — (a) Stiffness-limited design, minimum mass: beam in bending, length and shape fixed; section area free. (b) Stiffness-limited design, minimum mass: column in compression, buckling stiffness limited, length and shape fixed; section area free. (c) Vibration-limited design, maximum resonant frequency: beam in bending, length and section shape fixed; section area free. Higher is better.',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? Math.pow(E, 0.5) / rho : null; },
  },
  {
    id: 'M3', group: 'Stiffness',
    shortName: 'Panel Efficiency Index',
    ref: 'ashby-materials-selection',
    label: 'E^⅓ / ρ',
    description: 'E^⅓ / ρ — (a) Stiffness-limited design, minimum mass: panel in bending, length and width fixed; thickness free. (b) Stiffness-limited design, minimum mass: single-curvature shell under linear load, radius fixed; wall-thickness free. (c) Vibration-limited design, maximum resonant frequency: beam in bending, length, width and section shape fixed; thickness free. Higher is better.',
    higherIsBetter: true,
    fn: mat => { const { E, rho } = get(mat); return E && rho ? Math.pow(E, 1/3) / rho : null; },
  },

  // Strength-limited design
  {
    id: 'M4', group: 'Strength',
    shortName: 'Specific strength',
    ref: 'ashby-materials-selection',
    label: 'σ_y / ρ',
    description: 'Specific strength — compares how strong a material is relative to its weight for a rod or beam of fixed geometry. Higher is better: a high σ_y/ρ material supports more load per unit mass.',
    higherIsBetter: true,
    fn: mat => { const { sig_y, rho } = get(mat); return sig_y && rho ? sig_y / rho : null; },
  },
  {
    id: 'M5', group: 'Strength',
    shortName: 'Beam strength',
    ref: 'ashby-materials-selection',
    label: 'σ_y^⅔ / ρ',
    description: 'Beam strength at minimum mass — if you redesign a beam in each material to carry the same load before yielding, which material gives the lightest result? Higher is better.',
    higherIsBetter: true,
    fn: mat => { const { sig_y, rho } = get(mat); return sig_y && rho ? Math.pow(sig_y, 2/3) / rho : null; },
  },
  {
    id: 'M6', group: 'Strength',
    shortName: 'Panel strength',
    ref: 'ashby-materials-selection',
    label: 'σ_y^½ / ρ',
    description: 'Plate strength at minimum mass — same concept as M5 but for a flat plate. The exponent changes because plates carry load differently than beams. Higher is better.',
    higherIsBetter: true,
    fn: mat => { const { sig_y, rho } = get(mat); return sig_y && rho ? Math.pow(sig_y, 0.5) / rho : null; },
  },

  // Fracture and damage tolerance
  {
    id: 'M7', group: 'Fracture',
    shortName: 'Ductility index',
    ref: 'anderson-fracture-mechanics',
    label: 'K_IC / σ_y',
    description: 'Plastic zone size / ductility index — a measure of how much a crack tip can yield before fracture. Higher K_IC/σ_y means a larger plastic zone, indicating a tougher, more forgiving material that gives warning before fracture. Higher is better.',
    higherIsBetter: true,
    fn: mat => {
      const { K_IC, sig_y } = get(mat);
      // K_IC in MPa·m^0.5, sig_y in GPa → convert sig_y to MPa
      return (K_IC && sig_y) ? K_IC / (sig_y * 1000) : null;
    },
  },
  {
    id: 'M8', group: 'Fracture',
    shortName: 'Specific toughness',
    ref: 'ashby-materials-selection',
    label: 'K_IC / ρ',
    description: 'Toughness per unit mass — compares fracture toughness relative to material weight. Higher is better: useful when damage tolerance and low mass are both required, such as in aerospace structures.',
    higherIsBetter: true,
    fn: mat => {
      const { K_IC, rho } = get(mat);
      return (K_IC && rho) ? K_IC / rho : null;
    },
  },

  // Thermal design
  {
    id: 'M9', group: 'Thermal',
    shortName: 'Thermal distortion (steady)',
    ref: '10.1117/12.279804',
    label: 'α / k',
    description: 'Steady-state thermal distortion — how much a component distorts under a sustained heat load. α/k compares thermal expansion (tendency to grow) against thermal conductivity (ability to even out temperature). Lower is better: materials like SiC and ULE excel here because they either expand very little or conduct heat away quickly.',
    higherIsBetter: false,
    fn: mat => {
      const { alpha, k } = get(mat);
      return (alpha != null && k) ? alpha / k : null;
    },
  },
  {
    id: 'M10', group: 'Thermal',
    shortName: 'Thermal distortion (transient)',
    ref: '10.1117/12.279804',
    label: 'α / D',
    description: 'Transient thermal distortion — how much a component distorts during a sudden change in temperature, before steady-state is reached. α/D compares thermal expansion against thermal diffusivity (how quickly temperature equalizes through the material). Lower is better.',
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
    id: 'M11', group: 'Thermal',
    shortName: 'Thermal diffusivity',
    ref: 'incropera-heat-transfer',
    label: 'k / (ρ·C_p)',
    description: 'Thermal diffusivity — how quickly a material equilibrates temperature through its volume following a thermal disturbance. Higher is better: a high diffusivity material reaches a uniform temperature faster, reducing transient thermal gradients and distortion.',
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
