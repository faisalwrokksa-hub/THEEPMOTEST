import { billingChangeGuidance } from '@/lib/billing-self-service.mjs';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Page, Loaded } from '@/components/Page';
import { api, getSession } from '@/lib/api';
import { getLang } from '@/lib/i18n';
import {
  effectiveSubscriptionStatus, availableBillingActions, daysUntil,
  formatBillingDate, formatBillingMoney,
} from '@/lib/subscription-display.mjs';

/** Read-only plan comparison and workspace billing controls. Payment confirmation is webhook-only. */
export default async function BillingPage({ searchParams }: {
  searchParams: Promise<{ error?: string; success?: string; billing?: string; updated?: string }>;
}) {
  const session = await getSession();
  if (!session.authenticated) redirect('/login');
  if (!session.capabilities.includes('pmoa_admin')) redirect('/');
  const ar = (await getLang()) === 'ar';
  const lang = ar ? 'ar' : 'en';
  const tx = (en: string, arabic: string) => ar ? arabic : en;
  const { error, success, billing, updated } = await searchParams;
  const labels: Record<string, string> = {
    active: tx('Active', 'نشط'), trialing: tx('Trial', 'تجريبي'),
    past_due: tx('Past due', 'متأخر السداد'), paused: tx('Paused', 'موقوف مؤقتًا'),
    canceled: tx('Canceled', 'ملغى'), expired: tx('Expired', 'منتهي'),
    none: tx('No subscription', 'لا يوجد اشتراك'),
    upcoming: tx('Not started', 'لم يبدأ بعد'), unknown: tx('Status unavailable', 'الحالة غير متاحة'),
  };
  return <Page title={tx('Subscription and billing', 'الاشتراك والفوترة')}
    sub={tx('Review your plan, trial, renewal invoices, and billing options.',
      'راجع خطتك والفترة التجريبية وفواتير التجديد وخيارات الفوترة.')}>
    {error && <p role="alert" className="err">{tx(
      'The billing request could not be completed. Please check your subscription status or contact your administrator.',
      'تعذّر إكمال طلب الفوترة. تحقق من حالة الاشتراك أو تواصل مع المسؤول.')}</p>}
    {success && <p role="status" className="okmsg">{tx('Renewal invoice created or found.', 'تم إنشاء فاتورة التجديد أو العثور عليها.')}</p>}
    {updated && <p role="status" className="okmsg">{tx('Subscription preference updated.', 'تم تحديث إعداد الاشتراك.')}</p>}
    {billing === 'success' && <p role="status" className="dim">{tx(
      'You returned from Stripe Checkout. Your license renews only after our server verifies Stripe’s payment webhook.',
      'عدت من بوابة Stripe. لا يتجدد الترخيص إلا بعد تحقق الخادم من إشعار الدفع الموقّع.')}</p>}
    {billing === 'cancel' && <p role="status" className="dim">{tx(
      'Stripe Checkout was canceled. No payment confirmation has been received.',
      'تم إلغاء عملية الدفع عبر Stripe. لم يصل تأكيد دفع.')}</p>}

    <Loaded load={api.subscriptionCurrent}>{subscription => {
      const status = effectiveSubscriptionStatus(subscription);
      const actions = availableBillingActions(subscription);
      const remaining = status === 'trialing' ? daysUntil(subscription?.trialEndsAt) : null;
      return <section className="panel" aria-label={tx('Current subscription', 'الاشتراك الحالي')} style={{ marginBlockEnd: 20 }}>
        <h2>{tx('Your current subscription', 'اشتراكك الحالي')}</h2>
        <div className="modgrid">
          <div className="modcard">
            <strong>{subscription?.planName ?? subscription?.planCode ?? tx('No plan assigned', 'لم يتم تعيين خطة')}</strong>
            <p><span className="pill">{labels[status] ?? labels.unknown}</span></p>
            {subscription?.priceMinor != null && subscription.currency &&
              <p>{formatBillingMoney(subscription.priceMinor, subscription.currency, lang)} / {subscription.billingInterval === 'yearly' ? tx('year', 'سنة') : tx('month', 'شهر')}</p>}
            {subscription && <p className="dim">{tx('Current period', 'الفترة الحالية')}: {formatBillingDate(subscription.periodStartsAt, lang)} — {formatBillingDate(subscription.periodEndsAt, lang)}</p>}
            {remaining !== null && <p role="status">{tx('Trial time remaining', 'الوقت المتبقي من التجربة')}: <strong>{remaining}</strong> {tx('days (rounded up)', 'أيام (مقربة للأعلى)')}</p>}
            {subscription?.cancelAtPeriodEnd && <p role="status">{tx(
              'Cancellation is scheduled for the end of the current period. You keep access until then if the license remains valid.',
              'تمت جدولة الإلغاء بنهاية الفترة الحالية. يستمر الوصول حتى ذلك الوقت إذا بقي الترخيص صالحًا.')}</p>}
          </div>
          <div className="modcard">
            <strong>{tx('Manage renewal', 'إدارة التجديد')}</strong>
            <p className="dim">{tx(
              'Creating an invoice does not charge your card. Renewal is applied only after a verified payment.',
              'إنشاء الفاتورة لا يخصم من بطاقتك. يُنفذ التجديد بعد التحقق من الدفع فقط.')}</p>
            {actions.invoice && <p className="dim">{billingChangeGuidance('issue-invoice', actions.invoice, lang)}</p>}
            {actions.invoice && <form action="/api/billing/checkout" method="post">
              <input type="hidden" name="action" value="issue-invoice"/>
              <button type="submit" className="btn">{tx('Create renewal invoice', 'إنشاء فاتورة تجديد')}</button>
            </form>}
            {actions.scheduleCancellation && <p className="dim">{billingChangeGuidance('schedule-cancellation', actions.scheduleCancellation, lang)}</p>}
            {actions.scheduleCancellation && <form action="/api/billing/subscription" method="post">
              <input type="hidden" name="action" value="schedule-cancellation"/>
              <button type="submit" className="btn">{tx('Cancel at period end', 'الإلغاء عند نهاية الفترة')}</button>
            </form>}
            {actions.resume && <form action="/api/billing/subscription" method="post">
              <input type="hidden" name="action" value="resume"/>
              <button type="submit" className="btn">{tx('Keep my subscription', 'الإبقاء على اشتراكي')}</button>
            </form>}
            {!actions.invoice && !actions.resume && !actions.scheduleCancellation && <p className="dim">{tx(
              'Self-service renewal is not available for this status. Contact your workspace administrator or the platform owner.',
              'التجديد الذاتي غير متاح لهذه الحالة. تواصل مع مسؤول مساحة العمل أو مالك المنصة.')}</p>}
          </div>
        </div>
      </section>;
    }}</Loaded>

    <section className="panel" style={{ marginBlockEnd: 20 }} aria-label={tx('Available plans', 'الخطط المتاحة')}>
      <h2>{tx('Compare published plans', 'مقارنة الخطط المعلنة')}</h2>
      <p className="dim">{tx(
        'Prices and trial lengths come from the current plan catalogue. Module entitlements, taxes, and final commercial terms must be confirmed with your administrator. Selecting a plan here does not change your subscription.',
        'الأسعار ومدد التجربة معروضة من دليل الخطط الحالي. يجب تأكيد الوحدات المشمولة والضرائب والشروط التجارية النهائية مع المسؤول. عرض خطة هنا لا يغيّر الاشتراك.')}</p>
      <Loaded load={api.subscriptionPlans} empty={tx('No plans are published. Contact your platform administrator.', 'لا توجد خطط معلنة. تواصل مع مسؤول المنصة.')}>
        {plans => <div className="modgrid">{plans.map(plan => <article className="modcard" key={plan.code}>
          <h3>{plan.name}</h3>
          <p><strong>{formatBillingMoney(plan.priceMinor, plan.currency, lang)}</strong> / {plan.billingInterval === 'yearly' ? tx('year', 'سنة') : tx('month', 'شهر')}</p>
          <p className="dim">{plan.trialDays > 0 ? tx(`Trial: ${plan.trialDays} days`, `تجربة: ${plan.trialDays} يوم`) : tx('No trial included', 'لا توجد فترة تجريبية')}</p>
          <p className="dim">{tx('Contact an administrator to request this plan.', 'تواصل مع المسؤول لطلب هذه الخطة.')}</p>
        </article>)}</div>}
      </Loaded>
    </section>

    <section className="panel" style={{ marginBlockEnd: 20 }} aria-label={tx('Renewal invoices', 'فواتير التجديد')}>
      <h2>{tx('Renewal invoices', 'فواتير التجديد')}</h2>
      <Loaded load={api.billingInvoices} empty={tx('No renewal invoices yet.', 'لا توجد فواتير تجديد بعد.')}>
        {invoices => <div className="modgrid">{invoices.map(i => <article className="modcard" key={i.id}>
          <strong>{i.status === 'paid' ? tx('Paid', 'مدفوعة') : i.status === 'open' ? tx('Open', 'مفتوحة') : tx('Voided', 'ملغاة')}</strong>
          <p>{formatBillingMoney(i.amountMinor, i.currency, lang)}</p>
          <p className="dim">{formatBillingDate(i.periodStartsAt, lang)} — {formatBillingDate(i.periodEndsAt, lang)}</p>
          {i.status === 'open' && <form method="post" action="/api/billing/checkout">
            <input type="hidden" name="action" value="checkout"/>
            <input type="hidden" name="invoiceId" value={i.id}/>
            <button type="submit" className="btn">{tx('Pay securely with Stripe', 'الدفع الآمن عبر Stripe')}</button>
          </form>}
        </article>)}</div>}
      </Loaded>
    </section>

    <section className="panel" aria-label={tx('Payment exceptions', 'استثناءات المدفوعات')} style={{ marginBlockEnd: 20 }}>
      <h2>{tx('Payment exceptions requiring support', 'استثناءات المدفوعات التي تتطلب الدعم')}</h2>
      <p className="dim">{tx(
        'Refunds, disputes, and verified payments that could not renew a subscription are reviewed by support. A refunded charge does not automatically mean a new invoice or automatic repayment.',
        'يتولى فريق الدعم مراجعة المبالغ المستردة والنزاعات والمدفوعات المؤكدة التي لم تجدّد الاشتراك. لا يعني الاسترداد إصدار فاتورة جديدة أو إعادة سداد تلقائية.')}</p>
      <Loaded load={api.billingExceptions} empty={tx('No payment exceptions recorded.', 'لا توجد استثناءات مدفوعات مسجلة.')}>
        {exceptions => <div className="modgrid">{exceptions.map(item => <article className="modcard" key={item.id}>
          <strong>{({
            full_refund: tx('Full refund', 'استرداد كامل'),
            partial_refund: tx('Partial refund', 'استرداد جزئي'),
            dispute_opened: tx('Payment dispute opened', 'فتح نزاع على الدفع'),
            dispute_closed: tx('Payment dispute closed', 'إغلاق نزاع الدفع'),
            ineligible_settlement: tx('Payment needs reconciliation', 'دفعة تحتاج إلى تسوية'),
          } as Record<string,string>)[item.exceptionType] ?? tx('Payment exception', 'استثناء دفع')}</strong>
          <p>{formatBillingMoney(item.amountMinor, item.currency, lang)}</p>
          <p className="dim">{formatBillingDate(item.createdAt, lang)}</p>
          {item.subscriptionPaused && <p role="status">{tx('Access is paused pending review.', 'الوصول موقوف مؤقتًا لحين المراجعة.')}</p>}
          <p className="dim">{tx('Contact your billing support team with the invoice reference.', 'تواصل مع فريق دعم الفوترة مع مرجع الفاتورة.')}</p>
          <code dir="ltr">{item.invoiceId}</code>
        </article>)}</div>}
      </Loaded>
    </section>

    <section className="panel" aria-label={tx('Billing help', 'مساعدة الفوترة')}>
      <h2>{tx('Billing help and trial guidance', 'مساعدة الفوترة وإرشادات التجربة')}</h2>
      <h3>{tx('When does a trial end?', 'متى تنتهي التجربة؟')}</h3>
      <p>{tx('Your trial ends at the deadline shown above. Paid features may stop working after the deadline unless the subscription becomes active.',
        'تنتهي الفترة التجريبية عند الموعد الموضح أعلاه. قد تتوقف الميزات المدفوعة بعد ذلك ما لم يُفعّل الاشتراك.')}</p>
      <h3>{tx('Does a Checkout redirect mean payment succeeded?', 'هل العودة من بوابة الدفع تعني نجاح السداد؟')}</h3>
      <p>{tx('No. A renewal is recorded only when our server verifies the Stripe payment event. Refresh this page to check your invoice and subscription status.',
        'لا. لا يُسجل التجديد إلا بعد تحقق الخادم من إشعار دفع Stripe. حدّث الصفحة لمراجعة حالة الفاتورة والاشتراك.')}</p>
      <h3>{tx('Can I change plans here?', 'هل يمكن تغيير الخطة من هنا؟')}</h3>
      <p>{tx('Not yet. Plan changes and module entitlements require administrator approval. Do not assume an advertised plan includes every module.',
        'ليس بعد. تتطلب تغييرات الخطط وصلاحيات الوحدات موافقة المسؤول. لا تفترض أن كل خطة معلنة تشمل جميع الوحدات.')}</p>
      <h3>{tx('What happens if I cancel?', 'ماذا يحدث عند الإلغاء؟')}</h3>
      <p>{tx('Cancellation is scheduled for the current period end; it is not an immediate refund. An authorized administrator can reverse it before the period ends.',
        'يُجدول الإلغاء بنهاية الفترة الحالية ولا يعني استردادًا فوريًا. ويمكن للمسؤول المخوّل التراجع عنه قبل انتهاء الفترة.')}</p>
      <p><Link href="/getting-started">{tx('Open the workspace setup guide', 'فتح دليل إعداد مساحة العمل')}</Link></p>
    </section>
  </Page>;
}
