import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { money, num } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

export default async function Financials({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  // Outside <Loaded> on purpose: the create form must render even when the
  // list below is empty, which is precisely when someone needs it.
  const o = await api.createOptions().catch(() => ({ projects: [], people: [] }));
  return (
    <Page title="Financials"
          sub="Budget, committed, spent and forecast — with earned value, so an overrun shows before it lands.">
      <Flash error={error} done={done} lang={lang} />
      <NewRecord lang={lang} kind="cost" title="New cost line" cta="Add cost line" returnTo="/financials"
        intro="Budget, commitment, actual and forecast are separate lines against the same project. Keeping them apart is what makes variance and CPI mean anything."
        fields={[
                { name: 'projectId', label: 'Project', type: 'select', required: true,
                  options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
                { name: 'kind', label: 'Type', type: 'select', required: true, options: [
                  { value: 'budget', label: 'Budget' }, { value: 'commitment', label: 'Commitment' },
                  { value: 'actual', label: 'Actual' }, { value: 'forecast', label: 'Forecast' }] },
                { name: 'category', label: 'Category', required: true, placeholder: 'Construction' },
                { name: 'amount', label: 'Amount', type: 'number', required: true, step: 'any' },
                { name: 'currency', label: 'Currency', minLength: 3, maxLength: 3, pattern: '[A-Za-z]{3}', placeholder: 'SAR', hint: 'Three letters' },
                { name: 'period', label: 'Period', type: 'date', hint: 'The month this belongs to' },
                { name: 'note', label: 'Note', type: 'textarea' },
              ]} />
      <Loaded load={api.financials}>
        {(d) => {
          // Not `t` — that is the translate function above.
          const tot = d.byProject.reduce((a: any, r: any) => ({
            budget: a.budget + r.budget, committed: a.committed + r.committed,
            actual: a.actual + r.actual, forecast: a.forecast + r.forecast,
          }), { budget: 0, committed: 0, actual: 0, forecast: 0 });
          const over = tot.forecast - tot.budget;
          return (
            <>
              <div className="tiles">
                <div className="tile"><span>{t('Approved budget')}</span><strong>{money(tot.budget)}</strong>
                  <div className="split"><i className="dim">SAR</i></div></div>
                <div className="tile"><span>{t('Committed')}</span><strong>{money(tot.committed)}</strong>
                  <div className="bar"><i style={{ width: `${(tot.committed / tot.budget) * 100}%` }} /></div></div>
                <div className="tile"><span>{t('Actual spend')}</span><strong>{money(tot.actual)}</strong>
                  <div className="bar"><i style={{ width: `${(tot.actual / tot.budget) * 100}%` }} /></div></div>
                <div className={`tile${over > 0 ? ' alarm' : ''}`}>
                  <span>{t('Forecast variance')}</span>
                  <strong className={over > 0 ? 'crit' : 'good'}>{over > 0 ? '+' : ''}{money(over)}</strong>
                  <div className="split"><i className="dim">{t('forecast vs approved')}</i></div></div>
              </div>

              <h2 className="sec">{t('By project')}</h2>
              <div className="scrollx">
                <table>
                  <thead><tr>
                    <th>{t('Project')}</th><th>{t('Budget')}</th><th>{t('Committed')}</th><th>{t('Actual')}</th>
                    <th>{t('Earned value')}</th><th>{t('CPI')}</th><th>{t('Forecast')}</th><th>{t('Variance')}</th>
                  </tr></thead>
                  <tbody>
                    {d.byProject.map((r: any) => (
                      <tr key={r.id}>
                        <td><strong>{r.code}</strong><div className="dim">{r.progressPct}% complete</div></td>
                        <td className="num">{money(r.budget)}</td>
                        <td className="num">{money(r.committed)}</td>
                        <td className="num">{money(r.actual)}</td>
                        <td className="num">{money(r.earnedValue)}</td>
                        <td className="num">{r.cpi == null
                          ? <span className="dim" title={r.cpiSuppressed
                              ? `Only ${Math.round(r.drawnPct)}% of budget drawn — too early for a meaningful CPI`
                              : 'No spend recorded'}>too early</span>
                          : <span className={r.cpi >= 1 ? 'good' : 'crit'}>{num(r.cpi, 2)}</span>}</td>
                        <td className="num">{money(r.forecast)}
                          {r.forecastCoverage < 1 && (
                            <div className="dim" title="Categories without their own forecast fall back to budget">
                              {Math.round(r.forecastCoverage * 100)}% forecast, rest at budget
                            </div>)}</td>
                        <td className="num">{r.variance > 0
                          ? <span className="crit">+{money(r.variance)}</span>
                          : <span className="good">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="explain">
                <summary>{t('What CPI and earned value mean')}</summary>
                <p><strong>{t('Earned value')}</strong> is the budget you have genuinely earned: percent complete ×
                  budget. <strong>CPI</strong> (cost performance index) is earned value ÷ actual spend. Above
                  1.00 means you are getting more work per riyal than planned; below 1.00 means the opposite,
                  and the gap grows as the project runs. It is the earliest reliable signal of an overrun —
                  well before the money is gone.</p>
                <p>{t('It only becomes meaningful once spend covers a comparable scope, so projects with less than 15% of budget drawn show')} <em>too early</em> rather than a misleadingly high number.</p>
              </details>

              <h2 className="sec">{t('By category')}</h2>
              <table>
                <thead><tr><th>{t('Category')}</th><th>{t('Budget')}</th><th>{t('Actual')}</th><th>{t('Drawn')}</th></tr></thead>
                <tbody>
                  {d.byCategory.map((c: any) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="num">{money(c.budget)}</td>
                      <td className="num">{money(c.actual)}</td>
                      <td><div className="bar" style={{ inlineSize: 140 }}>
                        <i style={{ width: `${c.budget ? Math.min(100, (c.actual / c.budget) * 100) : 0}%` }} />
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
