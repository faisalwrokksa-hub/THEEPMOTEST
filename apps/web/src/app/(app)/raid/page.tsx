import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { getLang, tr } from '@/lib/i18n';

export default async function RaidPage({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const t = await tr();
  const lang = await getLang();
  return (
    <Page title="RAID & Governance"
          sub="Risks, assumptions, issues, dependencies, changes and decisions. An open item pointed at a gate holds that gate shut.">
      <Flash error={error} done={done} lang={lang} />
      <Loaded load={async () => ({ items: await api.raid(), o: await api.createOptions() })}>
        {({ items, o }) => (
          <>
            <NewRecord lang={lang} kind="raid" title="New register item" cta="Add to register" returnTo="/raid"
              intro="Point an item at a project's open gate and it will hold that gate shut until the item is closed."
              fields={[
                { name: 'projectId', label: 'Project', type: 'select', required: true,
                  options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
                { name: 'kind', label: 'Type', type: 'select', required: true, options: [
                  { value: 'risk', label: 'Risk' }, { value: 'issue', label: 'Issue' },
                  { value: 'dependency', label: 'Dependency' }, { value: 'assumption', label: 'Assumption' },
                  { value: 'change', label: 'Change' }, { value: 'decision', label: 'Decision' }] },
                { name: 'title', label: 'Title', required: true,
                  placeholder: 'Contractor has not submitted signed bonds' },
                { name: 'severity', label: 'Impact (1–5)', type: 'number', min: 1, max: 5, step: 1, hint: '5 = severe' },
                { name: 'likelihood', label: 'Likelihood (1–5)', type: 'number', min: 1, max: 5, step: 1, hint: '5 = almost certain' },
                { name: 'ownerId', label: 'Owner', type: 'select',
                  options: o.people.map((p: any) => ({ value: p.id, label: p.name })) },
                { name: 'dueDate', label: 'Due date', type: 'date' },
                { name: 'detail', label: 'Detail', type: 'textarea' },
                { name: 'blocksActiveGate', label: 'Block this project’s open gate until closed',
                  type: 'checkbox' },
              ]} />

            {items.length === 0 ? (
              <div className="empty">
                <strong>{t('The register is empty')}</strong>
                <p>{t('Add risks, issues and dependencies above. Pointing one at a gate is what turns a register entry into a control.')}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>{t('Project')}</th><th>{t('Type')}</th><th>{t('Item')}</th><th>{t('Risk')}</th>
                      <th>{t('Owner')}</th><th>{t('Blocks')}</th><th>{t('Status')}</th></tr>
                </thead>
                <tbody>
                  {items.map((r: any) => (
                    <tr key={r.id} style={r.status === 'closed' ? { opacity: 0.55 } : undefined}>
                      <td className="num">{r.projectCode}</td>
                      <td><span className={`kind k-${r.kind}`}>{r.kind}</span></td>
                      <td><strong>{r.title}</strong>{r.detail && <div className="dim">{r.detail}</div>}</td>
                      <td className="num">{r.severity && r.likelihood
                        ? <span className={r.severity * r.likelihood >= 15 ? 'crit' : 'warnt'}>
                            {r.severity * r.likelihood} of 25</span>
                        : <span className="dim">—</span>}</td>
                      <td>{r.owner ?? <span className="dim">unassigned</span>}</td>
                      <td>{r.blocksGate
                        ? <span className="crit">{r.blocksGate}</span>
                        : <span className="dim">—</span>}</td>
                      <td><span className={`pill s-${r.status}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Loaded>
    </Page>
  );
}
