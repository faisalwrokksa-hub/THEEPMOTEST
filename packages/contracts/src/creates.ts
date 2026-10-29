import { z } from 'zod';
import { uuid } from './common';

const name = z.string().trim().min(2).max(200);
const optText = z.string().trim().max(4000).optional().or(z.literal('')).transform((v) => v || undefined);

export const createPortfolioIn = z.object({
  name, description: optText,
  health: z.enum(['on_track', 'at_risk', 'critical']).default('on_track'),
});

export const createProgramIn = z.object({
  portfolioId: uuid, name, description: optText,
  health: z.enum(['on_track', 'at_risk', 'critical']).default('on_track'),
});

export const createProjectIn = z.object({
  programId: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,16}$/, 'Use 2–16 letters, digits or hyphens')
        .transform((v) => v.toUpperCase()),
  name,
  status: z.enum(['planning', 'active', 'on_hold', 'closed']).default('planning'),
  startDate: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  endDate: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  budgetAmount: z.coerce.number().nonnegative().optional(),
  ownerId: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
  /** Creates the seven gates with their checklists so governance works at once. */
  withGates: z.coerce.boolean().default(true),
});

export const createRaidIn = z.object({
  projectId: uuid,
  kind: z.enum(['risk', 'assumption', 'issue', 'dependency', 'change', 'decision']),
  title: name, detail: optText,
  severity: z.coerce.number().int().min(1).max(5).optional(),
  likelihood: z.coerce.number().int().min(1).max(5).optional(),
  ownerId: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
  dueDate: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  /** Point it at the project's open gate to hold that gate shut. */
  blocksActiveGate: z.coerce.boolean().default(false),
});

export const createTaskIn = z.object({
  projectId: uuid, title: name,
  state: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
  assigneeId: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
  dueDate: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  estimateHours: z.coerce.number().int().positive().optional(),
});

export const createUpdateIn = z.object({
  projectId: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
  kind: z.enum(['note', 'status', 'escalation']).default('note'),
  body: z.string().trim().min(3).max(4000),
});

/*
 * The rest of the write surface.
 *
 * These six tables were readable on their own screens and writable only by
 * uploading a workbook — which is fine for loading a portfolio on day one and
 * useless for adding a single benefit on day two. Same shapes the importer
 * already accepts, so a record typed into the page and a record imported from
 * a spreadsheet are the same record.
 */
const optUuid = uuid.optional().or(z.literal('')).transform((v) => v || undefined);
const optDate = z.string().optional().or(z.literal('')).transform((v) => v || undefined);
const optMoney = z.coerce.number().optional();
const scale5 = z.coerce.number().int().min(1).max(5).optional();

export const createBenefitIn = z.object({
  projectId: optUuid,
  name,
  /** What is actually counted — "Annual rental income (SAR)". */
  measure: z.string().trim().min(2).max(200),
  baseline: optMoney, target: optMoney, actual: optMoney,
  status: z.enum(['planned', 'in_progress', 'realized', 'missed']).default('planned'),
  reviewDate: optDate,
  ownerId: optUuid,
});

export const createStakeholderIn = z.object({
  projectId: optUuid,
  name, organisation: optText, role: optText,
  /** Influence and interest drive the engagement grid, so both are 1–5. */
  influence: scale5, interest: scale5,
  email: z.string().trim().email().optional().or(z.literal('')).transform((v) => v || undefined),
  phone: optText,
  isExternal: z.coerce.boolean().default(false),
});

export const createScheduleItemIn = z.object({
  projectId: uuid,
  name,
  kind: z.enum(['phase', 'activity', 'milestone']).default('activity'),
  startDate: optDate, endDate: optDate,
  /*
   * Baseline defaults to the planned dates when it is left blank. Slippage is
   * measured against the baseline, so an item without one can never be shown
   * as late — it would sit in the schedule looking permanently on time.
   */
  baselineStart: optDate, baselineEnd: optDate,
  progressPct: z.coerce.number().int().min(0).max(100).default(0),
  isCritical: z.coerce.boolean().default(false),
});

export const createCostIn = z.object({
  projectId: uuid,
  kind: z.enum(['budget', 'commitment', 'actual', 'forecast']),
  category: z.string().trim().min(2).max(200),
  amount: z.coerce.number(),
  currency: z.string().trim().length(3).default('SAR'),
  period: optDate,
  note: optText,
});

export const createAllocationIn = z.object({
  userId: uuid, projectId: uuid,
  role: z.string().trim().min(2).max(200),
  allocationPct: z.coerce.number().int().min(1).max(100),
  startDate: optDate, endDate: optDate,
});

export const createDocumentIn = z.object({
  projectId: optUuid,
  name,
  kind: z.string().trim().min(2).max(100),
  version: z.string().trim().max(20).default('1.0'),
  status: z.enum(['draft', 'in_review', 'approved', 'superseded']).default('draft'),
  /*
   * A link, not an upload. The platform records where a document lives and
   * what state it is in; the file itself stays in the document system the
   * customer already runs, which is where their retention and access rules
   * are. Storing a second copy here would mean two versions of the truth.
   */
  url: z.string().trim().url().optional().or(z.literal('')).transform((v) => v || undefined),
  ownerId: optUuid,
});

/**
 * @deprecated Legacy schema kept for compatibility with older integrations.
 * POST /api/v1/create/member is permanently disabled (410 Gone). New users
 * must accept an emailed, single-use invitation before getting membership.
 * Do not use this schema to enroll users or set credentials.
 */
export const createMemberIn = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum([
    'client_admin', 'pmo_lead', 'portfolio_manager', 'program_manager',
    'project_manager', 'governance_risk', 'finance_benefits', 'staff_consultant',
    'external_professional', 'team_member', 'executive_viewer', 'restricted_viewer',
  ]),
  /** Minimum length only — complexity rules annoy people into "Passw0rd!". */
  password: z.string().min(10).max(200),
});

/** Changing what an existing member may do, or retiring them. */
export const updateMemberIn = z.object({
  role: createMemberIn.shape.role.optional(),
  isActive: z.boolean().optional(),
}).refine((b) => b.role !== undefined || b.isActive !== undefined, {
  message: 'Nothing to change',
});
