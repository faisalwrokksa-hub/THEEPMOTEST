-- Ask X conversations. An answer a director acted on is part of the record,
-- so the question, the answer and the facts behind it are all kept.
CREATE TABLE IF NOT EXISTS "ask_messages" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thread_id"  uuid NOT NULL,
  "user_id"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "role"       text NOT NULL,
  "content"    text NOT NULL,
  "lang"       text DEFAULT 'en' NOT NULL,
  "model"      text,
  "grounding"  jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ask_tenant_idx" ON "ask_messages" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "ask_thread_idx" ON "ask_messages" ("thread_id", "created_at");
