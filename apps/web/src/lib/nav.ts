import type { Capability } from '@pmo/contracts';

/**
 * The workspace navigation, matching The EPMO's own six groups and twenty-one
 * items. Arabic labels are taken verbatim from their v6.5 navigation config
 * rather than translated by us, and each item carries the capability that
 * gates it — same capability strings their product uses.
 */
export type NavItem = { key: string; label: string; ar: string; href: string; cap: Capability };
export type NavGroup = { key: string; label: string; ar: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: 'home', label: 'Home', ar: 'الرئيسية', items: [
    { key: 'getting-started', label: 'Getting Started', ar: 'البدء', href: '/getting-started', cap: 'read' },
    { key: 'executive-overview', label: 'Executive Overview', ar: 'النظرة التنفيذية', href: '/', cap: 'read' },
    { key: 'my-work', label: 'My Work', ar: 'عملي', href: '/my-work', cap: 'read' },
    { key: 'attention', label: 'Attention', ar: 'مركز الانتباه', href: '/activity', cap: 'read' },
  ]},
  { key: 'plan', label: 'Plan & Deliver', ar: 'التخطيط والتنفيذ', items: [
    { key: 'portfolios', label: 'Portfolios', ar: 'المحافظ', href: '/portfolios', cap: 'pmoa_view_portfolio' },
    { key: 'programs', label: 'Programs', ar: 'البرامج', href: '/programs', cap: 'pmoa_view_portfolio' },
    { key: 'projects', label: 'Projects', ar: 'المشاريع', href: '/projects', cap: 'read' },
    { key: 'work-board', label: 'Work Board', ar: 'لوحة العمل', href: '/board', cap: 'pmoa_manage_work' },
    { key: 'schedule', label: 'Schedule', ar: 'الجدول وجانت', href: '/planner', cap: 'pmoa_manage_work' },
  ]},
  { key: 'govern', label: 'Govern', ar: 'الحوكمة', items: [
    { key: 'stage-gates', label: 'Stage Gates', ar: 'بوابات المراحل', href: '/governance', cap: 'pmoa_manage_raid' },
    { key: 'raid', label: 'RAID Register', ar: 'سجل المخاطر والقضايا', href: '/raid', cap: 'pmoa_manage_raid' },
    { key: 'decisions', label: 'Decisions', ar: 'القرارات', href: '/decisions', cap: 'pmoa_view_portfolio' },
    { key: 'approvals', label: 'Approvals', ar: 'الموافقات', href: '/approvals', cap: 'pmoa_approve' },
  ]},
  { key: 'analyse', label: 'Analyse', ar: 'التحليل', items: [
    { key: 'analytics', label: 'Analytics', ar: 'تحليلات المحفظة', href: '/analytics', cap: 'pmoa_view_portfolio' },
    { key: 'financials', label: 'Financials', ar: 'المالية', href: '/financials', cap: 'pmoa_view_financials' },
    { key: 'benefits', label: 'Benefits', ar: 'المنافع والأداء', href: '/benefits', cap: 'pmoa_view_financials' },
    { key: 'resources', label: 'Resources', ar: 'الموارد', href: '/resources', cap: 'pmoa_view_portfolio' },
    { key: 'notifications', label: 'Notifications', ar: 'التنبيهات', href: '/notifications', cap: 'pmoa_admin' },
    { key: 'data', label: 'Import & Export', ar: 'الاستيراد والتصدير', href: '/data', cap: 'pmoa_manage_projects' },
    { key: 'power-bi', label: 'Power BI', ar: 'باور بي آي', href: '/power-bi', cap: 'pmoa_admin' },
    { key: 'reports', label: 'Reports', ar: 'التقارير', href: '/reports', cap: 'pmoa_view_portfolio' },
  ]},
  { key: 'collaborate', label: 'Collaborate', ar: 'التعاون', items: [
    { key: 'documents', label: 'Documents', ar: 'الوثائق', href: '/documents', cap: 'read' },
    { key: 'updates', label: 'Updates', ar: 'التحديثات', href: '/updates', cap: 'read' },
    { key: 'stakeholders', label: 'Stakeholders', ar: 'أصحاب المصلحة', href: '/stakeholders', cap: 'read' },
  ]},
  { key: 'configure', label: 'Configure', ar: 'الإعداد', items: [
    { key: 'studio', label: 'Platform Studio', ar: 'استوديو المنصة', href: '/studio', cap: 'pmoa_admin' },
    { key: 'integrations', label: 'Integrations', ar: 'التكاملات', href: '/integrations', cap: 'pmoa_manage_projects' },
    { key: 'workspace-settings', label: 'Settings', ar: 'إعدادات مساحة العمل', href: '/settings', cap: 'read' },
    { key: 'platform', label: 'Modules', ar: 'المنصة والوحدات', href: '/platform', cap: 'pmoa_platform' },
    { key: 'billing', label: 'Billing & Renewals', ar: 'الفوترة والتجديدات', href: '/billing', cap: 'pmoa_admin' },
    { key: 'super-admin', label: 'Subscriptions', ar: 'إدارة الاشتراكات', href: '/super-admin', cap: 'pmoa_platform' },
  ]},
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
