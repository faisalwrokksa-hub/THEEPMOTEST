import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { tr, term } from '@/lib/i18n';
import { executiveSummary } from '@/lib/decision-cockpit';
import { portfolioSignals } from '@/lib/portfolio-intelligence';

/** Read-only executive actions surface. Uses the existing tenant/RLS-filtered
 * overview route; does not query financial data or issue approval mutations. */
export default async function DecisionCockpit() {
  const t = await tr();
  return (
    <Page title="Executive Decision Cockpit"
      sub="Prioritized exceptions, underlying evidence and suggested next actions. Recommendations are rules-based, not predictions.">
      <Loaded load={api.overview}>
        {(d: any) => {
          const queue = executiveSummary(d.attention ?? []);
          return <>
            <div className="tiles">
              <div className="tile"><span>{t('Critical attention')}</span><strong className="crit">{queue.critical}</strong></div>
              <div className="tile"><span>{t('High attention')}</span><strong>{queue.high}</strong></div>
              <div className="tile"><span>{t('Gates blocked')}</span><strong>{d.gates?.blocked ?? '—'}</strong></div>
              <div className="tile"><span>{t('Overdue register items')}</span><strong>{d.register?.overdue ?? '—'}</strong></div>
            </div>
            <p className="dim">{t('Priority severity is derived from project health, gate signals and RAID status. Open a source record before acting.')} {queue.total > queue.shown && `${t('Showing')} ${queue.shown} ${t('of')} ${queue.total}.`}</p>
            {queue.items.length === 0 ?
              <p className="quietempty">{t('No exceptions returned. Confirm data freshness before interpreting this as no risk.')}</p> :
              <table>
                <thead><tr><th>{t('Priority')}</th><th>{t('Project')}</th><th>{t('Evidence')}</th><th>{t('Recommended action')}</th><th>{t('Source')}</th></tr></thead>
                <tbody>{queue.items.map(item => <tr key={item.projectId}>
                  <td><span className={`pill ${item.severity === 'critical' ? 'critical' : item.severity === 'high' ? 'at_risk' : ''}`}>{t(item.severity)}</span></td>
                  <td><strong>{item.code}</strong><div className="dim">{item.name}</div><div className="dim">{term(t, item.health)}</div></td>
                  <td>{item.reasons.map((reason,i) => <div key={`${reason.key}-${i}`}>{reason.count === undefined ? t(reason.key) : `${reason.count} ${t(reason.key)}`}</div>)}</td>
                  <td>{t(item.recommendation)}<div className="dim">{t('Decision support only — confirm with the accountable owner.')}</div></td>
                  <td><a className="btn ghost" href={item.source}>{t('Review source')}</a></td>
                </tr>)}</tbody>
              </table>}
            <section aria-label="Portfolio historical intelligence">
              <h2>{t('Portfolio historical intelligence')}</h2>
              <Loaded load={api.trends}>{(trendData: any) => {
                const intelligence = portfolioSignals(trendData.history ?? []);
                return <>
                  <p className="dim">{t('Observed portfolio changes only; no predictive claims or cross-customer benchmarking.')} {intelligence.sampleDays} {t('daily snapshots')} · {t(intelligence.confidence)}</p>
                  <table><thead><tr><th>{t('Indicator')}</th><th>{t('Direction')}</th><th>{t('Observed change')}</th><th>{t('Evidence')}</th></tr></thead>
                  <tbody>{intelligence.signals.map(signal => <tr key={signal.key}><td>{t(signal.key)}</td><td>{t(signal.direction)}</td><td>{signal.change === null ? '—' : signal.change > 0 ? `+${signal.change}` : signal.change}</td><td>{t(signal.explanation)} <a href={signal.source}>{t('Review snapshots')}</a></td></tr>)}</tbody></table>
                  <p className="dim">{t(intelligence.note)}</p>
                </>;
              }}</Loaded>
            </section>
            <p className="dim">{t('Counts in the severity tiles refer only to the displayed priority queue (maximum 50 records); gate and overdue totals are portfolio aggregates.')}</p>
          </>;
        }}
      </Loaded>
    </Page>
  );
}
