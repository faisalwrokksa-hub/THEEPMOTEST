CREATE TYPE "public"."licence_tier" AS ENUM('trial', 'standard', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."module_status" AS ENUM('ga', 'beta', 'in_progress', 'planned');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"version" text DEFAULT '0.1.0' NOT NULL,
	"status" "module_status" DEFAULT 'planned' NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"tier" "licence_tier" DEFAULT 'standard' NOT NULL,
	"seat_limit" integer,
	"expires_at" timestamp with time zone,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_modules_key" ON "tenant_modules" USING btree ("tenant_id","module_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_modules_tenant_idx" ON "tenant_modules" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users" USING btree ("username");