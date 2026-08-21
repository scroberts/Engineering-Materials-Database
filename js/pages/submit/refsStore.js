/**
 * submit/refsStore.js — Reference database state, the reference side panel,
 * and the add/edit-reference form.
 */

import { esc } from './utils.js';

/** Live reference database (key → {short_label, doi, bibtex, url}) */
export let refs = {};

/**
 * Keys that were present in references/index.json at page load.
 * Anything not in this set is "new" and must be embedded in the
 * downloaded JSON under `new_references` so it survives a round-trip.
 */
export let canonicalKeys = new Set();

/** Set refs/canonicalKeys from a freshly loaded references/index.json. */
export function initRefs(loaded) {
  refs = loaded;
  canonicalKeys = new Set(Object.keys(loaded));
}

// ── Reference panel ──────────────────────────────────────────────────────────

/** Split and sort refs: new-session entries first, then canonical, both alphabetical by short_label. */
function sortedRefEntries() {
  const cmp = (a, b) => a[1].short_label.localeCompare(b[1].short_label, undefined, { sensitivity: 'base' });
  const newEntries = Object.entries(refs).filter(([k]) => !canonicalKeys.has(k)).sort(cmp);
  const canonical  = Object.entries(refs).filter(([k]) =>  canonicalKeys.has(k)).sort(cmp);
  return { newEntries, canonical };
}

export function renderRefPanel() {
  const list = document.getElementById('ref-panel-list');
  list.innerHTML = '';

  const { newEntries, canonical } = sortedRefEntries();

  if (!newEntries.length && !canonical.length) {
    list.innerHTML = '<li class="ref-panel-item" style="color:var(--color-muted);font-style:italic">No references loaded</li>';
  } else {
    const addItem = (key, entry) => {
      const li = document.createElement('li');
      li.className = 'ref-panel-item';
      const labelRow = document.createElement('div');
      labelRow.className = 'ref-panel-item-row';
      const textWrap = document.createElement('div');
      textWrap.innerHTML = `<strong>${esc(entry.short_label)}</strong><div class="ref-panel-key">${esc(key)}</div>`;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-ref-edit';
      editBtn.textContent = 'Edit';
      editBtn.dataset.refKey = key;
      editBtn.addEventListener('click', () => openEditRef(key));
      labelRow.append(textWrap, editBtn);
      li.appendChild(labelRow);
      list.appendChild(li);
    };

    if (newEntries.length) {
      const hdr = document.createElement('li');
      hdr.className = 'ref-panel-section-header';
      hdr.textContent = 'New (this session)';
      list.appendChild(hdr);
      newEntries.forEach(([k, e]) => addItem(k, e));
    }

    if (canonical.length) {
      const hdr = document.createElement('li');
      hdr.className = 'ref-panel-section-header';
      hdr.textContent = 'Reference database';
      list.appendChild(hdr);
      canonical.forEach(([k, e]) => addItem(k, e));
    }
  }

  // Refresh all ref selects in the form
  for (const sel of document.querySelectorAll('.form-ref-select')) {
    populateRefSelect(sel);
  }
}

export function populateRefSelect(sel) {
  const current = sel.value;
  sel.innerHTML = '<option value="">— no ref —</option>';

  const { newEntries, canonical } = sortedRefEntries();

  if (newEntries.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'New (this session)';
    newEntries.forEach(([k, e]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = e.short_label;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  if (canonical.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Reference database';
    canonical.forEach(([k, e]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = e.short_label;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  if (current && refs[current]) sel.value = current;
}

export function buildRefSelect() {
  const sel = document.createElement('select');
  sel.className = 'form-ref-select';
  populateRefSelect(sel);
  return sel;
}

// ── Add / Edit reference form wiring ─────────────────────────────────────────

/** Key being edited; null when adding a new entry. */
let _editingKey = null;

/** Which tab is active: 'bibtex' | 'url' */
let _activeTab = 'bibtex';

export function wireAddRefForm() {
  const btnAdd    = document.getElementById('btn-add-ref');
  const addForm   = document.getElementById('ref-add-form');
  const btnSave   = document.getElementById('btn-ref-save');
  const btnCancel = document.getElementById('btn-ref-cancel');
  const bibtexIn  = document.getElementById('ref-bibtex-input');
  const keyIn     = document.getElementById('ref-key-input');
  const labelIn   = document.getElementById('ref-shortlabel-input');
  const doiIn     = document.getElementById('ref-doi-input');
  const bibUpload = document.getElementById('ref-bib-upload');

  // ── Tab switching ──
  for (const tab of document.querySelectorAll('.ref-tab')) {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  }

  // ── Open add form ──
  btnAdd.addEventListener('click', () => {
    if (!addForm.hidden && _editingKey === null) {
      // Toggle closed if already open in add mode
      addForm.hidden = true;
      return;
    }
    _editingKey = null;
    clearAddForm();
    btnSave.textContent = 'Add Reference';
    addForm.hidden = false;
    switchTab('bibtex');
    keyIn.focus();
  });

  // ── Cancel ──
  btnCancel.addEventListener('click', () => {
    addForm.hidden = true;
    _editingKey = null;
    clearAddForm();
  });

  // ── BibTeX auto-parse ──
  bibtexIn.addEventListener('input', () => {
    const text = bibtexIn.value;
    const keyMatch  = text.match(/@\w+\{([^,]+),/);
    const doiMatch  = text.match(/doi\s*=\s*\{([^}]+)\}/i);
    const authMatch = text.match(/author\s*=\s*\{+([^{}]+)\}+/i);
    const yearMatch = text.match(/year\s*=\s*\{(\d{4})\}/i);
    if (keyMatch && !keyIn.value)  keyIn.value = keyMatch[1].trim();
    if (doiMatch && !doiIn.value)  doiIn.value = doiMatch[1].trim();
    if (!labelIn.value && authMatch && yearMatch) {
      const last = authMatch[1].split(/,| and /)[0].trim().split(/\s+/).pop();
      labelIn.value = `${last} ${yearMatch[1]}`;
    }
  });

  // ── Save (add or update) ──
  btnSave.addEventListener('click', () => {
    if (_activeTab === 'url') {
      saveUrlRef();
    } else {
      saveBibtexRef();
    }
  });

  // ── .bib file upload ──
  bibUpload.addEventListener('change', async () => {
    const file = bibUpload.files[0];
    if (!file) return;
    const text = await file.text();
    const entries = parseBib(text);
    let added = 0;
    for (const [key, entry] of Object.entries(entries)) {
      if (!refs[key]) { refs[key] = entry; added++; }
    }
    renderRefPanel();
    alert(`Added ${added} reference(s) from ${file.name}.`);
    bibUpload.value = '';
  });
}

function switchTab(tabName) {
  _activeTab = tabName;
  for (const tab of document.querySelectorAll('.ref-tab')) {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  }
  document.getElementById('ref-tab-bibtex').hidden = (tabName !== 'bibtex');
  document.getElementById('ref-tab-url').hidden    = (tabName !== 'url');
}

function saveBibtexRef() {
  const keyIn   = document.getElementById('ref-key-input');
  const labelIn = document.getElementById('ref-shortlabel-input');
  const doiIn   = document.getElementById('ref-doi-input');
  const bibtexIn= document.getElementById('ref-bibtex-input');

  const key   = (_editingKey ?? keyIn.value.trim());
  const label = labelIn.value.trim();
  if (!key || !label) { alert('Key and Short Label are required.'); return; }

  refs[key] = {
    short_label: label,
    doi: doiIn.value.trim() || null,
    bibtex: bibtexIn.value.trim() || (refs[key]?.bibtex ?? null),
    url: refs[key]?.url ?? null,
  };
  finishSave();
}

/** Slugify a reference label into a unique, unused key in `refs`. */
function slugifyRefKey(label, avoidKey = null) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let key = base; let n = 2;
  while (refs[key] && key !== avoidKey) { key = `${base}-${n++}`; }
  return key;
}

/** Add a reference entry directly (no form involved) and refresh dependent UI. Returns the key. */
export function addUrlReference(label, url) {
  const key = slugifyRefKey(label);
  refs[key] = { short_label: label, doi: null, bibtex: null, url };
  renderRefPanel();
  return key;
}

function saveUrlRef() {
  const labelIn = document.getElementById('ref-url-label-input');
  const urlIn   = document.getElementById('ref-url-input');
  const keyIn   = document.getElementById('ref-url-key-input');

  const label = labelIn.value.trim();
  const url   = urlIn.value.trim();
  if (!label || !url) { alert('Short label and URL are required.'); return; }

  // Auto-generate key from label if blank (and not editing)
  let key = _editingKey ?? keyIn.value.trim();
  if (!key) key = slugifyRefKey(label, _editingKey);

  refs[key] = {
    short_label: label,
    doi: null,
    bibtex: null,
    url,
  };
  finishSave();
}

function finishSave() {
  renderRefPanel();
  document.getElementById('ref-add-form').hidden = true;
  _editingKey = null;
  clearAddForm();
}

/**
 * Open the add-form pre-populated with an existing ref for editing.
 * The key field is shown but locked (can't rename a key mid-session).
 */
function openEditRef(key) {
  const entry  = refs[key];
  if (!entry) return;
  _editingKey  = key;

  const addForm = document.getElementById('ref-add-form');
  const btnSave = document.getElementById('btn-ref-save');
  clearAddForm();
  btnSave.textContent = 'Save Changes';
  addForm.hidden = false;

  if (entry.url && !entry.bibtex) {
    // URL-type reference → open URL tab
    switchTab('url');
    document.getElementById('ref-url-label-input').value = entry.short_label;
    document.getElementById('ref-url-input').value = entry.url;
    const keyIn = document.getElementById('ref-url-key-input');
    keyIn.value = key;
    keyIn.readOnly = true;
  } else {
    // BibTeX / manual reference
    switchTab('bibtex');
    document.getElementById('ref-shortlabel-input').value = entry.short_label;
    document.getElementById('ref-doi-input').value = entry.doi ?? '';
    document.getElementById('ref-bibtex-input').value = entry.bibtex ?? '';
    const keyIn = document.getElementById('ref-key-input');
    keyIn.value = key;
    keyIn.readOnly = true;
  }

  addForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAddForm() {
  document.getElementById('ref-bibtex-input').value = '';
  const keyIn = document.getElementById('ref-key-input');
  keyIn.value = ''; keyIn.readOnly = false;
  document.getElementById('ref-shortlabel-input').value = '';
  document.getElementById('ref-doi-input').value = '';
  document.getElementById('ref-url-label-input').value = '';
  document.getElementById('ref-url-input').value = '';
  const urlKeyIn = document.getElementById('ref-url-key-input');
  urlKeyIn.value = ''; urlKeyIn.readOnly = false;
}

/** Very simple BibTeX parser — extracts key, short_label, doi. */
function parseBib(text) {
  const result = {};
  const entryRe = /@\w+\{([^,]+),([\s\S]*?)(?=\n@|\s*$)/g;
  let m;
  while ((m = entryRe.exec(text)) !== null) {
    const key     = m[1].trim();
    const body    = m[2];
    const doiM    = body.match(/doi\s*=\s*\{([^}]+)\}/i);
    const authM   = body.match(/author\s*=\s*\{+([^{}]+)\}+/i);
    const yearM   = body.match(/year\s*=\s*\{(\d{4})\}/i);
    let label = key;
    if (authM && yearM) {
      const last = authM[1].split(/,| and /)[0].trim().split(/\s+/).pop();
      label = `${last} ${yearM[1]}`;
    }
    result[key] = {
      short_label: label,
      doi: doiM ? doiM[1].trim() : null,
      bibtex: m[0],
    };
  }
  return result;
}
