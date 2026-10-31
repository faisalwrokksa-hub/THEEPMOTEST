import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeMicrosoftOAuthFailure } from '../apps/api/src/microsoft/oauth-error-policy.ts';

const source = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../apps/api/src/microsoft/client.ts', import.meta.url), 'utf8');

test('failed reconnect does not mark an existing valid connection as revoked', () => {
  const start = source.indexOf('tok = await exchangeCode(cfg, code, resource)');
  const end = source.indexOf('if (!tok.refreshToken)', start);
  assert.ok(start >= 0 && end > start);
  const exchange = source.slice(start, end);
  assert.match(exchange, /catch\s*\{/);
  assert.doesNotMatch(exchange, /UPDATE integration_connections|invalidateTenantTokens|status\s*=\s*'error'/);
});

test('only explicit revoked refresh tokens invalidate delegated credentials', () => {
  const start = source.indexOf('private async accessToken(');
  const end = source.indexOf('/* ── where the files go', start);
  const fn = source.slice(start, end);
  const gate = fn.indexOf('if (!(e instanceof MsAuthError && e.needsReconnect))');
  const revoke = fn.indexOf('this.invalidateTenantTokens(tenantId);', fn.indexOf('tok = await refresh('));
  const sqlUpdate = fn.indexOf("UPDATE integration_connections SET status = 'error'");
  assert.ok(gate >= 0 && revoke > gate && sqlUpdate > gate,
    'non-revocation failures must return before cache invalidation and DB status update');
  assert.match(fn.slice(gate, revoke), /ServiceUnavailableException/);
  assert.match(client, /get needsReconnect\(\)\s*\{\s*return this.code === 'invalid_grant' && !this.needsConsent;/);
});

test('temporary Microsoft OAuth failures cannot be classified as revoked refresh credentials', () => {
  for (const code of ['temporarily_unavailable', 'server_error', 'invalid_client', 'interaction_required']) {
    const failure = safeMicrosoftOAuthFailure({ error: code, error_description: 'untrusted' });
    assert.equal(failure.code, 'oauth_error', code);
    assert.equal(failure.consentRequired, false, code);
  }
  assert.equal(safeMicrosoftOAuthFailure({ error: 'invalid_grant' }).code, 'invalid_grant');
});
