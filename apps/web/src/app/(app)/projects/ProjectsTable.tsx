'use client';
import { DataTable, type Col } from '@/components/DataTable';
import { money, when } from '@/lib/fmt';
import { translator, type Lang } from '@/lib/i18n-dict';
import Link from 'next/link';

type Row = {
  id: string; code: string; name: string; status: string; health: string;
  progressPct: number; budgetAmount: string | number | null; endDate: string | null;
};

const makeCols = (t: (s: string) => string, lang: Lang): Col<Row>[] => [
  { key: 'code', head: 'Code', value: (r) => r.code,
    cell: (r) => <span className="num">{r.code}</span> },
  { key: 'name', head: 'Project', value: (r) => r.name,
    cell: (r) => <><strong>{r.name}</strong><div><Link href={`/governance/${r.id}`}>
      {lang === 'ar' ? 'فتح الحوكمة' : 'Open governance'}
    </Link></div></> },
  { key: 'status', head: 'Status', value: (r) => r.status,
    cell: (r) => <span className="kind">{t(r.status.replace('_', ' '))}</span> },
  { key: 'health', head: 'Health',
    // Sort by severity, not alphabetically — critical must come first.
    value: (r) => ({ critical: 0, at_risk: 1, on_track: 2 } as any)[r.health] ?? 3,
    cell: (r) => <span className={`pill ${r.health}`}>{t(r.health.replace('_', ' '))}</span> },
  { key: 'progress', head: 'Progress', value: (r) => r.progressPct,
    cell: (r) => (
      <>
        <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, Number.isFinite(r.progressPct) ? r.progressPct : 0))}%` }} /></div>
        <span className="dim">{r.progressPct}%</span>
      </>
    ) },
  { key: 'budget', head: 'Budget', align: 'end',
    value: (r) => Number(r.budgetAmount ?? 0),
    cell: (r) => <span className="num">{money(Number(r.budgetAmount ?? 0) || null)}</span> },
  { key: 'end', head: 'Due', align: 'end', value: (r) => r.endDate ?? '',
    cell: (r) => <span className="num">{when(r.endDate, lang)}</span> },
];

export function ProjectsTable({ rows, lang }: { rows: Row[]; lang?: Lang }) {
  const cols = makeCols(translator(lang ?? 'en'), lang ?? 'en');
  return <DataTable rows={rows} cols={cols} lang={lang}
                    filterPlaceholder={lang === 'ar' ? 'ابحث برمز المشروع أو اسمه أو حالته…' : 'Filter by code, name or status…'}
                    initialSort={{ key: 'health', dir: 'asc' }} empty={lang === 'ar' ? 'لا توجد مشاريع بعد.' : 'No projects yet.'} />;
}
