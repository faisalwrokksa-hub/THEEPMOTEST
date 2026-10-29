import { Page } from '@/components/Page';
import { getLang, tr } from '@/lib/i18n';
import { PowerBiReport } from '@/components/PowerBiReport';
import { getSession } from '@/lib/api';
import { redirect } from 'next/navigation';

export default async function PowerBi() {
  // Embedded report tokens belong to a shared Microsoft connection. Only
  // workspace administrators can access them with the current OAuth design.
  const session = await getSession();
  if (!session.authenticated || !session.capabilities.includes('pmoa_admin')) redirect('/');
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Power BI"
          sub="Workspace administrators can view reports available to the Microsoft account connected to this workspace.">
      <PowerBiReport lang={lang} />
      <details className="explain">
        <summary>{t('Why the reports are theirs and not ours')}</summary>
        <p>{t('Reports use the workspace-connected Microsoft account, not each EPMO user’s personal Power BI identity. Restrict that account to the minimum datasets necessary and grant access only to workspace administrators.')}</p>
      </details>
    </Page>
  );
}
