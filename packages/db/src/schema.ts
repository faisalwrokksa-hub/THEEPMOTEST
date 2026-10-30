import {
  pgTable, uuid, text, timestamp, integer, numeric, jsonb, date, boolean, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const healthEnum = pgEnum('health', ['on_track', 'at_risk', 'critical']);
export const projectStatusEnum = pgEnum('project_status', ['planning', 'active', 'on_hold', 'closed']);
export const roleEnum = pgEnum('member_role', [
  'owner', 'admin', 'pmo_lead', 'project_manager', 'contributor', 'viewer', 'staff_consultant',
  /* The legacy role set, so the vocabulary matches the product customers
     were trained on. Added rather than renamed: a role name is written on
     every membership row. */
  'client_admin', 'portfolio_manager', 'program_manager', 'team_member',
  'executive_viewer', 'governance_risk', 'finance_benefits',
  'external_professional', 'restricted_viewer',
]);

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/* ── tenancy ──────────────────────────────────────────────────────────────
   `tenants` and `users` are the only tables NOT tenant-scoped: a tenant
   cannot be scoped to itself, and a user may belong to several tenants.
   Everything else below carries tenant_id and an RLS policy.            */

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: createdAt(),
}, (t) => ({ slugIdx: uniqueIndex('tenants_slug_key').on(t.slug) }));

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  /** Optional short login name. People may sign in with either this or email. */
  username: text('username'),
  displayName: text('display_name').notNull(),
  /** Argon2/bcrypt hash. Null means the account cannot sign in with a password. */
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: createdAt(),
  /* Vendor staff who may change module entitlements. Deliberately on the
     person and not on a membership: operating the platform is not a role
     inside any one customer's workspace. */
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_key').on(t.email),
  usernameIdx: uniqueIndex('users_username_key').on(t.username),
}));

export const memberships = pgTable('memberships', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('viewer'),
  // Per-workspace suspension: users.isActive remains global platform account status.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => ({
  uniq: uniqueIndex('memberships_tenant_user_key').on(t.tenantId, t.userId),
  tenantIdx: index('memberships_tenant_idx').on(t.tenantId),
}));


/* ── authentication ───────────────────────────────────────────────────────
   Opaque server-side sessions rather than JWTs: revocation is a DELETE, and
   nothing sensitive ever lives in the cookie. Only the HASH of the token is
   stored, so a database leak cannot be replayed as a login.               */

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** sha256 of the cookie value. The raw token exists only in the cookie. */
  tokenHash: text('token_hash').notNull(),
  /** Which tenant this session is currently acting in. */
  activeTenantId: uuid('active_tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => ({
  tokenIdx: uniqueIndex('sessions_token_key').on(t.tokenHash),
  userIdx: index('sessions_user_idx').on(t.userId),
  expiryIdx: index('sessions_expiry_idx').on(t.expiresAt),
}));

/** Rate limiting and lockout evidence, kept so abuse is auditable. */
export const authEvents = pgTable('auth_events', {
  id: id(),
  email: text('email'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),      // 'login.ok' | 'login.fail' | 'logout' | 'locked'
  ip: text('ip'),
  detail: text('detail'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ atIdx: index('auth_events_at_idx').on(t.at) }));

/** Global recovery tokens are short-lived; the application must not SELECT their hashes. */
export const authPasswordResets = pgTable('auth_password_resets', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => ({
  tokenKey: uniqueIndex('auth_password_resets_token_hash_key').on(t.tokenHash),
  userRecent: index('auth_password_resets_user_recent').on(t.userId, t.createdAt),
  expiryIdx: index('auth_password_resets_expiration').on(t.expiresAt),
}));

/* ── delivery spine: portfolio → program → project ───────────────────── */

export const portfolios = pgTable('portfolios', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  health: healthEnum('health').notNull().default('on_track'),
  createdAt: createdAt(),
}, (t) => ({ tenantIdx: index('portfolios_tenant_idx').on(t.tenantId) }));

export const programs = pgTable('programs', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  health: healthEnum('health').notNull().default('on_track'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('programs_tenant_idx').on(t.tenantId),
  portfolioIdx: index('programs_portfolio_idx').on(t.portfolioId),
}));

export const projects = pgTable('projects', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  status: projectStatusEnum('status').notNull().default('planning'),
  health: healthEnum('health').notNull().default('on_track'),
  progressPct: integer('progress_pct').notNull().default(0),
  startDate: date('start_date'),
  endDate: date('end_date'),
  budgetAmount: numeric('budget_amount', { precision: 18, scale: 2 }),
  budgetCurrency: text('budget_currency').default('SAR'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('projects_tenant_idx').on(t.tenantId),
  codeUniq: uniqueIndex('projects_tenant_code_key').on(t.tenantId, t.code),
  programIdx: index('projects_program_idx').on(t.programId),
}));

/* ── audit ledger ─────────────────────────────────────────────────────────
   Append-only. Every state change writes here in the SAME transaction as
   the change itself, so the ledger cannot drift from the data.          */

export const auditEvents = pgTable('audit_events', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  entity: text('entity').notNull(),          // 'project'
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),          // 'created' | 'updated' | 'gate.approved'
  diff: jsonb('diff').$type<Record<string, unknown>>(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantAtIdx: index('audit_tenant_at_idx').on(t.tenantId, t.at),
  entityIdx: index('audit_entity_idx').on(t.entity, t.entityId),
}));


/* ── governance: stage gates ──────────────────────────────────────────────
   A gate is a decision point a project must pass to keep spending money.
   SG0 Concept → SG1 Feasibility → SG2 Design → SG3 Detailed Design →
   SG4 Procurement → SG5 Construction → SG6 Handover.
   A gate opens only when every criterion is met AND its accountable
   approver has signed. That rule is the product.                        */

export const gateStatusEnum = pgEnum('gate_status', ['locked', 'active', 'approved', 'rejected']);
export const decisionEnum = pgEnum('decision', ['pending', 'approved', 'rejected']);
export const raidKindEnum = pgEnum('raid_kind',
  ['risk', 'assumption', 'issue', 'dependency', 'change', 'decision']);
export const raidStatusEnum = pgEnum('raid_status', ['open', 'mitigating', 'closed']);
export const taskStateEnum = pgEnum('task_state', ['todo', 'in_progress', 'blocked', 'done']);

export const gates = pgTable('gates', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),                 // 0..6
  name: text('name').notNull(),                  // 'Feasibility'
  status: gateStatusEnum('status').notNull().default('locked'),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('gates_tenant_idx').on(t.tenantId),
  projSeq: uniqueIndex('gates_project_seq_key').on(t.projectId, t.seq),
}));

/** One checklist row on a gate. The gate cannot pass while any is unmet. */
export const gateCriteria = pgTable('gate_criteria', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  gateId: uuid('gate_id').notNull().references(() => gates.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  isMet: boolean('is_met').notNull().default(false),
  evidenceUrl: text('evidence_url'),
  metAt: timestamp('met_at', { withTimezone: true }),
  metBy: uuid('met_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('gate_criteria_tenant_idx').on(t.tenantId),
  gateIdx: index('gate_criteria_gate_idx').on(t.gateId),
}));

/**
 * A signature on a gate. `isAccountable` marks the single person who owns the
 * decision — the "A" in RACI. Exactly one per gate, enforced by partial index.
 */
export const approvals = pgTable('approvals', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  gateId: uuid('gate_id').notNull().references(() => gates.id, { onDelete: 'cascade' }),
  approverId: uuid('approver_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  isAccountable: boolean('is_accountable').notNull().default(false),
  decision: decisionEnum('decision').notNull().default('pending'),
  comment: text('comment'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('approvals_tenant_idx').on(t.tenantId),
  gateIdx: index('approvals_gate_idx').on(t.gateId),
  oneApprover: uniqueIndex('approvals_gate_approver_key').on(t.gateId, t.approverId),
}));

/** Risks, Assumptions, Issues, Dependencies, Changes, Decisions — one register. */
export const raidItems = pgTable('raid_items', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: raidKindEnum('kind').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  /** 1..5, range enforced by CHECK constraints (see sql/rls.sql). */
  severity: integer('severity'),
  likelihood: integer('likelihood'),
  status: raidStatusEnum('status').notNull().default('open'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  /** The teeth: an open item pointing at a gate is what keeps that gate shut. */
  blocksGateId: uuid('blocks_gate_id').references(() => gates.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('raid_tenant_idx').on(t.tenantId),
  projectIdx: index('raid_project_idx').on(t.projectId),
  blocksIdx: index('raid_blocks_gate_idx').on(t.blocksGateId),
}));

export const tasks = pgTable('tasks', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  state: taskStateEnum('state').notNull().default('todo'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  estimateHours: integer('estimate_hours'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('tasks_tenant_idx').on(t.tenantId),
  projectIdx: index('tasks_project_idx').on(t.projectId),
}));


/* ── schedule (Planner / Gantt) ───────────────────────────────────────── */

export const scheduleItemKindEnum = pgEnum('schedule_kind', ['phase', 'activity', 'milestone']);

export const scheduleItems = pgTable('schedule_items', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: scheduleItemKindEnum('kind').notNull().default('activity'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  /** Baseline dates, so slippage is visible rather than inferred. */
  baselineStart: date('baseline_start'),
  baselineEnd: date('baseline_end'),
  progressPct: integer('progress_pct').notNull().default(0),
  isCritical: boolean('is_critical').notNull().default(false),
  dependsOnId: uuid('depends_on_id'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('sched_tenant_idx').on(t.tenantId),
  projectIdx: index('sched_project_idx').on(t.projectId),
}));

/* ── financials ───────────────────────────────────────────────────────── */

export const costKindEnum = pgEnum('cost_kind', ['budget', 'commitment', 'actual', 'forecast']);

export const costEntries = pgTable('cost_entries', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: costKindEnum('kind').notNull(),
  category: text('category').notNull(),          // 'Construction', 'Design fees'
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('SAR'),
  period: date('period'),                        // month this belongs to
  note: text('note'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('cost_tenant_idx').on(t.tenantId),
  projectKindIdx: index('cost_project_kind_idx').on(t.projectId, t.kind),
}));

/* ── benefits ─────────────────────────────────────────────────────────── */

export const benefitStatusEnum = pgEnum('benefit_status',
  ['planned', 'in_progress', 'realized', 'missed']);

export const benefits = pgTable('benefits', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  measure: text('measure').notNull(),            // 'Annual rental income (SAR)'
  baseline: numeric('baseline', { precision: 18, scale: 2 }),
  target: numeric('target', { precision: 18, scale: 2 }),
  actual: numeric('actual', { precision: 18, scale: 2 }),
  status: benefitStatusEnum('status').notNull().default('planned'),
  /** Benefits are tracked after the project closes — this is that date. */
  reviewDate: date('review_date'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('benefits_tenant_idx').on(t.tenantId),
  projectIdx: index('benefits_project_idx').on(t.projectId),
}));

/* ── resources & capacity ─────────────────────────────────────────────── */

export const allocations = pgTable('allocations', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),                  // 'Project Manager'
  allocationPct: integer('allocation_pct').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('alloc_tenant_idx').on(t.tenantId),
  userIdx: index('alloc_user_idx').on(t.userId),
}));

export const effortEntries = pgTable('effort_entries', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  workDate: date('work_date').notNull(),
  hours: numeric('hours', { precision: 6, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('effort_tenant_idx').on(t.tenantId),
  userDateIdx: index('effort_user_date_idx').on(t.userId, t.workDate),
}));

/* ── Platform Studio (low-code configuration) ─────────────────────────── */

export const fieldTypeEnum = pgEnum('field_type',
  ['text', 'number', 'date', 'select', 'boolean', 'user']);

export const customFields = pgTable('custom_fields', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  appliesTo: text('applies_to').notNull(),       // 'project' | 'raid_item'
  label: text('label').notNull(),
  fieldKey: text('field_key').notNull(),
  fieldType: fieldTypeEnum('field_type').notNull(),
  options: jsonb('options').$type<string[]>(),
  isRequired: boolean('is_required').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('cf_tenant_idx').on(t.tenantId),
  keyUniq: uniqueIndex('cf_tenant_key').on(t.tenantId, t.appliesTo, t.fieldKey),
}));

export const gateTemplates = pgTable('gate_templates', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  projectType: text('project_type').notNull(),   // 'Real estate'
  /** The gate + criteria shape a new project of this type is created with. */
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => ({ tenantIdx: index('gt_tenant_idx').on(t.tenantId) }));

export const automations = pgTable('automations', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  trigger: text('trigger').notNull(),            // 'gate.blocked'
  action: text('action').notNull(),              // 'notify.accountable'
  isActive: boolean('is_active').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  runCount: integer('run_count').notNull().default(0),
  createdAt: createdAt(),
}, (t) => ({ tenantIdx: index('auto_tenant_idx').on(t.tenantId) }));

/* ── reporting ────────────────────────────────────────────────────────── */

/**
 * Ask X conversations.
 *
 * Kept because an answer a director acted on is part of the record: "the
 * assistant said the portfolio was healthy" is a claim someone will eventually
 * want to check. Storing the question, the answer and the facts the answer was
 * grounded in makes that checkable rather than a matter of memory.
 */
export const askMessages = pgTable('ask_messages', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  role: text('role').notNull(),                  // 'user' | 'assistant'
  content: text('content').notNull(),
  lang: text('lang').notNull().default('en'),
  /** Which model answered, so an answer can be attributed later. */
  model: text('model'),
  /** A digest of the facts given to the model, for auditing an answer. */
  grounding: jsonb('grounding'),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('ask_tenant_idx').on(t.tenantId, t.createdAt),
  threadIdx: index('ask_thread_idx').on(t.threadId, t.createdAt),
}));

/**
 * A daily photograph of each workspace.
 *
 * Nothing else in the schema remembers what yesterday looked like: projects
 * carry their current health, costs carry the month they belong to, but there
 * is no record of what the portfolio *was*. Which means a question as ordinary
 * as "are we getting better or worse?" cannot be answered from the live tables
 * at all — only guessed at.
 *
 * One row per workspace per day, written by the scheduler. History therefore
 * starts the day this ships and cannot be backfilled, which the trend chart
 * says plainly rather than drawing a confident line through two points.
 */
export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  onDate: date('on_date').notNull(),
  projects: integer('projects').notNull().default(0),
  onTrack: integer('on_track').notNull().default(0),
  atRisk: integer('at_risk').notNull().default(0),
  critical: integer('critical').notNull().default(0),
  avgProgress: integer('avg_progress').notNull().default(0),
  gatesActive: integer('gates_active').notNull().default(0),
  gatesBlocked: integer('gates_blocked').notNull().default(0),
  openRegister: integer('open_register').notNull().default(0),
  budget: numeric('budget', { precision: 18, scale: 2 }).notNull().default('0'),
  actual: numeric('actual', { precision: 18, scale: 2 }).notNull().default('0'),
  forecast: numeric('forecast', { precision: 18, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(),
}, (t) => ({
  /** One per day: a second run the same day updates rather than duplicates. */
  uniq: uniqueIndex('snapshot_tenant_day').on(t.tenantId, t.onDate),
  tenantIdx: index('snapshot_tenant_idx').on(t.tenantId, t.onDate),
}));

export const notificationStatusEnum = pgEnum('notification_status',
  ['queued', 'sent', 'failed', 'suppressed']);

/**
 * The outbox.
 *
 * Every notification is written here first and sent second, which is what
 * makes "did the approver actually get told?" a question with an answer. It
 * also means a platform with no mail transport configured still records
 * exactly what it would have sent, so the rules can be tested before a single
 * address is verified.
 *
 * `dedupeKey` is the guard against the obvious failure of a rule that fires on
 * a *condition* rather than an event: a gate blocked on Monday is still
 * blocked on Tuesday, and nobody wants that email twice. The unique index does
 * the work, so a double-send is impossible rather than unlikely.
 */
export const notifications = pgTable('notifications', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** Who it is for. The address is copied in case the user is later removed. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  toEmail: text('to_email').notNull(),
  kind: text('kind').notNull(),                   // 'gate.blocked', 'approval.pending'
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  lang: text('lang').notNull().default('en'),
  /** What it is about, so the log can link back to the record. */
  entity: text('entity'),
  entityId: uuid('entity_id'),
  status: notificationStatusEnum('status').notNull().default('queued'),
  error: text('error'),
  dedupeKey: text('dedupe_key').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('notif_tenant_idx').on(t.tenantId, t.createdAt),
  statusIdx: index('notif_status_idx').on(t.status),
  dedupe: uniqueIndex('notif_dedupe_key').on(t.tenantId, t.dedupeKey),
}));

export const reportDefs = pgTable('report_defs', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(),                  // 'board_pack' | 'gate_status'
  audience: text('audience').notNull(),          // 'Board'
  schedule: text('schedule'),                    // 'Monthly, first Tuesday'
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ tenantIdx: index('rd_tenant_idx').on(t.tenantId) }));


/* ── collaborate: documents, updates, stakeholders ────────────────────── */

export const docStatusEnum = pgEnum('doc_status', ['draft', 'in_review', 'approved', 'superseded']);

export const documents = pgTable('documents', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  /** When set, this document is the evidence behind a gate criterion. */
  criterionId: uuid('criterion_id').references(() => gateCriteria.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(),                  // 'Drawing' | 'Contract' | 'Report'
  version: text('version').notNull().default('1.0'),
  status: docStatusEnum('status').notNull().default('draft'),
  url: text('url'),
  sizeKb: integer('size_kb'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

  /*
   * Where the bytes actually are.
   *
   * 'link' means we hold only the URL somebody typed, which is all this ever
   * was. 'microsoft' means the file is in the customer's own SharePoint or
   * OneDrive and these three identify it there. We never hold a copy: the
   * point of connecting their Microsoft tenant is that their documents stay
   * under their retention, their permissions and their legal hold.
   */
  storageProvider: text('storage_provider').notNull().default('link'),
  externalDriveId: text('external_drive_id'),
  externalItemId: text('external_item_id'),
  externalEtag: text('external_etag'),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('docs_tenant_idx').on(t.tenantId),
  projectIdx: index('docs_project_idx').on(t.projectId),
  externalIdx: index('docs_external_idx').on(t.externalItemId),
}));

export const updates = pgTable('updates', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull().default('note'),  // 'note' | 'status' | 'escalation'
  body: text('body').notNull(),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('updates_tenant_idx').on(t.tenantId),
  createdIdx: index('updates_created_idx').on(t.tenantId, t.createdAt),
}));

export const stakeholders = pgTable('stakeholders', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  organisation: text('organisation'),
  role: text('role'),
  /** Influence x interest is the standard stakeholder grid. Both 1..5. */
  influence: integer('influence'),
  interest: integer('interest'),
  email: text('email'),
  phone: text('phone'),
  isExternal: boolean('is_external').notNull().default(false),
  createdAt: createdAt(),
}, (t) => ({
  tenantIdx: index('stake_tenant_idx').on(t.tenantId),
  projectIdx: index('stake_project_idx').on(t.projectId),
}));

/* ── configure: integrations ──────────────────────────────────────────── */

export const integStatusEnum = pgEnum('integ_status', ['connected', 'error', 'disabled', 'pending']);

export const integrations = pgTable('integrations', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  provider: text('provider').notNull(),          // 'primavera_p6' | 'ms_project' | 'jira'
  direction: text('direction').notNull().default('inbound'),
  status: integStatusEnum('status').notNull().default('pending'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  recordsSynced: integer('records_synced').notNull().default(0),
  createdAt: createdAt(),
}, (t) => ({ tenantIdx: index('integ_tenant_idx').on(t.tenantId) }));

/**
 * A live connection to somebody else's system, on behalf of one workspace.
 *
 * Separate from `integrations` above, which is a catalogue row describing that
 * a connection exists and how it is doing. This is the connection itself: who
 * consented, in which Microsoft tenant, the refresh token that keeps it alive,
 * and where in their storage this workspace's files are to live.
 *
 * One per provider per workspace. The customer's own Microsoft tenant holds
 * the files; we hold a pointer and a token, and the token is encrypted at rest
 * so a database dump is not a set of keys to a customer's SharePoint.
 */
/** E04a: additive user-bound credentials; runtime remains on legacy storage. */
export const microsoftUserConnections = pgTable('microsoft_user_connections', {
 id: id(),
 tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
 userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
 provider: text('provider').notNull().default('microsoft'),
 status: integStatusEnum('status').notNull().default('pending'),
 externalTenantId: text('external_tenant_id'), accountEmail: text('account_email'),
 accountName: text('account_name'), scopes: text('scopes'), refreshToken: text('refresh_token'),
 siteId: text('site_id'), siteName: text('site_name'), siteUrl: text('site_url'),
 driveId: text('drive_id'), driveName: text('drive_name'),
 rootItemId: text('root_item_id'), rootPath: text('root_path'),
 connectedAt: timestamp('connected_at', { withTimezone: true }),
 lastError: text('last_error'), lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
 updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
 createdAt: createdAt(),
}, t => ({
 perUser: uniqueIndex('microsoft_user_connections_tenant_user_provider_key').on(t.tenantId,t.userId,t.provider),
 tenantIdx: index('microsoft_user_connections_tenant_idx').on(t.tenantId),
}));

export const integrationConnections = pgTable('integration_connections', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),            // 'microsoft'
  status: integStatusEnum('status').notNull().default('pending'),

  /** Their Microsoft tenant and the account that consented. */
  externalTenantId: text('external_tenant_id'),
  accountEmail: text('account_email'),
  accountName: text('account_name'),
  scopes: text('scopes'),
  /** AES-256-GCM. Never written in the clear, never returned by the API. */
  refreshToken: text('refresh_token'),

  /** Where this workspace's files live inside their storage. */
  siteId: text('site_id'),
  siteName: text('site_name'),
  siteUrl: text('site_url'),
  driveId: text('drive_id'),
  driveName: text('drive_name'),
  rootItemId: text('root_item_id'),
  rootPath: text('root_path'),

  connectedBy: uuid('connected_by').references(() => users.id, { onDelete: 'set null' }),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  lastError: text('last_error'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => ({
  oneEach: uniqueIndex('integration_conn_tenant_provider_key').on(t.tenantId, t.provider),
}));

/**
 * A half-finished OAuth handshake.
 *
 * The `state` parameter has to be unguessable, single-use and tied to the
 * workspace and person who started it, or a callback can be replayed into
 * somebody else's workspace. Rows are short-lived and deleted on use.
 */
export const oauthStates = pgTable('oauth_states', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  state: text('state').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  returnTo: text('return_to'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => ({ stateUniq: uniqueIndex('oauth_states_state_key').on(t.state) }));


/* ── platform module registry ─────────────────────────────────────────────
   The catalogue is platform-wide; entitlements are per tenant. Enforcement
   happens in the API (see ModuleGuard), never by hiding a menu item — a
   disabled module's routes must refuse, not merely disappear.            */

export const moduleStatusEnum = pgEnum('module_status', ['ga', 'beta', 'in_progress', 'planned', 'roadmap']);
export const licenceTierEnum = pgEnum('licence_tier', ['trial', 'standard', 'enterprise']);

export const modules = pgTable('modules', {
  /** Stable slug, e.g. 'pmo360'. Referenced by route decorators. */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  version: text('version').notNull().default('0.1.0'),
  status: moduleStatusEnum('status').notNull().default('planned'),
  /** Core cannot be disabled; everything else is optional. */
  isCore: boolean('is_core').notNull().default(false),
  dependsOn: jsonb('depends_on').$type<string[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(100),
  createdAt: createdAt(),
});

export const tenantModules = pgTable('tenant_modules', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  tier: licenceTierEnum('tier').notNull().default('standard'),
  /** Null means unlimited. Checked when seats are consumed. */
  seatLimit: integer('seat_limit'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({
  uniq: uniqueIndex('tenant_modules_key').on(t.tenantId, t.moduleId),
  tenantIdx: index('tenant_modules_tenant_idx').on(t.tenantId),
}));

/** Tables that carry tenant_id — the RLS script reads this list. */
export const TENANT_SCOPED = [
  'memberships', 'portfolios', 'programs', 'projects', 'audit_events',
  'gates', 'gate_criteria', 'approvals', 'raid_items', 'tasks',
  'schedule_items', 'cost_entries', 'benefits', 'allocations', 'effort_entries',
  'custom_fields', 'gate_templates', 'automations', 'report_defs',
  'documents', 'updates', 'stakeholders', 'integrations',
  'integration_connections', 'oauth_states', 'tenant_modules',
  'tenant_subscriptions', 'subscription_events', 'billing_invoices', 'billing_payments', 'billing_webhook_receipts', 'billing_stripe_checkout_sessions', 'billing_payment_exceptions',
] as const;

export { sql };


/* Phase 12: commercial subscriptions. Subscription state never deletes module data. */
export const subscriptionPlans = pgTable('subscription_plans', {
  id: id(), code: text('code').notNull(), name: text('name').notNull(),
  priceMinor: integer('price_minor').notNull().default(0),
  currency: text('currency').notNull().default('SAR'),
  billingInterval: text('billing_interval').notNull().default('monthly'),
  trialDays: integer('trial_days').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true), createdAt: createdAt(),
}, t => ({ codeIdx: uniqueIndex('subscription_plans_code_key').on(t.code) }));

export const tenantSubscriptions = pgTable('tenant_subscriptions', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id),
  status: text('status').notNull().default('trialing'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  periodStartsAt: timestamp('period_starts_at', { withTimezone: true }).notNull(),
  periodEndsAt: timestamp('period_ends_at', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ tenantIdx: index('tenant_subscriptions_tenant_idx').on(t.tenantId) }));

export const subscriptionEvents = pgTable('subscription_events', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').notNull().references(() => tenantSubscriptions.id),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  eventType: text('event_type').notNull(), details: jsonb('details').notNull().default({}),
  createdAt: createdAt(),
}, t => ({ tenantIdx: index('subscription_events_tenant_idx').on(t.tenantId) }));

/** Vendor-wide, append-only audit journal for subscription plan administration. */
export const platformSubscriptionAuditEvents = pgTable('platform_subscription_audit_events', {
  id: id(), actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  entityKind: text('entity_kind').notNull(), entityId: text('entity_id').notNull(),
  action: text('action').notNull(), details: jsonb('details').notNull().default({}),
  createdAt: createdAt(),
}, t => ({ createdIdx: index('platform_subscription_audit_events_created_at_idx').on(t.createdAt) }));


/* Phase 12: billed renewals. All three tables enforce tenant isolation through
   RLS and composite foreign keys in migration 0014. */
export const billingInvoices = pgTable('billing_invoices', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').notNull().references(() => tenantSubscriptions.id),
  periodStartsAt: timestamp('period_starts_at', { withTimezone: true }).notNull(),
  periodEndsAt: timestamp('period_ends_at', { withTimezone: true }).notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, t => ({
  tenantIdx: index('billing_invoices_tenant_created_idx').on(t.tenantId, t.createdAt),
  periodIdx: uniqueIndex('billing_invoice_unique_period').on(t.tenantId, t.subscriptionId, t.periodStartsAt),
}));
export const billingPayments = pgTable('billing_payments', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => billingInvoices.id),
  provider: text('provider').notNull(),
  providerPaymentId: text('provider_payment_id').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  createdAt: createdAt(),
}, t => ({
  tenantIdx: index('billing_payments_tenant_created_idx').on(t.tenantId, t.createdAt),
  uniquePayment: uniqueIndex('billing_payments_provider_payment_unique').on(t.provider, t.providerPaymentId),
}));
export const billingWebhookReceipts = pgTable('billing_webhook_receipts', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => billingInvoices.id),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  payloadSha256: text('payload_sha256').notNull(),
  createdAt: createdAt(),
}, t => ({
  tenantIdx: index('billing_webhook_receipts_tenant_created_idx').on(t.tenantId, t.createdAt),
  uniqueEvent: uniqueIndex('billing_receipts_event_unique').on(t.provider, t.providerEventId),
}));

/** Immutable references for authenticated Stripe-hosted checkout sessions. */
export const billingStripeCheckoutSessions = pgTable('billing_stripe_checkout_sessions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => billingInvoices.id),
  stripeSessionId: text('stripe_session_id').notNull(),
  checkoutUrl: text('checkout_url').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, t => ({
  tenantIdx: index('billing_stripe_invoice_idx').on(t.tenantId, t.invoiceId, t.createdAt),
  uniqueSession: uniqueIndex('billing_stripe_session_unique').on(t.stripeSessionId),
}));


/** Payment exception queue. All writes require signed Stripe evidence and tenant RLS. */
export const billingPaymentExceptions = pgTable('billing_payment_exceptions', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => billingInvoices.id),
  provider: text('provider').notNull(), providerEventId: text('provider_event_id').notNull(),
  providerPaymentId: text('provider_payment_id').notNull(), exceptionType: text('exception_type').notNull(),
  amountMinor: integer('amount_minor').notNull(), currency: text('currency').notNull(),
  subscriptionPaused: boolean('subscription_paused').notNull().default(false),
  details: jsonb('details').notNull().default({}), createdAt: createdAt(),
}, t => ({
  tenantIdx: index('billing_payment_exceptions_tenant_created_idx').on(t.tenantId, t.createdAt),
  eventUnique: uniqueIndex('billing_exception_event_unique').on(t.provider, t.providerEventId),
}));
