/**
 * submit/state.js — Edit-mode flags derived once from the URL at page load.
 */

const _params = new URLSearchParams(location.search);

export const editSlug = _params.get('slug');
export const editMode = Boolean(editSlug);
