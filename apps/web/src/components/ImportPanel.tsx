'use client';
import { useRef, useState } from 'react';
import { translator, type Lang } from '@/lib/i18n-dict';

export type ImportReport = {
  ok: boolean;
  projectCode?: string;
  mode?: 'created' | 'updated';
  created: Record<string, number>;
  problems: string[];
  warnings: string[];
  conflict?: { code: string; name: string; createdAt: string | null; holds: Record<string, number> };
};

/** Field names as the report counts them, said in English. */
const COUNTED: Record<string, string> = {
  projects: 'project', portfolios: 'portfolios', programs: 'programmes',
  gates: 'gates', criteria: 'gate criteria', schedule: 'schedule items',
  raid: 'register items', raidUpdated: 'register items updated',
  costs: 'cost lines', benefits: 'benefits', stakeholders: 'stakeholders',
  resources: 'resource allocations', documents: 'documents',
  documentsUpdated: 'documents updated', updates: 'updates',
};

/**
 * Upload a workbook, and deal with the one answer that is a question rather
 * than a failure: that project code is already in use.
 *
 * It used to refuse — "change the code, or delete that project first" — which
 * is the wrong advice almost every time it appeared. The usual way to get here
 * is to export a project, edit it in Excel and send it back; being told to
 * delete the project to do that means throwing away its gate signatures to fix
 * a typo. So the file stays in the page, the question gets asked, and pressing
 * Update sends the same bytes again with the mode set.
 *
 * Without JavaScript the plain form below still posts and still redirects; the
 * conflict is then reported but cannot be acted on from there.
 */
export function ImportPanel({ lang }: { lang?: Lang }) {
  const t = translator(lang ?? 'en');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [preflight, setPreflight] = useState<{ok:boolean;readOnly:boolean;sheets:{sheet:string;records:number}[];problems:string[];warnings:string[]} | null>(null);

  async function preview() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError(t('Choose a .xlsx workbook to upload.')); return; }
    setBusy(true); setError(''); setPreflight(null);
    try {
      const body = new FormData(); body.append('file',file,file.name);
      const response = await fetch('/api/excel/preview', {method:'POST',body,headers:{accept:'application/json'}});
      const payload = await response.json();
      if (!response.ok) {setError(String(payload.error ?? payload.message ?? 'Preview failed')); return;}
      setPreflight(payload);
    } catch {setError(t('Could not reach the server. Check your connection and try again.'));}
    finally {setBusy(false);}
  }

  async function send(mode: 'create' | 'update') {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError(t('Choose a .xlsx workbook to upload.')); return; }
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      body.append('mode', mode);
      const res = await fetch('/api/excel/upload', {
        method: 'POST', body, headers: { accept: 'application/json' },
      });
      const j = await res.json().catch(() => ({}) as any);
      if (!res.ok || j?.error) { setError(String(j?.error || t('The import failed.'))); return; }
      setReport(j as ImportReport);
    } catch {
      setError(t('Could not reach the server. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  const conflict = report?.conflict;

  return (
    <>
      <section className="panel">
        <h2>{t('Upload a workbook')}</h2>
        <p className="dim">{t('The whole file loads at once or not at all, so a failure part-way cannot leave a project with a schedule and no gates. Columns are matched by name in either language.')}</p>
        <form className="act inline" method="post" action="/api/excel/upload"
              encType="multipart/form-data"
              onSubmit={(e) => { e.preventDefault(); void send('create'); }}>
          <input ref={fileRef} type="file" name="file" accept=".xlsx" required
                 onChange={() => { setReport(null); setPreflight(null); setError(''); }} />
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void preview()}>Preview (no changes)</button>
          <button className="btn" type="submit" disabled={busy || !!preflight && !preflight.ok}>
            {busy ? t('Reading…') : t('Import')}
          </button>
        </form>
        {error && <p className="formerr" role="alert" style={{ marginBlockStart: 12 }}>{error}</p>}
      </section>

      {preflight && <section className="panel wide" role="status">
        <h3>Workbook validation preview — no data changed</h3>
        <p>{preflight.ok ? 'Basic workbook checks passed. Import may still fail server-side validation.' : 'Fix the problems before importing.'}</p>
        <ul>{preflight.sheets.map(s => <li key={s.sheet}>{s.sheet}: {s.records} records</li>)}</ul>
        {preflight.problems.map((p,i) => <p className="crit" key={i}>{p}</p>)}
        {preflight.warnings.map((w,i) => <p className="dim" key={i}>{w}</p>)}
      </section>}
      {conflict && (
        <section className="panel importask wide" role="alert">
          <h2>{t('That code is already in use')}</h2>
          {/* Code and name, no verb between them: a bare "is" is not a string
              that can be translated on its own. */}
          <p>
            <strong>{conflict.code}</strong> — <strong>{conflict.name}</strong>
            {conflict.createdAt && (
              <span className="dim"> · {t('in this workspace since')} {new Date(conflict.createdAt)
                .toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB',
                  { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            )}
          </p>
          {Object.keys(conflict.holds).length > 0 && (
            <ul className="counts">
              {Object.entries(conflict.holds).map(([k, n]) => (
                <li key={k}><strong>{n}</strong> {t(COUNTED[k] ?? k)}</li>
              ))}
            </ul>
          )}
          {/* Each heading travels with its own list. As flat siblings in the
              grid they wrapped into whichever column came next, which read as
              one list of five things under the first heading. */}
          <div className="whathappens">
            <div>
              <p>{t('Updating it would')}</p>
              <ul>
                <li>{t('replace the schedule, cost lines, benefits, stakeholders and resourcing with what is in the sheet')}</li>
                <li>{t('update register items and documents that match by name, and add the ones that do not')}</li>
                <li>{t('add any new update entries, skipping ones already recorded word for word')}</li>
              </ul>
            </div>
            <div>
              <p>{t('It would not touch')}</p>
              <ul>
                <li>{t('the gates, their checklists, or anything already signed off')}</li>
                <li>{t('register items and documents that are not named in the sheet')}</li>
              </ul>
            </div>
          </div>
          <div className="btnrow">
            <button className="btn" type="button" disabled={busy} onClick={() => void send('update')}>
              {busy ? t('Updating…') : `${t('Update')} ${conflict.code}`}
            </button>
            <button className="btn ghost" type="button" onClick={() => setReport(null)}>
              {t('Cancel')}
            </button>
          </div>
          <p className="dim">{t('To load it as a separate project instead, change the project code in the sheet and upload again.')}</p>
        </section>
      )}

      {report && !conflict && <Report t={t} r={report} />}
    </>
  );
}

/** The outcome of an import that actually ran. */
export function Report({ t, r }: { t: (s: string) => string; r: ImportReport }) {
  const headline = !r.ok ? t('Nothing was imported')
    : r.mode === 'updated' ? `${t('Updated')} ${r.projectCode}`
    : `${t('Imported')} ${r.projectCode}`;
  return (
    <div className={`panel wide ${r.ok ? 'importok' : 'importbad'}`} role="status">
      <h2>{headline}</h2>
      {r.ok && (
        <ul className="counts">
          {Object.entries(r.created).map(([k, n]) => (
            <li key={k}><strong>{n}</strong> {t(COUNTED[k] ?? k)}</li>
          ))}
        </ul>
      )}
      {r.problems.map((p, i) => <p className="crit" key={i}>{p}</p>)}
      {r.warnings.length > 0 && (
        <>
          <h3>{t('Worth knowing')}</h3>
          <ul className="warns">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </>
      )}
      {r.ok && r.projectCode && <a className="btn" href="/governance">{t('Govern it')}</a>}
    </div>
  );
}
