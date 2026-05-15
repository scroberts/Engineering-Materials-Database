/**
 * compare.js — Material comparison page.
 *
 * Reads ?slugs=a,b,c from the URL, loads all materials in parallel, then
 * renders bar charts per property group, S-N curve overlay, CTE vs
 * temperature overlay, and a merit-index table (M1–M13).
 */

import { loadMaterialBatch } from '../core/loader.js';
import { migrateToLatest } from '../core/schema.js';
import { shearModulus, shearStrengthVonMises, MERIT_INDICES } from '../core/derived.js';
import { convertPressure, convertCompStrength, convertFracture, fmt } from '../core/units.js';

// ── Palette ────────────────────────────────────────────────────────────────

const PALETTE = [
  '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
];

// ── State ──────────────────────────────────────────────────────────────────

let materials  = [];
let unitSystem = 'metric';      // 'metric' | 'imperial'
const charts   = new Map();     // canvasId → Chart instance

// ── Unit helpers ───────────────────────────────────────────────────────────

const pressureUnit        = () => unitSystem === 'metric' ? 'GPa'        : 'ksi';
const strengthUnit        = () => unitSystem === 'metric' ? 'MPa'        : 'ksi';
const fractureUnit        = () => unitSystem === 'metric' ? 'MPa·m^0.5' : 'ksi·in^0.5';
const fractureUnitDisplay = () => unitSystem === 'metric' ? 'MPa·m½'    : 'ksi·in½';

function toPressure(gpa) {
  if (gpa == null) return null;
  return unitSystem === 'imperial' ? convertPressure(gpa, 'ksi') : gpa;
}

function toStrength(mpa) {
  if (mpa == null) return null;
  return unitSystem === 'imperial' ? convertCompStrength(mpa, 'ksi') : mpa;
}

function toFracture(val) {
  if (val == null) return null;
  return unitSystem === 'imperial' ? convertFracture(val, 'ksi·in^0.5') : val;
}

// CTE: µm/m·°C and µm/m·K are identical (same degree size); Imperial = µin/in·°F = CTE / 1.8
const cteUnit   = () => unitSystem === 'imperial' ? 'µin/in·°F'     : 'µm/m·K';
const densUnit  = () => unitSystem === 'imperial' ? 'lb/in³'         : 'g/cm³';
const condUnit  = () => unitSystem === 'imperial' ? 'BTU/(hr·ft·°F)' : 'W/m·K';
const toCTE     = (v) => v != null ? (unitSystem === 'imperial' ? v / 1.8      : v) : null;
const toDensity = (v) => v != null ? (unitSystem === 'imperial' ? v * 0.036127 : v) : null;
const toCond    = (v) => v != null ? (unitSystem === 'imperial' ? v * 0.57779  : v) : null;

// ── Material accessors ─────────────────────────────────────────────────────

function v(section, key) { return section?.[key]?.value ?? null; }

function getProps(mat) {
  const mc = mat.mechanical_common ?? {};
  const mo = mat.mechanical_other  ?? {};
  const ph = mat.physical          ?? {};

  const E  = v(mc, 'youngs_modulus');
  const G  = shearModulus(mat);

  const sigY = v(mc, 'yield_strength');
  const uts  = v(mc, 'tensile_strength');
  const cs   = v(mc, 'compressive_strength');           // already MPa
  const ss   = v(mo, 'shear_strength') ?? shearStrengthVonMises(mat);

  const kic  = v(mo, 'fracture_toughness');
  const rho  = v(ph, 'density');
  const cte  = ph.thermal_expansion?.value ?? null;
  const k    = v(ph, 'thermal_conductivity');

  return { E, G, sigY, uts, cs, ss, kic, rho, cte, k };
}

// ── Display name ───────────────────────────────────────────────────────────

function shortName(mat) {
  const n = mat.identification?.name ?? mat.slug;
  return n.length > 26 ? n.slice(0, 24) + '…' : n;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Convert a formula string using _subscript and ^superscript notation into HTML.
 * e.g. 'σ_y^½ / ρ' → 'σ<sub>y</sub><sup>½</sup> / ρ'
 */
function fmtFormula(label) {
  return escHtml(label)
    .replace(/_([A-Za-z0-9]+)/g, '<sub>$1</sub>')
    .replace(/\^([^\s/()^]+)/g, '<sup>$1</sup>');
}

// ── Chart utilities ────────────────────────────────────────────────────────

function destroyChart(id) {
  if (charts.has(id)) { charts.get(id).destroy(); charts.delete(id); }
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, padding: 8 } },
  },
};

function makeDataset(mat, i, data) {
  const color = PALETTE[i % PALETTE.length];
  return {
    label: shortName(mat),
    data,
    backgroundColor: color + 'bf',
    borderColor: color,
    borderWidth: 1,
  };
}

/**
 * Grouped bar chart: X = property labels, one dataset (color) per material.
 * @param {string} id       — canvas element id
 * @param {string} title    — chart title
 * @param {string[]} labels — property names on X-axis
 * @param {Array[]}  values — values[i][j] = material i, property j (null = missing)
 * @param {string} yLabel   — Y-axis unit string
 * @param {number} decimals — tooltip decimal places
 */
function makeBarChart(id, title, labels, values, yLabel, decimals = 2) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return;

  const datasets = materials.map((mat, i) =>
    makeDataset(mat, i, values[i])
  );

  const hasData = datasets.some(ds => ds.data.some(v => v != null));
  if (!hasData) {
    canvas.closest('.chart-card')?.classList.add('chart-no-data');
    canvas.closest('.chart-card').innerHTML =
      `<div class="chart-empty-msg"><span>${title}</span><p>No data available for selected materials.</p></div>`;
    return;
  }

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: {
          display: true,
          text: title,
          font: { size: 13, weight: '600' },
          color: '#1e293b',
          padding: { bottom: 6 },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.y;
              return val == null
                ? `${ctx.dataset.label}: —`
                : `${ctx.dataset.label}: ${Number(val.toFixed(decimals))} ${yLabel}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: {
          beginAtZero: true,
          title: { display: true, text: yLabel, color: '#64748b', font: { size: 11 } },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });

  charts.set(id, chart);
}

// ── Bar chart renderers ────────────────────────────────────────────────────

function renderStiffnessChart() {
  const labels = ["Young's Modulus (E)", 'Shear Modulus (G)'];
  const values = materials.map(mat => {
    const { E, G } = getProps(mat);
    return [toPressure(E), toPressure(G)];
  });
  makeBarChart('chart-stiffness', 'Stiffness', labels, values, pressureUnit(), 2);
}

function renderStrengthChart() {
  const labels = ['Yield Strength (σ_y)', 'Tensile Strength (UTS)', 'Comp. Strength', 'Shear Strength'];
  const values = materials.map(mat => {
    const { sigY, uts, cs, ss } = getProps(mat);
    return [
      toStrength(sigY != null ? sigY * 1000 : null),
      toStrength(uts  != null ? uts  * 1000 : null),
      toStrength(cs),                                   // already MPa
      toStrength(ss   != null ? ss   * 1000 : null),
    ];
  });
  makeBarChart('chart-strength', 'Strength', labels, values, strengthUnit(), 1);
}

function renderFractureChart() {
  const labels = ['Fracture Toughness (K_IC)'];
  const values = materials.map(mat => [toFracture(getProps(mat).kic)]);
  makeBarChart('chart-fracture', 'Fracture Toughness', labels, values, fractureUnitDisplay(), 2);
}

function renderDensityChart() {
  const labels  = ['Density (ρ)'];
  const values  = materials.map(mat => [toDensity(getProps(mat).rho)]);
  const decimals = unitSystem === 'imperial' ? 4 : 2;
  makeBarChart('chart-density', 'Density', labels, values, densUnit(), decimals);
}

function renderCTEChart() {
  const labels = ['Thermal Expansion (α)'];
  const values = materials.map(mat => [toCTE(getProps(mat).cte)]);
  makeBarChart('chart-cte', 'Thermal Expansion (CTE)', labels, values, cteUnit(), 2);
}

function renderConductivityChart() {
  const labels = ['Thermal Conductivity (k)'];
  const values = materials.map(mat => [toCond(getProps(mat).k)]);
  makeBarChart('chart-conductivity', 'Thermal Conductivity', labels, values, condUnit(), 1);
}

// ── S-N curve chart ────────────────────────────────────────────────────────

function renderSNChart() {
  const section = document.getElementById('sn-section');
  if (!section) return;

  const matsWithSN = materials.filter(
    m => (m.mechanical_other?.fatigue_sn_curve?.points?.length ?? 0) > 0
  );

  if (matsWithSN.length === 0) { section.hidden = true; return; }
  section.hidden = false;

  destroyChart('chart-sn');
  const canvas = document.getElementById('chart-sn');
  if (!canvas) return;

  const sUnit    = strengthUnit();
  const toStress = (gpa) => {
    const mpa = gpa * 1000;
    return unitSystem === 'imperial' ? mpa * 0.145038 : mpa;
  };

  const datasets = matsWithSN.map(mat => {
    const i      = materials.indexOf(mat);
    const color  = PALETTE[i % PALETTE.length];
    const points = mat.mechanical_other.fatigue_sn_curve.points;
    return {
      label: shortName(mat),
      data: points.map(pt => ({ x: pt.cycles, y: toStress(pt.stress) })),
      borderColor: color,
      backgroundColor: color + '33',
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.2,
      fill: false,
    };
  });

  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: {
          display: true,
          text: 'Fatigue S–N Curve',
          font: { size: 13, weight: '600' },
          color: '#1e293b',
          padding: { bottom: 6 },
        },
        tooltip: {
          callbacks: {
            label: ctx =>
              `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ${sUnit}` +
              ` at ${ctx.parsed.x.toExponential(1)} cycles`,
          },
        },
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'Cycles to Failure', color: '#64748b', font: { size: 11 } },
          ticks: { font: { size: 11 } },
        },
        y: {
          title: { display: true, text: `Stress Amplitude (${sUnit})`, color: '#64748b', font: { size: 11 } },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });
  charts.set('chart-sn', chart);
}

// ── CTE vs Temperature chart ───────────────────────────────────────────────

function renderCTETempChart() {
  const section = document.getElementById('cte-temp-section');
  if (!section) return;

  // Temperature conversion helpers (data stored in °C)
  const tempUnit = unitSystem === 'imperial' ? '°F' : 'K';
  const toTempX  = unitSystem === 'imperial'
    ? (c) => Number((c * 9 / 5 + 32).toFixed(1))
    : (c) => Math.round(c + 273.15);

  const matsWithTable = materials.filter(
    m => (m.physical?.thermal_expansion?.table?.length ?? 0) > 1
  );

  // ── Scalar table fallback ─────────────────────────────────────────────────
  if (matsWithTable.length === 0) {
    const matsWithCTE = materials.filter(
      m => m.physical?.thermal_expansion?.value != null
    );
    if (matsWithCTE.length === 0) { section.hidden = true; return; }

    section.hidden = false;
    destroyChart('chart-cte-temp');

    // Update section heading to reflect table mode
    const heading = section.querySelector('.compare-section-title');
    if (heading) heading.textContent = 'Thermal Expansion (CTE)';

    // Replace chart area with a comparison table
    const area = section.querySelector('.chart-card, .cte-scalar-wrap');
    if (area) {
      const rows = matsWithCTE.map(mat => {
        const i     = materials.indexOf(mat);
        const color = PALETTE[i % PALETTE.length];
        const cte   = mat.physical.thermal_expansion.value;
        return `<tr>
          <td><span class="cte-dot" style="background:${color}"></span>${escHtml(shortName(mat))}</td>
          <td class="cte-scalar-val">${fmt(toCTE(cte), null, 2)} ${cteUnit()}</td>
        </tr>`;
      }).join('');
      area.className = 'cte-scalar-wrap';
      area.innerHTML = `
        <table class="cte-scalar-table">
          <thead><tr><th>Material</th><th>CTE (${cteUnit()})</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }
    return;
  }

  // ── Line chart ────────────────────────────────────────────────────────────
  section.hidden = false;
  destroyChart('chart-cte-temp');

  // Restore chart heading and ensure canvas exists
  const heading = section.querySelector('.compare-section-title');
  if (heading) heading.textContent = 'CTE vs Temperature';

  const area = section.querySelector('.chart-card, .cte-scalar-wrap');
  if (area) {
    area.className = 'chart-card chart-wide';
    area.innerHTML = '<canvas id="chart-cte-temp"></canvas>';
  }

  const canvas = document.getElementById('chart-cte-temp');
  if (!canvas) return;

  const datasets = matsWithTable.map(mat => {
    const i     = materials.indexOf(mat);
    const color = PALETTE[i % PALETTE.length];
    const table = mat.physical.thermal_expansion.table;
    return {
      label: shortName(mat),
      data: table.map(pt => ({ x: toTempX(pt.temp), y: toCTE(pt.cte) })),
      borderColor: color,
      backgroundColor: color + '33',
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      fill: false,
    };
  });

  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: {
          display: true,
          text: 'CTE vs Temperature',
          font: { size: 13, weight: '600' },
          color: '#1e293b',
          padding: { bottom: 6 },
        },
        tooltip: {
          callbacks: {
            label: ctx =>
              `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${cteUnit()}` +
              ` at ${ctx.parsed.x} ${tempUnit}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: `Temperature (${tempUnit})`, color: '#64748b', font: { size: 11 } },
          ticks: { font: { size: 11 } },
        },
        y: {
          title: { display: true, text: `CTE (${cteUnit()})`, color: '#64748b', font: { size: 11 } },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });
  charts.set('chart-cte-temp', chart);
}

// ── Merit index table ──────────────────────────────────────────────────────

function renderMeritTable() {
  const container = document.getElementById('merit-table-container');
  if (!container) return;

  // Compute all values per index per material
  const rows = MERIT_INDICES.map(idx => {
    const vals = materials.map(mat => idx.fn(mat));
    return { idx, vals };
  });

  // Build header row
  const matHeaders = materials.map((mat, i) => {
    const color = PALETTE[i % PALETTE.length];
    return `<th>
      <span class="merit-mat-dot" style="background:${color}"></span>
      ${escHtml(shortName(mat))}
    </th>`;
  }).join('');

  // Build data rows
  const dataRows = rows.map(({ idx, vals }) => {
    const validVals = vals.filter(v => v != null);
    const minVal    = validVals.length ? Math.min(...validVals) : null;
    const maxVal    = validVals.length ? Math.max(...validVals) : null;
    const range     = (maxVal != null && minVal != null && maxVal !== minVal)
      ? maxVal - minVal : null;

    const cells = vals.map((val, i) => {
      if (val == null) return `<td class="merit-cell"><span class="merit-missing">—</span></td>`;

      const isBest = idx.higherIsBetter
        ? val === maxVal
        : val === minVal;

      // Normalised bar width: full bar for best, proportional for others
      let pct = 100;
      if (range != null && range > 0) {
        pct = idx.higherIsBetter
          ? ((val - minVal) / range) * 100
          : ((maxVal - val) / range) * 100;
      }

      const color  = PALETTE[i % PALETTE.length];
      const digits = Math.abs(val) >= 100 ? 1 : Math.abs(val) >= 1 ? 3 : 5;

      return `<td class="merit-cell${isBest ? ' merit-best' : ''}">
        <span class="merit-val">${Number(val.toFixed(digits))}</span>
        <div class="merit-bar-wrap">
          <div class="merit-bar" style="width:${pct.toFixed(1)}%;background:${color}"></div>
        </div>
      </td>`;
    }).join('');

    const arrow = idx.higherIsBetter
      ? '<span class="merit-dir merit-up" title="Higher is better">↑</span>'
      : '<span class="merit-dir merit-down" title="Lower is better">↓</span>';

    return `<tr>
      <td class="merit-id">${idx.id}</td>
      <td class="merit-label" title="${escHtml(idx.description)}">
        ${fmtFormula(idx.label)} ${arrow}
      </td>
      <td class="merit-group">${escHtml(idx.group)}</td>
      ${cells}
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="merit-table">
      <thead>
        <tr>
          <th class="merit-id">Index</th>
          <th class="merit-label">Formula</th>
          <th class="merit-group">Group</th>
          ${matHeaders}
        </tr>
      </thead>
      <tbody>${dataRows}</tbody>
    </table>`;
}

// ── All charts re-render on unit change ────────────────────────────────────

function renderAllCharts() {
  renderStiffnessChart();
  renderStrengthChart();
  renderFractureChart();
  renderDensityChart();
  renderCTEChart();
  renderConductivityChart();
  renderSNChart();
  renderCTETempChart();
}

// ── Material strip ─────────────────────────────────────────────────────────

function renderMaterialStrip() {
  const chips = materials.map((mat, i) => {
    const id       = mat.identification ?? {};
    const catClass = (id.category ?? 'metal').toLowerCase().replace(/\s+/g, '-');
    const color    = PALETTE[i % PALETTE.length];
    return `
      <div class="mat-chip" style="border-top: 3px solid ${color}">
        <div class="mat-chip-name">${escHtml(id.name ?? id.slug)}</div>
        <div class="mat-chip-meta">
          <span class="badge badge-${catClass}">${escHtml(id.category ?? '')}</span>
          ${id.usage_frequency
            ? `<span class="badge badge-${id.usage_frequency === 'Exotic' ? 'exotic' : id.usage_frequency === 'Specialty' ? 'specialty' : 'common'}">${escHtml(id.usage_frequency)}</span>`
            : ''}
        </div>
        <a class="mat-chip-link" href="material.html?slug=${encodeURIComponent(id.slug ?? '')}">
          View detail →
        </a>
      </div>`;
  }).join('');

  return `
    <div class="compare-header">
      <a href="index.html" class="compare-back">← Back to Browse</a>
      <h1 class="compare-title">Comparing ${materials.length} Material${materials.length !== 1 ? 's' : ''}</h1>
      <div class="mat-strip">${chips}</div>
    </div>`;
}

// ── Unit toolbar ───────────────────────────────────────────────────────────

function renderToolbarHTML() {
  return `
    <div class="unit-toolbar compare-toolbar">
      <div class="unit-toolbar-group">
        <span class="unit-toolbar-label">Units:</span>
        <button class="unit-preset-btn is-active" data-preset="metric">Metric</button>
        <button class="unit-preset-btn" data-preset="imperial">Imperial</button>
      </div>
    </div>`;
}

function wireToolbar() {
  document.querySelectorAll('.unit-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.preset === unitSystem) return;
      document.querySelectorAll('.unit-preset-btn')
        .forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      unitSystem = btn.dataset.preset;
      renderAllCharts();
    });
  });
}

// ── Main page HTML shell ───────────────────────────────────────────────────

function renderPage() {
  const layout = document.getElementById('compare-layout');

  layout.innerHTML = `
    ${renderMaterialStrip()}
    ${renderToolbarHTML()}

    <div class="compare-body">

      <section class="compare-section">
        <h2 class="compare-section-title">Property Charts</h2>
        <div class="chart-grid">
          <div class="chart-card"><canvas id="chart-stiffness"></canvas></div>
          <div class="chart-card"><canvas id="chart-strength"></canvas></div>
          <div class="chart-card"><canvas id="chart-fracture"></canvas></div>
          <div class="chart-card"><canvas id="chart-density"></canvas></div>
          <div class="chart-card"><canvas id="chart-cte"></canvas></div>
          <div class="chart-card"><canvas id="chart-conductivity"></canvas></div>
        </div>
      </section>

      <section class="compare-section" id="sn-section">
        <h2 class="compare-section-title">Fatigue S–N Curve</h2>
        <div class="chart-card chart-wide">
          <canvas id="chart-sn"></canvas>
        </div>
      </section>

      <section class="compare-section" id="cte-temp-section">
        <h2 class="compare-section-title">CTE vs Temperature</h2>
        <div class="chart-card chart-wide">
          <canvas id="chart-cte-temp"></canvas>
        </div>
      </section>

      <section class="compare-section">
        <h2 class="compare-section-title">
          Merit Indices (M1–M13)
          <span class="merit-legend">
            <span class="merit-up">↑</span> higher is better &nbsp;
            <span class="merit-down">↓</span> lower is better &nbsp;
            <span class="merit-best-swatch"></span> best in class
          </span>
        </h2>
        <div class="merit-table-wrap" id="merit-table-container">
          <!-- populated by renderMeritTable() -->
        </div>
      </section>

    </div>`;
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const layout = document.getElementById('compare-layout');
  const params = new URLSearchParams(location.search);
  let slugs = (params.get('slugs') ?? '').split(',').map(s => s.trim()).filter(Boolean);

  // Fall back to the selection persisted by the browse page (nav link click)
  if (slugs.length < 2) {
    const stored = (sessionStorage.getItem('compareSet') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (stored.length >= 2) slugs = stored;
  }

  if (slugs.length < 2) {
    layout.innerHTML = `
      <div class="compare-empty">
        <strong>Select at least two materials to compare.</strong>
        <p>Go to <a href="index.html">Browse</a>, check the Compare box on two or more
        material cards, then click <em>Compare →</em>.</p>
      </div>`;
    return;
  }

  // Loading skeleton
  layout.innerHTML = `
    <div class="compare-loading">
      ${Array(slugs.length).fill('<div class="skeleton skeleton-chip"></div>').join('')}
    </div>`;

  try {
    const raw = await loadMaterialBatch(slugs);
    materials  = raw.map(migrateToLatest);
  } catch (err) {
    layout.innerHTML = `<div class="compare-error">
      <strong>Could not load materials.</strong><br>${escHtml(err.message)}<br><br>
      Make sure you're serving from a web server (<code>python -m http.server</code>).
      <br><br><a href="index.html">← Back to browse</a>
    </div>`;
    return;
  }

  document.title = `Compare ${materials.length} materials — Materials Database`;

  renderPage();
  renderAllCharts();
  renderMeritTable();
  wireToolbar();
}

init();
