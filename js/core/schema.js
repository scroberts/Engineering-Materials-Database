/**
 * schema.js — Schema version tracking and in-browser migration runner.
 *
 * When a material file is loaded, call migrateToLatest(data) before use.
 * Migration is purely in-memory; disk files are never modified by the browser.
 *
 * To add a new schema version:
 *   1. Increment CURRENT_VERSION.
 *   2. Push a migration function onto MIGRATIONS.
 *   3. Add the same migration to tools/migrate.py.
 */

export const CURRENT_VERSION = 1;

// Each entry: { from: N, migrate: (obj) => newObj }
const MIGRATIONS = [
  // Example for future use:
  // { from: 1, migrate: (obj) => ({ ...obj, schema_version: 2, newField: null }) },
];

/**
 * Migrate a parsed material object to the current schema version.
 * Returns the object unchanged if already at CURRENT_VERSION.
 */
export function migrateToLatest(data) {
  let obj = structuredClone ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  let version = obj.schema_version ?? 1;

  // Loop to a fixed point rather than a single pass over MIGRATIONS, so a
  // multi-step chain (v1->v2->v3->...) applies fully regardless of the
  // order migrations were pushed onto the array. Capped at MIGRATIONS.length
  // iterations — each migration must advance schema_version at least once,
  // so that's a safe upper bound and guards against an infinite loop if one
  // doesn't.
  for (let i = 0; i < MIGRATIONS.length && version < CURRENT_VERSION; i++) {
    const step = MIGRATIONS.find(s => s.from === version);
    if (!step) break;
    obj = step.migrate(obj);
    version = obj.schema_version;
  }

  return obj;
}
