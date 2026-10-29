-- A daily photograph of each workspace, so "are we getting better or worse?"
-- has an answer. History starts here; it cannot be backfilled, because nothing
-- in the live tables remembers what yesterday looked like.
CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "on_date"       date NOT NULL,
  "projects"      integer DEFAULT 0 NOT NULL,
  "on_track"      integer DEFAULT 0 NOT NULL,
  "at_risk"       integer DEFAULT 0 NOT NULL,
  "critical"      integer DEFAULT 0 NOT NULL,
  "avg_progress"  integer DEFAULT 0 NOT NULL,
  "gates_active"  integer DEFAULT 0 NOT NULL,
  "gates_blocked" integer DEFAULT 0 NOT NULL,
  "open_register" integer DEFAULT 0 NOT NULL,
  "budget"        numeric(18,2) DEFAULT '0' NOT NULL,
  "actual"        numeric(18,2) DEFAULT '0' NOT NULL,
  "forecast"      numeric(18,2) DEFAULT '0' NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "snapshot_tenant_day" ON "portfolio_snapshots" ("tenant_id", "on_date");
CREATE INDEX IF NOT EXISTS "snapshot_tenant_idx" ON "portfolio_snapshots" ("tenant_id", "on_date");
