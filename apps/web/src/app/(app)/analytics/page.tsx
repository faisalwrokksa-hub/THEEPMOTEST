import { Fragment } from 'react';
import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { money, pct } from '@/lib/fmt';
import { tr, getLang, term } from '@/lib/i18n';
import { LineChart, BarChart, StackedBar } from '@/components/Chart';

export default async function Analytics() {
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Portfolio Analytics" sub="Distributions across the whole portfolio — where the risk, the slippage and the spend actually sit.">
      <Loaded load={async () => ({ d: await api.analytics(), tr: await api.trends() })}>
        {({ d, tr: tre }: any) => {
          const total = d.byHealth.reduce((a: number, r: any) => a + r.n, 0) || 1;
          const maxSpend = Math.max(...d.spendByProject.map((s: any) => s.budget), 1);
          const heat = new Map<string, number>(
            d.riskHeat.map((r: any) => [`${r.severity}-${r.likelihood}`, Number(r.n)] as const),
          );
          return (
            <>
              <h2 className="sec" style={{ marginTop: 0 }}>{t('Spend against plan')}</h2>
              <p className="dim" style={{ marginTop: '-8px' }}>
                {t('Cumulative, month by month. Two straight lines mean nothing is being learned; the gap between them is the story.')}
              </p>
              <div className="chartcard">
                <LineChart
                  caption={t('Spend against plan')}
                  labels={tre.sCurve.map((p: any) => p.period.slice(0, 7))}
                  format={(v) => money(v) ?? '0'}
                  series={[
                    { key: 'plan', label: t('Planned'), colour: 'var(--ink-4)',
                      values: tre.sCurve.map((p: any) => p.cumBudget), dashed: true },
                    { key: 'actual', label: t('Actual'), colour: 'var(--accent)',
                      values: tre.sCurve.map((p: any) => p.cumActual) },
                    { key: 'forecast', label: t('Forecast'), colour: 'var(--warn)',
                      values: tre.sCurve.map((p: any) => p.cumForecast) },
                  ]} />
              </div>

              <div className="chartgrid">
                <div className="chartcard">
                  <h3>{t('Spend per month')}</h3>
                  <p className="sub">{t('Not cumulative — the rate, so a slowdown shows as a short bar rather than a flattening line.')}</p>
                  <BarChart
                    labels={tre.sCurve.map((p: any) => p.period.slice(5, 7))}
                    values={tre.sCurve.map((p: any) => p.actual)}
                    format={(v) => money(v) ?? '0'} />
                </div>
                <div className="chartcard">
                  <h3>{t('Gates passed per month')}</h3>
                  <p className="sub">{t('Delivery velocity. A portfolio that stops passing gates has stopped moving, whatever the progress bars say.')}</p>
                  {tre.throughput.length === 0
                    ? <p className="thin">{t('No gate has been passed yet, so there is no velocity to plot.')}</p>
                    : <BarChart
                        labels={tre.throughput.map((p: any) => p.period.slice(2))}
                        values={tre.throughput.map((p: any) => p.passed)}
                        colour="var(--good)"
                        format={(v) => String(Math.round(v))}
                        hrefs={tre.throughput.map(() => '/governance')} />}
                </div>
              </div>

              <h2 className="sec">{t('Portfolio over time')}</h2>
              {!tre.historyNote.enough ? (
                <p className="thin">
                  {tre.historyNote.days === 0
                    ? t('Nothing has been recorded yet. The platform photographs each workspace once a night, so this chart fills in from tomorrow — history cannot be invented backwards, because nothing in the live data remembers what yesterday looked like.')
                    : `${t('Recording since')} ${tre.historyNote.since} — ${tre.historyNote.days} ${t('day(s) so far. A trend needs about a week before it means anything.')}`}
                </p>
              ) : (
                <div className="chartcard">
                  <LineChart
                    caption={t('Portfolio over time')}
                    labels={tre.history.map((h: any) => h.onDate.slice(5))}
                    format={(v) => String(Math.round(v))}
                    series={[
                      { key: 'blocked', label: t('Gates blocked'), colour: 'var(--crit)',
                        values: tre.history.map((h: any) => h.gatesBlocked) },
                      { key: 'open', label: t('Open register items'), colour: 'var(--warn)',
                        values: tre.history.map((h: any) => h.openRegister) },
                      { key: 'progress', label: t('Average progress'), colour: 'var(--accent)',
                        values: tre.history.map((h: any) => h.avgProgress) },
                    ]} />
                </div>
              )}

              <h2 className="sec">{t('Project health')}</h2>
              <p className="dim" style={{ marginTop: '-8px' }}>
                {t('Each band is a link — click one to see exactly which projects it counts.')}
              </p>
              {/* Best to worst, always — a legend in arbitrary order makes the
                  reader work out the severity ranking for themselves. */}
              <StackedBar total={total} segments={[...d.byHealth]
                .sort((a: any, b: any) =>
                  ({ on_track: 0, at_risk: 1, critical: 2 } as any)[a.health] -
                  ({ on_track: 0, at_risk: 1, critical: 2 } as any)[b.health])
                .map((h: any) => ({
                label: term(t, h.health), value: h.n, href: `/projects?health=${h.health}`,
                colour: h.health === 'on_track' ? 'var(--good)'
                      : h.health === 'at_risk' ? 'var(--warn)' : 'var(--crit)',
              }))} />

              <h2 className="sec">{t('Gate funnel')}</h2>
              <p className="dim" style={{ marginTop: '-8px' }}>{t('How far projects have got. A wall of “locked” at one gate is where the portfolio is jamming.')}</p>
              <div className="funnel">
                {d.gateFunnel.map((g: any) => {
                  const inGate = g.approved + g.active + g.locked || 1;
                  return (
                    <div className="fcol" key={g.seq}>
                      <div className="fstack" title={`${g.approved} approved · ${g.active} active · ${g.locked} locked`}>
                        <span className="f-approved" style={{ height: `${(g.approved / inGate) * 100}%` }} />
                        <span className="f-active"   style={{ height: `${(g.active / inGate) * 100}%` }} />
                        <span className="f-locked"   style={{ height: `${(g.locked / inGate) * 100}%` }} />
                      </div>
                      <b>SG{g.seq}</b><em>{t(g.name)}</em>
                    </div>
                  );
                })}
              </div>

              <h2 className="sec">{t('Risk heat map')}</h2>
              <p className="dim" style={{ marginTop: '-8px' }}>{t('Open register items by impact (rows) against likelihood (columns). Top-right is where the danger is.')}</p>
              <div className="heat">
                <div className="hcorner" />
                {[1, 2, 3, 4, 5].map((l) => <div key={l} className="hhead">L{l}</div>)}
                {[5, 4, 3, 2, 1].map((sev) => (
                  <Fragment key={`row${sev}`}>
                    <div className="hhead">S{sev}</div>
                    {[1, 2, 3, 4, 5].map((lik) => {
                      const n = heat.get(`${sev}-${lik}`) ?? 0;
                      const score = sev * lik;
                      const cls = score >= 15 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low';
                      return <div key={`${sev}-${lik}`} className={`hcell h-${cls}${n ? ' filled' : ''}`}
                                  title={`impact ${sev} × likelihood ${lik} = ${score}`}>{n || ''}</div>;
                    })}
                  </Fragment>
                ))}
              </div>

              <h2 className="sec">{t('Budget vs spend')}</h2>
              <table>
                <thead><tr><th>{t('Project')}</th><th>{t('Budget')}</th><th>{t('Actual')}</th><th>{t('Drawn')}</th></tr></thead>
                <tbody>{d.spendByProject.map((s: any) => (
                  <tr key={s.code}>
                    <td><strong>{s.code}</strong></td>
                    <td className="num">{money(s.budget)}</td>
                    <td className="num">{money(s.actual)}</td>
                    <td>
                      <div className="bar" style={{ inlineSize: `${Math.max(8, (s.budget / maxSpend) * 200)}px` }}>
                        <i style={{ width: `${s.budget ? Math.min(100, (s.actual / s.budget) * 100) : 0}%` }} />
                      </div>
                      <span className="dim">{s.budget ? pct((s.actual / s.budget) * 100) : '—'}</span>
                    </td>
                  </tr>))}</tbody>
              </table>

              <h2 className="sec">{t('Schedule slippage')}</h2>
              <table>
                <thead><tr><th>{t('Project')}</th><th>{t('Baselined items')}</th><th>{t('Slipped')}</th><th>{t('Worst slip')}</th></tr></thead>
                <tbody>{d.slip.map((s: any) => (
                  <tr key={s.code}>
                    <td><strong>{s.code}</strong></td>
                    <td className="num">{s.baselined}</td>
                    <td className="num">{s.slipped > 0
                      ? <span className="crit">{s.slipped}</span> : <span className="good">0</span>}</td>
                    <td className="num">{s.worstSlipDays > 0
                      ? <span className="crit">+{s.worstSlipDays} days</span>
                      : <span className="good">on time</span>}</td>
                  </tr>))}</tbody>
              </table>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
