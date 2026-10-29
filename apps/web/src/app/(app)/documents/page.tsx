import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';
import { DocumentUpload } from '@/components/DocumentUpload';

const size = (kb: number | null) =>
  kb == null ? '—' : kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;

export default async function Documents({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  // Outside <Loaded> on purpose: the create form must render even when the
  // list below is empty, which is precisely when someone needs it.
  const o = await api.createOptions().catch(() => ({ projects: [], people: [] }));
  return (
    <Page title="Documents" sub="Deliverables and gate evidence. A document linked to a gate criterion is what turns a tick into proof.">
      <Flash error={error} done={done} lang={lang} />
      <DocumentUpload lang={lang} projects={o.projects ?? []} />
      <NewRecord lang={lang} kind="document" title="Register a document" cta="Register" returnTo="/documents"
        intro="Records a document that lives somewhere else — paste the link. To put a file into your own SharePoint instead, use the upload above."
        fields={[
                { name: 'name', label: 'Document', required: true, placeholder: 'Main contract — signed' },
                { name: 'kind', label: 'Type', required: true, placeholder: 'Contract' },
                { name: 'projectId', label: 'Project', type: 'select',
                  options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
                { name: 'version', label: 'Version', placeholder: '1.0' },
                { name: 'status', label: 'Status', type: 'select', options: [
                  { value: 'draft', label: 'Draft' }, { value: 'in_review', label: 'In review' },
                  { value: 'approved', label: 'Approved' }, { value: 'superseded', label: 'Superseded' }] },
                { name: 'url', label: 'Link', type: 'url', placeholder: 'https://…' },
                { name: 'ownerId', label: 'Owner', type: 'select',
                  options: o.people.map((p: any) => ({ value: p.id, label: p.name })) },
              ]} />
      <Loaded load={api.documents} empty="No documents yet.">
        {(list) => (
          <>
            <table>
              <thead><tr><th>{t('Document')}</th><th>{t('Project')}</th><th>{t('Type')}</th><th>{t('Ver')}</th><th>{t('Evidence for')}</th><th>{t('Size')}</th><th>{t('Updated')}</th><th>{t('Status')}</th></tr></thead>
              <tbody>{list.map((d: any) => (
                <tr key={d.id}>
                  {/* A document held in their Microsoft tenant opens through
                      the API, which asks Graph for a link that works on its
                      own — the stored webUrl only opens for somebody already
                      signed in to that tenant in this browser. */}
                  <td><strong>{d.storageProvider === 'microsoft'
                    ? <a href={`/api/microsoft/documents/${d.id}/open`} target="_blank" rel="noreferrer">
                        {d.name}</a>
                    : d.url
                      ? <a href={d.url} target="_blank" rel="noreferrer">{d.name}</a>
                      : d.name}</strong>
                    {d.storageProvider === 'microsoft' && (
                      <div className="dim">{t('in SharePoint')}</div>
                    )}
                    {d.owner && <div className="dim">{d.owner}</div>}</td>
                  <td className="num">{d.projectCode ?? '—'}</td>
                  <td><span className="kind">{d.kind}</span></td>
                  <td className="num">{d.version}</td>
                  <td>{d.evidenceFor
                    ? <span className="good">{d.evidenceFor}</span>
                    : <span className="dim">—</span>}</td>
                  <td className="num">{size(d.sizeKb)}</td>
                  <td>{when(d.updatedAt, lang)}</td>
                  <td><span className={`pill ${d.status === 'approved' ? 'on_track'
                    : d.status === 'in_review' ? 'at_risk' : 's-closed'}`}>
                    {d.status.replace('_', ' ')}</span></td>
                </tr>))}</tbody>
            </table>
            <details className="explain">
              <summary>{t('How documents connect to governance')}</summary>
              <p>{t('Two of the documents above are attached to a specific gate criterion. That link is the difference between a checklist someone ticked and a checklist someone can prove — when an auditor asks &ldquo;what evidence did you have when you approved this?&rdquo;, the answer is a file with a version number, an owner and a date.')}</p>
            </details>
          </>
        )}
      </Loaded>
    </Page>
  );
}
