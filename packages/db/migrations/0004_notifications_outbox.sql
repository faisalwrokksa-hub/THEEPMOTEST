-- The notification outbox. Written before sending, so delivery is auditable
-- and a platform with no mail transport still records what it would send.
DO $$ BEGIN
  CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'suppressed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "to_email"    text NOT NULL,
  "kind"        text NOT NULL,
  "subject"     text NOT NULL,
  "body"        text NOT NULL,
  "lang"        text DEFAULT 'en' NOT NULL,
  "entity"      text,
  "entity_id"   uuid,
  "status"      "notification_status" DEFAULT 'queued' NOT NULL,
  "error"       text,
  "dedupe_key"  text NOT NULL,
  "sent_at"     timestamp with time zone,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notif_tenant_idx" ON "notifications" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "notif_status_idx" ON "notifications" ("status");
-- A condition-based rule re-fires while the condition holds; this is what stops
-- the same blocked gate producing the same email every time the job runs.
CREATE UNIQUE INDEX IF NOT EXISTS "notif_dedupe_key" ON "notifications" ("tenant_id", "dedupe_key");
