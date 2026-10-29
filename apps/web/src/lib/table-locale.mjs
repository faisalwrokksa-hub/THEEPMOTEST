/** Pure locale helpers shared by Arabic/English data tables. */
export function compareTableValues(a, b, locale = 'en', direction = 'asc') {
  // Nulls must stay last in BOTH directions.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const comparison = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), locale === 'ar' ? 'ar' : 'en', {
        numeric: true, sensitivity: 'base',
      });
  return direction === 'desc' ? -comparison : comparison;
}

export function formatTableCount(n, locale = 'en') {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(n);
}
