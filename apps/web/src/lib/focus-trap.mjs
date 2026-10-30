/**
 * Return the element that should receive focus when Tab would leave a dialog.
 * Returning null means the browser can advance focus normally.
 * @template {HTMLElement} T
 * @param {Element | null} active
 * @param {readonly T[]} focusable
 * @param {boolean} backwards
 * @returns {T | null}
 */
export function focusWrapTarget(active, focusable, backwards) {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!focusable.includes(/** @type {T} */ (active))) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
