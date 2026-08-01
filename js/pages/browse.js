/**
 * browse.js — Browse/search page logic.
 *
 * Loads the material manifest, populates filter controls, renders
 * material cards, and manages comparison selection state.
 */

import { loadManifest } from '../core/loader.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const USAGE_FREQUENCIES = ['Common', 'Specialty', 'Exotic'];

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function frequencyBadge(freq) {
  if (!freq) return '';
  const cls = freq === 'Exotic' ? 'badge-exotic' : freq === 'Specialty' ? 'badge-specialty' : 'badge-common';
  return `<span class="badge ${cls}">${escHtml(freq)}</span>`;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_COMPARE = 10;

const FABRICATION_PROCESSES = [
  'Machining', 'Welding', 'Bending', 'Casting', 'Extrusion',
  '3D Print (FDM)', '3D Print (SLA)', '3D Print (SLS)',
  '3D Print (DMLS/SLM)', '3D Print (Binder Jet)', 'Sintering',
  'Composite Layup', 'Vacuum Infusion', 'Plating', 'Polishing',
];

const COMMON_FORMS = [
  'Sheet', 'Plate', 'Foil', 'Round Bar', 'Wire', 'Tube',
  'Angles and Structural Profiles', 'Filament', 'Pellet', 'Powder', 'Prepreg',
];

// ── State ──────────────────────────────────────────────────────────────────

let allMaterials = [];
const compareSet = new Set();   // slugs selected for comparison

// ── URL param helpers ──────────────────────────────────────────────────────

function readFiltersFromURL() {
  const p = new URLSearchParams(location.search);
  return {
    search:     p.get('q') || '',
    categories: new Set(p.getAll('cat')),
    fab:        new Set(p.getAll('fab')),
    forms:      new Set(p.getAll('form')),
    frequency:  new Set(p.getAll('freq')),
    magnetic:   new Set(p.getAll('magnetic')),
  };
}

function writeFiltersToURL(f) {
  const p = new URLSearchParams();
  if (f.search)    p.set('q', f.search);
  for (const c of f.categories) p.append('cat', c);
  for (const c of f.fab)        p.append('fab', c);
  for (const c of f.forms)      p.append('form', c);
  for (const fr of f.frequency) p.append('freq', fr);
  for (const m of f.magnetic)   p.append('magnetic', m);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ── Filter logic ───────────────────────────────────────────────────────────

function materialMatches(mat, f) {
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (mat.name + ' ' + mat.category).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.categories.size > 0 && !f.categories.has(mat.category)) return false;
  if (f.fab.size > 0) {
    const set = new Set(mat.fabrication_processes || []);
    if (![...f.fab].some(v => set.has(v))) return false;
  }
  if (f.forms.size > 0) {
    const set = new Set(mat.common_forms || []);
    if (![...f.forms].some(v => set.has(v))) return false;
  }
  if (f.frequency.size > 0 && !f.frequency.has(mat.usage_frequency)) return false;
  if (f.magnetic.size > 0 && !f.magnetic.has(mat.magnetic_classification)) return false;
  return true;
}

// ── Number formatting ──────────────────────────────────────────────────────

function fmt(value, unit, decimals = 1) {
  if (value == null) return null;
  return `${Number(value.toFixed(decimals))} ${unit}`;
}

// ── Card rendering ─────────────────────────────────────────────────────────

function renderCard(mat) {
  const selected   = compareSet.has(mat.slug);
  const catClass   = mat.category.toLowerCase().replace(/\s+/g, '-');
  const yieldMPa   = mat.yield_strength   != null ? mat.yield_strength   * 1000 : null;
  const utsMPa     = mat.tensile_strength != null ? mat.tensile_strength * 1000 : null;
  const eStr       = fmt(mat.youngs_modulus, 'GPa');
  const sigStr     = fmt(yieldMPa, 'MPa', 0);
  const utsStr     = fmt(utsMPa,   'MPa', 0);
  const rhoStr     = fmt(mat.density, 'g/cm³', 2);

  function propRow(label, title, value) {
    const display = value ?? '—';
    const cls     = value == null ? ' class="missing"' : '';
    return `
      <div class="prop-row">
        <dt title="${title}">${label}</dt>
        <dd${cls}>${display}</dd>
      </div>`;
  }

  return `
    <div class="material-card${selected ? ' is-selected' : ''}" data-slug="${mat.slug}">
      <div class="card-header">
        <h2 class="card-name">${escHtml(mat.name)}</h2>
        <div class="card-badges">
          <span class="badge badge-${catClass}">${escHtml(mat.category)}</span>
          ${frequencyBadge(mat.usage_frequency)}
        </div>
      </div>
      <dl class="card-props">
        ${propRow('E',                        "Young's Modulus — stiffness in the elastic region",  eStr)}
        ${propRow('σ<sub>y</sub>',            'Yield Strength — onset of permanent deformation',    sigStr)}
        ${propRow('UTS',                      'Ultimate Tensile Strength — maximum stress before failure', utsStr)}
        ${propRow('ρ',                        'Density',                                            rhoStr)}
      </dl>
      <div class="card-footer">
        <label class="compare-label">
          <input type="checkbox" class="compare-check"
                 data-slug="${mat.slug}" ${selected ? 'checked' : ''}>
          Compare
        </label>
        <a href="material.html?slug=${mat.slug}" class="btn-view">View →</a>
      </div>
    </div>`;
}

// ── Grid rendering ─────────────────────────────────────────────────────────

let visibleSlugs = [];   // slugs currently shown in grid (for Compare All Filtered)

function renderGrid(filters) {
  const grid    = document.getElementById('materials-grid');
  const counter = document.getElementById('result-count');
  const visible = allMaterials.filter(m => materialMatches(m, filters));
  visibleSlugs  = visible.map(m => m.slug);

  counter.textContent = `${visible.length} of ${allMaterials.length} material${allMaterials.length === 1 ? '' : 's'}`;

  if (visible.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <strong>No materials match these filters.</strong>
        <p>Try broadening your search or clearing some filters.</p>
      </div>`;
    updateCompareBar();
    return;
  }

  grid.innerHTML = visible.map(renderCard).join('');

  // Wire compare checkboxes
  grid.querySelectorAll('.compare-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const slug = e.target.dataset.slug;
      if (e.target.checked) {
        if (compareSet.size >= MAX_COMPARE) {
          e.target.checked = false;
          alert(`You can compare up to ${MAX_COMPARE} materials at a time.`);
          return;
        }
        compareSet.add(slug);
      } else {
        compareSet.delete(slug);
      }
      // Update card selection style without full re-render
      e.target.closest('.material-card').classList.toggle('is-selected', e.target.checked);
      updateCompareBar();
    });
  });

  updateCompareBar();
}

// ── Compare bar ────────────────────────────────────────────────────────────

function updateCompareBar() {
  const bar      = document.getElementById('compare-bar');
  const count    = document.getElementById('compare-count');
  const btn      = document.getElementById('btn-compare');
  const btnAll   = document.getElementById('btn-compare-all-filtered');

  sessionStorage.setItem('compareSet', [...compareSet].join(','));

  // "Compare All Filtered" button visibility
  const n = visibleSlugs.length;
  if (btnAll) {
    const show = n >= 2;
    btnAll.hidden = !show;
    if (show) {
      const tooMany = n > MAX_COMPARE;
      btnAll.disabled = tooMany;
      btnAll.title    = tooMany ? `Max ${MAX_COMPARE} for comparison` : '';
      btnAll.textContent = `Compare All Filtered (${n}) →`;
    }
  }

  if (compareSet.size === 0) {
    if (btnAll && !btnAll.hidden) {
      // Keep bar visible to expose the Compare All Filtered button
      bar.hidden = false;
      count.textContent = '';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    } else {
      bar.hidden = true;
    }
    return;
  }

  bar.hidden = false;
  count.textContent = `${compareSet.size} selected`;
  btn.disabled = compareSet.size < 2;
  btn.style.opacity = compareSet.size < 2 ? '0.5' : '1';
}

// ── Sidebar builder ────────────────────────────────────────────────────────

function buildSidebar(currentFilters) {
  // Category checkboxes
  const catGroup = document.getElementById('filter-category');
  catGroup.innerHTML = ['Metal', 'Plastic', 'Ceramic', 'Composite', 'Glass', 'Natural Material', 'Elastomer'].map(cat => `
    <label class="filter-check">
      <input type="checkbox" name="cat" value="${cat}"
             ${currentFilters.categories.has(cat) ? 'checked' : ''}>
      ${cat}
    </label>`).join('');

  // Fabrication process checkboxes (collapsed by default — long list)
  const fabGroup = document.getElementById('filter-fabrication');
  const SHORT_FAB = FABRICATION_PROCESSES.slice(0, 5);
  const LONG_FAB  = FABRICATION_PROCESSES.slice(5);
  fabGroup.innerHTML =
    SHORT_FAB.map(p => checkboxHtml('fab', p, currentFilters.fab)).join('') +
    `<details><summary>${LONG_FAB.length} more…</summary>` +
    LONG_FAB.map(p => checkboxHtml('fab', p, currentFilters.fab)).join('') +
    `</details>`;

  // Common forms checkboxes
  const formGroup = document.getElementById('filter-forms');
  formGroup.innerHTML = COMMON_FORMS.map(f => checkboxHtml('form', f, currentFilters.forms)).join('');

  // Usage frequency checkboxes
  const freqGroup = document.getElementById('filter-frequency');
  freqGroup.innerHTML = USAGE_FREQUENCIES.map(fr => checkboxHtml('freq', fr, currentFilters.frequency)).join('');

  // Magnetic classification checkboxes
  const magGroup = document.getElementById('filter-magnetic');
  if (magGroup) {
    magGroup.innerHTML = ['Ferromagnetic', 'Paramagnetic', 'Diamagnetic'].map(m => checkboxHtml('magnetic', m, currentFilters.magnetic)).join('');
  }

  // Search input
  document.getElementById('search-input').value = currentFilters.search;
}

function checkboxHtml(name, value, activeSet) {
  return `
    <label class="filter-check">
      <input type="checkbox" name="${name}" value="${value}"
             ${activeSet.has(value) ? 'checked' : ''}>
      ${value}
    </label>`;
}

// ── Event wiring ───────────────────────────────────────────────────────────

function collectFilters() {
  const f = {
    search:     document.getElementById('search-input').value.trim(),
    categories: new Set(),
    fab:        new Set(),
    forms:      new Set(),
    frequency:  new Set(),
    magnetic:   new Set(),
  };
  document.querySelectorAll('input[name="cat"]:checked').forEach(el => f.categories.add(el.value));
  document.querySelectorAll('input[name="fab"]:checked').forEach(el => f.fab.add(el.value));
  document.querySelectorAll('input[name="form"]:checked').forEach(el => f.forms.add(el.value));
  document.querySelectorAll('input[name="freq"]:checked').forEach(el => f.frequency.add(el.value));
  document.querySelectorAll('input[name="magnetic"]:checked').forEach(el => f.magnetic.add(el.value));
  return f;
}

function buildAdvancedSelectURL(f) {
  const p = new URLSearchParams();
  for (const c of f.categories) p.append('cat', c);
  for (const c of f.fab)        p.append('fab', c);
  for (const c of f.forms)      p.append('form', c);
  for (const fr of f.frequency) p.append('freq', fr);
  for (const m of f.magnetic)   p.append('magnetic', m);
  const qs = p.toString();
  return `select.html${qs ? '?' + qs : ''}`;
}

function updateAdvancedNavLink(f) {
  const navLink = document.querySelector('a[href^="select.html"]');
  if (navLink) navLink.href = buildAdvancedSelectURL(f);
}

function onFilterChange() {
  const f = collectFilters();
  writeFiltersToURL(f);
  updateAdvancedNavLink(f);
  renderGrid(f);
}

function wireSidebar() {
  const sidebar = document.getElementById('filter-sidebar');
  sidebar.addEventListener('change', onFilterChange);

  // Debounce text search
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(onFilterChange, 200);
  });

  document.getElementById('filter-reset').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    const empty = { search: '', categories: new Set(), fab: new Set(), forms: new Set(), frequency: new Set(), magnetic: new Set() };
    buildSidebar(empty);
    renderGrid(empty);
    updateAdvancedNavLink(empty);
    compareSet.clear();
    updateCompareBar();
  });

  const btnAdvanced = document.getElementById('btn-advanced-select');
  if (btnAdvanced) {
    btnAdvanced.addEventListener('click', () => {
      location.href = buildAdvancedSelectURL(collectFilters());
    });
  }
}

function wireCompareBar() {
  document.getElementById('btn-compare').addEventListener('click', () => {
    if (compareSet.size < 2) return;
    location.href = `compare.html?slugs=${[...compareSet].join(',')}`;
  });
  document.getElementById('btn-clear-compare').addEventListener('click', () => {
    compareSet.clear();
    updateCompareBar();
    renderGrid(collectFilters());
  });
  const btnAll = document.getElementById('btn-compare-all-filtered');
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      if (visibleSlugs.length < 2 || visibleSlugs.length > MAX_COMPARE) return;
      location.href = `compare.html?slugs=${visibleSlugs.join(',')}`;
    });
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const grid = document.getElementById('materials-grid');

  // Show loading skeletons
  grid.innerHTML = Array(6).fill('<div class="skeleton skeleton-card"></div>').join('');

  try {
    const manifest = await loadManifest();
    allMaterials = manifest.materials;
  } catch (err) {
    // Safe: all content below is hardcoded — no user input interpolated
    grid.innerHTML = `<p class="error-message">
      Could not load materials. Make sure you are serving the site from a web server,
      not opening the file directly in the browser.<br><br>
      Run: <code>python -m http.server</code> then open
      <a href="http://localhost:8000">http://localhost:8000</a>
    </p>`;
    return;
  }

  const filters = readFiltersFromURL();
  buildSidebar(filters);
  wireSidebar();
  wireCompareBar();
  updateAdvancedNavLink(filters);
  renderGrid(filters);
}

init();
