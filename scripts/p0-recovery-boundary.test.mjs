import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('packages/db/migrations/0019_password_recovery.sql');
const policy=read('packages/db/sql/rls.sql');
const privilege=read('packages/db/sql/assert-global-role-privileges.sql');
const service=read('apps/api/src/auth/recovery.service.ts');
const controller=read('apps/api/src/auth/auth.controller.ts');
const requestProxy=read('apps/web/src/app/api/password-recovery/request/route.ts');
const resetProxy=read('apps/web/src/app/api/password-recovery/reset/route.ts');
const client=read('apps/web/src/app/reset-password/ResetPasswordForm.tsx');
const page=read('apps/web/src/app/reset-password/page.tsx');
const login=read('apps/web/src/app/login/page.tsx');

test('recovery table stores a digest not plaintext, expires in 30 minutes',()=>{
 assert.match(migration,/token_hash text NOT NULL UNIQUE/);
 assert.match(migration,/expires_at <= created_at \+ interval '30 minutes'/);
});
test('redeem only succeeds for unused and unexpired tokens',()=>{
 assert.match(migration,/consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now\(\)/);
 assert.match(migration,/FOR UPDATE/);
});
test('redeem cannot execute for arbitrary malformed password hashes',()=>{
 assert.match(migration,/p_password_hash !~/);
 assert.match(migration,/p_token_hash !~/);
});
test('redeem transaction rotates credential, revokes ALL sessions and records audit',()=>{
 assert.match(migration,/UPDATE public\.users SET password_hash = p_password_hash/);
 assert.match(migration,/DELETE FROM public\.sessions WHERE user_id = target_user/);
 assert.match(migration,/UPDATE public\.auth_password_resets SET consumed_at = now\(\)/);
 assert.match(migration,/INSERT INTO public\.auth_events/);
});
test('only the privileged function can update an existing password',()=>{
 assert.match(migration,/SECURITY DEFINER SET search_path/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.pmo_redeem_password_reset\(text, text\) FROM PUBLIC/);
 assert.match(policy,/GRANT EXECUTE ON FUNCTION public\.pmo_redeem_password_reset\(text, text\) TO pmo_app/);
 assert.match(policy,/REVOKE INSERT, UPDATE, DELETE ON users FROM pmo_app/);
 assert.doesNotMatch(policy,/GRANT UPDATE \(password_hash/);
});
test('database role must never read bearer token hashes',()=>{
 assert.match(policy,/REVOKE ALL ON public\.auth_password_resets FROM pmo_app/);
 assert.match(policy,/GRANT SELECT \(id, user_id, created_at, expires_at, consumed_at, revoked_at\)/);
 assert.doesNotMatch(policy,/GRANT SELECT \([^\n]*token_hash/);
 assert.match(privilege,/has_column_privilege\('pmo_app', 'public\.auth_password_resets', 'token_hash', 'SELECT'\)/);
});
test('recovery initiation has generic response, cooldown and confirmed delivery',()=>{
 assert.match(service,/If this address has an active account/);
 assert.match(service,/if \(!user\?\.active\) return GENERIC/);
 assert.match(service,/pg_advisory_xact_lock/);
 assert.match(service,/created_at > now\(\) - interval '15 minutes'/);
 assert.match(service,/if \(!transport\.delivers\) throw/);
 assert.match(service,/if \(!delivered\) \{/);
 assert.match(service,/SET revoked_at=now\(\)/);
 assert.match(service,/WHERE id=\$\{issued.id\}/);
 assert.doesNotMatch(service,/WHERE token_hash=\$\{hash\}/);
});
test('reset hashes password before narrow database function redemption',()=>{
 assert.match(service,/await bcrypt\.hash\(password, 12\)/);
 assert.match(service,/public\.pmo_redeem_password_reset\(/);
 assert.doesNotMatch(service,/UPDATE users SET password_hash/);
});
test('public endpoints are IP rate limited and schema validated',()=>{
 assert.match(controller,/@Throttle\(\{ default: \{ ttl: 900_000, limit: 3 \} \}\)[\s\S]*?@Post\('password-recovery\/request'\)/);
 assert.match(controller,/@Throttle\(\{ default: \{ ttl: 900_000, limit: 6 \} \}\)[\s\S]*?@Post\('password-recovery\/reset'\)/);
 assert.match(controller,/password: z\.string\(\)\.min\(12\)\.max\(200\)/);
});
test('proxies reject CSRF and never return recovery bearer data',()=>{
 for(const p of [requestProxy,resetProxy]) {
  assert.match(p,/rejectUnsafeBrowserMutation\(req\)/);
  assert.match(p,/cache: 'no-store'/);
  assert.doesNotMatch(p, /res\.json\(\)/);
 }
});
test('web page uses fragment token only and erases it immediately',()=>{
 assert.match(client,/window\.location\.hash/);
 assert.match(client,/window\.history\.replaceState/);
 assert.match(page,/referrer: 'no-referrer'/);
 assert.doesNotMatch(client,/window\.location\.search/);
});
test('development password hint is not displayed on staging or production deployment',()=>{
 assert.match(login,/DEPLOYMENT_ENV === 'development'/);
});
