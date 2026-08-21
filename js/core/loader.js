/**
 * loader.js — Fetches and caches material data.
 *
 * The manifest (materials/index.json) is fetched once and cached.
 * Individual material files are lazy-loaded on first access and cached.
 * All functions return Promises.
 *
 * All three fetches use `cache: 'no-store'`, deliberately and consistently —
 * this is a reference site where material data gets corrected after
 * publication, and a manifest that's fresh while an individual material file
 * is served stale from the browser's HTTP cache is a real, observed failure
 * mode, not a hypothetical one. GitHub Pages already sits behind a CDN, and
 * store.js's in-memory cache below still avoids refetching within a single
 * page load, so this doesn't disable caching so much as move it to the layer
 * where staleness can't silently outlive a data correction.
 */

import * as store from './store.js';

const MANIFEST_URL = 'materials/index.json';

/**
 * Load the manifest. Subsequent calls return the cached result.
 * @returns {Promise<{generated: string, materials: Array}>}
 */
export async function loadManifest() {
  if (store.has('manifest')) return store.get('manifest');

  const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch manifest (${res.status})`);

  const data = await res.json();
  store.set('manifest', data);
  return data;
}

/**
 * Load a single material by slug. Lazy-fetches from the path in the manifest.
 * @param {string} slug
 * @returns {Promise<Object>}
 */
export async function loadMaterial(slug) {
  if (store.has(slug)) return store.get(slug);

  const manifest = await loadManifest();
  const entry = manifest.materials.find(m => m.slug === slug);
  if (!entry) throw new Error(`Unknown material slug: "${slug}"`);

  const res = await fetch(entry.path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${entry.path} (${res.status})`);

  const data = await res.json();
  store.set(slug, data);
  return data;
}

/**
 * Load multiple materials in parallel.
 * @param {string[]} slugs
 * @returns {Promise<Object[]>}
 */
export async function loadMaterialBatch(slugs) {
  return Promise.all(slugs.map(loadMaterial));
}

/**
 * Load the shared reference database. Subsequent calls return the cached result.
 * @returns {Promise<Object>}  keyed by BibTeX citation key
 */
export async function loadReferences() {
  if (store.has('references')) return store.get('references');

  const res = await fetch('references/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch references (${res.status})`);

  const data = await res.json();
  store.set('references', data);
  return data;
}
