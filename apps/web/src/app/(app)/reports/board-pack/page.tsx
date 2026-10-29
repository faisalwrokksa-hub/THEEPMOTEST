import { api, getSession } from '@/lib/api';
import { Loaded } from '@/components/Page';
import { money, pct, when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';
import { parts, term, type T } from '@pmo/contracts';
import { attentionReasonText } from '@/lib/executive-attention';

/**
 * One translated sentence, with its figures in bold.
 *
 * The sentence is translated whole and only then broken apart, so the bold
 * runs land wherever the target language puts the numbers rather than where
 * English put them.
 */
function Say({ t, s, v }: { t: T; s: string; v: Record<string, string | number> }) {
  return (
    <>
      {parts(t(s), v).map((p, i) =>
        p.slot
          /*
           * <bdi> isolates the value from the sentence around it. A slot holds
           * live data whose direction nobody can predict — a date, an English
           * project name, a blocker written by the contractor — and dropping
           * Latin text into an Arabic sentence without isolation lets the
           * bidirectional algorithm reorder it against the neighbouring words.
           * That is what turned "20 Sept 26" into "Sept 26 20" in the pack.
           */
          ? <strong key={i}><bdi>{p.text}</bdi></strong>
          : <span key={i}>{p.text}</span>)}
    </>
  );
}

/** A live, print-ready board pack. Ctrl/Cmd-P gives a clean PDF. */
export default async function BoardPack() {
  const t = await tr();
  const lang = await getLang();
  /*
   * The workspace name was hard-coded to one customer's, so every tenant's
   * board pack carried the same company name on its front page — including
   * packs built from an entirely different tenant's data. It comes from the
   * session now, which is the only thing that knows whose pack this is.
   */
  const session = await getSession();
  const workspace = session.authenticated ? session.tenantName : '';
  return (
    <Loaded load={async () => ({
      o: await api.overview(), g: await api.gates(), f: await api.financials(),
    })}>
      {({ o, g, f }) => {
        // Not `t` — that is the translate function in the enclosing scope.
        const totals = f.byProject.reduce((a: any, r: any) => ({
          budget: a.budget + r.budget, actual: a.actual + r.actual,
        }), { budget: 0, actual: 0 });
        const one = o.gates.blocked === 1;
        return (
          <article className="pack">
            <header>
              <div>
                <h1>{t('Portfolio Board Pack')}</h1>
                <p className="dim">
                  <bdi>{workspace}</bdi> · <Say t={t} s="generated {date}"
                    v={{ date: when(new Date().toISOString(), lang) }} />
                </p>
              </div>
              <span className="tag">{t('Live data')}</span>
            </header>

            <h2>1 · {t('Position')}</h2>
            <p>
              {o.health.total === 0 ? t('This workspace has no projects yet, so there is nothing to report on.') : (
                <>
                  <Say t={t}
                    s="The portfolio holds {total} projects: {onTrack} on track, {atRisk} at risk and {critical} critical. Average delivery progress is {progress}."
                    v={{ total: o.health.total, onTrack: o.health.on_track,
                         atRisk: o.health.at_risk, critical: o.health.critical,
                         progress: pct(o.health.avg_progress) }} />{' '}
                  <Say t={t}
                    s={one
                      ? 'Of {active} active stage gates, {blocked} is blocked, which holds the associated funding.'
                      : 'Of {active} active stage gates, {blocked} are blocked, which holds the associated funding.'}
                    v={{ active: o.gates.active, blocked: o.gates.blocked }} />{' '}
                  {/* 0/0 is not 0% — an unfunded portfolio gets a different sentence. */}
                  {totals.budget > 0
                    ? <Say t={t} s="Approved budget stands at {budget} SAR with {actual} drawn ({drawn})."
                        v={{ budget: money(totals.budget), actual: money(totals.actual),
                             drawn: pct((totals.actual / totals.budget) * 100) }} />
                    : t('No budget has been approved yet.')}
                </>
              )}
            </p>

            <h2>2 · {t('Gate status')}</h2>
            <table>
              <thead><tr><th>{t('Project')}</th><th>{t('Gate')}</th><th>{t('Checklist')}</th><th>{t('Accountable')}</th><th>{t('Blocked by')}</th></tr></thead>
              <tbody>{g.length === 0 ? (
                <tr><td colSpan={5} className="dim">{t('No active stage gates.')}</td></tr>
              ) : g.map((r: any) => (
                <tr key={r.gateId}>
                  <td><strong>{r.projectCode}</strong></td>
                  <td><bdi>SG{r.seq} {t(r.name)}</bdi></td>
                  <td>{r.criteriaTotal ? `${r.criteriaMet}/${r.criteriaTotal}` : '—'}</td>
                  <td><bdi>{r.accountable ?? '—'}</bdi></td>
                  <td><bdi>{r.blockedBy.length ? r.blockedBy.join('; ') : '—'}</bdi></td>
                </tr>))}</tbody>
            </table>

            <h2>3 · {t('Executive priorities')}</h2>
            {o.attention.length === 0 ? <p>{t('None.')}</p> : (
              <ol className="decisions">
                {o.attention.map((a: any) => (
                  <li key={a.projectId}>
                    {a.gateSeq === null
                      ? <Say t={t} s="{code} — {name} is {health} and has no active gate."
                          v={{ code: a.code, name: a.name, health: term(t, a.health) }} />
                      : <Say t={t} s="{code} — {name} is {health} at {gate}."
                          v={{ code: a.code, name: a.name, health: term(t, a.health),
                               gate: `SG${a.gateSeq} ${t(a.gateName ?? '')}` }} />}
                    {' '}<Say t={t} s="The blocker is: {reason}."
                      v={{ reason: attentionReasonText(a, t, lang) }} />
                  </li>
                ))}
              </ol>
            )}

            <h2>4 · {t('Cost performance')}</h2>
            <table>
              <thead><tr><th>{t('Project')}</th><th>{t('Budget')}</th><th>{t('Actual')}</th><th>{t('CPI')}</th><th>{t('Forecast')}</th></tr></thead>
              <tbody>{f.byProject.length === 0 ? (
                <tr><td colSpan={5} className="dim">{t('No costs recorded.')}</td></tr>
              ) : f.byProject.map((r: any) => (
                <tr key={r.id}>
                  <td><strong>{r.code}</strong></td>
                  <td>{money(r.budget)}</td><td>{money(r.actual)}</td>
                  <td>{r.cpi ? r.cpi.toFixed(2) : '—'}</td>
                  <td>{money(r.forecast || r.budget)}</td>
                </tr>))}</tbody>
            </table>

            <footer className="dim">
              {t('Generated from live portfolio data. Every figure traces to a record in the platform.')}
            </footer>
          </article>
        );
      }}
    </Loaded>
  );
}
