import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (p) => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const controller = source('apps/api/src/creates/creates.controller.ts');
const creates = source('apps/api/src/creates/creates.service.ts');
const onboarding = source('apps/api/src/onboarding/onboarding.service.ts');
const onboardingController = source('apps/api/src/onboarding/onboarding.controller.ts');
const inviteSchema = source('apps/api/src/onboarding/onboarding.schemas.ts');
const contracts = source('packages/contracts/src/creates.ts');
const appModule = source('apps/api/src/app.module.ts');

// These guard the security boundary even when a new onboarding feature is added.
test('legacy direct member creation explicitly returns 410 instead of assigning credentials', () => {
  assert.match(controller, /@Post\('member'\)\s+member\(\): never\s*\{\s*throw new GoneException/);
  assert.doesNotMatch(controller, /createMemberIn/);
});
test('creation service no longer silently enrolls existing global accounts', () => {
  assert.doesNotMatch(creates, /async member\(/);
  assert.doesNotMatch(creates, /INSERT INTO users\s*\(email,\s*display_name,\s*password_hash\)/);
  assert.doesNotMatch(creates, /bcrypt\.hash/);
});
test('legacy contract is labeled deprecated so new clients use invitations', () => {
  assert.match(contracts, /@deprecated Legacy schema/);
  assert.match(contracts, /410 Gone/);
});
test('invitation issuance requires personnel permission, transport, and a hashed token', () => {
  assert.match(onboarding, /async invite\([\s\S]*?requireCapability\('pmoa_manage_people'\)/);
  assert.match(onboarding, /if \(!transport\.delivers\) throw new ServiceUnavailableException/);
  assert.match(onboarding, /const \{ token, hash \} = makeInvitationToken\(tenantId\)/);
  assert.match(onboarding, /token_hash,expires_at,invited_by/);
});
test('membership is added only after locked single-use token acceptance', () => {
  const start = onboarding.indexOf('async accept(');
  const accept = onboarding.slice(start);
  assert.ok(start > 0);
  assert.match(accept, /parseInvitationToken\(body\.token\)/);
  assert.match(accept, /FOR UPDATE/);
  assert.match(accept, /if \(!inv \|\| !isInvitationAcceptable\(inv\)\)/);
  assert.match(accept, /INSERT INTO memberships\(tenant_id,user_id,role\)/);
  assert.match(accept, /SET consumed_at=now\(\), accepted_by=/);
});
test('public accept endpoint is narrowly scoped and throttled', () => {
  assert.match(onboardingController, /@Throttle\(\{ default: \{ ttl: 60_000, limit: 6 \} \}\)\s+@Post\('invitation\/accept'\)/);
  assert.match(inviteSchema, /role: z\.enum\(ASSIGNABLE_ROLES\)/);
  assert.doesNotMatch(inviteSchema, /tenantId:/);
});

test('development identity enumeration is not registered in the customer API', () => {
  assert.doesNotMatch(appModule, /DevController|dev\/dev\.controller/);
  assert.match(appModule, /controllers: \[HealthController\]/);
});
