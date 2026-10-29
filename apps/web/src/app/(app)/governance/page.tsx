import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { tr, getLang } from '@/lib/i18n';

export default async function GovernancePage() {
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Stage Gates" sub="Which projects are stuck, at which gate, and why. Open one to tick criteria, sign approvals and pass the gate.">
      <Loaded load={api.gates} empty="No projects have an active gate.">
        {(gates) => (
          <table>
            <thead>
              <tr><th>{t('Project')}</th><th>{t('Current gate')}</th><th>{t('Checklist')}</th>
                  <th>{t('Signatures')}</th><th>{t('Accountable')}</th><th>{t('Blocked by')}</th>
                  <th>{t('Can pass?')}</th><th></th></tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.gateId}>
                  <td>
                    <a href={`/governance/${g.projectId}`}><strong>{g.projectCode}</strong></a>
                    <div className="dim">{g.projectName}</div>
                  </td>
                  <td>SG{g.seq} {t(g.name)}</td>
                  <td className="num">
                    {g.criteriaTotal === 0
                      ? <span className="dim">{t('no checklist')}</span>
                      : <><span className={g.criteriaMet === g.criteriaTotal ? 'good' : 'warnt'}>
                          {g.criteriaMet}/{g.criteriaTotal}</span>
                          <div className="bar"><i style={{ width: `${(g.criteriaMet / g.criteriaTotal) * 100}%` }} /></div></>}
                  </td>
                  <td className="num">{g.unsigned === 0
                    ? <span className="good">{t('all signed')}</span>
                    : <span className="warnt">{g.unsigned} {t('pending')}</span>}</td>
                  <td>{g.accountable ?? <span className="dim">{t('unassigned')}</span>}</td>
                  <td>{g.blockedBy.length === 0
                    ? <span className="dim">—</span>
                    : g.blockedBy.map((b) => <div key={b} className="crit">{b}</div>)}</td>
                  <td>{g.mayPass
                    ? <span className="pill on_track">{t('yes')}</span>
                    : <span className="pill critical">{t('no')}</span>}</td>
                  <td><a className="btn ghost" href={`/governance/${g.projectId}`}>{t('Open')}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loaded>
    </Page>
  );
}
