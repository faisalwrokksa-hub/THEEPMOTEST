'use client';
import { useEffect, useRef, useState } from 'react';
import { translator, type Lang } from '@/lib/i18n-dict';

type Report = { id: string; name: string; groupId: string | null; groupName: string; webUrl: string };

/**
 * Power BI embedding uses the shared workspace-connected Microsoft account.
 * It is not the current EPMO member's individual delegated token. The API
 * requires a workspace administrator before returning a bearer token.
 * A future per-user OAuth design could allow safely broader access.
 */
export function PowerBiReport({ lang }: { lang?: Lang }) {
  const t = translator(lang ?? 'en');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [chosen, setChosen] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [needsPowerBi, setNeedsPowerBi] = useState(false);
  const [loading, setLoading] = useState(true);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => { void list(); }, []);

  async function list() {
    setLoading(true);
    try {
      const res = await fetch('/api/microsoft/reports', { headers: { accept: 'application/json' } });
      const j = await res.json().catch(() => ({}) as any);
      if (!res.ok) {
        const msg = String(j?.message || j?.error || `Request failed (${res.status})`);
        // Not an error so much as a step not taken yet; the page says which.
        setNeedsPowerBi(/not connected|not been approved|Connect Power BI/i.test(msg));
        setError(msg);
        return;
      }
      setReports(j.reports ?? []);
      if ((j.reports ?? []).length === 1) void show(j.reports[0]);
    } catch {
      setError(t('Could not reach the server. Check your connection and try again.'));
    } finally { setLoading(false); }
  }

  async function show(r: Report) {
    setChosen(r); setError('');
    try {
      const q = r.groupId ? `?groupId=${encodeURIComponent(r.groupId)}` : '';
      const res = await fetch(`/api/microsoft/reports/${encodeURIComponent(r.id)}/embed${q}`,
        { headers: { accept: 'application/json' } });
      const j = await res.json().catch(() => ({}) as any);
      if (!res.ok) { setError(String(j?.message || j?.error)); return; }

      const pbi = await import('powerbi-client');
      const service = new pbi.service.Service(
        pbi.factories.hpmFactory, pbi.factories.wpmpFactory, pbi.factories.routerFactory);
      if (!host.current) return;
      service.reset(host.current);
      service.embed(host.current, {
        type: 'report',
        id: j.id,
        embedUrl: j.embedUrl,
        accessToken: j.accessToken,
        tokenType: pbi.models.TokenType.Aad,
        settings: {
          panes: { filters: { visible: false }, pageNavigation: { visible: true } },
          background: pbi.models.BackgroundType.Transparent,
        },
      });
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  if (loading) return <p className="dim">{t('Checking…')}</p>;

  if (needsPowerBi) {
    return (
      <section className="panel">
        <h2>{t('Power BI is not connected yet')}</h2>
        <p className="dim">{error}</p>
        <p className="dim">{t('Reports use the workspace-connected Microsoft account; an administrator must approve Power BI before reports appear.')}</p>
        <a className="btn" href="/integrations">{t('Go to Integrations')}</a>
      </section>
    );
  }

  return (
    <>
      {reports && reports.length > 0 && (
        <form className="act inline" style={{ marginBlockEnd: 'var(--sp-4)' }}>
          <label>
            {t('Report')}
            <select value={chosen?.id ?? ''} onChange={(e) => {
              const r = reports.find((x) => x.id === e.target.value);
              if (r) void show(r);
            }}>
              <option value="" disabled>{t('Choose…')}</option>
              {reports.map((r) => (
                <option key={`${r.groupId ?? 'me'}:${r.id}`} value={r.id}>
                  {r.groupName} — {r.name}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <a className="btn ghost" href={chosen.webUrl} target="_blank" rel="noreferrer">
              {t('Open in Power BI')}
            </a>
          )}
        </form>
      )}

      {error && <p className="formerr" role="alert">{error}</p>}

      {reports && reports.length === 0 && (
        <p className="dim">{t('That Microsoft account can see no Power BI reports. Someone has to share a workspace with it, or publish a report into one.')}</p>
      )}

      {/* Kept in the DOM rather than mounted on demand: the SDK embeds into a
          real element, and one that React has just replaced is not it. */}
      <div ref={host} className="pbiframe" hidden={!chosen} />
    </>
  );
}
