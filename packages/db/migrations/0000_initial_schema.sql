CREATE TYPE "public"."benefit_status" AS ENUM('planned', 'in_progress', 'realized', 'missed');--> statement-breakpoint
CREATE TYPE "public"."cost_kind" AS ENUM('budget', 'commitment', 'actual', 'forecast');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('draft', 'in_review', 'approved', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('text', 'number', 'date', 'select', 'boolean', 'user');--> statement-breakpoint
CREATE TYPE "public"."gate_status" AS ENUM('locked', 'active', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."health" AS ENUM('on_track', 'at_risk', 'critical');--> statement-breakpoint
CREATE TYPE "public"."integ_status" AS ENUM('connected', 'error', 'disabled', 'pending');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'closed');--> statement-breakpoint
CREATE TYPE "public"."raid_kind" AS ENUM('risk', 'assumption', 'issue', 'dependency', 'change', 'decision');--> statement-breakpoint
CREATE TYPE "public"."raid_status" AS ENUM('open', 'mitigating', 'closed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'pmo_lead', 'project_manager', 'contributor', 'viewer', 'staff_consultant');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('phase', 'activity', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('todo', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"allocation_pct" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gate_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"is_accountable" boolean DEFAULT false NOT NULL,
	"decision" "decision" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"user_id" uuid,
	"action" text NOT NULL,
	"ip" text,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"action" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"measure" text NOT NULL,
	"baseline" numeric(18, 2),
	"target" numeric(18, 2),
	"actual" numeric(18, 2),
	"status" "benefit_status" DEFAULT 'planned' NOT NULL,
	"review_date" date,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "cost_kind" NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"period" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"applies_to" text NOT NULL,
	"label" text NOT NULL,
	"field_key" text NOT NULL,
	"field_type" "field_type" NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"criterion_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"url" text,
	"size_kb" integer,
	"owner_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "effort_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gate_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gate_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_met" boolean DEFAULT false NOT NULL,
	"evidence_url" text,
	"met_at" timestamp with time zone,
	"met_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gate_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"project_type" text NOT NULL,
	"definition" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"status" "gate_status" DEFAULT 'locked' NOT NULL,
	"opened_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"status" "integ_status" DEFAULT 'pending' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"records_synced" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"health" "health" DEFAULT 'on_track' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"health" "health" DEFAULT 'on_track' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"health" "health" DEFAULT 'on_track' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"budget_amount" numeric(18, 2),
	"budget_currency" text DEFAULT 'SAR',
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "raid_kind" NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"severity" integer,
	"likelihood" integer,
	"status" "raid_status" DEFAULT 'open' NOT NULL,
	"owner_id" uuid,
	"blocks_gate_id" uuid,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"audience" text NOT NULL,
	"schedule" text,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "schedule_kind" DEFAULT 'activity' NOT NULL,
	"start_date" date,
	"end_date" date,
	"baseline_start" date,
	"baseline_end" date,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"depends_on_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"active_tenant_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stakeholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"organisation" text,
	"role" text,
	"influence" integer,
	"interest" integer,
	"email" text,
	"phone" text,
	"is_external" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" "task_state" DEFAULT 'todo' NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"estimate_hours" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"author_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allocations" ADD CONSTRAINT "allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allocations" ADD CONSTRAINT "allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allocations" ADD CONSTRAINT "allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_gate_id_gates_id_fk" FOREIGN KEY ("gate_id") REFERENCES "public"."gates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automations" ADD CONSTRAINT "automations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benefits" ADD CONSTRAINT "benefits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benefits" ADD CONSTRAINT "benefits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benefits" ADD CONSTRAINT "benefits_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_criterion_id_gate_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."gate_criteria"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "effort_entries" ADD CONSTRAINT "effort_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "effort_entries" ADD CONSTRAINT "effort_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "effort_entries" ADD CONSTRAINT "effort_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_criteria" ADD CONSTRAINT "gate_criteria_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_criteria" ADD CONSTRAINT "gate_criteria_gate_id_gates_id_fk" FOREIGN KEY ("gate_id") REFERENCES "public"."gates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_criteria" ADD CONSTRAINT "gate_criteria_met_by_users_id_fk" FOREIGN KEY ("met_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_templates" ADD CONSTRAINT "gate_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gates" ADD CONSTRAINT "gates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gates" ADD CONSTRAINT "gates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programs" ADD CONSTRAINT "programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programs" ADD CONSTRAINT "programs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_blocks_gate_id_gates_id_fk" FOREIGN KEY ("blocks_gate_id") REFERENCES "public"."gates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_defs" ADD CONSTRAINT "report_defs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_tenant_id_tenants_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "updates" ADD CONSTRAINT "updates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "updates" ADD CONSTRAINT "updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "updates" ADD CONSTRAINT "updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alloc_tenant_idx" ON "allocations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alloc_user_idx" ON "allocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_tenant_idx" ON "approvals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_gate_idx" ON "approvals" USING btree ("gate_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approvals_gate_approver_key" ON "approvals" USING btree ("gate_id","approver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_tenant_at_idx" ON "audit_events" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_events" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_at_idx" ON "auth_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_tenant_idx" ON "automations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "benefits_tenant_idx" ON "benefits" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "benefits_project_idx" ON "benefits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_tenant_idx" ON "cost_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_project_kind_idx" ON "cost_entries" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cf_tenant_idx" ON "custom_fields" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cf_tenant_key" ON "custom_fields" USING btree ("tenant_id","applies_to","field_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_tenant_idx" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "effort_tenant_idx" ON "effort_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "effort_user_date_idx" ON "effort_entries" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_criteria_tenant_idx" ON "gate_criteria" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_criteria_gate_idx" ON "gate_criteria" USING btree ("gate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gt_tenant_idx" ON "gate_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gates_tenant_idx" ON "gates" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gates_project_seq_key" ON "gates" USING btree ("project_id","seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integ_tenant_idx" ON "integrations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_tenant_user_key" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_tenant_idx" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolios_tenant_idx" ON "portfolios" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programs_tenant_idx" ON "programs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programs_portfolio_idx" ON "programs" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_tenant_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_tenant_code_key" ON "projects" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_program_idx" ON "projects" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_tenant_idx" ON "raid_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_project_idx" ON "raid_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_blocks_gate_idx" ON "raid_items" USING btree ("blocks_gate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rd_tenant_idx" ON "report_defs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sched_tenant_idx" ON "schedule_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sched_project_idx" ON "schedule_items" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stake_tenant_idx" ON "stakeholders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stake_project_idx" ON "stakeholders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_idx" ON "tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "updates_tenant_idx" ON "updates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "updates_created_idx" ON "updates" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" USING btree ("email");