export const money = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en', {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(n);

export const num = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : new Intl.NumberFormat('en', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(n);

/*
 * Guards NaN and Infinity, not just null. A percentage is nearly always a
 * ratio, and an empty workspace makes that 0/0 — which reached a production
 * board pack reading "0 drawn (NaN%)". A dash is the honest answer when there
 * is nothing to take a percentage of.
 */
export const pct = (n: number | null | undefined) =>
  (n == null || !Number.isFinite(n) ? '—' : `${Math.round(n)}%`);

/**
 * Dates follow the interface language. Arabic uses `ar` with the Gregorian
 * calendar and Western digits — which is what Saudi business documents use —
 * rather than the Hijri default some locales pick.
 */
export const when = (s: string | null | undefined, lang: 'en' | 'ar' = 'en') =>
  !s ? '—' : new Date(s).toLocaleDateString(
    lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB',
    { day: 'numeric', month: 'short', year: '2-digit' });

export const ago = (s: string, lang: 'en' | 'ar' = 'en') => {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (m < 60) return rtf.format(-m, 'minute');
  if (m < 1440) return rtf.format(-Math.floor(m / 60), 'hour');
  return rtf.format(-Math.floor(m / 1440), 'day');
};
