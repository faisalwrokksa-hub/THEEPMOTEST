import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { num, when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

export default async function Benefits({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  // Outside <Loaded> on purpose: the create form must render even when the
  // list below is empty, which is precisely when someone needs it.
  const o = await api.createOptions().catch(() => ({ projects: [], people: [] }));
  return (
    <Page title="Benefits"
          sub="Did the project deliver the value it promised? Tracked after handover — the step most tools skip.">
      <Flash error={error} done={done} lang={lang} />
      <NewRecord lang={lang} kind="benefit" title="New benefit" cta="Add benefit" returnTo="/benefits"
        intro="A benefit is the value the project promised. Recording the measure and its baseline now is what makes it checkable after handover."
        fields={[
                { name: 'name', label: 'Benefit', required: true, placeholder: 'Additional rental income' },
                { name: 'measure', label: 'Measure', required: true, placeholder: 'Annual rental income (SAR)' },
                { name: 'projectId', label: 'Project', type: 'select',
                  options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
                { name: 'baseline', label: 'Baseline', type: 'number', hint: 'Where it stands today' },
                { name: 'target', label: 'Target', type: 'number' },
                { name: 'actual', label: 'Actual', type: 'number', hint: 'Leave blank until measured' },
                { name: 'status', label: 'Status', type: 'select', options: [
                  { value: 'planned', label: 'Planned' }, { value: 'in_progress', label: 'In progress' },
                  { value: 'realized', label: 'Realised' }, { value: 'missed', label: 'Missed' }] },
                { name: 'reviewDate', label: 'Review date', type: 'date' },
                { name: 'ownerId', label: 'Owner', type: 'select',
                  options: o.people.map((p: any) => ({ value: p.id, label: p.name })) },
              ]} />
      <Loaded load={api.benefits} empty="No benefits defined yet.">
        {(list) => (
          <>
            <table>
              <thead><tr>
                <th>{t('Benefit')}</th><th>{t('Project')}</th><th>{t('Measure')}</th><th>{t('Baseline')}</th>
                <th>{t('Target')}</th><th>{t('Actual')}</th><th>{t('Progress')}</th><th>{t('Review')}</th><th>{t('Status')}</th>
              </tr></thead>
              <tbody>
                {list.map((b: any) => (
                  <tr key={b.id}>
                    <td><strong>{b.name}</strong>
                      {b.owner && <div className="dim">{b.owner}</div>}</td>
                    <td className="num">{b.projectCode ?? '—'}</td>
                    <td className="dim">{b.measure}
                      {b.direction === 'decrease' && <div className="kind">lower is better</div>}</td>
                    <td className="num">{num(b.baseline)}</td>
                    <td className="num">{num(b.target)}</td>
                    <td className="num">{num(b.actual)}</td>
                    <td>{b.pctOfTarget == null ? <span className="dim">—</span> : (
                      <><div className="bar" style={{ inlineSize: 110 }}>
                        <i style={{ width: `${b.pctOfTarget}%` }} /></div>
                        <span className="dim">{b.pctOfTarget}% of the way from baseline to target</span></>)}</td>
                    <td>{when(b.reviewDate, lang)}</td>
                    <td><span className={`pill b-${b.status}`}>{b.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="explain">
              <summary>{t('Why benefits are tracked separately from delivery')}</summary>
              <p>{t('A project can finish on time and on budget and still deliver nothing of value. Benefits have their own owner and their own review date — often a year or more after handover — so the question &ldquo;was this worth doing?&rdquo; still gets asked once the delivery team has moved on. Baseline is where you started, target is what you promised, actual is where you are.')}</p>
            </details>
          </>
        )}
      </Loaded>
    </Page>
  );
}
