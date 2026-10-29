import { api, getSession } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { ago, num } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';
import { MicrosoftPanel } from '@/components/MicrosoftPanel';
import { can, type Capability } from '@pmo/contracts';

export default async function Integrations({ searchParams }:
  { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { connected, error } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  const session = await getSession();
  const caps = ((session.authenticated ? session.capabilities : ['read']) ?? ['read']) as Capability[];
  // Fetched here rather than in the panel so the page renders complete. A
  // failure is not fatal: the panel asks again from the browser.
  const ms = await api.microsoft().catch(() => null);

  return (
    <Page title="Integrations" sub="Connections to the systems the delivery world actually runs on.">
      <MicrosoftPanel lang={lang} mayManage={can(caps, 'pmoa_admin')}
                      flash={{ connected, error }} initial={ms} />

      <h2 className="sec">{t('Everything else')}</h2>
      <Loaded load={api.integrations} empty="No other integrations configured.">
        {(list) => (
          <>
            <div className="grid2">
              {list.map((i: any) => (
                <div className={`panel integ s-${i.status}`} key={i.id}>
                  <header>
                    <strong>{i.name}</strong>
                    <span className={`pill ${i.status === 'connected' ? 'on_track'
                      : i.status === 'error' ? 'critical' : 's-closed'}`}>{i.status}</span>
                  </header>
                  <dl>
                    <div><dt>{t('Provider')}</dt><dd><code>{i.provider}</code></dd></div>
                    <div><dt>{t('Direction')}</dt><dd>{i.direction}</dd></div>
                    <div><dt>{t('Records synced')}</dt><dd className="num">{num(i.recordsSynced)}</dd></div>
                    <div><dt>{t('Last sync')}</dt><dd>{i.lastSyncAt ? ago(i.lastSyncAt, lang) : 'never'}</dd></div>
                  </dl>
                  {i.lastError && <p className="err" style={{ marginBlockStart: 12 }}>{i.lastError}</p>}
                </div>
              ))}
            </div>
            <details className="explain">
              <summary>{t('Why these particular integrations')}</summary>
              <p>{t('Capital programmes in the region already run on Primavera P6 for schedules and SharePoint for documents, and finance teams want the numbers in Power BI. An integration that pulls a P6 schedule in is worth more than any feature we could build to replace it — the goal is to govern the delivery data, not to make people re-enter it.')}</p>
            </details>
          </>
        )}
      </Loaded>
    </Page>
  );
}
