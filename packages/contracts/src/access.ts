import { z } from 'zod';

/**
 * Capability model, mirroring the capability strings The EPMO gates its own
 * navigation with. Roles map to capabilities; UI and API both check
 * capabilities, never roles — so adding a role never means touching a guard.
 */
export const capability = z.enum([
  'read',
  'pmoa_view_portfolio',
  'pmoa_view_financials',
  'pmoa_manage_projects',
  'pmoa_manage_work',
  // Posting to the shared activity feed is a write, not the read capability.
  'pmoa_post_updates',
  'pmoa_manage_raid',
  'pmoa_approve',
  'pmoa_admin',
  /* Operating the platform itself — the module catalogue and who is licensed
     for what. Held by vendor staff, never by a customer, and therefore not
     granted by any role below. */
  'pmoa_platform',
  /* Writing money and benefits. Split out because creating a cost line was
     guarded by `pmoa_view_financials`, which let anyone who could read the
     finances also write them. */
  'pmoa_manage_finance',
  /* Managing who is in the workspace and what they may do. */
  'pmoa_manage_people',
]);
export type Capability = z.infer<typeof capability>;

const ALL: Capability[] = ['read', 'pmoa_view_portfolio', 'pmoa_view_financials',
  'pmoa_manage_projects', 'pmoa_manage_work', 'pmoa_post_updates', 'pmoa_manage_raid',
  'pmoa_manage_finance', 'pmoa_manage_people', 'pmoa_approve', 'pmoa_admin'];

export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  owner: ALL,
  admin: ALL,
  client_admin: ALL,
  pmo_lead: ['read','pmoa_view_portfolio','pmoa_view_financials','pmoa_manage_projects','pmoa_manage_work','pmoa_manage_raid','pmoa_manage_finance','pmoa_approve','pmoa_post_updates'],
  portfolio_manager: ['read','pmoa_view_portfolio','pmoa_view_financials','pmoa_manage_projects','pmoa_manage_work','pmoa_manage_raid','pmoa_approve','pmoa_post_updates'],
  program_manager: ['read','pmoa_view_portfolio','pmoa_view_financials','pmoa_manage_projects','pmoa_manage_work','pmoa_manage_raid','pmoa_post_updates'],
  project_manager: ['read','pmoa_view_portfolio','pmoa_manage_projects','pmoa_manage_work','pmoa_manage_raid','pmoa_post_updates'],
  governance_risk: ['read','pmoa_view_portfolio','pmoa_manage_raid','pmoa_approve','pmoa_post_updates'],
  finance_benefits: ['read','pmoa_view_portfolio','pmoa_view_financials','pmoa_manage_finance','pmoa_post_updates'],
  staff_consultant: ['read','pmoa_view_portfolio','pmoa_view_financials','pmoa_manage_work','pmoa_manage_raid','pmoa_post_updates'],
  external_professional: ['read','pmoa_manage_work','pmoa_post_updates'],
  team_member: ['read','pmoa_manage_work','pmoa_post_updates'],
  contributor: ['read','pmoa_manage_work','pmoa_post_updates'],
  executive_viewer: ['read','pmoa_view_portfolio','pmoa_view_financials'],
  viewer: ['read','pmoa_view_portfolio'],
  restricted_viewer: ['read'],
};

export const capabilitiesFor = (role: string): Capability[] =>
  ROLE_CAPABILITIES[role] ?? ['read'];

export const can = (caps: readonly Capability[], needed: Capability) =>
  // pmoa_admin is a blanket pass inside a workspace, but it must not reach
  // across into platform administration — that was exactly the hole.
  caps.includes(needed) ||
  (needed !== 'pmoa_platform' && caps.includes('pmoa_admin'));

export const session = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  userId: z.string().uuid().nullable(),
  displayName: z.string().nullable(),
  role: z.string(),
  capabilities: z.array(capability),
});
export type Session = z.infer<typeof session>;

/**
 * What each role is called on screen. The The EPMO names, so a customer moving
 * from that product recognises the list rather than learning a second one.
 */
export const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  owner:                 { en: 'Owner',                 ar: 'المالك' },
  admin:                 { en: 'Administrator',         ar: 'مدير النظام' },
  client_admin:          { en: 'Client Administrator',  ar: 'مدير العميل' },
  pmo_lead:              { en: 'PMO Manager',           ar: 'مدير مكتب المشاريع' },
  portfolio_manager:     { en: 'Portfolio Manager',     ar: 'مدير المحفظة' },
  program_manager:       { en: 'Programme Manager',     ar: 'مدير البرنامج' },
  project_manager:       { en: 'Project Manager',       ar: 'مدير المشروع' },
  governance_risk:       { en: 'Governance & Risk',     ar: 'الحوكمة والمخاطر' },
  finance_benefits:      { en: 'Finance & Benefits',    ar: 'المالية والمنافع' },
  staff_consultant:      { en: 'Staff Consultant',      ar: 'استشاري' },
  external_professional: { en: 'External Professional', ar: 'مختص خارجي' },
  team_member:           { en: 'Team Member',           ar: 'عضو فريق' },
  contributor:           { en: 'Contributor',           ar: 'مساهم' },
  executive_viewer:      { en: 'Executive Viewer',      ar: 'مطّلع تنفيذي' },
  viewer:                { en: 'Viewer',                ar: 'مطّلع' },
  restricted_viewer:     { en: 'Restricted Viewer',     ar: 'مطّلع مقيّد' },
};

/** The roles a workspace administrator may hand out. Never owner or admin. */
export const ASSIGNABLE_ROLES = [
  'client_admin', 'pmo_lead', 'portfolio_manager', 'program_manager',
  'project_manager', 'governance_risk', 'finance_benefits', 'staff_consultant',
  'external_professional', 'team_member', 'executive_viewer', 'restricted_viewer',
] as const;
