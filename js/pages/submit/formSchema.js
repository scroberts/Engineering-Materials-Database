/**
 * submit/formSchema.js — Declarative description of the submission form.
 *
 * Each field descriptor:
 * { id, label, hint, type }
 *
 * Types:
 *   'text'       → <input type="text">
 *   'textarea'   → <textarea>
 *   'select'     → <select>  (needs options:[])
 *   'checkbox'   → hidden + checkbox list  (needs options:[])
 *   'bool'       → yes/no/unknown select
 *   'number'     → numeric input, optional canonicalUnit + displayUnits[]
 *   'range'      → {min, max} pair, optional canonicalUnit + displayUnits[]
 *   'range3'     → {min, max, typical} triple
 *   'hardness'   → special hardness sub-form
 *   'sn'         → S-N curve editor
 *   'cte'        → CTE table + single value
 *   'rockwell'   → rockwell + scale
 */

import {
  PRESSURE_UNITS, COMP_STRENGTH_UNITS, FRACTURE_UNITS, TEMPERATURE_UNITS,
  DENSITY_UNITS, ELECTRICAL_UNITS, THERMAL_COND_UNITS,
  SPECIFIC_HEAT_UNITS, THERMAL_DIFF_UNITS,
} from '../../core/units.js';

export const FORM_SECTIONS = [
  {
    id: 'identification',
    title: 'Identification',
    fields: [
      { id: 'name',       label: 'Material name',        type: 'text',     required: true,
        hint: 'e.g. Aluminum 6061-T6' },
      { id: 'slug',       label: 'Slug (URL key)',        type: 'text',     required: true,
        hint: 'e.g. aluminum-6061-t6  (lowercase, hyphens only)' },
      { id: 'category',   label: 'Category',              type: 'select',   required: true,
        options: ['Metal', 'Plastic', 'Ceramic', 'Composite', 'Glass', 'Natural Material', 'Elastomer'] },
      { id: 'fabrication_processes', label: 'Fabrication processes', type: 'checkbox',
        options: ['Machining', 'Welding', 'Bending', 'Casting', 'Extrusion', 'Moulding',
                  '3D Print (FDM)', '3D Print (SLA)', '3D Print (SLS)',
                  '3D Print (DMLS/SLM)', '3D Print (Binder Jet)', 'Sintering',
                  'Composite Layup', 'Vacuum Infusion', 'Plating', 'Polishing'] },
      { id: 'common_forms', label: 'Common forms', type: 'checkbox',
        options: ['Sheet', 'Plate', 'Foil', 'Round Bar', 'Wire', 'Tube',
                  'Angles and Structural Profiles', 'Filament',
                  'Pellet', 'Powder', 'Prepreg'] },
      { id: 'common_form_notes', label: 'Form notes', type: 'text',
        hint: 'Optional notes on available forms' },
      { id: 'usage_frequency', label: 'Usage Frequency', type: 'select', required: true,
        options: ['Common', 'Specialty', 'Exotic'] },
      { id: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'typical_usage',
    title: 'Typical Usage',
    collapsed: true,
    fields: [
      { id: 'typical_usage', label: 'Typical usage', type: 'textarea',
        hint: 'Describe common engineering applications for this material' },
    ],
  },
  {
    id: 'mechanical_common',
    title: 'Mechanical — Common',
    fields: [
      { id: 'youngs_modulus',     label: "Young's Modulus (E)",        type: 'number',
        hint: 'Stiffness in the elastic region',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'poissons_ratio',     label: "Poisson's Ratio (ν)",        type: 'number',
        hint: 'Lateral strain / axial strain (dimensionless, ~0.25–0.45)' },
      { id: 'yield_strength',     label: 'Yield Strength (σ_y)',       type: 'number',
        hint: 'Onset of plastic deformation',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'tensile_strength',   label: 'Tensile Strength (UTS)',     type: 'number',
        hint: 'Maximum stress before fracture',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'compressive_modulus',   label: 'Compressive Modulus',     type: 'number',
        hint: 'Stiffness in compression (often ≈ E; enter if distinct)',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'compressive_strength',  label: 'Compressive Strength',    type: 'number',
        hint: 'Maximum compressive stress (stored in MPa)',
        canonicalUnit: 'MPa', displayUnits: COMP_STRENGTH_UNITS },
      { id: 'usable_temp_range', label: 'Usable Temperature Range', type: 'temprange',
        hint: 'Min and max service temperature' },
    ],
  },
  {
    id: 'mechanical_other',
    title: 'Mechanical — Other',
    collapsed: true,
    fields: [
      { id: 'microyield_strength', label: 'Micro-yield Strength',      type: 'number',
        hint: 'Stress causing 1 µstrain permanent set',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'creep_strength',      label: 'Creep Strength',            type: 'number',
        hint: 'Stress producing 0.1% creep in 1000 h',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
      { id: 'fatigue_sn_curve',    label: 'Fatigue S-N Curve',         type: 'sn',
        hint: 'Maximum stress in cycle (GPa) vs. cycles to failure. All points must share the same stress ratio (R) and test method — fill those in below; do not mix data from different R values, loading types, or notched/unnotched conditions in one curve.' },
      { id: 'fracture_toughness',  label: 'Fracture Toughness (K_IC)', type: 'number',
        hint: 'Critical stress intensity factor',
        canonicalUnit: 'MPa·m^0.5', displayUnits: FRACTURE_UNITS },
      { id: 'hardness',            label: 'Hardness',                  type: 'hardness' },
      { id: 'ductility',           label: 'Ductility (elongation)',     type: 'range3',
        hint: '% elongation at fracture; enter min, max, and/or typical' },
      { id: 'shear_strength',      label: 'Shear Strength',            type: 'number',
        hint: 'Leave blank to compute from yield strength (von Mises)',
        canonicalUnit: 'GPa', displayUnits: PRESSURE_UNITS },
    ],
  },
  {
    id: 'physical',
    title: 'Physical Properties',
    fields: [
      { id: 'density',               label: 'Density (ρ)',             type: 'number',
        hint: 'Mass per unit volume',
        canonicalUnit: 'g/cm³', displayUnits: DENSITY_UNITS },
      { id: 'electrical_conductivity', label: 'Electrical Conductivity', type: 'number',
        hint: '% of International Annealed Copper Standard',
        canonicalUnit: '% IACS', displayUnits: ELECTRICAL_UNITS },
      { id: 'vapour_pressure',       label: 'Vapour Pressure',         type: 'number',
        hint: 'Pa (at 20 °C)' },
      { id: 'thermal_expansion',     label: 'CTE (α)',                 type: 'cte',
        hint: 'Enter single value and/or temperature-dependent table' },
      { id: 'thermal_conductivity',  label: 'Thermal Conductivity (k)', type: 'thermal-table',
        hint: 'Enter single value and/or temperature-dependent table',
        valueKey: 'k', valueLabel: 'k',
        canonicalUnit: 'W/m·K', displayUnits: THERMAL_COND_UNITS },
      { id: 'specific_heat',         label: 'Specific Heat (Cp)',      type: 'thermal-table',
        hint: 'Enter single value and/or temperature-dependent table',
        valueKey: 'cp', valueLabel: 'Cp',
        canonicalUnit: 'J/(kg·K)', displayUnits: SPECIFIC_HEAT_UNITS },
      { id: 'thermal_diffusivity',   label: 'Thermal Diffusivity (D)', type: 'number',
        hint: 'Leave blank to compute from k, ρ, Cp',
        canonicalUnit: 'cm²/s', displayUnits: THERMAL_DIFF_UNITS },
      { id: 'melting_point_tm',    label: 'Melting Point (Tm)',    type: 'number',
        canonicalUnit: '°C', displayUnits: TEMPERATURE_UNITS },
      { id: 'glass_transition_tg', label: 'Glass Transition (Tg)', type: 'number',
        canonicalUnit: '°C', displayUnits: TEMPERATURE_UNITS },
      { id: 'magnetic_classification', label: 'Magnetic Classification', type: 'magclass' },
    ],
  },
];
