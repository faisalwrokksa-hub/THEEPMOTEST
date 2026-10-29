import { redirect } from 'next/navigation';
import { api, getSession } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { getLang } from '@/lib/i18n';

const text = (ar: boolean, en: string, arabic: string) => ar ? arabic : en;

/** This is a vendor-only page. Its backing APIs independently enforce the vendor flag. */
export default async function SuperAdmin({ searchParams }: {
  searchParams: Promise<{ done?: string; error?: string; offset?: string }>;
}) {
  const session = await getSession();
  if (!session.authenticated) redirect('/login');
  if (!session.capabilities.includes('pmoa_platform')) redirect('/');
  const ar = (await getLang()) === 'ar';
  const { done, error, offset } = await searchParams;
  const page = Math.max(0, Math.min(10_000, Number(offset ?? 0) || 0));
  const tx = (en: string, Arabic: string) => text(ar, en, Arabic);
  return (
    <Page title={tx('Super Admin — Licensing', 'الإدارة العليا — التراخيص')}
      sub={tx('Manage customer subscriptions and plans. Manual license grants do not verify payment.',
        'إدارة اشتراكات العملاء والباقات. منح التراخيص يدويًا لا يعني التحقق من الدفع.')}>
      {done && <p className="okmsg" role="status">{tx('Change saved and audited.', 'تم حفظ التغيير وتسجيله.')}</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <section className="panel" style={{marginBlockEnd:24}}>
        <h2>{tx('Create subscription plan', 'إنشاء باقة اشتراك')}</h2>
        <form method="post" action="/api/super-admin" style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'end'}}>
          <input name="action" type="hidden" value="create-plan"/>
          <label>{tx('Code', 'الرمز')}<input required name="code" placeholder="enterprise_yearly" pattern="[a-z][a-z0-9_-]{2,39}"/></label>
          <label>{tx('Name', 'الاسم')}<input required name="name" minLength={3} maxLength={120}/></label>
          <label>{tx('Price in minor units', 'السعر بالهللات')}<input required type="number" min="0" name="priceMinor" defaultValue="0"/></label>
          <label>{tx('Currency', 'العملة')}<input required name="currency" maxLength={3} defaultValue="SAR"/></label>
          <label>{tx('Interval', 'الفترة')}<select name="billingInterval"><option value="monthly">{tx('Monthly','شهري')}</option><option value="yearly">{tx('Yearly','سنوي')}</option></select></label>
          <label>{tx('Trial days', 'أيام التجربة')}<input type="number" min="0" max="365" name="trialDays" defaultValue="0"/></label>
          <button type="submit" className="btn">{tx('Create plan', 'إنشاء باقة')}</button>
        </form>
      </section>
      <section className="panel" style={{marginBlockEnd:24}}>
        <h2>{tx('Available plans', 'الباقات المتاحة')}</h2>
        <Loaded load={api.superAdminPlans}>{plans => <div className="modgrid">
          {plans.map((p: any) => <div className="modcard" key={p.id}>
            <strong>{p.name}</strong><p className="dim">{p.code} · {(p.priceMinor / 100).toFixed(2)} {p.currency} / {p.billingInterval}</p>
            <p>{tx('Trial', 'تجربة')}: {p.trialDays} {tx('days', 'يوم')}</p>
            <form method="post" action="/api/super-admin">
              <input name="action" type="hidden" value="update-plan"/>
              <input name="code" type="hidden" value={p.code}/>
              <input name="isActive" type="hidden" value={p.isActive ? 'false':'true'}/>
              <button className="btn ghost" type="submit">{p.isActive ? tx('Deactivate', 'تعطيل'): tx('Activate','تفعيل')}</button>
            </form>
          </div>)}
        </div>}</Loaded>
      </section>
      <section className="panel">
        <h2>{tx('Customer licenses', 'تراخيص العملاء')}</h2>
        <p className="dim">{tx('Manual grants are audited and immediately replace the existing subscription. Use only with documented authorization.',
          'تُسجّل التراخيص اليدوية وتستبدل الاشتراك الحالي فورًا. يجب توثيق سبب التفويض.')}</p>
        <Loaded load={() => api.superAdminTenants(page)}>{result => <>
          <div className="modgrid">
            {result.items.map((tenant: any) => <div className="modcard" key={tenant.id}>
              <header><strong>{tenant.name}</strong></header>
              <p className="dim">{tenant.slug}</p>
              <p>{tx('Current plan', 'الباقة الحالية')}: <strong>{tenant.subscription?.planCode ?? tx('None', 'لا يوجد')}</strong></p>
              <p>{tx('Status', 'الحالة')}: {tenant.subscription?.status ?? '—'}</p>
              <form method="post" action="/api/super-admin" style={{display:'grid',gap:8}}>
                <input name="action" value="manual-grant" type="hidden"/>
                <input name="tenantId" value={tenant.id} type="hidden"/>
                <label>{tx('Active plan code', 'رمز الباقة الفعالة')}<input name="planCode" required placeholder="enterprise_yearly"/></label>
                <label>{tx('License type', 'نوع الترخيص')}<select name="status"><option value="active">{tx('Active', 'نشط')}</option><option value="trialing">{tx('Trial', 'تجريبي')}</option></select></label>
                <label>{tx('Starts at (UTC)', 'تاريخ البداية (UTC)')}<input required name="periodStartsAt" type="datetime-local"/></label>
                <label>{tx('Ends at (UTC)', 'تاريخ النهاية (UTC)')}<input required name="periodEndsAt" type="datetime-local"/></label>
                <label>{tx('Trial end (UTC, trials only)', 'نهاية التجربة (UTC)')}<input name="trialEndsAt" type="datetime-local"/></label>
                <label>{tx('Reason for manual license grant', 'سبب منح الترخيص اليدوي')}<input required minLength={10} maxLength={500} name="reason" placeholder={tx('Approved contract/reference', 'مرجع العقد أو الموافقة')}/></label>
                <button className="btn" type="submit">{tx('Grant manual license', 'منح ترخيص يدوي')}</button>
              </form>
              {tenant.subscription && !['canceled','expired'].includes(tenant.subscription.status) && <form method="post" action="/api/super-admin" style={{marginBlockStart:12}}>
                <input type="hidden" name="action" value="cancel"/>
                <input type="hidden" name="tenantId" value={tenant.id}/>
                <input type="hidden" name="subscriptionId" value={tenant.subscription.id}/>
                <label>{tx('Cancellation reason', 'سبب الإلغاء')}<input name="reason" required minLength={10} maxLength={500}/></label>
                <button className="btn ghost" type="submit">{tx('Cancel license now', 'إلغاء الترخيص الآن')}</button>
              </form>}
            </div>)}
          </div>
          <div style={{display:'flex',gap:16,marginBlockStart:20}}>
            {page > 0 && <a href={`/super-admin?offset=${Math.max(0,page-result.limit)}`}>{tx('Previous', 'السابق')}</a>}
            {result.hasMore && <a href={`/super-admin?offset=${page+result.limit}`}>{tx('Next', 'التالي')}</a>}
          </div>
        </>}</Loaded>
      </section>
      <section className="panel" style={{marginBlockStart:24}}>
        <h2>{tx('Plan audit history', 'سجل تدقيق الباقات')}</h2>
        <Loaded load={api.superAdminAudit}>{entries => <ul>
          {entries.slice(0, 20).map((e: any) => <li key={e.id}>
            <strong>{e.action}</strong> · {e.entityId} · <time>{new Date(e.createdAt).toISOString().slice(0,16).replace('T',' ')}</time> UTC
          </li>)}
        </ul>}</Loaded>
      </section>
    </Page>
  );
}
