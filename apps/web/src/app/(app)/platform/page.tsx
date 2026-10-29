import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

const STATUS: Record<string, { label: string; cls: string }> = {
  ga: { label: 'available', cls: 'on_track' },
  beta: { label: 'beta', cls: 'at_risk' },
  in_progress: { label: 'available', cls: 'on_track' },
};

export default async function Platform({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Platform & Modules"
          sub="The EPMO is a set of modules on one platform. Enable what this workspace has licensed — the server enforces it, so a disabled module refuses even if its address is typed directly.">
      {error && <p className="err" role="alert" style={{ marginBlockEnd: 16 }}>{error}</p>}
      {done && !error && <p className="okmsg" role="status" style={{ marginBlockEnd: 16 }}>{t('Saved.')}</p>}
      <Loaded load={api.platformModules}>
        {(all) => {
          // Modules still in development are not shown at all. Advertising
          // something as unavailable is worse than not advertising it.
          const mods = all.filter((m: any) => m.status !== 'roadmap');
          const on = mods.filter((m: any) => m.enabled).length;
          const built = mods.length;
          return (
            <>
              <div className="tiles">
                <div className="tile"><span>{t('Modules enabled')}</span><strong>{on}</strong>
                  <div className="split"><i className="dim">{t('of')} {built} {t('available')}</i></div></div>
                <div className="tile"><span>{t('In the catalogue')}</span><strong>{mods.length}</strong>
                  <div className="split"><i className="dim">{t('licensable modules')}</i></div></div>
                <div className="tile"><span>{t('Platform version')}</span>
                  <strong style={{ fontSize: '1.3rem' }}>{t('The EPMO')}</strong>
                  <div className="split"><i className="dim">{t('modular monolith')}</i></div></div>
              </div>

              <h2 className="sec">{t('Modules')}</h2>
              <div className="modgrid">
                {mods.map((m: any) => {
                  const st = STATUS[m.status] ?? STATUS.ga;
                  return (
                    <div className={`modcard${m.enabled ? ' on' : ''}`} key={m.id}>
                      <header>
                        <div>
                          <strong>{m.name}</strong>
                          <code>{m.id} · v{m.version}</code>
                        </div>
                        <span className={`pill ${st.cls}`}>{t(st.label)}</span>
                      </header>
                      <p>{t(m.summary)}</p>
                      <footer>
                        <span className="dim">
                          {m.isCore ? t('Part of the platform')
                            : m.dependsOn.length ? `${t('Requires')} ${m.dependsOn.join(', ')}`
                            : t('No dependencies')}
                          {m.enabled && m.enabledAt ? ` · ${t('on since')} ${when(m.enabledAt, lang)}` : ''}
                        </span>
                        {m.isCore ? (
                          <span className="pill on_track">{t('always on')}</span>
                        ) : (
                          <form method="post" action="/api/platform">
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="enabled" value={m.enabled ? 'false' : 'true'} />
                            <button className={`btn ${m.enabled ? 'ghost' : ''}`} type="submit">
                              {t(m.enabled ? 'Disable' : 'Enable')}
                            </button>
                          </form>
                        )}
                      </footer>
                    </div>
                  );
                })}
              </div>

              <details className="explain">
                <summary>{t('Why modules are enforced in the API, not the menu')}</summary>
                <p>{t('Hiding a link stops nobody: the URL is still there and the data behind it is still reachable. Every module-owned route carries the module that owns it, and a guard checks the workspace entitlement on each request — so a workspace on a PMO-only plan gets a clear refusal from')} <code>/api/v1/financials</code>, not an empty page. Dependencies are
                  enforced both ways: a module cannot be enabled before what it needs, or disabled while
                  something else depends on it.</p>
              </details>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
