/** Fixed customer-facing create endpoints; never interpolate arbitrary form data into a URL. */
const ALLOWED_CREATE_KINDS = new Set([
  'portfolio', 'program', 'project', 'raid', 'task', 'update',
  'benefit', 'stakeholder', 'schedule-item', 'cost', 'allocation', 'document',
]);

/** @returns {string | null} */
export function validCreateKind(value) {
  return typeof value === 'string' && ALLOWED_CREATE_KINDS.has(value) ? value : null;
}
