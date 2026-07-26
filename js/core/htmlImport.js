/**
 * htmlImport.js — Client-side port of tools/parse_refs.py.
 *
 * Parses a saved material-reference HTML file (AZoM, MakeItFrom, NIST, etc.)
 * directly in the browser using DOMParser, so submit.js's "Pre-fill from HTML"
 * button can populate the form without the Python download/parse pipeline.
 *
 * IMPORTANT: this duplicates the site-scraping rules in tools/parse_refs.py.
 * The two are NOT kept in sync automatically — if a site's page layout
 * changes, both files need updating. See CLAUDE.md for the reasoning behind
 * accepting this duplication. Each parser below cites its Python counterpart
 * (function/class + line range) to make that easier.
 */

// ── Text/DOM helpers (no BeautifulSoup equivalent needed — replicate get_text) ──

/** Approximates BeautifulSoup's el.get_text(" ", strip=True). */
function getText(el) {
  if (!el) return '';
  const parts = [];
  el.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent.trim();
      if (t) parts.push(t);
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const t = getText(n);
      if (t) parts.push(t);
    }
  });
  return parts.join(' ');
}

function cells(tr) {
  return Array.from(tr.querySelectorAll('td, th')).map(getText);
}

function classMatches(el, regex) {
  return (el.className || '').toString().split(/\s+/).some(c => regex.test(c));
}

function findAllByClass(root, regex) {
  return Array.from(root.querySelectorAll('*')).filter(el => classMatches(el, regex));
}

function findFirstByClass(root, regex) {
  return Array.from(root.querySelectorAll('*')).find(el => classMatches(el, regex)) ?? null;
}

function tablesByClass(doc, regex) {
  return Array.from(doc.querySelectorAll('table')).filter(t => classMatches(t, regex));
}

/** BS4's find_previous(tags) — nearest matching element preceding `el` in document order. */
function findPrevious(el, selector, doc) {
  let best = null;
  for (const c of doc.querySelectorAll(selector)) {
    if (c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = c;
  }
  return best;
}

// ── Value/unit helpers (ported from tools/parse_refs.py:34-79) ──

function num(s) {
  if (!s) return null;
  s = s.replace(/−/g, '-').replace(/–/g, '-').replace(/,/g, '');
  s = s.replace(/([-+]?\d+\.?\d*)\s*[x×]\s*10\^([+-]?\d+)/g, '$1e$2');
  const m = s.match(/[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const SCI_X_RE = /([-+]?\d[\d,]*\.?\d*)\s*[x×]\s*10\^([+-]?\d+)/g;

function splitValUnit(cell) {
  if (!cell) return null;
  const c = cell.trim().replace(SCI_X_RE, '$1e$2');
  const m = c.match(/^\s*([-+]?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?)\s*([\s\S]*)/);
  return m ? [m[1], m[2]] : null;
}

/** Normalise a unit string for comparison (lowercase, no spaces/symbols). */
function nu(s) {
  s = s.toLowerCase();
  const subs = [
    ['°', ''], ['°', ''], ['µ', 'u'], ['μ', 'u'],
    [' ', ''], ['²', '2'], ['³', '3'],
    ['½', '0.5'], ['¹', '1'],
    ['·', ''], ['*', ''], ['^', ''],
  ];
  for (const [old, rep] of subs) s = s.split(old).join(rep);
  return s;
}

function vp(value, ref = null) {
  return { value, ref };
}

// ── Unit converters (ported from tools/parse_refs.py:82-205) ──

function convertPressureToGPa(value, unit) {
  const u = nu(unit);
  if (u.includes('gpa') || u.includes('kn/mm2')) return value;
  if (u.includes('mpa') || u.includes('n/mm2')) return value / 1000.0;
  if (u.includes('ksi')) return value * 0.006894757;
  if (u.includes('psi')) return value * 6.894757e-6;
  if (u.includes('pa') && !u.includes('k') && !u.includes('m')) return value * 1e-9;
  return null;
}

function convertPressureToMPa(value, unit) {
  const u = nu(unit);
  if (u.includes('mpa') || u.includes('n/mm2')) return value;
  if (u.includes('gpa') || u.includes('kn/mm2')) return value * 1000.0;
  if (u.includes('ksi')) return value * 6.894757;
  if (u.includes('psi')) return value * 0.006894757;
  return null;
}

function convertDensity(value, unit) {
  const u = nu(unit);
  if (u.includes('g/cm') || u.includes('g/cc')) return value;
  if (u.includes('kg/m3')) return value / 1000.0;
  if (u.includes('lb/in3') || u.includes('lb/in')) return value * 27.6799;
  if (u.includes('lb/ft3')) return value * 0.016018;
  return null;
}

function convertCTE(value, unit) {
  const u = nu(unit);
  if (u.includes('ppm') || u.includes('um/m') || u.includes('ue/')) {
    if (u.includes('/f') || u.includes('perf')) return value * 1.8;
    return value;
  }
  if (u.includes('1/f') || u.includes('/f') || u.includes('in/in') || u.includes('ft/ft')) return value * 1.8e6;
  if (u.includes('1/k') || u.includes('1/c') || u.includes('/k') || u.includes('/c')) return value * 1e6;
  return null;
}

function convertConductivity(value, unit) {
  const u = nu(unit);
  if (u.includes('w/m')) return value;
  if (u.includes('btu') && u.includes('in') && u.includes('hr')) return value * 0.14423;
  if (u.includes('btu') && u.includes('hr')) return value * 1.73073;
  if (u.includes('btu') && u.includes('in') && u.includes('s')) return value * 519.22;
  if (u.includes('cal') && u.includes('s')) return value * 418.68;
  if (u.includes('cal') && u.includes('min')) return value * 6.978;
  return null;
}

function convertSpecificHeat(value, unit) {
  const u = nu(unit);
  if (u.includes('kj/kg')) return value * 1000.0;
  if (u.includes('j/kgk') || u.includes('j/kg')) return value;
  if (u.includes('btu/lb')) return value * 4186.8;
  if (u.includes('cal/gk') || u.includes('cal/g')) return value * 4186.8;
  if (u.includes('j/gk') || u.includes('j/g')) return value * 1000.0;
  return null;
}

function convertTemp(value, unit) {
  const u = nu(unit);
  if (u.includes('f') && !u.includes('c') && !u.includes('k')) return (value - 32) * 5.0 / 9.0;
  if (u.includes('k') && !u.includes('c')) return value - 273.15;
  return value; // assume °C
}

function convertFractureToughness(value, unit) {
  const u = nu(unit);
  if (u.includes('mpa')) return value;
  if (u.includes('ksi')) return value * 1.0988;
  return null;
}

function convertThermalDiffusivity(value, unit) {
  const u = nu(unit);
  if (u.includes('cm2/s') || u.includes('cm2s')) return value;
  if (u.includes('mm2/s') || u.includes('mm2s')) return value * 0.01;
  if (u.includes('m2/s') || u.includes('m2s')) return value * 10000.0;
  return null;
}

// ── Property name → schema field mapping (ported from tools/parse_refs.py:212-254) ──

const PROP_MAP = [
  ['young', 'mechanical_common.youngs_modulus', convertPressureToGPa],
  ['elastic mod', 'mechanical_common.youngs_modulus', convertPressureToGPa],
  ['modulus of elasticity', 'mechanical_common.youngs_modulus', convertPressureToGPa],
  ['tensile modulus', 'mechanical_common.youngs_modulus', convertPressureToGPa],
  ['poisson', 'mechanical_common.poissons_ratio', null],
  ['tensile strength, ult', 'mechanical_common.tensile_strength', convertPressureToGPa],
  ['ultimate tensile', 'mechanical_common.tensile_strength', convertPressureToGPa],
  ['uts', 'mechanical_common.tensile_strength', convertPressureToGPa],
  ['tensile strength, yield', 'mechanical_common.yield_strength', convertPressureToGPa],
  ['yield strength', 'mechanical_common.yield_strength', convertPressureToGPa],
  ['0.2% proof', 'mechanical_common.yield_strength', convertPressureToGPa],
  ['proof stress', 'mechanical_common.yield_strength', convertPressureToGPa],
  ['compressive yield', 'mechanical_common.compressive_strength', convertPressureToMPa],
  ['compressive strength', 'mechanical_common.compressive_strength', convertPressureToMPa],
  ['elongation', 'mechanical_other.ductility', null],
  ['ductility', 'mechanical_other.ductility', null],
  ['shear strength', 'mechanical_other.shear_strength', convertPressureToGPa],
  ['fracture toughness', 'mechanical_other.fracture_toughness', convertFractureToughness],
  ['hardness, vickers', 'mechanical_other.hardness_vickers', null],
  ['vickers hardness', 'mechanical_other.hardness_vickers', null],
  ['hardness hv', 'mechanical_other.hardness_vickers', null],
  ['hardness, brinell', 'mechanical_other.hardness_brinell', null],
  ['brinell hardness', 'mechanical_other.hardness_brinell', null],
  ['hardness hb', 'mechanical_other.hardness_brinell', null],
  ['hardness, rockwell', 'mechanical_other.hardness_rockwell', null],
  ['rockwell hardness', 'mechanical_other.hardness_rockwell', null],
  ['density', 'physical.density', convertDensity],
  ['thermal expansion', 'physical.thermal_expansion', convertCTE],
  ['coefficient of thermal expansion', 'physical.thermal_expansion', convertCTE],
  ['cte', 'physical.thermal_expansion', convertCTE],
  ['linear expansion', 'physical.thermal_expansion', convertCTE],
  ['thermal conductivity', 'physical.thermal_conductivity', convertConductivity],
  ['specific heat', 'physical.specific_heat', convertSpecificHeat],
  ['heat capacity', 'physical.specific_heat', convertSpecificHeat],
  ['thermal diffusivity', 'physical.thermal_diffusivity', convertThermalDiffusivity],
  ['melting point', 'physical.melting_point_tm', convertTemp],
  ['solidus', 'physical.melting_point_tm', convertTemp],
  ['electrical conductivity', 'physical.electrical_conductivity', null],
];

/** Ported from tools/parse_refs.py:257-278 (_map_property). */
function mapProperty(name, valueStr, unit) {
  const n = name.toLowerCase().trim();
  const v = num(valueStr);
  if (v === null) return null;
  for (const [pattern, path, converter] of PROP_MAP) {
    if (n.includes(pattern)) {
      let canonical = v;
      if (converter) {
        const converted = converter(v, unit);
        canonical = converted === null ? v : converted;
      }
      return [path, canonical];
    }
  }
  return null;
}

/**
 * Ported from tools/parse_refs.py:361-376 (BaseParser._apply_rows), with one
 * deliberate deviation: first match per schema path wins, instead of last.
 *
 * Reason (found during verification against refs_html/azom-4340.html): AZoM
 * lists derived/converted values with names like "Hardness, Rockwell C
 * (converted from Brinell hardness...)" — the parenthetical spuriously
 * contains the substring "brinell hardness", so PROP_MAP's substring matching
 * (identical in tools/parse_refs.py) maps it to mechanical_other.hardness_brinell
 * too. Last-write-wins let that overwrite the correct primary "Hardness,
 * Brinell" row (217) with an unrelated converted value (17) — silently wrong,
 * not just missing. The primary row for a property consistently appears
 * before parenthetical cross-references to it in every site sampled, so
 * first-wins fixes this without needing per-site exclusion rules.
 */
function applyRows(rows) {
  const parsed = {};
  const raw = {};
  for (const [name, valueStr, unitStr] of rows) {
    const result = mapProperty(name, valueStr, unitStr);
    if (result) {
      const [path, canonical] = result;
      if (!(path in parsed)) {
        parsed[path] = canonical;
        if (path === ROCKWELL_SCALE_PATH) {
          const scale = extractRockwellScale(name);
          if (scale) parsed[`${ROCKWELL_SCALE_PATH}__scale`] = scale;
        }
      }
    } else {
      raw[name] = `${valueStr} ${unitStr}`.trim();
    }
  }
  return [parsed, raw];
}

// ── Output template (ported from tools/parse_refs.py:300-350) ──

function emptyResult(stub, site, sourceUrl) {
  return {
    _meta: {
      source_site: site,
      source_file: `${stub}.html`,
      source_url: sourceUrl,
      parsed_date: new Date().toISOString().slice(0, 10),
    },
    identification: { name: null, slug: stub, category: null, usage_frequency: null },
    mechanical_common: {},
    mechanical_other: {},
    physical: {},
    _raw: {},
  };
}

const ROCKWELL_SCALE_PATH = 'mechanical_other.hardness_rockwell';

/** Rockwell scale letter from a property name, e.g. "Hardness, Rockwell C" → "C". */
function extractRockwellScale(name) {
  const m = name.match(/rockwell\s*([a-z])\b/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Ported from tools/parse_refs.py:321-350 (_finish). Extracts the Rockwell
 * scale letter (A/B/C/etc.) from the property name via a synthetic
 * "<path>__scale" side-channel key in `parsed`, consumed here and nowhere
 * else — found missing during real-world use (titanium-ti-6al-4v-grade-5-sta
 * needed it filled in by hand); tools/parse_refs.py's _finish() has the same
 * fix applied (see _rockwell_scale() there).
 */
function finishResult(result, parsed, raw) {
  for (const [path, value] of Object.entries(parsed)) {
    if (path === `${ROCKWELL_SCALE_PATH}__scale`) continue; // side-channel, consumed by the hardness_rockwell branch below
    const [section, key] = [path.slice(0, path.indexOf('.')), path.slice(path.indexOf('.') + 1)];
    if (section === 'mechanical_common') {
      result.mechanical_common[key] = vp(value);
    } else if (section === 'mechanical_other') {
      if (key === 'ductility') {
        result.mechanical_other.ductility = { min: null, max: null, typical: value, ref: null };
      } else if (key === 'hardness_rockwell') {
        result.mechanical_other.hardness_rockwell = { value, scale: parsed[`${ROCKWELL_SCALE_PATH}__scale`] ?? null, ref: null };
      } else {
        result.mechanical_other[key] = vp(value);
      }
    } else if (section === 'physical') {
      if (key === 'thermal_conductivity' || key === 'specific_heat') {
        result.physical[key] = { value, table: [], ref: null };
      } else if (key === 'thermal_expansion') {
        result.physical.thermal_expansion = { value, table: [], ref: null };
      } else if (key === 'magnetic_classification') {
        result.physical.magnetic_classification = { value, ref: null };
      } else {
        result.physical[key] = vp(value);
      }
    }
  }
  Object.assign(result._raw, raw);
  return result;
}

// ── Per-site parsers ──────────────────────────────────────────────────────────

/** AZoM material property pages. Ported from tools/parse_refs.py:379-429 (AZoMParser). */
function parseAzom(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];
  for (const container of doc.querySelectorAll('.content-item-body, .article-content, .specifications-table')) {
    for (const table of container.querySelectorAll('table')) {
      for (const tr of table.querySelectorAll('tr')) {
        const c = cells(tr);
        if (c.length < 2) continue;
        const propName = c[0];
        const valSourceCell = c[1];
        const m = splitValUnit(valSourceCell);
        rows.push(m ? [propName, m[0], m[1]] : [propName, valSourceCell, '']);
      }
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'azom', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** MakeItFrom.com pages. Ported from tools/parse_refs.py:432-493 (MakeItFromParser). */
function parseMakeItFrom(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const propRegex = /\bnd\b|\bprop-name\b|\bname\b/;
  const valRegex = /\bval\b|\bvalue\b|\bnum\b/;

  let rows = [];
  for (const propDiv of findAllByClass(doc, propRegex)) {
    const propName = getText(propDiv);
    const parent = propDiv.parentElement;
    if (!parent) continue;
    const valEl = findFirstByClass(parent, valRegex);
    if (!valEl) continue;
    const unitEls = Array.from(valEl.querySelectorAll('i'));
    const unit = unitEls.map(u => getText(u)).join(' ');
    let valText = getText(valEl);
    for (const u of unitEls) valText = valText.replace(getText(u), '');
    rows.push([propName, valText.trim(), unit.trim()]);
  }

  if (rows.length === 0) rows = fallbackTableRows(doc);

  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'makeitfrom', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

function fallbackTableRows(doc) {
  const rows = [];
  for (const table of doc.querySelectorAll('table')) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const m = splitValUnit(c[1]);
      if (m) rows.push([c[0], m[0], m[1]]);
    }
  }
  return rows;
}

/** MatWeb.com data sheets. Ported from tools/parse_refs.py:495-547 (MatWebParser). */
function parseMatWeb(doc, stub) {
  const h1 = doc.querySelector('h1');
  let name = h1 ? getText(h1) : null;
  if (!name) {
    const title = doc.querySelector('title');
    if (title) name = getText(title).split('|')[0].trim();
  }

  let rows = [];
  for (const table of tablesByClass(doc, /tablediv|datatable|property/i)) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const m = splitValUnit(c[1]);
      if (m) rows.push([c[0], m[0], m[1]]);
    }
  }

  if (rows.length === 0) {
    for (const table of doc.querySelectorAll('table')) {
      for (const tr of table.querySelectorAll('tr')) {
        const c = cells(tr);
        if (c.length < 2) continue;
        const prop = c[0];
        if (!prop || num(prop) !== null) continue;
        const m = splitValUnit(c[1]);
        if (m) rows.push([prop, m[0], m[1]]);
      }
    }
  }

  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'matweb', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** SpaceMatDB pages. Ported from tools/parse_refs.py:550-585 (SpaceMatDBParser). */
function parseSpaceMatDB(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];
  for (const table of tablesByClass(doc, /TFtable|spacetable/i)) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const prop = c[0];
      const valRaw = c[1];
      const m = splitValUnit(valRaw);
      rows.push(m ? [prop, m[0], m[1]] : [prop, valRaw, '']);
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'spacematdb', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** TheWorldMaterial.com pages. Ported from tools/parse_refs.py:588-633 (TheWorldMaterialParser). */
function parseTheWorldMaterial(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];
  for (const wrapper of doc.querySelectorAll('.table-responsive, .entry-content')) {
    for (const table of wrapper.querySelectorAll('table')) {
      let trs = Array.from(table.querySelectorAll('tr'));
      let headers = [];
      if (trs.length) {
        const headerCells = Array.from(trs[0].querySelectorAll('th, td')).map(getText);
        if (headerCells.some(h => !num(h))) {
          headers = headerCells;
          trs = trs.slice(1);
        }
      }
      for (const tr of trs) {
        const c = cells(tr);
        if (c.length < 2) continue;
        const prop = c[0];
        for (const cell of c.slice(1)) {
          const m = splitValUnit(cell);
          if (m) { rows.push([prop, m[0], m[1]]); break; }
        }
      }
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'theworldmaterial', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** EngineersEdge.com pages. Ported from tools/parse_refs.py:636-677 (EngineersEdgeParser). */
function parseEngineersEdge(doc, stub) {
  let name = null;
  for (const tag of doc.querySelectorAll('h1, h2')) {
    const text = getText(tag);
    if (text && text.length > 5) { name = text; break; }
  }

  const rows = [];
  for (const table of doc.querySelectorAll('table')) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const prop = c[0].trim();
      if (!prop || ['property', 'properties', 'characteristic'].includes(prop.toLowerCase())) continue;
      for (const cell of c.slice(1)) {
        const m = splitValUnit(cell);
        if (m) { rows.push([prop, m[0], m[1]]); break; }
      }
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'engineersedge', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** HighTempMetals.com pages. Ported from tools/parse_refs.py:680-742 (HighTempMetalsParser). */
function parseHighTempMetals(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];

  for (const table of doc.querySelectorAll('table')) {
    let trs = Array.from(table.querySelectorAll('tr'));
    if (!trs.length) continue;

    let headers = [];
    const firstCells = Array.from(trs[0].querySelectorAll('td, th')).map(getText);
    if (firstCells.some(h => num(h) === null && h)) {
      headers = firstCells;
      trs = trs.slice(1);
    }

    if (headers.length) {
      const sectionHeader = findPrevious(table, 'h2, h3, h4, strong, b', doc);
      const sectionName = sectionHeader ? getText(sectionHeader) : 'Unknown';
      for (const tr of trs) {
        const c = cells(tr);
        if (!c.length) continue;
        for (let i = 0; i < Math.min(headers.length, c.length); i++) {
          const h = headers[i];
          const cellVal = c[i];
          if (!h || !cellVal) continue;
          if (num(h) === null && num(cellVal) !== null) {
            rows.push([`${sectionName} — ${h}`, cellVal, '']);
          }
          // else: header looks like a temperature-index column — skip (matches Python no-op branch)
        }
      }
    } else {
      for (const tr of trs) {
        const c = cells(tr);
        if (c.length < 2) continue;
        const m = splitValUnit(c[1]);
        if (m) rows.push([c[0], m[0], m[1]]);
      }
    }
  }

  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'hightempmetals', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** eFunda.com pages. Ported from tools/parse_refs.py:745-777 (EfundaParser). */
function parseEfunda(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];
  for (const table of doc.querySelectorAll('table')) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length >= 3) {
        rows.push([c[0], c[1], c[2]]);
      } else if (c.length === 2) {
        const m = splitValUnit(c[1]);
        if (m) rows.push([c[0], m[0], m[1]]);
      }
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'efunda', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** NIST material data pages. Ported from tools/parse_refs.py:780-813 (NISTParser). */
function parseNIST(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];
  for (const table of doc.querySelectorAll('table')) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const prop = c[0];
      for (const cell of c.slice(1)) {
        const m = splitValUnit(cell);
        if (m) { rows.push([prop, m[0], m[1]]); break; }
      }
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'nist', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

/** Fallback parser for unrecognized sites. Ported from tools/parse_refs.py:816-850 (GenericParser). */
function parseGeneric(doc, stub) {
  const h1 = doc.querySelector('h1');
  const name = h1 ? getText(h1) : null;
  const rows = [];
  for (const table of doc.querySelectorAll('table')) {
    for (const tr of table.querySelectorAll('tr')) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const prop = c[0];
      if (!prop || num(prop) !== null) continue;
      for (const cell of c.slice(1)) {
        const m = splitValUnit(cell);
        if (m) { rows.push([prop, m[0], m[1]]); break; }
      }
    }
  }
  const [parsed, raw] = applyRows(rows);
  const result = emptyResult(stub, 'generic', null);
  if (name) result.identification.name = name;
  return finishResult(result, parsed, raw);
}

// ── Site detection (ported from tools/parse_refs.py:855-874) ──

const PARSERS = {
  azom: parseAzom,
  makeitfrom: parseMakeItFrom,
  matweb: parseMatWeb,
  spacematdb: parseSpaceMatDB,
  theworldmaterial: parseTheWorldMaterial,
  engineersedge: parseEngineersEdge,
  'engineers-edge': parseEngineersEdge,
  hightempmetals: parseHighTempMetals,
  efunda: parseEfunda,
  nist: parseNIST,
};

const SITE_LABELS = {
  azom: 'AZoM',
  makeitfrom: 'MakeItFrom',
  matweb: 'MatWeb',
  spacematdb: 'SpaceMatDB',
  theworldmaterial: 'TheWorldMaterial',
  engineersedge: 'EngineersEdge',
  'engineers-edge': 'EngineersEdge',
  hightempmetals: 'HighTempMetals',
  efunda: 'eFunda',
  nist: 'NIST',
  generic: 'source file',
};

function detectSite(stem) {
  const prefixes = Object.keys(PARSERS).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (stem.startsWith(prefix)) return prefix;
  }
  return 'generic';
}

function extractSourceUrl(doc) {
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical) {
    const href = canonical.getAttribute('href');
    if (href) return href;
  }
  const og = doc.querySelector('meta[property="og:url"]');
  if (og) {
    const content = og.getAttribute('content');
    if (content) return content;
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse an uploaded HTML reference file into a schema-shaped material object,
 * mirroring tools/parse_refs.py's output (see tools/parse_refs.py:300-318).
 *
 * @param {string} filename - the uploaded file's name (used to detect site + derive stub)
 * @param {string} htmlText - the file's text content
 * @returns {{mat: object, sourceUrl: string|null, siteLabel: string, populatedCount: number, unmatchedRaw: object}}
 */
export function parseHtmlToMaterial(filename, htmlText) {
  const stub = filename.replace(/\.[^./\\]*$/, '');
  const site = detectSite(stub);
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const parseFn = PARSERS[site] ?? parseGeneric;
  const mat = parseFn(doc, stub);
  mat._meta.source_url = extractSourceUrl(doc);

  const populatedCount =
    Object.keys(mat.mechanical_common).length +
    Object.keys(mat.mechanical_other).length +
    Object.keys(mat.physical).length;

  return {
    mat,
    sourceUrl: mat._meta.source_url,
    siteLabel: SITE_LABELS[site] ?? site,
    populatedCount,
    unmatchedRaw: mat._raw,
  };
}
