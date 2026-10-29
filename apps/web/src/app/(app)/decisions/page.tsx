import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { when } from '@/lib/fmt';
import { tr, getLang, term } from '@/lib/i18n';

export default async function Decisions() {
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Decisions" sub="The decision log. Every recorded decision, who owned it, and which gate it was taken at — the record auditors ask for first.">
      <Loaded load={api.decisions} empty="No decisions recorded yet. They are logged as you close gates.">
        {(list) => (
          <table>
            <thead><tr><th>{t('Decision')}</th><th>{t('Project')}</th><th>{t('Taken at')}</th><th>{t('Owner')}</th><th>{t('Date')}</th><th>{t('State')}</th></tr></thead>
            <tbody>{list.map((d: any) => (
              <tr key={d.id}>
                <td><strong>{d.title}</strong>{d.detail && <div className="dim">{d.detail}</div>}</td>
                <td className="num">{d.projectCode}</td>
                <td>{d.atGate ?? <span className="dim">not gate-linked</span>}</td>
                <td>{d.owner ?? <span className="dim">unassigned</span>}</td>
                <td>{when(d.decidedAt, lang)}</td>
                <td><span className={`pill s-${d.status}`}>{term(t, d.status)}</span></td>
              </tr>))}</tbody>
          </table>
        )}
      </Loaded>
    </Page>
  );
}
