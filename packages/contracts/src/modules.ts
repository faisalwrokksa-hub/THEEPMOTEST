import { z } from 'zod';

/**
 * The The EPMO module catalogue.
 *
 * `status` drives what a workspace can switch on. Modules still in development
 * are kept out of the customer-facing catalogue entirely rather than shown as
 * unavailable — the engineering roadmap is tracked separately.
 *   ga          — generally available
 *   in_progress — available, still gaining capability
 *   roadmap     — not offered for licensing yet; hidden in the product
 */
export const MODULE_CATALOGUE = [
  { id: 'core360', name: 'Core360', sortOrder: 0, isCore: true, status: 'ga', version: '1.0.0',
    dependsOn: [],
    summary: 'Identity, tenants, roles and capabilities, audit trail, settings, configuration studio.' },

  { id: 'pmo360', name: 'PMO360', sortOrder: 10, isCore: false, status: 'ga', version: '1.0.0',
    dependsOn: ['core360'],
    summary: 'Portfolios, programmes, projects, tasks, schedule, stage gates, RAID, decisions and approvals.' },

  { id: 'analytics360', name: 'Analytics360', sortOrder: 20, isCore: false, status: 'ga', version: '0.9.0',
    dependsOn: ['core360'],
    summary: 'Cross-module dashboards, portfolio analytics and the reporting framework.' },

  { id: 'benefits360', name: 'Benefits360', sortOrder: 30, isCore: false, status: 'ga', version: '0.9.0',
    dependsOn: ['core360', 'pmo360'],
    summary: 'Benefit definition, baseline/target/actual tracking and realisation after closure.' },

  { id: 'finance360', name: 'Finance360', sortOrder: 40, isCore: false, status: 'in_progress', version: '0.4.0',
    dependsOn: ['core360'],
    summary: 'Project cost control, commitments, forecasting and earned value across the portfolio.' },

  { id: 'risk360', name: 'Risk360 / GRC', sortOrder: 50, isCore: false, status: 'in_progress', version: '0.5.0',
    dependsOn: ['core360'],
    summary: 'Risk and issue register with 5×5 scoring, ownership and gate blocking.' },

  { id: 'document360', name: 'Document360', sortOrder: 60, isCore: false, status: 'in_progress', version: '0.3.0',
    dependsOn: ['core360'],
    summary: 'Document register with versions, approval status and gate evidence.' },

  { id: 'hr360', name: 'HR360', sortOrder: 70, isCore: false, status: 'in_progress', version: '0.3.0',
    dependsOn: ['core360'],
    summary: 'People, allocation, capacity planning and logged effort.' },

  { id: 'crm360', name: 'CRM360', sortOrder: 80, isCore: false, status: 'in_progress', version: '0.2.0',
    dependsOn: ['core360'],
    summary: 'Clients, engagements and stakeholder mapping with influence analysis.' },

  { id: 'strategy360', name: 'Strategy360', sortOrder: 90, isCore: false, status: 'roadmap', version: '0.0.0',
    dependsOn: ['core360', 'pmo360'],
    summary: 'Vision, pillars, initiatives, KPIs and OKRs cascading into delivery.' },

  { id: 'procurement360', name: 'Procurement360', sortOrder: 100, isCore: false, status: 'roadmap', version: '0.0.0',
    dependsOn: ['core360', 'finance360'],
    summary: 'Requisitions, tenders, vendors, purchase orders and goods receipt.' },

  { id: 'contract360', name: 'Contract360', sortOrder: 110, isCore: false, status: 'roadmap', version: '0.0.0',
    dependsOn: ['core360', 'procurement360'],
    summary: 'Contract register, milestones, variations, claims and expiry management.' },

  { id: 'asset360', name: 'Asset360', sortOrder: 120, isCore: false, status: 'roadmap', version: '0.0.0',
    dependsOn: ['core360'],
    summary: 'Asset register, lifecycle, maintenance and depreciation.' },

  { id: 'service360', name: 'Service360', sortOrder: 130, isCore: false, status: 'roadmap', version: '0.0.0',
    dependsOn: ['core360'],
    summary: 'Service catalogue, requests, SLAs and fulfilment.' },

  { id: 'process360', name: 'Process360', sortOrder: 140, isCore: false, status: 'roadmap', version: '0.0.0',
    dependsOn: ['core360'],
    summary: 'No-code process and approval design beyond the built-in stage gates.' },

  { id: 'ai360', name: 'AI360', sortOrder: 150, isCore: false, status: 'in_progress', version: '1.0.0',
    dependsOn: ['core360', 'analytics360'],
    summary: 'Grounded assistant over live portfolio data, proactive signals and narrative generation.' },
] as const;

export type ModuleId = typeof MODULE_CATALOGUE[number]['id'];
export const MODULE_IDS = MODULE_CATALOGUE.map((m) => m.id) as ModuleId[];

export const moduleId = z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]);

export const tenantModule = z.object({
  id: moduleId,
  name: z.string(),
  summary: z.string(),
  version: z.string(),
  status: z.enum(['ga', 'beta', 'in_progress', 'roadmap']),
  isCore: z.boolean(),
  dependsOn: z.array(z.string()),
  enabled: z.boolean(),
  tier: z.enum(['trial', 'standard', 'enterprise']),
  seatLimit: z.number().int().nullable(),
  expiresAt: z.coerce.date().nullable(),
});
export type TenantModule = z.infer<typeof tenantModule>;

export const setModule = z.object({
  enabled: z.boolean(),
  tier: z.enum(['trial', 'standard', 'enterprise']).optional(),
  seatLimit: z.number().int().positive().nullable().optional(),
});

/** Which module owns each navigation entry. Used to filter the rail. */
export const NAV_MODULE: Record<string, ModuleId> = {
  'getting-started': 'core360',
  'executive-overview': 'core360',
  'my-work': 'core360',
  attention: 'core360',
  portfolios: 'pmo360',
  programs: 'pmo360',
  projects: 'pmo360',
  'work-board': 'pmo360',
  schedule: 'pmo360',
  'stage-gates': 'pmo360',
  raid: 'risk360',
  decisions: 'pmo360',
  approvals: 'pmo360',
  analytics: 'analytics360',
  financials: 'finance360',
  benefits: 'benefits360',
  resources: 'hr360',
  reports: 'analytics360',
  // Reading the customer's own Power BI is part of connecting their Microsoft
  // tenant, not a reporting feature of ours, so it is not behind Analytics360.
  'power-bi': 'core360',
  data: 'pmo360',
  notifications: 'core360',
  ask: 'ai360',
  documents: 'document360',
  updates: 'core360',
  stakeholders: 'crm360',
  studio: 'core360',
  integrations: 'core360',
  'workspace-settings': 'core360',
  platform: 'core360',
};
