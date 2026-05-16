/**
 * tooltips.js — Human-readable definitions for all material property keys.
 *
 * Used by detail.js and submit.js to wire `title` attributes onto property
 * label elements so students can hover to see what each property means.
 */

export const TOOLTIPS = {
  // ── Mechanical common ──────────────────────────────────────────────────────
  youngs_modulus:
    "Young's Modulus (E): Ratio of tensile stress to tensile strain in the elastic region. Measures how stiff a material is — higher E means less deformation under load.",
  poissons_ratio:
    "Poisson's Ratio (ν): Ratio of lateral strain to axial strain under uniaxial stress. Typical metals: 0.25–0.35.",
  yield_strength:
    "Yield Strength (σ_y): Stress at which permanent (plastic) deformation begins. Design limit for structural components.",
  tensile_strength:
    "Tensile Strength (UTS): Maximum engineering stress a material can withstand before necking. For brittle materials this is typically the flexural (modulus of rupture) strength.",
  compressive_modulus:
    "Compressive Modulus: Stiffness in compression. Equal to Young's Modulus for most isotropic materials; differs significantly for composites and foams.",
  compressive_strength:
    "Compressive Strength: Maximum compressive stress before crushing or buckling failure. Particularly important for ceramics and concrete.",
  usable_temp_range:
    "Usable Temperature Range: Minimum and maximum service temperatures. Bounded by embrittlement (low end) or creep / softening / degradation (high end).",

  // ── Mechanical other ───────────────────────────────────────────────────────
  microyield_strength:
    "Microyield Strength (σ_MY): Stress at which plastic strain reaches 1 µstrain (10⁻⁶). Critical for precision optical and structural applications where dimensional stability is required.",
  creep_strength:
    "Creep Strength: Stress to produce a specified creep strain (often 0.1 % or 0.2 %) at a given temperature over a specified time (often 1000 h). Relevant at elevated temperatures.",
  fatigue_sn_curve:
    "Fatigue S–N Curve: Applied stress amplitude vs. number of cycles to failure (Wöhler curve). Points define the curve; log-linear interpolation is used between points.",
  fracture_toughness:
    "Fracture Toughness (K_IC): Critical stress intensity factor for mode-I (opening) crack propagation. Higher values indicate greater resistance to brittle fracture.",
  hardness_vickers:
    "Vickers Hardness (HV): Indentation hardness measured with a square pyramidal diamond indenter. Continuous scale applicable to all materials.",
  hardness_brinell:
    "Brinell Hardness (HB): Indentation hardness using a 10 mm hardened steel or tungsten carbide ball. Good for softer metals; becomes inaccurate above ~650 HB.",
  hardness_rockwell:
    "Rockwell Hardness (HR): Differential-depth indentation hardness. Scale must be specified (e.g. HRC for hard steel, HRB for softer metals, HRR for plastics).",
  hardness_shore:
    "Shore Hardness: Indentation hardness measured with a durometer. Shore A for soft elastomers and rubbers; Shore D for harder elastomers and semi-rigid plastics.",
  ductility:
    "Ductility (elongation at break, %): Plastic strain at fracture in a tensile test. A rough indicator of a material's ability to deform before breaking.",
  shear_strength:
    "Shear Strength (τ): Maximum shear stress a material can sustain. If not directly measured, estimated as σ_y / √3 via von Mises yield criterion.",

  // ── Physical ───────────────────────────────────────────────────────────────
  density:
    "Density (ρ): Mass per unit volume. Used in specific-property and merit-index calculations.",
  electrical_conductivity:
    "Electrical Conductivity (% IACS): Conductivity relative to the International Annealed Copper Standard (IACS = 58 MS/m = 100 %). Copper is defined as 100 % IACS.",
  vapour_pressure:
    "Vapour Pressure: Equilibrium pressure of a material's vapour above its condensed phase at a given temperature. Critical for high-vacuum and space applications.",
  thermal_expansion:
    "Coefficient of Thermal Expansion (CTE, α): Fractional change in length per degree of temperature change. Lower α → less thermally induced distortion.",
  thermal_conductivity:
    "Thermal Conductivity (k): Rate of heat transfer through a material per unit area per unit temperature gradient (W/m·K). Higher k → faster heat dissipation.",
  specific_heat:
    "Specific Heat Capacity (Cp): Heat energy required to raise 1 kg by 1 K (J/kg·K). Governs transient thermal response.",
  thermal_diffusivity:
    "Thermal Diffusivity (D = k / ρCp): Speed at which temperature changes propagate through a material (cm²/s). Higher D → faster thermal equilibration.",
  melting_point_tm:
    "Melting Point (Tm): Temperature at which the material transitions from solid to liquid. For crystalline materials (metals, ceramics). Upper bound on service temperature.",
  glass_transition_tg:
    "Glass Transition Temperature (Tg): Temperature below which an amorphous polymer or glass is in a glassy (rigid) state and above which it becomes rubbery or viscous. Relevant for polymers and amorphous ceramics.",
  usage_frequency:
    "Usage Frequency — Common: materials used routinely in everyday engineering design; a practising engineer would encounter these in the majority of projects. Specialty: materials selected for specific performance requirements not met by common materials; used regularly in particular industries or applications but not in general practice. Exotic: materials reserved for highly demanding or niche applications where performance requirements cannot be met by any other means; rarely encountered outside specialist fields.",
  magnetic_classification:
    "Magnetic Classification: Ferromagnetic (including ferrimagnetic) — strongly magnetic, use with caution near field-sensitive instruments (e.g. iron, nickel, cobalt and their alloys). Paramagnetic — weakly magnetic, generally acceptable (e.g. aluminum, titanium, some stainless steels). Diamagnetic — magnetically benign, preferred for precision optical/astronomical instruments (e.g. copper, beryllium, silicon, most polymers and ceramics).",

  // ── Derived / calculated ───────────────────────────────────────────────────
  shear_modulus:
    "Shear Modulus (G = E / 2(1+ν)): Ratio of shear stress to shear strain. Governs torsional stiffness.",
  specific_stiffness:
    "Specific Stiffness (E / ρ): Young's Modulus divided by density. Higher values mean a stiffer structure for the same mass.",
  shear_strength_calc:
    "Shear Strength (calculated via von Mises, τ = σ_y / √3): Estimated from yield strength when a direct measurement is not available.",
};
