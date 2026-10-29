import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const service=text('apps/api/src/onboarding/onboarding.service.ts');
const controller=text('apps/api/src/onboarding/onboarding.controller.ts');
const schema=text('apps/api/src/onboarding/onboarding.schemas.ts');
const migration=text('packages/db/migrations/0016_workspace_profiles_invitations.sql');
const web=text('apps/web/src/app/api/onboarding/route.ts');
const acceptProxy=text('apps/web/src/app/api/invite/accept/route.ts');
const acceptForm=text('apps/web/src/app/accept-invite/InviteForm.tsx');
const middleware=text('apps/api/src/app.module.ts');
const settings=text('apps/web/src/app/(app)/settings/page.tsx');

test('profile changes require workspace admin capability',()=>assert.match(service,/async updateProfile\([\s\S]*?requireCapability\('pmoa_admin'\)/));
test('invitation issuance requires manage-people capability',()=>assert.match(service,/async invite\([\s\S]*?requireCapability\('pmoa_manage_people'\)/));
test('revocation and listing require manage-people capability',()=>{
 assert.match(service,/async revoke\([\s\S]*?requireCapability\('pmoa_manage_people'\)/);
 assert.match(service,/async invitations\([\s\S]*?requireCapability\('pmoa_manage_people'\)/);
});
test('invitation role is allowlisted and cannot be owner or vendor administrator',()=>{
 assert.match(schema,/z\.enum\(ASSIGNABLE_ROLES\)/);
 assert.match(web,/roles\.has\(get\('role'\)\)/);
});
test('HTTP APIs never accept a workspace tenantId in their request body',()=>{
 assert.doesNotMatch(schema, /tenantId:/);
 assert.match(service,/const \{ tenantId, userId \} = currentContext\(\)/);
});
test('email delivery must be configured and failure invalidates invitations',()=>{
 assert.match(service,/if \(!transport\.delivers\) throw new ServiceUnavailableException/);
 assert.match(service,/delivery_status=\$\{result\.ok \? 'sent' : 'failed'\}/);
 assert.match(service,/revoked_at=CASE WHEN \$\{result\.ok\}/);
});
test('acceptance locks the database row before creating membership',()=>{
 assert.match(service,/FROM tenant_invitations[\s\S]*?FOR UPDATE/);
 assert.match(service,/isInvitationAcceptable\(inv\)/);
 assert.match(service,/INSERT INTO memberships\(tenant_id,user_id,role\)/);
 assert.match(service,/SET consumed_at=now\(\), accepted_by=/);
});
test('invitation acceptance never resets an existing account password',()=>{
 assert.doesNotMatch(service,/UPDATE users SET password_hash/);
 assert.match(service,/if \(!user\) \{/);
});
test('database enforces unique token hashes and one active invitation per address',()=>{
 assert.match(migration,/token_hash text NOT NULL UNIQUE/);
 assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitation_one_pending_email/);
});
test('invitations and profiles enforce RLS and cannot be deleted by the app',()=>{
 for (const table of ['tenant_profiles','tenant_invitations']) {
  assert.match(migration,new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(migration,new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
 }
 assert.match(migration,/REVOKE DELETE ON tenant_profiles, tenant_invitations FROM pmo_app/);
});
test('public accept route is explicit and throttled; no arbitrary unauthenticated API paths',()=>{
 assert.match(middleware,/path: 'api\/v1\/onboarding\/invitation\/accept', method: RequestMethod\.POST/);
 assert.match(controller,/@Throttle\(\{ default: \{ ttl: 60_000, limit: 6 \} \}\)/);
 assert.doesNotMatch(middleware,/path: 'api\/v1\/onboarding\/\*'/);
});
test('browser proxies reject cross-site mutations and arbitrary API paths',()=>{
 assert.match(web,/rejectUnsafeBrowserMutation\(req\)/);
 assert.match(acceptProxy,/rejectUnsafeBrowserMutation\(req\)/);
 assert.doesNotMatch(web,/get\('tenantId'\)/);
});
test('invitation tokens are never returned to the administrator',()=>{
 assert.match(service,/return \{ id: created\.id, email: body\.email/);
 assert.doesNotMatch(service,/return \{ token/);
});
test('browser removes invitation token from address bar',()=>{
 assert.match(acceptForm,/location\.hash/);
 assert.match(acceptForm,/history\.replaceState/);
});
test('UI includes bilingual invitation controls and separates owner configuration',()=>{
 assert.match(settings,/دعوة زميل بالبريد الإلكتروني/);
 assert.match(settings,/Invite a colleague by email/);
 assert.match(settings,/mayEditProfile = can\(caps, 'pmoa_admin'\)/);
});
test('forged invitations are rejected before password hashing',()=>{
 const preflight=service.indexOf('const [preflight] =');
 const hashing=service.indexOf('await bcrypt.hash(body.password, 12)');
 const rowLock=service.indexOf('FOR UPDATE',hashing);
 assert.ok(preflight>=0 && preflight<hashing && hashing<rowLock);
 assert.match(service,/if \(!preflight \|\| !isInvitationAcceptable\(preflight\)\)/);
});
test('public acceptance and admin issuance have separate rate limits',()=>{
 assert.match(controller,/@Throttle\(\{ default: \{ ttl: 60_000, limit: 6 \} \}\)/);
 assert.match(controller,/@Throttle\(\{ default: \{ ttl: 60_000, limit: 10 \} \}\)/);
});

test('Compose passes SES configuration only to the API container',()=>{
 const compose=text('docker-compose.prod.yml');
 const api=compose.split('\n  web:')[0];
 const webPart=compose.split('\n  web:')[1];
 for(const env of ['MAIL_TRANSPORT','MAIL_FROM','MAIL_REGION']) {
  assert.match(api,new RegExp(`${env}: \\$\\{${env}`));
  assert.doesNotMatch(webPart,new RegExp(`${env}:`));
 }
});
