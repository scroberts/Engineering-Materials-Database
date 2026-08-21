/**
 * submit.js — Material submission form (orchestrator)
 *
 * Responsibilities:
 *   1. Load references/index.json → populate reference panel + per-field dropdowns
 *   2. Build form sections mirroring the JSON schema
 *   3. Pre-fill from uploaded JSON (runs migrateToLatest first)
 *   4. Download canonical JSON on button click
 *   5. Show post-download PR instructions
 *   6. Allow adding new BibTeX references inline
 *
 * The actual logic lives in js/pages/submit/*.js:
 *   state.js       — edit-mode flags derived from the URL
 *   utils.js       — esc()
 *   formSchema.js  — FORM_SECTIONS data
 *   refsStore.js   — reference database state, side panel, add/edit-ref form
 *   formBuilder.js — renders FORM_SECTIONS into DOM controls
 *   prefill.js     — populates the form from a material JSON or HTML import
 *   exportJson.js  — reads the form back into canonical JSON + downloads it
 */

import { loadReferences, loadMaterial } from '../core/loader.js';
import { migrateToLatest } from '../core/schema.js';
import { parseHtmlToMaterial } from '../core/htmlImport.js';

import { editMode, editSlug } from './submit/state.js';
import { initRefs, renderRefPanel, wireAddRefForm, addUrlReference } from './submit/refsStore.js';
import { buildForm } from './submit/formBuilder.js';
import { prefillForm, applyHtmlPrefill, referenceLabel } from './submit/prefill.js';
import { downloadJSON } from './submit/exportJson.js';

// ── State ───────────────────────────────────────────────────────────────────

/** Parsed HTML import waiting on a manual source-URL decision ({ parsed, fileName } or null). */
let _pendingHtmlImport = null;

// ── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  if (editMode) {
    document.querySelector('.submit-title').textContent = 'Edit Material';
    document.querySelector('.submit-subtitle').textContent = 'Loading…';
  }

  try {
    initRefs(await loadReferences());
  } catch (e) {
    console.warn('Could not load references:', e);
    initRefs({});
  }

  renderRefPanel();
  buildForm();
  wireForm();

  if (editMode) await loadEditMaterial();
}

init();

// ── Edit mode ────────────────────────────────────────────────────────────────

async function loadEditMaterial() {
  try {
    const raw = await loadMaterial(editSlug);
    const mat = migrateToLatest(raw);
    prefillForm(mat);
    applyEditModeUI(mat);
  } catch (e) {
    document.querySelector('.submit-title').textContent = 'Edit Material — Error';
    document.querySelector('.submit-subtitle').textContent =
      `Could not load "${editSlug}": ${e.message}`;
  }
}

function applyEditModeUI(mat) {
  const name = mat.identification?.name ?? editSlug;
  document.title = `Edit: ${name} — UVIC Engineering Materials Database`;
  document.querySelector('.submit-title').textContent    = `Edit Material: ${name}`;
  document.querySelector('.submit-subtitle').textContent =
    'Update the values below. Download the corrected JSON and open a Pull Request to replace the existing file.';
  document.querySelector('.submit-prefill-row').hidden   = true;
  document.getElementById('btn-download').textContent    = 'Download Updated JSON';

  // Slug must not change — filename is the slug
  const slugIn = document.getElementById('field-slug');
  if (slugIn) {
    slugIn.readOnly = true;
    slugIn.dataset.userEdited = 'true';
  }
}

// ── Form wiring ───────────────────────────────────────────────────────────────

function wireForm() {
  // Slug auto-generation from name
  const nameIn = document.getElementById('field-name');
  const slugIn = document.getElementById('field-slug');
  if (nameIn && slugIn) {
    nameIn.addEventListener('input', () => {
      if (!slugIn.dataset.userEdited) {
        slugIn.value = nameIn.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
    });
    slugIn.addEventListener('input', () => { slugIn.dataset.userEdited = 'true'; });
  }

  // Pre-fill upload
  document.getElementById('prefill-upload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw  = JSON.parse(text);
      const mat  = migrateToLatest(raw);
      prefillForm(mat);
      document.getElementById('prefill-status').textContent = `Pre-filled from ${file.name}`;
    } catch (err) {
      document.getElementById('prefill-status').textContent = `Error: ${err.message}`;
      document.getElementById('prefill-status').style.color = 'var(--color-danger)';
    }
  });

  // Pre-fill from HTML (see js/core/htmlImport.js)
  document.getElementById('prefill-html-upload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('prefill-html-status');
    const urlRow = document.getElementById('prefill-html-url-row');
    try {
      const text   = await file.text();
      const parsed = parseHtmlToMaterial(file.name, text);
      if (parsed.sourceUrl) {
        const key = addUrlReference(referenceLabel(parsed, file.name), parsed.sourceUrl);
        applyHtmlPrefill(parsed, key);
        urlRow.hidden = true;
      } else {
        _pendingHtmlImport = { parsed, fileName: file.name };
        urlRow.hidden = false;
        status.style.color = '';
        status.textContent =
          `Parsed ${parsed.populatedCount} propert${parsed.populatedCount === 1 ? 'y' : 'ies'} from ${parsed.siteLabel}, ` +
          `but no source URL was found in the file — enter one below, or skip to pre-fill fields without a reference.`;
      }
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      status.style.color = 'var(--color-danger)';
    }
  });

  document.getElementById('prefill-html-url-confirm').addEventListener('click', () => {
    if (!_pendingHtmlImport) return;
    const { parsed, fileName } = _pendingHtmlImport;
    const url = document.getElementById('prefill-html-url').value.trim();
    const key = url ? addUrlReference(referenceLabel(parsed, fileName), url) : null;
    applyHtmlPrefill(parsed, key);
    dismissHtmlUrlPrompt();
  });

  document.getElementById('prefill-html-url-skip').addEventListener('click', () => {
    if (!_pendingHtmlImport) return;
    applyHtmlPrefill(_pendingHtmlImport.parsed, null);
    dismissHtmlUrlPrompt();
  });

  // Download button
  document.getElementById('btn-download').addEventListener('click', downloadJSON);

  // Add-ref panel wiring
  wireAddRefForm();
}

function dismissHtmlUrlPrompt() {
  document.getElementById('prefill-html-url-row').hidden = true;
  document.getElementById('prefill-html-url').value = '';
  _pendingHtmlImport = null;
}
