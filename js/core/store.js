/**
 * store.js — Simple in-memory cache for loaded JSON data.
 * Keyed by slug (materials) or the string "manifest".
 */

const cache = new Map();

export function get(key)        { return cache.get(key); }
export function set(key, value) { cache.set(key, value); return value; }
export function has(key)        { return cache.has(key); }
