/** A resource identifier becomes part of an authenticated API URL.
 * Reject path traversal, query/fragment delimiters and non-UUID values before
 * constructing the URL; the API independently validates tenant ownership.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidPathSegment(value) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new TypeError('Invalid resource identifier');
  }
  return value;
}
