'use client';
import { useEffect, useRef, useState } from 'react';
import { translator, type Lang } from '@/lib/i18n-dict';

type Project = { id: string; code: string; name: string };

/**
 * Put a file into the customer's own SharePoint or OneDrive and register it.
 *
 * Deliberately not a second document store. The file is written to their
 * tenancy under a folder named for the project, and what The EPMO keeps is the
 * row that says which drive and which item — so their retention policy, their
 * permissions and their legal hold all still apply, and deleting The EPMO
 * tomorrow would not take anybody's contracts with it.
 *
 * Renders nothing at all until Microsoft is connected and a library has been
 * chosen. An upload button that cannot upload is worse than no button.
 */
export function DocumentUpload({ lang, projects }: { lang?: Lang; projects: Project[] }) {
  const t = translator(lang ?? 'en');
  const [ready, setReady] = useState<boolean | null>(null);
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; webUrl: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/microsoft/status', { headers: { accept: 'application/json' } });
        const j = await res.json().catch(() => ({}) as any);
        const c = j?.connection;
        setReady(Boolean(c?.driveId && c?.rootItemId));
        setWhere([c?.siteName, c?.driveName, c?.rootPath].filter(Boolean).join(' / '));
      } catch { setReady(false); }
    })();
  }, []);

  if (!ready) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(''); setDone(null);
    try {
      const res = await fetch('/api/microsoft/upload', {
        method: 'POST', body: new FormData(e.currentTarget), headers: { accept: 'application/json' },
      });
      const j = await res.json().catch(() => ({}) as any);
      if (!res.ok) { setError(String(j?.message || j?.error || `Upload failed (${res.status})`)); return; }
      setDone({ name: j.name, webUrl: j.webUrl });
      form.current?.reset();
    } catch {
      setError(t('Could not reach the server. Check your connection and try again.'));
    } finally { setBusy(false); }
  }

  return (
    <section className="panel upload">
      <h2>{t('Upload to SharePoint')}</h2>
      <p className="dim">
        {t('The file is written to your own Microsoft storage, in a folder named for the project. The EPMO records where it is — it never keeps a copy.')}
        {where && <> {' '}<strong>{where}</strong></>}
      </p>
      <form ref={form} className="act inline" onSubmit={submit}>
        <input type="file" name="file" required onChange={() => { setDone(null); setError(''); }} />
        <label>
          {t('Project')}
          <select name="projectId" defaultValue="">
            <option value="">{t('— workspace folder —')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('Type')}
          <input name="kind" placeholder={t('Contract')} defaultValue="File" />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t('Uploading…') : t('Upload')}
        </button>
      </form>
      {error && <p className="formerr" role="alert">{error}</p>}
      {done && (
        <p className="okmsg" role="status">
          {t('Uploaded')} <strong>{done.name}</strong>{' · '}
          <a href={done.webUrl} target="_blank" rel="noreferrer">{t('Open in SharePoint')}</a>
        </p>
      )}
    </section>
  );
}
