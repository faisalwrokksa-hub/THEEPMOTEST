'use client';
import { useMemo, useState } from 'react';
import { translator, type Lang } from '@/lib/i18n-dict';
import { compareTableValues, formatTableCount } from '@/lib/table-locale.mjs';

export type Col<T> = {
  key: string;
  head: string;
  /** Value used for sorting and filtering — keep it primitive. */
  value?: (row: T) => string | number | null;
  cell?: (row: T) => React.ReactNode;
  align?: 'start' | 'end';
  sortable?: boolean;
};

/**
 * Sortable, filterable table. Deliberately client-side: these are portfolio-
 * sized lists (tens to low hundreds), so a round-trip per sort would be slower
 * and worse. The API keeps its cursor pagination for when that stops being true.
 */
export function DataTable<T>({ rows, cols, filterPlaceholder, empty, initialSort, lang }: {
  rows: T[]; cols: Col<T>[]; filterPlaceholder?: string; empty?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** A string, not a function — this crosses the server/client boundary. */
  lang?: Lang;
}) {
  const locale = lang ?? 'en';
  const t = translator(locale);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);

  const val = (r: T, key: string) => {
    const c = cols.find((x) => x.key === key);
    return c?.value ? c.value(r) : null;
  };

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows;
    if (needle) {
      out = rows.filter((r) =>
        cols.some((c) => String(c.value?.(r) ?? '').toLowerCase().includes(needle)));
    }
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        return compareTableValues(x, y, locale, sort.dir);
      });
    }
    return out;
  }, [rows, cols, q, sort, locale]);

  function toggle(key: string) {
    setSort((s) => s?.key !== key ? { key, dir: 'asc' }
      : s.dir === 'asc' ? { key, dir: 'desc' } : null);
  }

  return (
    <>
      <div className="tabletools">
        <div className="search">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="7" cy="7" r="4.3" /><path d="M10.3 10.3L14 14" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={t(filterPlaceholder ?? 'Filter…')} aria-label={t('Filter rows')} dir="auto" />
          {q && <button className="clear" onClick={() => setQ('')} aria-label={t('Clear filter')}>×</button>}
        </div>
        <span className="dim" aria-live="polite">
          {view.length === rows.length
            ? `${formatTableCount(rows.length, locale)} ${t('rows')}`
            : `${formatTableCount(view.length, locale)} ${t('of')} ${formatTableCount(rows.length, locale)}`}
        </span>
      </div>

      {view.length === 0 ? (
        <div className="empty">
          <strong>{t(q ? 'Nothing matches that filter' : (empty ?? 'Nothing here yet'))}</strong>
          {q && <p>{t('Try a shorter search, or clear the filter.')}</p>}
        </div>
      ) : (
        <div className="scrollx">
          <table>
            <thead>
              <tr>
                {cols.map((c) => {
                  const on = sort?.key === c.key;
                  const can = c.sortable !== false && !!c.value;
                  return (
                    <th key={c.key} style={{ textAlign: c.align ?? 'start' }}
                        aria-sort={can ? (on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}>
                      {can ? (
                        <button className={`sortbtn${on ? ' on' : ''}`} onClick={() => toggle(c.key)}>
                          {t(c.head)}
                          <span className="arrow">{on ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      ) : t(c.head)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={(r as any).id ?? i}>
                  {cols.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align ?? 'start' }}>
                      {c.cell ? c.cell(r) : <bdi>{String(c.value?.(r) ?? '—')}</bdi>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
