import Link from 'next/link';
import { trialChecklist, TRIAL_EXAMPLE } from '@/lib/trial-guidance.mjs';
import { api, getSession, type OnboardingStatus } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { getLang } from '@/lib/i18n';
import { can, type Capability } from '@pmo/contracts';
import { onboardingActionHref, onboardingActionLicensed } from '@/lib/onboarding-guidance';
import { effectiveSubscriptionStatus, daysUntil } from '@/lib/subscription-display.mjs';

const copy = {
  en: {
    title: 'Getting Started',
    sub: 'Set up your organization, invite colleagues, and launch your first governed project.',
    progress: 'Workspace setup progress',
    nextTitle: 'Your next recommended step',
    nextInfo: 'We recommend creating your portfolio, then a programme and your first governed project. You can add colleagues at any time.',
    nextButton: 'Start this step',
    nextBlocked: 'You can review the step below, but completing it requires an authorized user or an enabled module.',
    allDone: 'Setup complete',
    completed: 'completed',
    done: 'Completed',
    todo: 'To do',
    open: 'Open',
    askAdmin: 'Ask an administrator',
    moduleNeeded: 'This step also requires the PMO module to be enabled for your workspace.',
    help: 'Only authorized workspace administrators can add people or create project records.',
    note: 'Administrators can now invite colleagues using secure, 72-hour email links when Amazon SES is configured.',
    finished: 'Your workspace essentials are ready. You can continue managing projects from the navigation.',
    tasks: {
      workspace: ['Workspace created', 'Your organization workspace is active. Review its name and identifier in Settings.'],
      team: ['Add a colleague', 'Bring another member into this workspace and assign an appropriate role.'],
      portfolio: ['Create a portfolio', 'Group work by your strategic portfolio.'],
      program: ['Create a programme', 'Place related initiatives inside a portfolio.'],
      project: ['Create your first project', 'Start with a project and its stage-gate governance.'],
    },
  },
  ar: {
    title: 'البدء',
    sub: 'جهّز مساحة مؤسستك وفريق العمل وأطلق أول مشروع تحت الحوكمة.',
    progress: 'تقدم إعداد مساحة العمل',
    nextTitle: 'الخطوة التالية المقترحة',
    nextInfo: 'نقترح إنشاء المحفظة ثم البرنامج وأول مشروع خاضع للحوكمة. ويمكنك إضافة الزملاء في أي وقت.',
    nextButton: 'ابدأ هذه الخطوة',
    nextBlocked: 'يمكنك مراجعة الخطوة أدناه، لكن تنفيذها يتطلب مستخدماً مخولاً أو وحدة مفعّلة.',
    allDone: 'اكتمل الإعداد',
    completed: 'مكتملة',
    done: 'مكتمل',
    todo: 'لم يكتمل',
    open: 'فتح',
    askAdmin: 'تواصل مع مسؤول مساحة العمل',
    moduleNeeded: 'تتطلب هذه الخطوة أيضاً تفعيل وحدة إدارة المشاريع لمساحة العمل.',
    help: 'إضافة الأعضاء وإنشاء سجلات المشاريع متاحان فقط للمستخدمين المخولين.',
    note: 'يمكن لمسؤولي مساحة العمل إرسال دعوات آمنة عبر البريد الإلكتروني لمدة 72 ساعة بعد تهيئة خدمة Amazon SES.',
    finished: 'اكتملت الخطوات الأساسية. يمكنك الآن متابعة إدارة المشاريع من القائمة الرئيسية.',
    tasks: {
      workspace: ['مساحة العمل جاهزة', 'مساحة المؤسسة مفعّلة. يمكنك مراجعة الاسم والمعرّف في الإعدادات.'],
      team: ['إضافة زميل', 'أضف عضواً آخر وحدد الصلاحية المناسبة له.'],
      portfolio: ['إنشاء محفظة', 'نظّم العمل وفق المحفظة الاستراتيجية.'],
      program: ['إنشاء برنامج', 'اجمع المبادرات المترابطة في محفظة واحدة.'],
      project: ['إنشاء أول مشروع', 'ابدأ مشروعاً مع بوابات المراحل الخاصة بالحوكمة.'],
    },
  },
} as const;

export default async function GettingStarted() {
  const lang = await getLang();
  const text = copy[lang];
  const session = await getSession();
  const capabilities: Capability[] = session.authenticated
    ? (session.capabilities as Capability[]) : [];
  const subscription = session.authenticated && session.capabilities.includes('pmoa_admin')
    ? await api.subscriptionCurrent().catch(() => null) : null;
  const licenseStatus = subscription ? effectiveSubscriptionStatus(subscription) : null;
  const trialDays = licenseStatus === 'trialing' ? daysUntil(subscription?.trialEndsAt) : null;

  return (
    <Page title={text.title} sub={text.sub}>
      {licenseStatus === 'trialing' && <section className="panel" aria-label={lang === 'ar' ? 'إرشادات الفترة التجريبية' : 'Trial guidance'} style={{ marginBlockEnd: 16 }}>
        <strong>{lang === 'ar' ? 'الفترة التجريبية لمساحة العمل' : 'Your workspace trial'}</strong>
        <p>{lang === 'ar' ? `المتبقي من التجربة: ${trialDays ?? '—'} أيام. أكمِل إعداد مساحة العمل وراجع خطة الاشتراك قبل انتهاء التجربة.` : `Trial time remaining: ${trialDays ?? '—'} days. Finish workspace setup and review your plan before the trial ends.`}</p>
        <Link href="/billing">{lang === 'ar' ? 'مراجعة الخطة والتجديد' : 'Review plan and renewal'}</Link>
      </section>}
      {licenseStatus === 'expired' && <section className="panel" role="status" style={{ marginBlockEnd: 16 }}>
        <p>{lang === 'ar' ? 'انتهت صلاحية الاشتراك. قد تكون الوحدات التجارية غير متاحة حتى تأكيد التجديد.' : 'The subscription has expired. Commercial modules may be unavailable until renewal is confirmed.'}</p>
        <Link href="/billing">{lang === 'ar' ? 'فتح الفوترة' : 'Open billing'}</Link>
      </section>}
      <Loaded load={async () => ({
        data: await api.onboarding(),
        modules: await api.enabledModules().catch(() => ['core360']),
      })}>
        {({ data, modules }: { data: OnboardingStatus; modules: string[] }) => {
          const nextTask = data.tasks.find(task => task.key === data.nextStep);
          const canOpenNext = nextTask && can(capabilities, nextTask.capability)
            && onboardingActionLicensed(nextTask.key, modules);
          return (
          <>
            <section className="panel" aria-label={text.progress}>
              <h2 className="sec" style={{ marginTop: 0 }}>{text.progress}</h2>
              <p><strong>{data.tenant.name}</strong> <span className="dim">({data.tenant.slug})</span></p>
              <div className="tiles" style={{ marginTop: 12 }}>
                <div className="tile">
                  <span>{text.completed}</span>
                  <strong>{data.completed} / {data.total}</strong>
                </div>
                <div className="tile">
                  <span>{text.progress}</span>
                  <strong>{data.percent}%</strong>
                  <div className="bar" role="progressbar" aria-label={text.progress}
                       aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.percent}>
                    <i style={{ width: `${data.percent}%` }} />
                  </div>
                </div>
              </div>
              {data.completed === data.total && <p>{text.finished}</p>}
              {licenseStatus === 'trialing' && <div style={{ marginTop: 16 }} aria-label={lang === 'ar' ? 'خطوات نجاح التجربة' : 'Trial success checklist'}>
                <h3>{lang === 'ar' ? 'أهداف نجاح التجربة' : 'Trial success goals'}</h3>
                <ol>{trialChecklist(data.tasks, lang).map(step => <li key={step.key}>
                  {step.completed ? '✓ ' : '○ '}{step.label}
                </li>)}</ol>
                <p className="dim">{lang === 'ar' ? 'مثال توضيحي فقط، وليس بيانات فعلية أو مشروعاً محفوظاً:' : 'Illustrative sample only — not real data or a saved project:'}
                  {' '}{TRIAL_EXAMPLE.project} · {TRIAL_EXAMPLE.risks} {lang === 'ar' ? 'مخاطر' : 'risks'} · {TRIAL_EXAMPLE.decisions} {lang === 'ar' ? 'قرار' : 'decision'}.
                </p>
              </div>}
            </section>

            {nextTask ? (
              <section className="panel" aria-labelledby="onboarding-next" style={{ marginTop: 16 }}>
                <h2 className="sec" id="onboarding-next" style={{ marginTop: 0 }}>{text.nextTitle}</h2>
                <p><strong>{text.tasks[nextTask.key][0]}</strong></p>
                <p className="dim">{text.nextInfo}</p>
                {canOpenNext ? (
                  <Link href={onboardingActionHref(nextTask.key)} className="btn">
                    {text.nextButton}
                  </Link>
                ) : <p className="dim">{text.nextBlocked}</p>}
              </section>
            ) : (
              <p role="status" style={{ marginTop: 16 }}>{text.allDone}: {text.finished}</p>
            )}

            <ol style={{ display: 'grid', gap: 12, paddingInlineStart: 24, marginTop: 22 }}>
              {data.tasks.map((task) => {
                const [heading, description] = text.tasks[task.key];
                const permitted = can(capabilities, task.capability);
                const licensed = onboardingActionLicensed(task.key, modules);
                const available = permitted && licensed;
                return (
                  <li key={task.key} className="panel" style={{ padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <strong>{heading}</strong>
                        <p className="dim" style={{ marginTop: 6 }}>{description}</p>
                      </div>
                      <span className={`pill ${task.completed ? 'on_track' : 's-closed'}`}>
                        {task.completed ? text.done : text.todo}
                      </span>
                    </div>
                    {available ? (
                      <Link href={onboardingActionHref(task.key)} className="btn" style={{ display: 'inline-block', marginTop: 10 }}>
                        {text.open}
                      </Link>
                    ) : (
                      <p className="dim" style={{ marginTop: 8 }}>
                        {!permitted ? text.askAdmin : text.moduleNeeded}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="dim">{text.help}</p>
            <p className="dim">{text.note}</p>
          </>
        );
        }}
      </Loaded>
    </Page>
  );
}
