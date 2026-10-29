import { api, getSession } from '@/lib/api';
import { can, type Capability } from '@pmo/contracts';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { ago } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';
import { term } from '@pmo/contracts';

export default async function Updates({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  const session = await getSession();
  const mayPost = session.authenticated && can(session.capabilities as Capability[], 'pmoa_post_updates');
  // Outside <Loaded> on purpose: the post box must render even when the
  // stream below is empty, which is precisely when someone needs it.
  const o = await api.createOptions().catch(() => ({ projects: [], people: [] }));
  return (
    <Page title="Updates" sub="Narrative from the delivery teams — what the numbers do not say.">
      <Flash error={error} done={done} lang={lang} />
      {mayPost ? <NewRecord lang={lang} kind="update" title="Post an update" cta="Post" returnTo="/updates"
        intro="An escalation is the one that gets read first. Leave the project blank for something that applies to the whole portfolio."
        fields={[
          { name: 'projectId', label: 'Project', type: 'select',
            options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
          { name: 'kind', label: 'Kind', type: 'select', options: [
            { value: 'note', label: 'Note' }, { value: 'status', label: 'Status' },
            { value: 'escalation', label: 'Escalation' }] },
          { name: 'body', label: 'Update', type: 'textarea', required: true, maxLength: 4000,
            placeholder: 'Piling finished a week early; the crane permit is still with the municipality.' },
        ]} /> : <p className="dim">{lang === 'ar'
          ? 'يمكنك قراءة التحديثات، ولكن نشر التحديثات يتطلب صلاحية المساهمة.'
          : 'You can read updates, but posting requires contributor permission.'}</p>}
      <Loaded load={api.updates} empty="No updates posted yet.">
        {(list) => (
          <div className="stream">
            {list.map((u: any) => (
              <article key={u.id} className={`post p-${u.kind}`}>
                <header>
                  <span className="av">{(u.author ?? '?').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}</span>
                  <div>
                    <strong><bdi>{u.author ?? t('Unknown')}</bdi></strong>
                    <span className="dim">{u.projectCode ? <><bdi>{u.projectCode}</bdi>{' · '}</> : ''}{ago(u.createdAt, lang)}</span>
                  </div>
                  <span className={`kind ${u.kind === 'escalation' ? 'k-issue' : u.kind === 'status' ? 'k-assumption' : ''}`}>
                    {term(t, u.kind)}</span>
                </header>
                <p>{u.body}</p>
              </article>
            ))}
          </div>
        )}
      </Loaded>
    </Page>
  );
}
