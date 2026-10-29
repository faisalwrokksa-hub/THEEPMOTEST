'use client';
import { useEffect, useState } from 'react';
import { translator, type Lang } from '@/lib/i18n-dict';

type Connection = {
  id: string; status: string;
  accountEmail: string | null; accountName: string | null;
  externalTenantId: string | null; scopes: string | null;
  siteId: string | null; siteName: string | null; siteUrl: string | null;
  driveId: string | null; driveName: string | null;
  rootItemId: string | null; rootPath: string | null;
  connectedAt: string | null; lastError: string | null;
};
type Status = { configured: boolean; connection: Connection | null };
type Place = { siteId: string; name: string; url: string };
type Drive = { driveId: string; name: string; url: string };

const POWERBI_SCOPE = 'analysis.windows.net/powerbi';

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`/api/microsoft/${path}`, {
    ...init, headers: { accept: 'application/json', 'content-type': 'application/json', ...init?.headers },
  });
  const j = await res.json().catch(() => ({}) as any);
  if (!res.ok) throw new Error(j?.message || j?.error || `Request failed (${res.status})`);
  return j;
}

/**
 * Connecting a workspace to the customer's own Microsoft tenant.
 *
 * Three states, in order, and the panel only ever shows the next one: connect
 * the account, choose where files go, and optionally add Power BI. Showing a
 * folder picker before anything is connected, or a Power BI button that fails
 * because nobody consented to it, is how an integration page ends up feeling
 * like a form that lies.
 */
export function MicrosoftPanel({ lang, mayManage, flash, initial }: {
  lang?: Lang; mayManage: boolean; flash?: { connected?: string; error?: string };
  initial?: Status | null;
}) {
  const t = translator(lang ?? 'en');
  // Rendered on the server too, so the page arrives whole. Without it the
  // panel is the word "Checking…" until hydration, which is a flash of a
  // different page on the one screen that is meant to state plainly what is
  // and is not connected.
  const [status, setStatus] = useState<Status | null>(initial ?? null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(flash?.error ?? '');
  const [places, setPlaces] = useState<{ oneDrive: Drive | null; sites: Place[] } | null>(null);
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [site, setSite] = useState<Place | null>(null);
  const [search, setSearch] = useState('');

  // Nothing to fetch when the server already said; after a connect or a
  // disconnect, load() runs again.
  useEffect(() => { if (!initial) void load(); }, [initial]);

  async function load() {
    try { setStatus(await call('status')); }
    catch (e) { setError(String((e as Error).message)); }
  }

  async function connect(resource: 'graph' | 'powerbi') {
    setBusy(resource); setError('');
    try {
      // The redirect has to happen from the top-level window, not a fetch:
      // Microsoft's sign-in page refuses to render in a frame or an XHR.
      const { url } = await call('connect', {
        method: 'POST',
        body: JSON.stringify({ resource, returnTo: '/integrations' }),
      });
      window.location.assign(url);
    } catch (e) { setError(String((e as Error).message)); setBusy(''); }
  }

  async function disconnect() {
    setBusy('disconnect'); setError('');
    try {
      const r = await call('connection', { method: 'DELETE' });
      setStatus({ configured: true, connection: null });
      setPlaces(null); setDrives(null); setSite(null);
      if (r.documentsStillLinked) {
        setError(t('Disconnected. {n} documents still point at files in that Microsoft tenant — the files are untouched, and reconnecting restores the links.')
          .replace('{n}', String(r.documentsStillLinked)));
      }
    } catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(''); }
  }

  async function findPlaces(q = '') {
    setBusy('places'); setError('');
    try { setPlaces(await call(`places${q ? `?q=${encodeURIComponent(q)}` : ''}`)); }
    catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(''); }
  }

  async function openSite(s: Place) {
    setBusy('drives'); setError(''); setSite(s); setDrives(null);
    try { setDrives(await call(`sites/${encodeURIComponent(s.siteId)}/drives`)); }
    catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(''); }
  }

  async function chooseDrive(driveId: string) {
    setBusy('location'); setError('');
    try {
      await call('location', {
        method: 'POST', body: JSON.stringify({ siteId: site?.siteId, driveId }),
      });
      setPlaces(null); setDrives(null); setSite(null);
      await load();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(''); }
  }

  if (!status) return <section className="panel"><p className="dim">{t('Checking…')}</p></section>;

  const c = status.connection;
  const hasPowerBi = Boolean(c?.scopes?.includes(POWERBI_SCOPE));
  const hasLocation = Boolean(c?.driveId && c?.rootItemId);

  return (
    <section className={`panel integ ms ${c ? 's-connected' : 's-pending'}`}>
      <header>
        <strong>{t('Microsoft 365')}</strong>
        <span className={`pill ${c ? 'on_track' : 's-closed'}`}>
          {c ? t('connected') : t('not connected')}
        </span>
      </header>
      <p className="dim">{t('SharePoint, OneDrive and Power BI, in the customer’s own Microsoft tenant. Documents uploaded here are written to their storage and stay there — under their retention, their permissions and their legal hold. The EPMO keeps a pointer, never a copy.')}</p>

      {flash?.connected && !error && (
        <p className="okmsg" role="status">{t('Microsoft is connected.')}</p>
      )}
      {error && <p className="formerr" role="alert">{error}</p>}
      {c?.lastError && !error && <p className="formerr">{c.lastError}</p>}

      {!status.configured && (
        <div className="notset">
          <p><strong>{t('Not configured on this server yet')}</strong></p>
          <p className="dim">{t('An administrator needs to register The EPMO as a multi-tenant application in Entra ID, then set MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI and MS_TOKEN_KEY. Until then there is nothing for a customer to connect to. The steps are in docs/microsoft-setup.md.')}</p>
        </div>
      )}

      {status.configured && !c && (
        <div className="btnrow">
          <button className="btn" disabled={!mayManage || busy === 'graph'}
                  onClick={() => void connect('graph')}>
            {busy === 'graph' ? t('Opening Microsoft…') : t('Connect Microsoft')}
          </button>
          {!mayManage && <span className="dim">{t('Only an administrator can connect this.')}</span>}
        </div>
      )}

      {c && (
        <>
          {!mayManage && <p className="dim">{t('Only workspace administrators can view Microsoft connection details.')}</p>}
          {mayManage && <dl>
            <div><dt>{t('Account')}</dt>
                 <dd>{c.accountName ? `${c.accountName} · ` : ''}{c.accountEmail ?? '—'}</dd></div>
            <div><dt>{t('Files go to')}</dt>
                 <dd>{hasLocation
                   ? <a href={c.siteUrl ?? '#'} target="_blank" rel="noreferrer">
                       {[c.siteName, c.driveName, c.rootPath].filter(Boolean).join(' / ')}
                     </a>
                   : <span className="dim">{t('nowhere yet — choose a library below')}</span>}</dd></div>
            <div><dt>{t('Power BI')}</dt>
                 <dd>{hasPowerBi ? t('approved') : <span className="dim">{t('not approved')}</span>}</dd></div>
            <div><dt>{t('Connected')}</dt>
                 <dd>{c.connectedAt
                   ? new Date(c.connectedAt).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB',
                       { day: 'numeric', month: 'short', year: 'numeric' })
                   : '—'}</dd></div>
          </dl>}

          {mayManage && (
            <div className="btnrow">
              {!hasLocation && (
                <button className="btn" disabled={busy === 'places'} onClick={() => void findPlaces()}>
                  {busy === 'places' ? t('Looking…') : t('Choose where files go')}
                </button>
              )}
              {hasLocation && (
                <button className="btn ghost" disabled={busy === 'places'} onClick={() => void findPlaces()}>
                  {t('Change location')}
                </button>
              )}
              {!hasPowerBi && (
                <button className="btn ghost" disabled={busy === 'powerbi'}
                        onClick={() => void connect('powerbi')}>
                  {busy === 'powerbi' ? t('Opening Microsoft…') : t('Add Power BI')}
                </button>
              )}
              <button className="btn ghost danger" disabled={busy === 'disconnect'}
                      onClick={() => void disconnect()}>
                {busy === 'disconnect' ? t('Disconnecting…') : t('Disconnect')}
              </button>
            </div>
          )}
        </>
      )}

      {places && (
        <div className="picker">
          <h3>{site ? t('Which document library?') : t('Where should documents live?')}</h3>
          {!site && (
            <>
              <form className="act inline" onSubmit={(e) => { e.preventDefault(); void findPlaces(search); }}>
                <label>
                  {t('Find a SharePoint site')}
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                         placeholder={t('name or part of one')} />
                </label>
                <button className="btn ghost" type="submit" disabled={busy === 'places'}>{t('Search')}</button>
              </form>
              <ul className="pick">
                {places.oneDrive && (
                  <li>
                    <button type="button" onClick={() => void chooseDrive(places.oneDrive!.driveId)}
                            disabled={busy === 'location'}>
                      <strong>{t('My OneDrive')}</strong>
                      <small className="dim">{t('Only this account can reach it. Fine for a trial; a SharePoint library is what a team wants.')}</small>
                    </button>
                  </li>
                )}
                {places.sites.map((s) => (
                  <li key={s.siteId}>
                    <button type="button" onClick={() => void openSite(s)} disabled={busy === 'drives'}>
                      <strong>{s.name}</strong>
                      <small className="dim">{s.url}</small>
                    </button>
                  </li>
                ))}
                {places.sites.length === 0 && !places.oneDrive && (
                  <li className="dim">{t('No SharePoint sites came back for that account.')}</li>
                )}
              </ul>
            </>
          )}
          {site && drives && (
            <ul className="pick">
              {drives.map((d) => (
                <li key={d.driveId}>
                  <button type="button" onClick={() => void chooseDrive(d.driveId)}
                          disabled={busy === 'location'}>
                    <strong>{d.name}</strong>
                    <small className="dim">{site.name}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="btnrow">
            <button className="btn ghost" type="button"
                    onClick={() => { if (site) { setSite(null); setDrives(null); } else setPlaces(null); }}>
              {site ? t('Back') : t('Cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
